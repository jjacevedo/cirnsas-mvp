const request = require("supertest");
const crypto = require("crypto");
const { createApp } = require("../src/app");

function hashPassword(password) {
  const salt = process.env.AUTH_SALT || "cirnsas_mvp_salt";
  return crypto.createHash("sha256").update(`${password}:${salt}`).digest("hex");
}

function makePool() {
  const user = {
    id: 2,
    nombre: "Asesor Comercial",
    correo: "asesor@cirnsas.com",
    rol: "Asesor",
    password_hash: hashPassword("asesor123"),
  };

  return {
    async query(sql, params) {
      if (sql.includes("FROM usuarios WHERE correo = ?")) {
        if (params[0] === user.correo) return [[user], []];
        return [[], []];
      }
      if (sql.includes("INSERT INTO sesiones")) return [{ insertId: 1 }, []];
      if (sql.includes("FROM sesiones s")) {
        return [[{ token: "token123", id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol }], []];
      }
      if (sql.includes("SELECT * FROM apartamentos")) return [[], []];
      if (sql.includes("SELECT COUNT(*) AS total FROM gastos_obra"))
        return [[{ total: 0 }], []];
      if (sql.includes("DELETE FROM presupuesto_items"))
        return [{ affectedRows: 1 }, []];
      if (sql.includes("SELECT * FROM pagos")) return [[], []];
      if (sql.includes("UPDATE pagos SET estado = 'Vencido'"))
        return [{ affectedRows: 0 }, []];
      return [[], []];
    },
    async getConnection() {
      return {
        query: this.query.bind(this),
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
      };
    },
  };
}

describe("API core", () => {
  let app;

  beforeEach(() => {
    process.env.AUTH_SALT = "test_salt";
    app = createApp({ pool: makePool() });
  });

  it("rechaza login con credenciales inválidas", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ correo: "asesor@cirnsas.com", password: "mala" });

    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("INVALID_CREDENTIALS");
  });

  it("permite login con credenciales válidas", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ correo: "asesor@cirnsas.com", password: "asesor123" });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.correo).toBe("asesor@cirnsas.com");
  });

  it("protege endpoints privados sin token", async () => {
    const response = await request(app).get("/api/apartamentos");
    expect(response.status).toBe(401);
    expect(response.body.errorCode).toBe("UNAUTHORIZED");
  });

  it("expone error estructurado de validación", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ correo: "no-es-correo", password: "" });
    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("VALIDATION_ERROR");
  });
});
