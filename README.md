# exactamente-backend

API REST del proyecto **Exactamente**, construida con [Hono](https://hono.dev/), [Bun](https://bun.sh/) y [Drizzle ORM](https://orm.drizzle.team/) sobre PostgreSQL.

## Requisitos

- [Bun](https://bun.sh/) >= 1.0
- [Docker](https://www.docker.com/) y Docker Compose (para la base de datos)

## Instalación

```bash
bun install
```

## Variables de entorno

Copia el archivo de ejemplo y ajusta los valores:

```bash
cp .env.example .env
```

| Variable       | Descripción                              | Valor por defecto                                        |
|----------------|------------------------------------------|----------------------------------------------------------|
| `DATABASE_URL` | URL de conexión a PostgreSQL             | `postgresql://postgres:postgres@localhost:5432/exactamente` |
| `JWT_SECRET`   | Clave secreta para firmar tokens JWT     | —                                                        |
| `PORT`         | Puerto en el que corre el servidor       | `3000`                                                   |
| `NODE_ENV`     | Entorno de ejecución                     | `development`                                            |
| `CORS_ORIGIN`  | Origen permitido para CORS               | `http://localhost:4321`                                  |

## Base de datos

Levantá la base de datos con Docker:

```bash
docker compose up -d
```

Ejecutá las migraciones:

```bash
bun db:migrate
```

(Opcional) Cargá los datos iniciales:

```bash
bun seed
```

## Desarrollo

```bash
bun dev
```

El servidor queda disponible en `http://localhost:3000`.

### Endpoint de salud

```
GET /health
```

## Comandos disponibles

| Comando          | Descripción                                  |
|------------------|----------------------------------------------|
| `bun dev`        | Servidor en modo desarrollo con hot-reload   |
| `bun start`      | Servidor en producción                       |
| `bun test`       | Ejecutar tests                               |
| `bun db:generate`| Generar migraciones a partir del schema      |
| `bun db:migrate` | Aplicar migraciones a la base de datos       |
| `bun db:studio`  | Abrir Drizzle Studio (UI para la DB)         |
| `bun seed`       | Cargar datos de ejemplo en la base de datos  |

## Estructura del proyecto

```
src/
├── db/             # Conexión, schema y migraciones
├── middleware/     # Auth y autorización por rol
├── routes/         # Endpoints de la API
├── services/       # Lógica de negocio
├── types/          # Tipos TypeScript compartidos
├── utils/          # Utilidades generales
├── validators/     # Schemas de validación con Zod
├── app.ts          # Configuración de la app Hono
└── index.ts        # Entry point del servidor
```

## API

Base URL: `/api/v1`

| Recurso          | Ruta                    |
|------------------|-------------------------|
| Autenticación    | `/api/v1/auth`          |
| Universidades    | `/api/v1/universities`  |
| Facultades       | `/api/v1/faculties`     |
| Carreras         | `/api/v1/careers`       |
| Materias         | `/api/v1/subjects`      |
| Recursos         | `/api/v1/resources`     |
