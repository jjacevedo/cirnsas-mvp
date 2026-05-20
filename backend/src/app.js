const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { z } = require("zod");

const ESTADOS_APARTAMENTO = ["Disponible", "Reservado", "Vendido", "Escriturado"];
const ESTADOS_PAGO = ["Pendiente", "Pagado", "Vencido"];

class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function validate(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Datos inválidos.", result.error.flatten());
  }
  return result.data;
}

function hashPassword(password) {
  const salt = process.env.AUTH_SALT || "cirnsas_mvp_salt";
  return crypto.createHash("sha256").update(`${password}:${salt}`).digest("hex");
}

const schemaLogin = z.object({
  correo: z.string().email(),
  password: z.string().min(4),
});

const schemaApartamento = z.object({
  proyecto: z.string().min(1),
  torre: z.string().min(1),
  numero: z.string().min(1),
  piso: z.coerce.number().int().nonnegative(),
  area_m2: z.coerce.number().positive(),
  precio: z.coerce.number().positive(),
});

const schemaReserva = z.object({
  apartamento_id: z.coerce.number().int().positive(),
  prospecto_nombre: z.string().min(1),
  fecha_vencimiento: z.string().min(1),
});

const schemaVenta = z.object({
  apartamento_id: z.coerce.number().int().positive(),
  cliente_nombre: z.string().min(1),
  cliente_documento: z.string().min(1),
  cliente_telefono: z.string().min(1),
  cliente_correo: z.string().email(),
  precio_pactado: z.coerce.number().positive(),
  acabados_elegidos: z.string().optional().nullable(),
  fecha_firma: z.string().min(1),
});

const schemaPago = z.object({
  venta_id: z.coerce.number().int().positive(),
  cuota_numero: z.coerce.number().int().positive(),
  fecha_vencimiento: z.string().min(1),
  valor: z.coerce.number().positive(),
  metodo_pago: z.string().optional().nullable(),
  estado: z.enum(["Pendiente", "Pagado", "Vencido"]).optional(),
  fecha_pago: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

const schemaPatchPago = z.object({
  estado: z.enum(["Pendiente", "Pagado", "Vencido"]).optional(),
  fecha_pago: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  metodo_pago: z.string().optional().nullable(),
});

const schemaRubro = z.object({
  proyecto: z.string().min(1),
  rubro: z.string().min(1),
  valor_presupuestado: z.coerce.number().positive(),
});

const schemaGasto = z.object({
  presupuesto_item_id: z.coerce.number().int().positive(),
  fecha: z.string().min(1),
  valor: z.coerce.number().positive(),
  proveedor: z.string().optional().nullable(),
  referencia: z.string().optional().nullable(),
  descripcion: z.string().optional().nullable(),
});

function createApp({ pool }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  async function markPastDue() {
    await pool.query(
      `UPDATE pagos SET estado = 'Vencido'
       WHERE estado = 'Pendiente' AND fecha_vencimiento < CURDATE()`
    );
  }

  function authRequired(req, _res, next) {
    req.auth = req.headers.authorization || "";
    next();
  }

  async function resolveUser(req) {
    const token = req.auth.startsWith("Bearer ") ? req.auth.slice(7) : null;
    if (!token) throw new AppError(401, "UNAUTHORIZED", "No autorizado.");
    const [rows] = await pool.query(
      `SELECT s.token, u.id, u.nombre, u.correo, u.rol
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token = ? AND s.expires_at > NOW()`,
      [token]
    );
    if (!rows.length) {
      throw new AppError(401, "UNAUTHORIZED", "Sesión inválida o expirada.");
    }
    return rows[0];
  }

  function requireRole(user, role) {
    if (user.rol !== role) {
      throw new AppError(
        403,
        "FORBIDDEN",
        `Solo usuarios con rol ${role} pueden ejecutar esta acción.`
      );
    }
  }

  async function logEstadoApartamento({
    apartamentoId,
    estadoAnterior,
    estadoNuevo,
    motivo,
    usuarioId,
    conn = pool,
  }) {
    await conn.query(
      `INSERT INTO estado_apartamento_log
      (apartamento_id, estado_anterior, estado_nuevo, motivo, usuario_id)
      VALUES (?, ?, ?, ?, ?)`,
      [apartamentoId, estadoAnterior, estadoNuevo, motivo, usuarioId]
    );
  }

  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      const [rows] = await pool.query("SELECT NOW() AS now");
      res.json({ ok: true, dbTime: rows[0].now });
    })
  );

  app.post(
    "/api/auth/login",
    asyncHandler(async (req, res) => {
      const payload = validate(schemaLogin, req.body);
      const [rows] = await pool.query(
        "SELECT id, nombre, correo, rol, password_hash FROM usuarios WHERE correo = ?",
        [payload.correo]
      );
      if (!rows.length || rows[0].password_hash !== hashPassword(payload.password)) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales incorrectas.");
      }
      const user = rows[0];
      const token = crypto.randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO sesiones (token, usuario_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))",
        [token, user.id]
      );
      res.json({
        token,
        user: { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol },
      });
    })
  );

  app.use("/api", authRequired);

  app.post(
    "/api/auth/logout",
    asyncHandler(async (req, res) => {
      const user = await resolveUser(req);
      await pool.query("DELETE FROM sesiones WHERE token = ?", [user.token]);
      res.json({ ok: true });
    })
  );

  app.get(
    "/api/auth/me",
    asyncHandler(async (req, res) => {
      const user = await resolveUser(req);
      res.json({ user: { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol } });
    })
  );

  app.get(
    "/api/apartamentos",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
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
        `SELECT
          a.*,
          r.id AS reserva_id,
          r.prospecto_nombre,
          r.fecha_vencimiento AS reserva_vence,
          DATEDIFF(CURDATE(), r.created_at) AS dias_reserva
        FROM apartamentos a
        LEFT JOIN reservas r ON r.apartamento_id = a.id AND r.estado = 'Activa'
        ${whereSql}
        ORDER BY a.proyecto, a.torre, a.numero`,
        values
      );
      res.json(rows);
    })
  );

  app.post(
    "/api/apartamentos",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      const payload = validate(schemaApartamento, req.body);
      try {
        const [result] = await pool.query(
          `INSERT INTO apartamentos (proyecto, torre, numero, piso, area_m2, precio, estado)
           VALUES (?, ?, ?, ?, ?, ?, 'Disponible')`,
          [
            payload.proyecto,
            payload.torre,
            payload.numero,
            payload.piso,
            payload.area_m2,
            payload.precio,
          ]
        );
        const [rows] = await pool.query("SELECT * FROM apartamentos WHERE id = ?", [
          result.insertId,
        ]);
        res.status(201).json(rows[0]);
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          throw new AppError(
            409,
            "DUPLICATE_APARTMENT",
            "Ya existe un apartamento con ese número para este proyecto y torre."
          );
        }
        throw error;
      }
    })
  );

  app.post(
    "/api/reservas",
    asyncHandler(async (req, res) => {
      const user = await resolveUser(req);
      const payload = validate(schemaReserva, req.body);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [aptRows] = await conn.query(
          "SELECT id, estado FROM apartamentos WHERE id = ? FOR UPDATE",
          [payload.apartamento_id]
        );
        if (!aptRows.length) throw new AppError(404, "NOT_FOUND", "Apartamento no encontrado.");
        if (aptRows[0].estado !== "Disponible") {
          throw new AppError(
            409,
            "INVALID_APARTMENT_STATE",
            "Solo se pueden reservar apartamentos disponibles."
          );
        }

        const [result] = await conn.query(
          `INSERT INTO reservas (apartamento_id, prospecto_nombre, fecha_vencimiento, estado, asesor_usuario_id)
           VALUES (?, ?, ?, 'Activa', ?)`,
          [payload.apartamento_id, payload.prospecto_nombre, payload.fecha_vencimiento, user.id]
        );
        await conn.query("UPDATE apartamentos SET estado = 'Reservado' WHERE id = ?", [
          payload.apartamento_id,
        ]);
        await logEstadoApartamento({
          apartamentoId: payload.apartamento_id,
          estadoAnterior: "Disponible",
          estadoNuevo: "Reservado",
          motivo: "Registro de reserva",
          usuarioId: user.id,
          conn,
        });
        await conn.commit();
        const [rows] = await pool.query("SELECT * FROM reservas WHERE id = ?", [result.insertId]);
        res.status(201).json(rows[0]);
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    })
  );

  app.post(
    "/api/ventas",
    asyncHandler(async (req, res) => {
      const user = await resolveUser(req);
      const payload = validate(schemaVenta, req.body);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [aptRows] = await conn.query(
          "SELECT id, estado FROM apartamentos WHERE id = ? FOR UPDATE",
          [payload.apartamento_id]
        );
        if (!aptRows.length) throw new AppError(404, "NOT_FOUND", "Apartamento no encontrado.");
        if (["Reservado", "Vendido", "Escriturado"].includes(aptRows[0].estado)) {
          throw new AppError(
            409,
            "INVALID_APARTMENT_STATE",
            "No se puede registrar venta sobre un apartamento reservado/vendido."
          );
        }
        const [result] = await conn.query(
          `INSERT INTO ventas (
            apartamento_id, cliente_nombre, cliente_documento, cliente_telefono,
            cliente_correo, precio_pactado, acabados_elegidos, fecha_firma, asesor_usuario_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payload.apartamento_id,
            payload.cliente_nombre,
            payload.cliente_documento,
            payload.cliente_telefono,
            payload.cliente_correo,
            payload.precio_pactado,
            payload.acabados_elegidos || null,
            payload.fecha_firma,
            user.id,
          ]
        );
        await conn.query("UPDATE apartamentos SET estado = 'Vendido' WHERE id = ?", [
          payload.apartamento_id,
        ]);
        await logEstadoApartamento({
          apartamentoId: payload.apartamento_id,
          estadoAnterior: aptRows[0].estado,
          estadoNuevo: "Vendido",
          motivo: "Registro de venta",
          usuarioId: user.id,
          conn,
        });
        await conn.commit();
        const [rows] = await pool.query("SELECT * FROM ventas WHERE id = ?", [result.insertId]);
        res.status(201).json(rows[0]);
      } catch (error) {
        await conn.rollback();
        if (error.code === "ER_DUP_ENTRY") {
          throw new AppError(409, "DUPLICATE_SALE", "Este apartamento ya tiene una venta.");
        }
        throw error;
      } finally {
        conn.release();
      }
    })
  );

  app.post(
    "/api/reservas/:id/cancelar",
    asyncHandler(async (req, res) => {
      const user = await resolveUser(req);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          `SELECT r.id, r.apartamento_id, r.estado, a.estado AS estado_apartamento
           FROM reservas r
           JOIN apartamentos a ON a.id = r.apartamento_id
           WHERE r.id = ? FOR UPDATE`,
          [req.params.id]
        );
        if (!rows.length) throw new AppError(404, "NOT_FOUND", "Reserva no encontrada.");
        if (rows[0].estado !== "Activa") {
          throw new AppError(409, "INVALID_RESERVA_STATE", "La reserva ya no está activa.");
        }
        await conn.query("UPDATE reservas SET estado = 'Cancelada' WHERE id = ?", [req.params.id]);
        await conn.query("UPDATE apartamentos SET estado = 'Disponible' WHERE id = ?", [
          rows[0].apartamento_id,
        ]);
        await logEstadoApartamento({
          apartamentoId: rows[0].apartamento_id,
          estadoAnterior: rows[0].estado_apartamento,
          estadoNuevo: "Disponible",
          motivo: "Cancelación de reserva",
          usuarioId: user.id,
          conn,
        });
        await conn.commit();
        res.json({ ok: true });
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    })
  );

  app.post(
    "/api/reservas/:id/convertir-venta",
    asyncHandler(async (req, res) => {
      const user = await resolveUser(req);
      const payload = validate(
        schemaVenta.omit({ apartamento_id: true }),
        req.body
      );
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          `SELECT r.id, r.estado, r.apartamento_id, a.estado AS estado_apartamento
           FROM reservas r
           JOIN apartamentos a ON a.id = r.apartamento_id
           WHERE r.id = ? FOR UPDATE`,
          [req.params.id]
        );
        if (!rows.length) throw new AppError(404, "NOT_FOUND", "Reserva no encontrada.");
        if (rows[0].estado !== "Activa") {
          throw new AppError(409, "INVALID_RESERVA_STATE", "La reserva no está activa.");
        }

        await conn.query(
          `INSERT INTO ventas (
            apartamento_id, cliente_nombre, cliente_documento, cliente_telefono,
            cliente_correo, precio_pactado, acabados_elegidos, fecha_firma, asesor_usuario_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rows[0].apartamento_id,
            payload.cliente_nombre,
            payload.cliente_documento,
            payload.cliente_telefono,
            payload.cliente_correo,
            payload.precio_pactado,
            payload.acabados_elegidos || null,
            payload.fecha_firma,
            user.id,
          ]
        );
        await conn.query("UPDATE reservas SET estado = 'Convertida' WHERE id = ?", [req.params.id]);
        await conn.query("UPDATE apartamentos SET estado = 'Vendido' WHERE id = ?", [
          rows[0].apartamento_id,
        ]);
        await logEstadoApartamento({
          apartamentoId: rows[0].apartamento_id,
          estadoAnterior: rows[0].estado_apartamento,
          estadoNuevo: "Vendido",
          motivo: "Conversión de reserva a venta",
          usuarioId: user.id,
          conn,
        });
        await conn.commit();
        res.json({ ok: true });
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    })
  );

  app.get(
    "/api/ventas",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
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
    })
  );

  app.get(
    "/api/pagos",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      await markPastDue();
      const where = [];
      const values = [];
      if (req.query.proyecto) {
        where.push("proyecto = ?");
        values.push(req.query.proyecto);
      }
      if (req.query.estado && ESTADOS_PAGO.includes(req.query.estado)) {
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
    })
  );

  app.post(
    "/api/pagos",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      const payload = validate(schemaPago, req.body);
      const [ventas] = await pool.query(
        `SELECT v.id, v.cliente_nombre, a.proyecto, CONCAT(a.torre, '-', a.numero) AS apartamento_ref
         FROM ventas v
         JOIN apartamentos a ON a.id = v.apartamento_id
         WHERE v.id = ?`,
        [payload.venta_id]
      );
      if (!ventas.length) {
        throw new AppError(404, "NOT_FOUND", "Venta no encontrada para asociar el pago.");
      }
      const venta = ventas[0];
      const [result] = await pool.query(
        `INSERT INTO pagos (
          venta_id, proyecto, cliente_nombre, apartamento_ref, cuota_numero,
          fecha_vencimiento, valor, metodo_pago, estado, fecha_pago, notas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.venta_id,
          venta.proyecto,
          venta.cliente_nombre,
          venta.apartamento_ref,
          payload.cuota_numero,
          payload.fecha_vencimiento,
          payload.valor,
          payload.metodo_pago || null,
          payload.estado || "Pendiente",
          payload.fecha_pago || null,
          payload.notas || null,
        ]
      );
      const [rows] = await pool.query("SELECT * FROM pagos WHERE id = ?", [result.insertId]);
      res.status(201).json(rows[0]);
    })
  );

  app.patch(
    "/api/pagos/:id",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      const payload = validate(schemaPatchPago, req.body);
      const [result] = await pool.query(
        `UPDATE pagos
         SET estado = COALESCE(?, estado),
             fecha_pago = COALESCE(?, fecha_pago),
             notas = COALESCE(?, notas),
             metodo_pago = COALESCE(?, metodo_pago)
         WHERE id = ?`,
        [
          payload.estado || null,
          payload.fecha_pago || null,
          payload.notas || null,
          payload.metodo_pago || null,
          req.params.id,
        ]
      );
      if (!result.affectedRows) throw new AppError(404, "NOT_FOUND", "Pago no encontrado.");
      const [rows] = await pool.query("SELECT * FROM pagos WHERE id = ?", [req.params.id]);
      res.json(rows[0]);
    })
  );

  app.get(
    "/api/clientes/resumen-pagos",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      await markPastDue();
      const where = [];
      const values = [];
      if (req.query.proyecto) {
        where.push("p.proyecto = ?");
        values.push(req.query.proyecto);
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
      const estadoGlobal = req.query.estado_global;
      const filtered =
        estadoGlobal && ["Al día", "Con pendientes", "Vencido"].includes(estadoGlobal)
          ? rows.filter((r) => r.estado_global === estadoGlobal)
          : rows;
      res.json(filtered);
    })
  );

  app.get(
    "/api/clientes/:ventaId/pagos",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      await markPastDue();
      const [rows] = await pool.query(
        "SELECT * FROM pagos WHERE venta_id = ? ORDER BY cuota_numero ASC",
        [req.params.ventaId]
      );
      res.json(rows);
    })
  );

  app.get(
    "/api/reportes/pagos.csv",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
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
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
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
    })
  );

  app.get(
    "/api/presupuesto/resumen",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
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
          CASE WHEN p.valor_presupuestado = 0 THEN 0
               ELSE (COALESCE(SUM(g.valor), 0) / p.valor_presupuestado) * 100 END AS porcentaje_ejecucion,
          CASE WHEN COALESCE(SUM(g.valor), 0) > p.valor_presupuestado * 1.10 THEN 1 ELSE 0 END AS alerta_desviacion
        FROM presupuesto_items p
        LEFT JOIN gastos_obra g ON g.presupuesto_item_id = p.id
        ${where}
        GROUP BY p.id, p.proyecto, p.rubro, p.valor_presupuestado
        ORDER BY p.proyecto, p.rubro
      `,
        values
      );
      res.json(rows);
    })
  );

  app.post(
    "/api/presupuesto/items",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      const payload = validate(schemaRubro, req.body);
      const [result] = await pool.query(
        `INSERT INTO presupuesto_items (proyecto, rubro, valor_presupuestado)
         VALUES (?, ?, ?)`,
        [payload.proyecto, payload.rubro, payload.valor_presupuestado]
      );
      const [rows] = await pool.query("SELECT * FROM presupuesto_items WHERE id = ?", [
        result.insertId,
      ]);
      res.status(201).json(rows[0]);
    })
  );

  app.put(
    "/api/presupuesto/items/:id",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      const payload = validate(schemaRubro, req.body);
      const [uses] = await pool.query(
        "SELECT COUNT(*) AS total FROM gastos_obra WHERE presupuesto_item_id = ?",
        [req.params.id]
      );
      if (uses[0].total > 0) {
        throw new AppError(
          409,
          "BUDGET_LOCKED",
          "No se puede editar el rubro: ya tiene gastos registrados."
        );
      }
      const [result] = await pool.query(
        `UPDATE presupuesto_items
         SET proyecto = ?, rubro = ?, valor_presupuestado = ?
         WHERE id = ?`,
        [payload.proyecto, payload.rubro, payload.valor_presupuestado, req.params.id]
      );
      if (!result.affectedRows) throw new AppError(404, "NOT_FOUND", "Rubro no encontrado.");
      const [rows] = await pool.query("SELECT * FROM presupuesto_items WHERE id = ?", [
        req.params.id,
      ]);
      res.json(rows[0]);
    })
  );

  app.delete(
    "/api/presupuesto/items/:id",
    asyncHandler(async (req, res) => {
      const user = await resolveUser(req);
      requireRole(user, "Administrador");
      const [uses] = await pool.query(
        "SELECT COUNT(*) AS total FROM gastos_obra WHERE presupuesto_item_id = ?",
        [req.params.id]
      );
      if (uses[0].total > 0) {
        throw new AppError(
          409,
          "BUDGET_LOCKED",
          "No se puede eliminar un presupuesto que ya tiene gastos."
        );
      }
      const [result] = await pool.query("DELETE FROM presupuesto_items WHERE id = ?", [
        req.params.id,
      ]);
      if (!result.affectedRows) throw new AppError(404, "NOT_FOUND", "Rubro no encontrado.");
      res.json({ ok: true });
    })
  );

  app.post(
    "/api/presupuesto/gastos",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      const payload = validate(schemaGasto, req.body);
      const [result] = await pool.query(
        `INSERT INTO gastos_obra (
          presupuesto_item_id, fecha, valor, proveedor, referencia, descripcion
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          payload.presupuesto_item_id,
          payload.fecha,
          payload.valor,
          payload.proveedor || null,
          payload.referencia || null,
          payload.descripcion || null,
        ]
      );
      const [rows] = await pool.query("SELECT * FROM gastos_obra WHERE id = ?", [
        result.insertId,
      ]);
      res.status(201).json(rows[0]);
    })
  );

  app.get(
    "/api/auditoria/estados-apartamento",
    asyncHandler(async (req, res) => {
      await resolveUser(req);
      const [rows] = await pool.query(
        `SELECT
          l.id,
          l.created_at,
          l.estado_anterior,
          l.estado_nuevo,
          l.motivo,
          a.proyecto,
          a.torre,
          a.numero,
          u.nombre AS usuario
        FROM estado_apartamento_log l
        JOIN apartamentos a ON a.id = l.apartamento_id
        JOIN usuarios u ON u.id = l.usuario_id
        ORDER BY l.created_at DESC
        LIMIT 200`
      );
      res.json(rows);
    })
  );

  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({
        errorCode: err.code,
        message: err.message,
        details: err.details,
      });
    }
    console.error(err);
    return res.status(500).json({
      errorCode: "INTERNAL_ERROR",
      message: "Error interno del servidor.",
    });
  });

  return app;
}

module.exports = { createApp, AppError, ESTADOS_APARTAMENTO, ESTADOS_PAGO };
