const mysql = require("mysql2/promise");
const crypto = require("crypto");

const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

if (!DB_HOST || !DB_USER || !DB_NAME) {
  throw new Error("Faltan variables DB_HOST, DB_USER o DB_NAME en el .env.");
}

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD || "",
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

function hashPassword(password) {
  const salt = process.env.AUTH_SALT || "cirnsas_mvp_salt";
  return crypto.createHash("sha256").update(`${password}:${salt}`).digest("hex");
}

async function initSchema() {
  async function ensureColumn(tableName, columnName, definitionSql) {
    const [rows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
      [DB_NAME, tableName, columnName]
    );

    if (rows[0].total === 0) {
      await pool.query(
        `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`
      );
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS apartamentos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proyecto VARCHAR(120) NOT NULL,
      torre VARCHAR(50) NOT NULL,
      numero VARCHAR(20) NOT NULL,
      piso INT NOT NULL,
      area_m2 DECIMAL(10,2) NOT NULL,
      precio DECIMAL(14,2) NOT NULL,
      estado VARCHAR(40) NOT NULL DEFAULT 'Disponible',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_apartamento (proyecto, torre, numero)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      correo VARCHAR(120) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      rol VARCHAR(40) NOT NULL DEFAULT 'Asesor',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sesiones (
      token VARCHAR(128) PRIMARY KEY,
      usuario_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      CONSTRAINT fk_sesion_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ventas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      apartamento_id INT NOT NULL UNIQUE,
      cliente_nombre VARCHAR(120) NOT NULL,
      cliente_documento VARCHAR(50) NOT NULL,
      cliente_telefono VARCHAR(50) NOT NULL,
      cliente_correo VARCHAR(120) NOT NULL,
      precio_pactado DECIMAL(14,2) NOT NULL,
      acabados_elegidos VARCHAR(120) NULL,
      fecha_firma DATE NOT NULL,
      asesor_usuario_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_venta_apartamento
        FOREIGN KEY (apartamento_id) REFERENCES apartamentos(id) ON DELETE CASCADE,
      CONSTRAINT fk_venta_asesor
        FOREIGN KEY (asesor_usuario_id) REFERENCES usuarios(id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      apartamento_id INT NOT NULL,
      prospecto_nombre VARCHAR(120) NOT NULL,
      fecha_vencimiento DATE NOT NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'Activa',
      asesor_usuario_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_reserva_apartamento
        FOREIGN KEY (apartamento_id) REFERENCES apartamentos(id) ON DELETE CASCADE,
      CONSTRAINT fk_reserva_asesor
        FOREIGN KEY (asesor_usuario_id) REFERENCES usuarios(id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      venta_id INT NULL,
      proyecto VARCHAR(120) NOT NULL,
      cliente_nombre VARCHAR(120) NOT NULL,
      apartamento_ref VARCHAR(40) NOT NULL,
      cuota_numero INT NOT NULL,
      fecha_vencimiento DATE NOT NULL,
      valor DECIMAL(14,2) NOT NULL,
      metodo_pago VARCHAR(60) NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
      fecha_pago DATE NULL,
      notas TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pago_venta
        FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL
    );
  `);

  await ensureColumn("pagos", "venta_id", "INT NULL AFTER id");
  await ensureColumn(
    "pagos",
    "proyecto",
    "VARCHAR(120) NOT NULL DEFAULT '' AFTER venta_id"
  );
  await ensureColumn("pagos", "metodo_pago", "VARCHAR(60) NULL AFTER valor");
  await ensureColumn(
    "pagos",
    "cliente_nombre",
    "VARCHAR(120) NOT NULL DEFAULT '' AFTER proyecto"
  );
  await ensureColumn(
    "pagos",
    "apartamento_ref",
    "VARCHAR(40) NOT NULL DEFAULT '' AFTER cliente_nombre"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS estado_apartamento_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      apartamento_id INT NOT NULL,
      estado_anterior VARCHAR(40) NOT NULL,
      estado_nuevo VARCHAR(40) NOT NULL,
      motivo VARCHAR(80) NOT NULL,
      usuario_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_log_apartamento
        FOREIGN KEY (apartamento_id) REFERENCES apartamentos(id) ON DELETE CASCADE,
      CONSTRAINT fk_log_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS presupuesto_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proyecto VARCHAR(120) NOT NULL,
      rubro VARCHAR(120) NOT NULL,
      valor_presupuestado DECIMAL(14,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_presupuesto_rubro (proyecto, rubro)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gastos_obra (
      id INT AUTO_INCREMENT PRIMARY KEY,
      presupuesto_item_id INT NOT NULL,
      fecha DATE NOT NULL,
      valor DECIMAL(14,2) NOT NULL,
      proveedor VARCHAR(120) NULL,
      referencia VARCHAR(120) NULL,
      descripcion TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_gastos_presupuesto
        FOREIGN KEY (presupuesto_item_id) REFERENCES presupuesto_items(id)
        ON DELETE CASCADE
    );
  `);
  await ensureColumn("gastos_obra", "proveedor", "VARCHAR(120) NULL AFTER valor");
  await ensureColumn(
    "gastos_obra",
    "referencia",
    "VARCHAR(120) NULL AFTER proveedor"
  );

  const [usuarios] = await pool.query("SELECT COUNT(*) AS total FROM usuarios");
  if (usuarios[0].total === 0) {
    await pool.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol)
       VALUES
         ('Administrador CIRNSAS', 'admin@cirnsas.com', ?, 'Administrador'),
         ('Asesor Comercial', 'asesor@cirnsas.com', ?, 'Asesor')`,
      [hashPassword("admin123"), hashPassword("asesor123")]
    );
  }
}

module.exports = { pool, initSchema, hashPassword };
