const path = require("path");
const dotenv = require("dotenv");

dotenv.config();
if (!process.env.DB_HOST) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

const { initSchema, pool } = require("./db");
const { createApp } = require("./app");

const app = createApp({ pool });
const PORT = Number(process.env.PORT || 4000);

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

module.exports = { app };
