const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta DATABASE_URL en variables de entorno.");
}

const pool = new Pool({
  connectionString,
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apartamentos (
      id SERIAL PRIMARY KEY,
      proyecto VARCHAR(120) NOT NULL,
      torre VARCHAR(50) NOT NULL,
      numero VARCHAR(20) NOT NULL,
      piso INTEGER NOT NULL CHECK (piso >= 0),
      area_m2 NUMERIC(10,2) NOT NULL CHECK (area_m2 > 0),
      precio NUMERIC(14,2) NOT NULL CHECK (precio > 0),
      estado VARCHAR(40) NOT NULL DEFAULT 'Disponible',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos (
      id SERIAL PRIMARY KEY,
      cliente_nombre VARCHAR(120) NOT NULL,
      apartamento_ref VARCHAR(40) NOT NULL,
      cuota_numero INTEGER NOT NULL CHECK (cuota_numero > 0),
      fecha_vencimiento DATE NOT NULL,
      valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
      estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
      fecha_pago DATE,
      notas TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS presupuesto_items (
      id SERIAL PRIMARY KEY,
      proyecto VARCHAR(120) NOT NULL,
      rubro VARCHAR(120) NOT NULL,
      valor_presupuestado NUMERIC(14,2) NOT NULL CHECK (valor_presupuestado > 0),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gastos_obra (
      id SERIAL PRIMARY KEY,
      presupuesto_item_id INTEGER NOT NULL REFERENCES presupuesto_items(id) ON DELETE CASCADE,
      fecha DATE NOT NULL,
      valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
      descripcion TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

module.exports = {
  pool,
  initSchema,
};
