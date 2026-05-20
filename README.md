# SGI CIRNSAS - MVP

Aplicativo interno para CIRNSAS que centraliza:

- Inventario y estado comercial de apartamentos
- Reservas y ventas con trazabilidad
- Seguimiento de pagos por cliente
- Control presupuestal de obra (presupuestado vs ejecutado)
- Autenticación básica, auditoría y exportación de reportes

## Arquitectura

- `frontend`: React + Vite
- `backend`: Node.js + Express
- `database`: MySQL
- `ci`: GitHub Actions
- `quality`: tests backend/frontend + validación con Zod

## Estructura

- `frontend/src/App.jsx`: interfaz principal del MVP
- `backend/src/app.js`: rutas, validación, permisos y errores estandarizados
- `backend/src/db.js`: conexión y esquema MySQL
- `backend/sql/seed.sql`: datos de prueba
- `.github/workflows/ci.yml`: pipeline CI
- `docker-compose.yml`: stack local completo con Docker

## Historias de usuario cubiertas

- HU-01 a HU-03: inventario, reservas, ventas y cambios de estado
- HU-04 y HU-05: registro de pagos, estados automáticos y vista por cliente
- HU-06 a HU-08: presupuesto, gastos, comparativo y alertas
- HU-09: login con sesión y control básico de permisos
- HU-10: exportación CSV de estado de pagos

## Requisitos

- Node.js 20+
- MySQL 8+

## Variables de entorno

Copia `.env.example` en `.env`:

```bash
cp .env.example .env
```

Contenido esperado:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=cirnsas_db
AUTH_SALT=cirnsas_mvp_salt
```

## Ejecución local (sin Docker)

1) Crear base de datos:

```sql
CREATE DATABASE cirnsas_db;
```

2) Instalar dependencias:

```bash
npm install
npm run install:all
```

3) Levantar app:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Credenciales demo:

- `asesor@cirnsas.com` / `asesor123`
- `admin@cirnsas.com` / `admin123`

4) (Opcional) Cargar seed:

```bash
mysql -u root -p cirnsas_db < backend/sql/seed.sql
```

## Ejecución con Docker Compose

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- MySQL: `localhost:3306` (`root/root`)

## Pruebas y calidad

```bash
npm test
```

Esto ejecuta:

- tests de backend (`vitest` + `supertest`)
- tests de frontend (`vitest` + `testing-library`)

## Endpoints clave

- `POST /api/auth/login`
- `GET /api/apartamentos`
- `POST /api/reservas`
- `POST /api/ventas`
- `GET /api/clientes/resumen-pagos`
- `GET /api/reportes/pagos.csv`
- `GET /api/presupuesto/resumen`
- `GET /api/auditoria/estados-apartamento`

## Checklist demo (video)

1. Login con usuario asesor
2. Crear apartamento y filtrarlo
3. Crear reserva y convertirla a venta
4. Registrar cuotas/pagos y ver estado global del cliente
5. Exportar reporte CSV de pagos
6. Registrar rubro + gasto y mostrar alerta de desviación
7. Mostrar pestaña de auditoría y trazabilidad de cambios