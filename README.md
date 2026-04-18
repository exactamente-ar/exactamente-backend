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

### Salud

```
GET /health
```

---

### Autenticación — `/api/v1/auth`

#### `POST /api/v1/auth/register`

Registra un nuevo usuario.

**Body (JSON):**

| Campo         | Tipo   | Requerido | Descripción                        |
|---------------|--------|-----------|------------------------------------|
| `email`       | string | sí        | Email válido                       |
| `password`    | string | sí        | Mínimo 8 caracteres                |
| `displayName` | string | sí        | Nombre para mostrar (2–100 chars)  |

**Respuesta `201`:**
```json
{
  "user": { "id": "...", "email": "...", "displayName": "...", "role": "user" },
  "token": "<JWT>"
}
```

**Errores:** `409` si el email ya está registrado.

---

#### `POST /api/v1/auth/login`

Inicia sesión con email y contraseña.

**Body (JSON):**

| Campo      | Tipo   | Requerido |
|------------|--------|-----------|
| `email`    | string | sí        |
| `password` | string | sí        |

**Respuesta `200`:**
```json
{
  "user": { "id": "...", "email": "...", "displayName": "...", "role": "user" },
  "token": "<JWT>"
}
```

**Errores:** `401` si las credenciales son inválidas.

---

#### `GET /api/v1/auth/me`

Devuelve el usuario autenticado. Requiere header `Authorization: Bearer <token>`.

**Respuesta `200`:**
```json
{
  "user": { "id": "...", "email": "...", "displayName": "...", "role": "user" }
}
```

**Errores:** `401` sin token, `404` si el usuario no existe.

---

### Universidades — `/api/v1/universities`

#### `GET /api/v1/universities`

Lista todas las universidades ordenadas por nombre.

**Respuesta `200`:**
```json
{
  "data": [{ "id": "...", "name": "...", "slug": "..." }]
}
```

---

### Facultades — `/api/v1/faculties`

#### `GET /api/v1/faculties`

Lista facultades, opcionalmente filtradas por universidad.

**Query params:**

| Param          | Tipo   | Descripción                        |
|----------------|--------|------------------------------------|
| `universityId` | string | (opcional) Filtra por universidad  |

**Respuesta `200`:**
```json
{
  "data": [{ "id": "...", "name": "...", "slug": "...", "universityId": "..." }]
}
```

---

### Carreras — `/api/v1/careers`

#### `GET /api/v1/careers`

Lista carreras, opcionalmente filtradas por facultad.

**Query params:**

| Param       | Tipo   | Descripción                     |
|-------------|--------|---------------------------------|
| `facultyId` | string | (opcional) Filtra por facultad  |

**Respuesta `200`:**
```json
{
  "data": [{ "id": "...", "name": "...", "slug": "...", "facultyId": "..." }]
}
```

---

### Materias — `/api/v1/subjects`

#### `GET /api/v1/subjects`

Lista materias con paginación y filtros.

**Query params:**

| Param        | Tipo   | Descripción                                 |
|--------------|--------|---------------------------------------------|
| `careerId`   | string | (opcional) Filtra por carrera               |
| `facultyId`  | string | (opcional) Filtra por facultad              |
| `year`       | number | (opcional) Año de cursado (1–5)             |
| `quadmester` | number | (opcional) Cuatrimestre (1–2)               |
| `search`     | string | (opcional) Búsqueda por título (parcial)    |
| `page`       | number | Página (default: `1`)                       |
| `limit`      | number | Resultados por página (default: `20`, max: `100`) |

**Respuesta `200`:**
```json
{
  "data": [{
    "id": "...", "title": "...", "slug": "...", "year": 1, "quadmester": 1,
    "careers": [{ "careerId": "...", "year": 1, "quadmester": 1 }],
    "prerequisites": ["<subjectId>"],
    "correlatives": ["<subjectId>"]
  }],
  "pagination": { "total": 50, "page": 1, "limit": 20, "totalPages": 3 }
}
```

---

#### `GET /api/v1/subjects/:id`

Devuelve el detalle de una materia por su ID, incluyendo prerequisitos y correlativas completas.

**Respuesta `200`:**
```json
{
  "subject": {
    "id": "...", "title": "...", "slug": "...", "year": 2, "quadmester": 1,
    "description": "...", "urlMoodle": "...", "urlPrograma": "...",
    "careers": [{ "careerId": "...", "year": 2, "quadmester": 1 }],
    "prerequisites": ["<subjectId>"],
    "correlatives": ["<subjectId>"],
    "prerequisiteSubjects": [{ "id": "...", "title": "..." }],
    "correlativeSubjects": [{ "id": "...", "title": "..." }]
  }
}
```

**Errores:** `404` si la materia no existe.

---

### Recursos — `/api/v1/resources`

#### `GET /api/v1/resources`

Lista recursos publicados con paginación y filtros.

**Query params:**

| Param       | Tipo                                | Descripción                                       |
|-------------|-------------------------------------|---------------------------------------------------|
| `subjectId` | string                              | (opcional) Filtra por materia                     |
| `type`      | `resumen` \| `parcial` \| `final`   | (opcional) Filtra por tipo de recurso             |
| `page`      | number                              | Página (default: `1`)                             |
| `limit`     | number                              | Resultados por página (default: `20`, max: `100`) |

**Respuesta `200`:**
```json
{
  "data": [{
    "id": "...", "subjectId": "...", "title": "...",
    "type": "parcial", "status": "published",
    "driveFileId": "...", "driveSize": 12345, "downloadCount": 7,
    "publishedAt": "2024-01-01T00:00:00.000Z",
    "previewUrl": "https://drive.google.com/file/d/.../preview",
    "downloadUrl": "https://drive.google.com/uc?export=download&id=..."
  }],
  "pagination": { "total": 10, "page": 1, "limit": 20, "totalPages": 1 }
}
```
