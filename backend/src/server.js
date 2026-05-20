require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { pool, initSchema } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const result = await pool.query("SELECT NOW() AS now");
  res.json({ ok: true, dbTime: result.rows[0].now });
});

app.get("/api/apartamentos", async (_req, res) => {
  const result = await pool.query(
    "SELECT * FROM apartamentos ORDER BY proyecto, torre, numero"
  );
  res.json(result.rows);
});

app.post("/api/apartamentos", async (req, res) => {
  const { proyecto, torre, numero, piso, area_m2, precio, estado } = req.body;

  if (!proyecto || !torre || !numero || !piso || !area_m2 || !precio) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  const result = await pool.query(
    `INSERT INTO apartamentos (proyecto, torre, numero, piso, area_m2, precio, estado)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Disponible'))
     RETURNING *`,
    [proyecto, torre, numero, piso, area_m2, precio, estado]
  );

  return res.status(201).json(result.rows[0]);
});

app.patch("/api/apartamentos/:id/estado", async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!estado) {
    return res.status(400).json({ error: "El campo estado es obligatorio." });
  }

  const result = await pool.query(
    "UPDATE apartamentos SET estado = $1 WHERE id = $2 RETURNING *",
    [estado, id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Apartamento no encontrado." });
  }

  return res.json(result.rows[0]);
});

app.get("/api/pagos", async (_req, res) => {
  const result = await pool.query(
    "SELECT * FROM pagos ORDER BY fecha_vencimiento ASC, cuota_numero ASC"
  );
  res.json(result.rows);
});

app.post("/api/pagos", async (req, res) => {
  const {
    cliente_nombre,
    apartamento_ref,
    cuota_numero,
    fecha_vencimiento,
    valor,
    estado,
    fecha_pago,
    notas,
  } = req.body;

  if (
    !cliente_nombre ||
    !apartamento_ref ||
    !cuota_numero ||
    !fecha_vencimiento ||
    !valor
  ) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  const result = await pool.query(
    `INSERT INTO pagos (
      cliente_nombre,
      apartamento_ref,
      cuota_numero,
      fecha_vencimiento,
      valor,
      estado,
      fecha_pago,
      notas
    )
    VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'Pendiente'), $7, $8)
    RETURNING *`,
    [
      cliente_nombre,
      apartamento_ref,
      cuota_numero,
      fecha_vencimiento,
      valor,
      estado,
      fecha_pago || null,
      notas || null,
    ]
  );

  return res.status(201).json(result.rows[0]);
});

app.patch("/api/pagos/:id", async (req, res) => {
  const { id } = req.params;
  const { estado, fecha_pago, notas } = req.body;

  const result = await pool.query(
    `UPDATE pagos
     SET estado = COALESCE($1, estado),
         fecha_pago = COALESCE($2, fecha_pago),
         notas = COALESCE($3, notas)
     WHERE id = $4
     RETURNING *`,
    [estado, fecha_pago, notas, id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Pago no encontrado." });
  }

  return res.json(result.rows[0]);
});

app.get("/api/presupuesto/resumen", async (req, res) => {
  const proyecto = req.query.proyecto;
  const values = [];
  let where = "";
  if (proyecto) {
    values.push(proyecto);
    where = "WHERE p.proyecto = $1";
  }

  const result = await pool.query(
    `
    SELECT
      p.id,
      p.proyecto,
      p.rubro,
      p.valor_presupuestado,
      COALESCE(SUM(g.valor), 0) AS valor_ejecutado,
      (p.valor_presupuestado - COALESCE(SUM(g.valor), 0)) AS variacion
    FROM presupuesto_items p
    LEFT JOIN gastos_obra g ON g.presupuesto_item_id = p.id
    ${where}
    GROUP BY p.id
    ORDER BY p.proyecto, p.rubro
  `,
    values
  );

  return res.json(result.rows);
});

app.post("/api/presupuesto/items", async (req, res) => {
  const { proyecto, rubro, valor_presupuestado } = req.body;
  if (!proyecto || !rubro || !valor_presupuestado) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  const result = await pool.query(
    `INSERT INTO presupuesto_items (proyecto, rubro, valor_presupuestado)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [proyecto, rubro, valor_presupuestado]
  );

  return res.status(201).json(result.rows[0]);
});

app.post("/api/presupuesto/gastos", async (req, res) => {
  const { presupuesto_item_id, fecha, valor, descripcion } = req.body;
  if (!presupuesto_item_id || !fecha || !valor) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  const result = await pool.query(
    `INSERT INTO gastos_obra (presupuesto_item_id, fecha, valor, descripcion)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [presupuesto_item_id, fecha, valor, descripcion || null]
  );

  return res.status(201).json(result.rows[0]);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

async function bootstrap() {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`API SGI CIRNSAS corriendo en http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("No fue posible iniciar la API:", err);
  process.exit(1);
});
