# SGI CIRNSAS - MVP

Repositorio base del MVP para CIRNSAS con arquitectura:

- `frontend`: React + Vite
- `backend`: Node.js + Express
- `database`: PostgreSQL

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
   - Resumen de ejecutado vs presupuestado.

## Requisitos

- Node.js 20+ ([https://nodejs.org](https://nodejs.org))
- PostgreSQL 14+ ([https://www.postgresql.org/download/](https://www.postgresql.org/download/))

## Instalación

### 1) Crear base de datos

En PostgreSQL crea la base:

```sql
CREATE DATABASE cirnsas_mvp;
```

### 2) Configurar variables de entorno del backend

En la carpeta `backend`, crea un archivo `.env` basado en `.env.example`:

```bash
cp backend/.env.example backend/.env
```

Ejemplo de valor:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cirnsas_mvp
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

## Seed opcional de datos

Para insertar datos iniciales de prueba:

```bash
psql "postgresql://postgres:postgres@localhost:5432/cirnsas_mvp" -f backend/sql/seed.sql
```

## Endpoints principales

- `GET /api/health`
- `GET/POST /api/apartamentos`
- `PATCH /api/apartamentos/:id/estado`
- `GET/POST /api/pagos`
- `PATCH /api/pagos/:id`
- `GET /api/presupuesto/resumen`
- `POST /api/presupuesto/items`
- `POST /api/presupuesto/gastos`