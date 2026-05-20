const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");

dotenv.config();
if (!process.env.DB_HOST) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

const { pool, initSchema, hashPassword } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "No autorizado." });
  }

  pool
    .query(
      `SELECT s.token, u.id, u.nombre, u.correo, u.rol
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token = ? AND s.expires_at > NOW()`,
      [token]
    )
    .then(([rows]) => {
      if (rows.length === 0) {
        return res.status(401).json({ error: "Sesión inválida o expirada." });
      }
      req.user = rows[0];
      next();
    })
    .catch(next);
}

async function logEstadoApartamento(
  apartamentoId,
  estadoAnterior,
  estadoNuevo,
  motivo,
  userId,
  conn = pool
) {
  await conn.query(
    `INSERT INTO estado_apartamento_log
     (apartamento_id, estado_anterior, estado_nuevo, motivo, usuario_id)
     VALUES (?, ?, ?, ?, ?)`,
    [apartamentoId, estadoAnterior, estadoNuevo, motivo, userId]
  );
}

async function marcarCuotasVencidas() {
  await pool.query(
    `UPDATE pagos
     SET estado = 'Vencido'
     WHERE estado = 'Pendiente' AND fecha_vencimiento < CURDATE()`
  );
}

app.get("/api/health", async (_req, res) => {
  const [rows] = await pool.query("SELECT NOW() AS now");
  res.json({ ok: true, dbTime: rows[0].now });
});

app.post("/api/auth/login", async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) {
    return res.status(400).json({ error: "Correo y contraseña son obligatorios." });
  }

  const [rows] = await pool.query(
    "SELECT id, nombre, correo, rol, password_hash FROM usuarios WHERE correo = ?",
    [correo]
  );

  if (rows.length === 0 || rows[0].password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: "Credenciales incorrectas." });
  }

  const user = rows[0];
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sesiones (token, usuario_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))",
    [token, user.id]
  );

  return res.json({
    token,
    user: { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol },
  });
});

app.use("/api", authRequired);

app.post("/api/auth/logout", async (req, res) => {
  await pool.query("DELETE FROM sesiones WHERE token = ?", [req.user.token]);
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      nombre: req.user.nombre,
      correo: req.user.correo,
      rol: req.user.rol,
    },
  });
});

app.get("/api/apartamentos", async (req, res) => {
  const { proyecto, torre, piso, estado } = req.query;
  const where = [];
  const values = [];
  if (proyecto) {
    where.push("a.proyecto = ?");
    values.push(proyecto);
  }
  if (torre) {
    where.push("a.torre = ?");
    values.push(torre);
  }
  if (piso) {
    where.push("a.piso = ?");
    values.push(Number(piso));
  }
  if (estado) {
    where.push("a.estado = ?");
    values.push(estado);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `
    SELECT
      a.*,
      r.id AS reserva_id,
      r.prospecto_nombre,
      r.fecha_vencimiento AS reserva_vence,
      DATEDIFF(CURDATE(), r.created_at) AS dias_reserva
    FROM apartamentos a
    LEFT JOIN reservas r
      ON r.apartamento_id = a.id AND r.estado = 'Activa'
    ${whereSql}
    ORDER BY a.proyecto, a.torre, a.numero
  `,
    values
  );
  res.json(rows);
});

app.post("/api/apartamentos", async (req, res) => {
  const { proyecto, torre, numero, piso, area_m2, precio } = req.body;
  if (!proyecto || !torre || !numero || !piso || !area_m2 || !precio) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO apartamentos (proyecto, torre, numero, piso, area_m2, precio, estado)
       VALUES (?, ?, ?, ?, ?, ?, 'Disponible')`,
      [proyecto, torre, numero, piso, area_m2, precio]
    );
    const [rows] = await pool.query("SELECT * FROM apartamentos WHERE id = ?", [
      result.insertId,
    ]);
    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Ya existe un apartamento con ese número para este proyecto y torre.",
      });
    }
    throw error;
  }
});

app.post("/api/ventas", async (req, res) => {
  const {
    apartamento_id,
    cliente_nombre,
    cliente_documento,
    cliente_telefono,
    cliente_correo,
    precio_pactado,
    acabados_elegidos,
    fecha_firma,
  } = req.body;

  if (
    !apartamento_id ||
    !cliente_nombre ||
    !cliente_documento ||
    !cliente_telefono ||
    !cliente_correo ||
    !precio_pactado ||
    !fecha_firma
  ) {
    return res.status(400).json({ error: "Faltan campos obligatorios de la venta." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [aptRows] = await conn.query(
      "SELECT id, estado FROM apartamentos WHERE id = ? FOR UPDATE",
      [apartamento_id]
    );
    if (!aptRows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Apartamento no encontrado." });
    }
    if (["Reservado", "Vendido", "Escriturado"].includes(aptRows[0].estado)) {
      await conn.rollback();
      return res
        .status(409)
        .json({ error: "No se puede vender un apartamento reservado o vendido." });
    }

    const [saleResult] = await conn.query(
      `INSERT INTO ventas (
        apartamento_id, cliente_nombre, cliente_documento, cliente_telefono,
        cliente_correo, precio_pactado, acabados_elegidos, fecha_firma, asesor_usuario_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        apartamento_id,
        cliente_nombre,
        cliente_documento,
        cliente_telefono,
        cliente_correo,
        precio_pactado,
        acabados_elegidos || null,
        fecha_firma,
        req.user.id,
      ]
    );

    await conn.query("UPDATE apartamentos SET estado = 'Vendido' WHERE id = ?", [
      apartamento_id,
    ]);
    await logEstadoApartamento(
      apartamento_id,
      aptRows[0].estado,
      "Vendido",
      "Registro de venta",
      req.user.id,
      conn
    );

    await conn.commit();
    const [rows] = await pool.query("SELECT * FROM ventas WHERE id = ?", [
      saleResult.insertId,
    ]);
    return res.status(201).json(rows[0]);
  } catch (error) {
    await conn.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "Este apartamento ya tiene una venta registrada." });
    }
    throw error;
  } finally {
    conn.release();
  }
});

app.post("/api/reservas", async (req, res) => {
  const { apartamento_id, prospecto_nombre, fecha_vencimiento } = req.body;
  if (!apartamento_id || !prospecto_nombre || !fecha_vencimiento) {
    return res.status(400).json({ error: "Faltan campos obligatorios de la reserva." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [aptRows] = await conn.query(
      "SELECT id, estado FROM apartamentos WHERE id = ? FOR UPDATE",
      [apartamento_id]
    );
    if (!aptRows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Apartamento no encontrado." });
    }
    if (aptRows[0].estado !== "Disponible") {
      await conn.rollback();
      return res
        .status(409)
        .json({ error: "Solo se pueden reservar apartamentos disponibles." });
    }

    const [result] = await conn.query(
      `INSERT INTO reservas (
        apartamento_id, prospecto_nombre, fecha_vencimiento, estado, asesor_usuario_id
      ) VALUES (?, ?, ?, 'Activa', ?)`,
      [apartamento_id, prospecto_nombre, fecha_vencimiento, req.user.id]
    );
    await conn.query("UPDATE apartamentos SET estado = 'Reservado' WHERE id = ?", [
      apartamento_id,
    ]);
    await logEstadoApartamento(
      apartamento_id,
      "Disponible",
      "Reservado",
      "Registro de reserva",
      req.user.id,
      conn
    );
    await conn.commit();
    const [rows] = await pool.query("SELECT * FROM reservas WHERE id = ?", [
      result.insertId,
    ]);
    return res.status(201).json(rows[0]);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

app.post("/api/reservas/:id/cancelar", async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT r.id, r.apartamento_id, r.estado, a.estado AS estado_apartamento
       FROM reservas r
       JOIN apartamentos a ON a.id = r.apartamento_id
       WHERE r.id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Reserva no encontrada." });
    }
    if (rows[0].estado !== "Activa") {
      await conn.rollback();
      return res.status(409).json({ error: "La reserva ya no está activa." });
    }
    await conn.query("UPDATE reservas SET estado = 'Cancelada' WHERE id = ?", [id]);
    await conn.query("UPDATE apartamentos SET estado = 'Disponible' WHERE id = ?", [
      rows[0].apartamento_id,
    ]);
    await logEstadoApartamento(
      rows[0].apartamento_id,
      rows[0].estado_apartamento,
      "Disponible",
      "Cancelación de reserva",
      req.user.id,
      conn
    );
    await conn.commit();
    return res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

app.post("/api/reservas/:id/convertir-venta", async (req, res) => {
  const { id } = req.params;
  const {
    cliente_nombre,
    cliente_documento,
    cliente_telefono,
    cliente_correo,
    precio_pactado,
    acabados_elegidos,
    fecha_firma,
  } = req.body;

  if (
    !cliente_nombre ||
    !cliente_documento ||
    !cliente_telefono ||
    !cliente_correo ||
    !precio_pactado ||
    !fecha_firma
  ) {
    return res.status(400).json({ error: "Faltan campos obligatorios de la venta." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT r.id, r.estado, r.apartamento_id, a.estado AS estado_apartamento
       FROM reservas r
       JOIN apartamentos a ON a.id = r.apartamento_id
       WHERE r.id = ? FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Reserva no encontrada." });
    }
    if (rows[0].estado !== "Activa") {
      await conn.rollback();
      return res.status(409).json({ error: "La reserva no está activa." });
    }
    await conn.query(
      `INSERT INTO ventas (
        apartamento_id, cliente_nombre, cliente_documento, cliente_telefono,
        cliente_correo, precio_pactado, acabados_elegidos, fecha_firma, asesor_usuario_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rows[0].apartamento_id,
        cliente_nombre,
        cliente_documento,
        cliente_telefono,
        cliente_correo,
        precio_pactado,
        acabados_elegidos || null,
        fecha_firma,
        req.user.id,
      ]
    );
    await conn.query("UPDATE reservas SET estado = 'Convertida' WHERE id = ?", [id]);
    await conn.query("UPDATE apartamentos SET estado = 'Vendido' WHERE id = ?", [
      rows[0].apartamento_id,
    ]);
    await logEstadoApartamento(
      rows[0].apartamento_id,
      rows[0].estado_apartamento,
      "Vendido",
      "Conversión de reserva a venta",
      req.user.id,
      conn
    );
    await conn.commit();
    return res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "Este apartamento ya tiene una venta registrada." });
    }
    throw error;
  } finally {
    conn.release();
  }
});

app.get("/api/ventas", async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT
      v.id,
      v.cliente_nombre,
      v.cliente_documento,
      a.proyecto,
      CONCAT(a.torre, '-', a.numero) AS apartamento_ref
    FROM ventas v
    JOIN apartamentos a ON a.id = v.apartamento_id
    ORDER BY v.created_at DESC`
  );
  res.json(rows);
});

app.get("/api/pagos", async (req, res) => {
  await marcarCuotasVencidas();
  const where = [];
  const values = [];
  if (req.query.proyecto) {
    where.push("proyecto = ?");
    values.push(req.query.proyecto);
  }
  if (req.query.estado) {
    where.push("estado = ?");
    values.push(req.query.estado);
  }
  if (req.query.venta_id) {
    where.push("venta_id = ?");
    values.push(Number(req.query.venta_id));
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT * FROM pagos ${whereSql}
     ORDER BY fecha_vencimiento ASC, cuota_numero ASC`,
    values
  );
  res.json(rows);
});

app.post("/api/pagos", async (req, res) => {
  const {
    venta_id,
    cuota_numero,
    fecha_vencimiento,
    valor,
    metodo_pago,
    estado,
    fecha_pago,
    notas,
  } = req.body;

  if (!venta_id || !cuota_numero || !fecha_vencimiento || !valor) {
    return res.status(400).json({ error: "Faltan campos obligatorios del pago." });
  }

  const [ventas] = await pool.query(
    `SELECT v.id, v.cliente_nombre, a.proyecto, CONCAT(a.torre, '-', a.numero) AS apartamento_ref
     FROM ventas v
     JOIN apartamentos a ON a.id = v.apartamento_id
     WHERE v.id = ?`,
    [venta_id]
  );
  if (!ventas.length) {
    return res.status(404).json({ error: "Venta no encontrada para asociar el pago." });
  }

  const venta = ventas[0];
  const [result] = await pool.query(
    `INSERT INTO pagos (
      venta_id, proyecto, cliente_nombre, apartamento_ref, cuota_numero,
      fecha_vencimiento, valor, metodo_pago, estado, fecha_pago, notas
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'Pendiente'), ?, ?)`,
    [
      venta_id,
      venta.proyecto,
      venta.cliente_nombre,
      venta.apartamento_ref,
      cuota_numero,
      fecha_vencimiento,
      valor,
      metodo_pago || null,
      estado || null,
      fecha_pago || null,
      notas || null,
    ]
  );
  const [rows] = await pool.query("SELECT * FROM pagos WHERE id = ?", [
    result.insertId,
  ]);
  res.status(201).json(rows[0]);
});

app.patch("/api/pagos/:id", async (req, res) => {
  const { id } = req.params;
  const { estado, fecha_pago, notas, metodo_pago } = req.body;

  const [result] = await pool.query(
    `UPDATE pagos
     SET estado = COALESCE(?, estado),
         fecha_pago = COALESCE(?, fecha_pago),
         notas = COALESCE(?, notas),
         metodo_pago = COALESCE(?, metodo_pago)
     WHERE id = ?`,
    [estado || null, fecha_pago || null, notas || null, metodo_pago || null, id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "Pago no encontrado." });
  }
  const [rows] = await pool.query("SELECT * FROM pagos WHERE id = ?", [id]);
  res.json(rows[0]);
});

app.get("/api/clientes/resumen-pagos", async (req, res) => {
  await marcarCuotasVencidas();
  const where = [];
  const values = [];
  if (req.query.proyecto) {
    where.push("p.proyecto = ?");
    values.push(req.query.proyecto);
  }
  if (req.query.estado_global) {
    const estado = req.query.estado_global;
    if (estado === "Vencido") {
      where.push(`EXISTS (
        SELECT 1 FROM pagos p2
        WHERE p2.venta_id = p.venta_id AND p2.estado = 'Vencido'
      )`);
    }
    if (estado === "Con pendientes") {
      where.push(`NOT EXISTS (
        SELECT 1 FROM pagos p2
        WHERE p2.venta_id = p.venta_id AND p2.estado = 'Vencido'
      )`);
      where.push(`EXISTS (
        SELECT 1 FROM pagos p2
        WHERE p2.venta_id = p.venta_id AND p2.estado = 'Pendiente'
      )`);
    }
    if (estado === "Al día") {
      where.push(`NOT EXISTS (
        SELECT 1 FROM pagos p2
        WHERE p2.venta_id = p.venta_id AND p2.estado IN ('Pendiente', 'Vencido')
      )`);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `
    SELECT
      p.venta_id,
      p.proyecto,
      p.cliente_nombre,
      p.apartamento_ref,
      SUM(CASE WHEN p.estado = 'Pagado' THEN p.valor ELSE 0 END) AS total_pagado,
      SUM(CASE WHEN p.estado = 'Pendiente' THEN p.valor ELSE 0 END) AS total_pendiente,
      SUM(CASE WHEN p.estado = 'Vencido' THEN p.valor ELSE 0 END) AS total_vencido,
      SUM(CASE WHEN p.estado IN ('Pendiente', 'Vencido') THEN p.valor ELSE 0 END) AS saldo_total,
      CASE
        WHEN SUM(CASE WHEN p.estado = 'Vencido' THEN 1 ELSE 0 END) > 0 THEN 'Vencido'
        WHEN SUM(CASE WHEN p.estado = 'Pendiente' THEN 1 ELSE 0 END) > 0 THEN 'Con pendientes'
        ELSE 'Al día'
      END AS estado_global
    FROM pagos p
    ${whereSql}
    GROUP BY p.venta_id, p.proyecto, p.cliente_nombre, p.apartamento_ref
    ORDER BY estado_global DESC, saldo_total DESC
  `,
    values
  );
  res.json(rows);
});

app.get("/api/clientes/:ventaId/pagos", async (req, res) => {
  await marcarCuotasVencidas();
  const [rows] = await pool.query(
    "SELECT * FROM pagos WHERE venta_id = ? ORDER BY cuota_numero ASC",
    [req.params.ventaId]
  );
  res.json(rows);
});

app.get("/api/reportes/pagos.csv", async (req, res) => {
  const proyecto = req.query.proyecto || "";
  const [rows] = await pool.query(
    `
    SELECT
      p.proyecto,
      p.cliente_nombre,
      p.apartamento_ref,
      SUM(CASE WHEN p.estado = 'Pagado' THEN 1 ELSE 0 END) AS cuotas_pagadas,
      SUM(CASE WHEN p.estado = 'Pendiente' THEN 1 ELSE 0 END) AS cuotas_pendientes,
      SUM(CASE WHEN p.estado = 'Vencido' THEN 1 ELSE 0 END) AS cuotas_vencidas,
      SUM(CASE WHEN p.estado IN ('Pendiente', 'Vencido') THEN p.valor ELSE 0 END) AS saldo_total
    FROM pagos p
    ${proyecto ? "WHERE p.proyecto = ?" : ""}
    GROUP BY p.proyecto, p.cliente_nombre, p.apartamento_ref
    ORDER BY p.proyecto, p.cliente_nombre
  `,
    proyecto ? [proyecto] : []
  );
  const header =
    "proyecto,cliente,apartamento,cuotas_pagadas,cuotas_pendientes,cuotas_vencidas,saldo_total";
  const body = rows
    .map((r) =>
      [
        r.proyecto,
        r.cliente_nombre,
        r.apartamento_ref,
        r.cuotas_pagadas,
        r.cuotas_pendientes,
        r.cuotas_vencidas,
        Number(r.saldo_total),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
  const date = new Date().toISOString().slice(0, 10);
  const projectSafe = proyecto ? proyecto.replace(/\s+/g, "_") : "todos";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="reporte_pagos_${projectSafe}_${date}.csv"`
  );
  res.send(`${header}\n${body}\n`);
});

app.get("/api/presupuesto/resumen", async (req, res) => {
  const proyecto = req.query.proyecto;
  const values = [];
  let where = "";
  if (proyecto) {
    values.push(proyecto);
    where = "WHERE p.proyecto = ?";
  }

  const [rows] = await pool.query(
    `
    SELECT
      p.id,
      p.proyecto,
      p.rubro,
      p.valor_presupuestado,
      COALESCE(SUM(g.valor), 0) AS valor_ejecutado,
      (p.valor_presupuestado - COALESCE(SUM(g.valor), 0)) AS variacion,
      CASE
        WHEN p.valor_presupuestado = 0 THEN 0
        ELSE (COALESCE(SUM(g.valor), 0) / p.valor_presupuestado) * 100
      END AS porcentaje_ejecucion,
      CASE
        WHEN COALESCE(SUM(g.valor), 0) > p.valor_presupuestado * 1.10 THEN 1
        ELSE 0
      END AS alerta_desviacion
    FROM presupuesto_items p
    LEFT JOIN gastos_obra g ON g.presupuesto_item_id = p.id
    ${where}
    GROUP BY p.id, p.proyecto, p.rubro, p.valor_presupuestado
    ORDER BY p.proyecto, p.rubro
  `,
    values
  );

  return res.json(rows);
});

app.post("/api/presupuesto/items", async (req, res) => {
  const { proyecto, rubro, valor_presupuestado } = req.body;
  if (!proyecto || !rubro || !valor_presupuestado) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  const [result] = await pool.query(
    `INSERT INTO presupuesto_items (proyecto, rubro, valor_presupuestado)
     VALUES (?, ?, ?)`,
    [proyecto, rubro, valor_presupuestado]
  );

  const [rows] = await pool.query(
    "SELECT * FROM presupuesto_items WHERE id = ?",
    [result.insertId]
  );
  return res.status(201).json(rows[0]);
});

app.put("/api/presupuesto/items/:id", async (req, res) => {
  const { id } = req.params;
  const { proyecto, rubro, valor_presupuestado } = req.body;
  if (!proyecto || !rubro || !valor_presupuestado) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }
  const [uses] = await pool.query(
    "SELECT COUNT(*) AS total FROM gastos_obra WHERE presupuesto_item_id = ?",
    [id]
  );
  if (uses[0].total > 0) {
    return res.status(409).json({
      error: "No se puede editar el presupuesto porque la obra ya tiene gastos registrados.",
    });
  }
  const [result] = await pool.query(
    `UPDATE presupuesto_items
     SET proyecto = ?, rubro = ?, valor_presupuestado = ?
     WHERE id = ?`,
    [proyecto, rubro, valor_presupuestado, id]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "Rubro no encontrado." });
  }
  const [rows] = await pool.query("SELECT * FROM presupuesto_items WHERE id = ?", [
    id,
  ]);
  res.json(rows[0]);
});

app.delete("/api/presupuesto/items/:id", async (req, res) => {
  const { id } = req.params;
  const [uses] = await pool.query(
    "SELECT COUNT(*) AS total FROM gastos_obra WHERE presupuesto_item_id = ?",
    [id]
  );
  if (uses[0].total > 0) {
    return res.status(409).json({
      error: "No se puede eliminar un presupuesto que ya tiene gastos registrados.",
    });
  }
  const [result] = await pool.query("DELETE FROM presupuesto_items WHERE id = ?", [
    id,
  ]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "Rubro no encontrado." });
  }
  res.json({ ok: true });
});

app.post("/api/presupuesto/gastos", async (req, res) => {
  const { presupuesto_item_id, fecha, valor, proveedor, referencia, descripcion } =
    req.body;
  if (!presupuesto_item_id || !fecha || !valor) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  const [result] = await pool.query(
    `INSERT INTO gastos_obra (
      presupuesto_item_id, fecha, valor, proveedor, referencia, descripcion
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      presupuesto_item_id,
      fecha,
      valor,
      proveedor || null,
      referencia || null,
      descripcion || null,
    ]
  );

  const [rows] = await pool.query("SELECT * FROM gastos_obra WHERE id = ?", [
    result.insertId,
  ]);
  return res.status(201).json(rows[0]);
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
