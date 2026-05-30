# exactamente-backend

API REST del proyecto **Exactamente**, construida con [Hono](https://hono.dev/), [Bun](https://bun.sh/) y [Drizzle ORM](https://orm.drizzle.team/) sobre PostgreSQL.

## Stack

| Capa | Tecnología |
|------|-----------|
| Runtime | Bun |
| Framework | Hono v4.6 |
| DB | PostgreSQL 16 (Docker) + Drizzle ORM |
| Validación | Zod + @hono/zod-validator |
| Auth | JWT (HS256, 7 días) |
| Storage | Cloudflare R2 (S3-compatible) |

---

## Setup

### Requisitos

- [Bun](https://bun.sh/) >= 1.0
- [Docker](https://www.docker.com/) y Docker Compose

### Instalación

```bash
bun install
cp .env.example .env   # ajustar valores
docker compose up -d   # base de datos
bun db:migrate
bun seed               # datos de ejemplo (opcional)
```

### Variables de entorno

| Variable | Requerida | Descripción | Default |
|----------|-----------|-------------|---------|
| `DATABASE_URL` | Sí | URL de conexión a PostgreSQL | `postgresql://postgres:postgres@localhost:5432/exactamente` |
| `JWT_SECRET` | Sí | Clave secreta para firmar JWTs | — |
| `PORT` | No | Puerto del servidor | `3000` |
| `NODE_ENV` | No | Entorno de ejecución | `development` |
| `CORS_ORIGIN` | No | Origen(es) permitido(s) para CORS (separados por coma) | `http://localhost:4321` |
| `GOOGLE_CLIENT_ID` | No | Client ID de Google OAuth | — |
| `GOOGLE_CLIENT_SECRET` | No | Client Secret de Google OAuth | — |
| `R2_ACCOUNT_ID` | No | Account ID de Cloudflare R2 | — |
| `R2_ACCESS_KEY_ID` | No | Access Key de R2 | — |
| `R2_SECRET_ACCESS_KEY` | No | Secret Key de R2 | — |
| `R2_BUCKET_NAME` | No | Nombre del bucket de R2 | — |

### Setup adicional (una sola vez)

Habilitar la extensión `unaccent` en PostgreSQL (necesaria para búsqueda accent-insensitive):

```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS unaccent;"
```

### Comandos

| Comando | Descripción |
|---------|-------------|
| `bun dev` | Servidor con hot-reload |
| `bun start` | Servidor en producción |
| `bun test` | Tests unitarios |
| `bun db:generate` | Generar migración desde schema |
| `bun db:migrate` | Aplicar migraciones |
| `bun db:studio` | Drizzle Studio (UI para la DB) |
| `bun seed` | Cargar datos de ejemplo |

---

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

---

## API Reference

**Base URL:**
- Producción: `https://api.exactamente.com.ar/api/v1`
- Local: `http://localhost:3000/api/v1`

### Convenciones

**Auth:** todas las rutas protegidas requieren header:
```
Authorization: Bearer <jwt_token>
```

**Paginación** (respuesta estándar):
```json
{ "data": [...], "total": 100, "page": 1, "totalPages": 10 }
```
Excepción: `GET /api/v1/careers` devuelve `{ "data": [...] }` sin paginación.

**Errores:**
```json
{ "error": "Mensaje descriptivo" }
```

| Código | Causa |
|--------|-------|
| 400 | Validación fallida |
| 401 | Sin token o token inválido |
| 403 | Rol insuficiente |
| 404 | Recurso no encontrado |
| 409 | Conflicto de estado |
| 429 | Rate limit excedido |
| 500 | Error interno |

**Roles:** `user` < `admin` < `superadmin` — rutas `/admin/*` requieren al menos `admin`.

---

### Salud

#### `GET /health`

```json
{ "status": "ok", "timestamp": "2025-01-01T00:00:00.000Z" }
```

---

### Autenticación — `/api/v1/auth`

#### `POST /api/v1/auth/register`

Registra un nuevo usuario. Rate limit: 5 req/hora por IP.

**Body (JSON):**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `email` | string | Sí | Email válido |
| `password` | string | Sí | Mínimo 8 caracteres |
| `displayName` | string | Sí | 2–100 caracteres |

**Respuesta `201`:**
```json
{
  "user": { "id": "uuid", "email": "...", "displayName": "...", "role": "user" },
  "token": "<JWT>"
}
```

**Errores:** `409` si el email ya está registrado.

---

#### `POST /api/v1/auth/login`

Inicia sesión con email y contraseña. Rate limit: 10 req/15 min por IP.

**Body (JSON):**

| Campo | Tipo | Requerido |
|-------|------|-----------|
| `email` | string | Sí |
| `password` | string | Sí |

**Respuesta `200`:** igual que register.

**Errores:** `401` credenciales inválidas. Usuarios creados con Google (sin contraseña) no pueden usar este endpoint.

---

#### `GET /api/v1/auth/me` 🔒

Devuelve el usuario autenticado.

**Respuesta `200`:**
```json
{ "user": { "id": "uuid", "email": "...", "displayName": "...", "role": "user" } }
```

---

#### `GET /api/v1/auth/google`

Inicia el flujo OAuth con Google. Redirige al consent screen (302). Rate limit: 20 req/15 min por IP.

---

#### `GET /api/v1/auth/google/callback`

Callback de Google después del consent. Intercambia el code por un JWT propio y redirige al frontend.

**Query params:**

| Param | Descripción |
|-------|-------------|
| `code` | Authorization code de Google (si el usuario aceptó) |
| `error` | Presente si el usuario rechazó o hubo error en Google |

**Flujo:**
1. Si hay `error` o falta `code` → redirect a `CORS_ORIGIN/login?error=oauth_denied`
2. Intercambia `code` por access_token en Google
3. Busca usuario por `googleId` o `email`:
   - No existe → crea usuario (`emailVerified: true`, sin contraseña)
   - Existe sin `googleId` → vincula la cuenta email/password con Google
   - Existe con `googleId` → login normal
4. Firma JWT y redirige a `CORS_ORIGIN/auth/callback?token=<jwt>`
5. Si falla el intercambio con Google → redirect a `CORS_ORIGIN/login?error=oauth_failed`

Rate limit: 20 req/15 min por IP.

---

### Universidades — `/api/v1/universities`

#### `GET /api/v1/universities`

Lista universidades paginadas.

**Query params:** `page` (default 1), `limit` (default 20, max 100)

**Respuesta `200`:**
```json
{
  "data": [{
    "id": "uuid",
    "name": "Universidad de Buenos Aires",
    "shortName": "UBA",
    "slug": "uba",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }],
  "total": 5, "page": 1, "totalPages": 1
}
```

---

### Facultades — `/api/v1/faculties`

#### `GET /api/v1/faculties`

Lista facultades paginadas.

**Query params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `universityId` | string | (opcional) Filtra por universidad |
| `page` | number | Default 1 |
| `limit` | number | Default 20, max 100 |

**Respuesta `200`:**
```json
{
  "data": [{
    "id": "uuid",
    "universityId": "uuid",
    "name": "Facultad de Ciencias Exactas y Naturales",
    "shortName": "Exactas",
    "slug": "exactas",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }],
  "total": 3, "page": 1, "totalPages": 1
}
```

---

### Carreras — `/api/v1/careers`

#### `GET /api/v1/careers`

Lista **todas** las carreras (sin paginación).

**Query params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `facultyId` | string | (opcional) Filtra por facultad |

**Respuesta `200`:**
```json
{
  "data": [{
    "id": "uuid",
    "facultyId": "uuid",
    "name": "Ingeniería en Sistemas",
    "shortName": null,
    "slug": "ingenieria-en-sistemas",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }]
}
```

---

### Materias — `/api/v1/subjects`

#### `GET /api/v1/subjects`

Lista materias con sus carreras asociadas.

**Query params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `careerId` | string | (opcional) Filtra por carrera |
| `facultyId` | string | (opcional) Filtra por facultad |
| `year` | number | (opcional) Año de cursada (1–5) |
| `quadmester` | number | (opcional) Cuatrimestre (1–2) |
| `search` | string | (opcional) Búsqueda por título (accent-insensitive) |
| `page` | number | Default 1 |
| `limit` | number | Default 20, max 100 |

**Respuesta `200`:**
```json
{
  "data": [{
    "id": "uuid",
    "facultyId": "uuid",
    "title": "Algoritmos y Estructuras de Datos",
    "slug": "algoritmos-y-estructuras-de-datos",
    "description": "...",
    "urlMoodle": "https://...",
    "urlPrograma": "https://...",
    "year": 2,
    "quadmester": 1,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "careers": [{
      "careerId": "uuid",
      "careerName": "Ingeniería en Sistemas",
      "facultyId": "uuid",
      "facultyName": "Exactas",
      "universityId": "uuid",
      "universityName": "UBA",
      "planId": "uuid",
      "year": 2,
      "quadmester": 1
    }]
  }],
  "total": 42, "page": 1, "totalPages": 3
}
```

---

#### `GET /api/v1/subjects/:id`

Detalle de una materia.

**Respuesta `200`:**
```json
{
  "subject": {
    "id": "uuid",
    "facultyId": "uuid",
    "title": "Algoritmos y Estructuras de Datos",
    "slug": "algoritmos-y-estructuras-de-datos",
    "description": "...",
    "urlMoodle": "https://...",
    "urlPrograma": "https://...",
    "year": 2,
    "quadmester": 1,
    "createdAt": "...",
    "updatedAt": "...",
    "careers": [{ "careerId": "uuid", "year": 2, "quadmester": 1 }]
  }
}
```

**Errores:** `404`

---

### Recursos — `/api/v1/resources`

#### `GET /api/v1/resources`

Lista recursos publicados.

**Query params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `subjectId` | string | (opcional) Filtra por materia |
| `type` | `resumen` \| `parcial` \| `final` | (opcional) Filtra por tipo |
| `page` | number | Default 1 |
| `limit` | number | Default 20, max 100 |

Solo devuelve `status = 'published'`, ordenados por `publishedAt` desc.

**Respuesta `200`:**
```json
{
  "data": [{
    "id": "uuid",
    "subjectId": "uuid",
    "title": "Recuperatorio - Álgebra - Jun 2024 (Tema 2)",
    "type": "parcial",
    "subtype": "recuperatorio",
    "status": "published",
    "examYear": 2024,
    "examMonth": 6,
    "topic": 2,
    "notes": null,
    "downloadCount": 17,
    "publishedAt": "2025-01-01T00:00:00.000Z",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "fileUrl": "https://r2.example.com/..."
  }],
  "total": 8, "page": 1, "totalPages": 1
}
```

---

#### `POST /api/v1/resources` 🔒

Sube un recurso para moderación.

**Content-Type:** `multipart/form-data`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `file` | File | Sí | PDF, máximo 20 MB |
| `subjectId` | string | Sí | UUID de la materia |
| `type` | `resumen` \| `parcial` \| `final` | Sí | Tipo de recurso |
| `title` | string | Si `type='resumen'` | Título del recurso |
| `subtype` | `parcial` \| `recuperatorio` \| `prefinal` \| `parcialito` | Si `type='parcial'` | Subtipo |
| `examYear` | number | Sí | Año del examen |
| `examMonth` | number | Sí | Mes del examen (1–12) |
| `topic` | number | No | Tema (1–5) |
| `notes` | string | No | Notas adicionales |

**Respuesta `201`:**
```json
{
  "id": "uuid",
  "subjectId": "uuid",
  "title": "Recuperatorio - Álgebra - Jun 2024",
  "type": "parcial",
  "subtype": "recuperatorio",
  "status": "pending",
  "examYear": 2024,
  "examMonth": 6,
  "topic": null,
  "notes": null,
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

`fileUrl` es `null` hasta que un admin apruebe el recurso.

**Errores:** `400` (no es PDF / supera 20 MB / validación) · `404` (materia no existe)

---

### Admin — Recursos 🔒

Requieren `Authorization: Bearer <admin_token>`.

#### `GET /api/v1/admin/resources`

Lista recursos de todos los estados.

**Query params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `status` | `pending` \| `published` \| `rejected` | (opcional) Filtra por estado |
| `subjectId` | string | (opcional) Filtra por materia |
| `careerId` | string | (opcional) Filtra por carrera |
| `page` | number | Default 1 |
| `limit` | number | Default 20, max 100 |

**Respuesta `200`:** `PaginatedResponse<AdminResource>`

```json
{
  "data": [{
    "id": "uuid",
    "subjectId": "uuid",
    "subjectTitle": "Álgebra",
    "title": "...",
    "type": "parcial",
    "subtype": "recuperatorio",
    "status": "pending",
    "examYear": 2024,
    "examMonth": 6,
    "topic": null,
    "notes": null,
    "downloadCount": 0,
    "publishedAt": null,
    "createdAt": "...",
    "updatedAt": "...",
    "fileUrl": null,
    "uploadedBy": "uuid",
    "reviewedBy": null,
    "r2Key": "uploads/...",
    "rejectionReason": null
  }],
  "total": 5, "page": 1, "totalPages": 1
}
```

---

#### `POST /api/v1/admin/resources` 🔒

Sube un recurso que queda **publicado directamente** (sin moderación). Mismos campos que el upload de usuario.

**Respuesta `201`:** igual que `POST /api/v1/resources` pero con `status: 'published'` y `fileUrl` disponible.

---

#### `GET /api/v1/admin/resources/:id/preview` 🔒

Obtiene URL temporal firmada para previsualizar el PDF.

**Respuesta `200`:**
```json
{ "signedUrl": "https://r2.example.com/...?X-Amz-Expires=3600&..." }
```

---

#### `PATCH /api/v1/admin/resources/:id/approve` 🔒

Aprueba un recurso en estado `pending`.

**Respuesta `200`:** `AdminResource` actualizado con `status: 'published'`.

**Errores:** `404` · `409` (no está en estado `pending`)

---

#### `PATCH /api/v1/admin/resources/:id/reject` 🔒

Rechaza un recurso en estado `pending`.

**Body (JSON):**

| Campo | Tipo | Requerido |
|-------|------|-----------|
| `reason` | string | Sí |

**Respuesta `200`:** `AdminResource` actualizado con `status: 'rejected'`.

**Errores:** `404` · `409` (no está en estado `pending`)

---

#### `PATCH /api/v1/admin/resources/bulk-approve` 🔒

Aprueba múltiples recursos en lote. Operación parcial: procesa todos, los errores individuales no detienen el resto.

**Body (JSON):**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ids` | string[] | 1–100 UUIDs de recursos `pending` |

**Respuesta `200`:**
```json
{
  "approved": ["uuid1", "uuid2"],
  "errors": [{ "id": "uuid3", "reason": "No está en estado pending" }]
}
```

---

### Admin — Materias 🔒

Requieren `Authorization: Bearer <admin_token>`.

#### `GET /api/v1/admin/subjects`

Lista materias con contador de recursos publicados.

**Query params:** `facultyId?`, `page`, `limit`

**Respuesta `200`:** `PaginatedResponse<Subject & { resourceCount: number }>`

---

#### `POST /api/v1/admin/subjects`

Crea una materia.

**Body (JSON):**

| Campo | Tipo | Requerido |
|-------|------|-----------|
| `facultyId` | string | Sí |
| `title` | string | Sí |
| `description` | string | No |
| `urlMoodle` | string | No |
| `urlPrograma` | string | No |
| `year` | number (1–5) | Sí |
| `quadmester` | number (1–2) | Sí |

**Respuesta `201`:** `Subject`

---

#### `GET /api/v1/admin/subjects/:id`

**Respuesta `200`:** `Subject` · **Errores:** `404`

---

#### `PATCH /api/v1/admin/subjects/:id`

Actualización parcial. Todos los campos opcionales. Actualizar `title` regenera el `slug`.

**Respuesta `200`:** `Subject` actualizada · **Errores:** `404`

---

#### `DELETE /api/v1/admin/subjects/:id`

**Errores:** `404` · `409` si tiene recursos publicados (rechazarlos primero)

---

### Admin — Universidades 🔒

#### `GET /api/v1/admin/universities`
Query: `page`, `limit` → `PaginatedResponse<University>`

#### `POST /api/v1/admin/universities`
Body: `{ name }` → `University` (201)

#### `GET /api/v1/admin/universities/:id`
→ `University` · `404`

#### `PATCH /api/v1/admin/universities/:id`
Body: `{ name }` → `University`

#### `DELETE /api/v1/admin/universities/:id`
`409` si tiene facultades

---

### Admin — Facultades 🔒

#### `GET /api/v1/admin/faculties`
Query: `universityId?`, `page`, `limit` → `PaginatedResponse<Faculty>`

#### `POST /api/v1/admin/faculties`
Body: `{ universityId, name }` → `Faculty` (201)

#### `GET /api/v1/admin/faculties/:id`
→ `Faculty` · `404`

#### `PATCH /api/v1/admin/faculties/:id`
Body: `{ name }` → `Faculty`

#### `DELETE /api/v1/admin/faculties/:id`
`409` si tiene carreras

---

### Admin — Carreras 🔒

#### `GET /api/v1/admin/careers`
Query: `facultyId?`, `page`, `limit` → `PaginatedResponse<Career>`

#### `POST /api/v1/admin/careers`
Body: `{ facultyId, name }` → `Career` (201)

#### `GET /api/v1/admin/careers/:id`
→ `Career` · `404`

#### `PATCH /api/v1/admin/careers/:id`
Body: `{ name }` → `Career`

#### `DELETE /api/v1/admin/careers/:id`
`409` si tiene planes

---

### Admin — Planes de carrera 🔒

#### `GET /api/v1/admin/career-plans`
Query: `careerId?`, `page`, `limit` → `PaginatedResponse<CareerPlan>`

#### `POST /api/v1/admin/career-plans`
Body: `{ careerId, name, year }` → `CareerPlan` (201)

#### `GET /api/v1/admin/career-plans/:id`
→ `CareerPlan` · `404`

#### `PATCH /api/v1/admin/career-plans/:id`
Body: `{ name?, year? }` → `CareerPlan`

#### `DELETE /api/v1/admin/career-plans/:id`
`409` si tiene materias asignadas

---

### Admin — Stats 🔒

#### `GET /api/v1/admin/stats`

**Respuesta `200`:**
```json
{
  "resources": {
    "total": 150,
    "byStatus": { "pending": 12, "published": 130, "rejected": 8 },
    "byType":   { "resumen": 40, "parcial": 80, "final": 30 }
  },
  "coverage": {
    "subjectsWithResources": 25,
    "subjectsWithoutResources": 10
  },
  "counts": {
    "subjects": 35,
    "careers": 4,
    "faculties": 2,
    "universities": 1
  }
}
```

---

## Schemas de tipos

```ts
PublicUser {
  id: string           // UUID
  email: string
  displayName: string
  role: 'user' | 'admin' | 'superadmin'
}

University {
  id: string
  name: string
  shortName: string | null   // ej: "UBA"
  slug: string
  createdAt: string
}

Faculty {
  id: string
  universityId: string
  name: string
  shortName: string | null   // ej: "Exactas"
  slug: string
  createdAt: string
}

Career {
  id: string
  facultyId: string
  name: string
  shortName: string | null
  slug: string
  createdAt: string
}

CareerPlan {
  id: string
  careerId: string
  name: string         // ej: "Plan 2023"
  year: number         // ej: 2023
  createdAt: string
}

Subject {
  id: string
  facultyId: string
  title: string
  slug: string
  description: string
  urlMoodle: string    // puede ser ""
  urlPrograma: string  // puede ser ""
  year: number         // 1–5
  quadmester: 1 | 2
  createdAt: string
  updatedAt: string
}

SubjectWithCareers extends Subject {
  careers: Array<{
    careerId: string
    careerName: string
    facultyId: string
    facultyName: string
    universityId: string
    universityName: string
    planId: string
    year: number
    quadmester: number
  }>
}

Resource {
  id: string
  subjectId: string
  title: string        // para resumen: provisto por el usuario; para parcial/final: auto-generado
  type: 'resumen' | 'parcial' | 'final'
  subtype: 'parcial' | 'recuperatorio' | 'prefinal' | 'parcialito' | null  // requerido si type='parcial'
  status: 'pending' | 'published' | 'rejected'
  examYear: number | null
  examMonth: number | null  // 1–12
  topic: number | null      // 1–5
  notes: string | null
  downloadCount: number
  publishedAt: string | null
  createdAt: string
  fileUrl: string | null   // null hasta que se publique
}

AdminResource extends Resource {
  subjectTitle: string | null
  uploadedBy: string        // user ID
  reviewedBy: string | null
  r2Key: string | null
  rejectionReason: string | null
  updatedAt: string
}
```

---

## CORS

El header `CORS_ORIGIN` acepta múltiples orígenes separados por coma (ej: `http://localhost:4321,https://exactamente.app`).

Métodos permitidos: `GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS`  
Headers permitidos: `Content-Type`, `Authorization`
