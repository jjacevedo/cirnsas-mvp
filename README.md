# SGI CIRNSAS - MVP

Repositorio base del MVP para CIRNSAS con arquitectura:

- `frontend`: React + Vite
- `backend`: Node.js + Express
- `database`: MySQL

## Qué incluye este MVP

1. **Inventario de apartamentos**
   - Registro de apartamentos por proyecto/torre.
   - Cambio de estado (`Disponible`, `Reservado`, `En promesa de compra`, `Escriturado`).

2. **Seguimiento de pagos**
   - Registro de cuotas por cliente.
   - Cambio de estado de pago (`Pendiente`, `Pagado`, `Vencido`).

3. **Control presupuestal**
   - Registro de rubros presupuestados.
   - Registro de gastos de obra.
   - Resumen de ejecutado vs presupuestado con porcentaje y alertas.

4. **Autenticación y reportes**
   - Login con usuario/contraseña.
   - Sesión activa y cierre de sesión.
   - Exportación de reporte de pagos en CSV (compatible con Excel).

## Requisitos

- Node.js 20+ ([https://nodejs.org](https://nodejs.org))
- MySQL 8+ ([https://dev.mysql.com/downloads/mysql/](https://dev.mysql.com/downloads/mysql/))

## Instalación

### 1) Crear base de datos

En MySQL crea la base:

```sql
CREATE DATABASE cirnsas_db;
```

### 2) Configurar variables de entorno

Usa el archivo `.env` en la raiz del proyecto con:

```env
PORT=4000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=cirnsas_db
```

### 3) Instalar dependencias

Desde la raíz del proyecto:

```bash
npm install
npm run install:all
```

## Ejecución en desarrollo

Desde la raíz:

```bash
npm run dev
```

Esto levanta:

- Backend: [http://localhost:4000](http://localhost:4000)
- Frontend: [http://localhost:5173](http://localhost:5173)

Credenciales demo:

- `asesor@cirnsas.com` / `asesor123`
- `admin@cirnsas.com` / `admin123`

## Seed opcional de datos

Para insertar datos iniciales de prueba (despues de iniciar la API una vez para que cree tablas):

```bash
mysql -u root -p cirnsas_db < backend/sql/seed.sql
```

## Endpoints principales

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET/POST /api/apartamentos`
- `POST /api/ventas`
- `POST /api/reservas`
- `POST /api/reservas/:id/cancelar`
- `POST /api/reservas/:id/convertir-venta`
- `GET /api/ventas`
- `GET/POST /api/pagos`
- `PATCH /api/pagos/:id`
- `GET /api/clientes/resumen-pagos`
- `GET /api/clientes/:ventaId/pagos`
- `GET /api/reportes/pagos.csv`
- `GET /api/presupuesto/resumen`
- `POST /api/presupuesto/items`
- `PUT /api/presupuesto/items/:id`
- `DELETE /api/presupuesto/items/:id`
- `POST /api/presupuesto/gastos`