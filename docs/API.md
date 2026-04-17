# Exactamente Backend — API Reference

## Base URL

```
http://localhost:3000
```

> All API endpoints are prefixed with `/api/v1`.

---

## Authentication

The API uses **JWT Bearer tokens** (HS256, 7-day expiry).

### Getting a token

Register or login to receive a token:

```
POST /api/v1/auth/register
POST /api/v1/auth/login
```

### Using the token

Include the token in every protected request:

```
Authorization: Bearer <token>
```

### Roles

| Role | Level |
|------|-------|
| `user` | 1 — default |
| `admin` | 2 — scoped to a faculty |
| `superadmin` | 3 — full access |

---

## Endpoints

### Health

#### `GET /health`

```json
{ "status": "ok", "timestamp": "2025-01-01T00:00:00.000Z" }
```

---

### Auth

#### `POST /api/v1/auth/register`

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "minimo8chars",
  "displayName": "Juan Peñalba"
}
```

Constraints: `email` valid email · `password` min 8 chars · `displayName` 2–100 chars

**Response `201`:**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Juan Peñalba",
    "role": "user",
    "emailVerified": false,
    "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "token": "<jwt>"
}
```

---

#### `POST /api/v1/auth/login`

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "minimo8chars"
}
```

**Response `200`:** same shape as register.

---

#### `GET /api/v1/auth/me` 🔒

Requires `Authorization: Bearer <token>`.

**Response `200`:**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Juan Peñalba",
    "role": "user",
    "emailVerified": false,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

---

### Universities

#### `GET /api/v1/universities`

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "UNICEN",
      "slug": "unicen",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Faculties

#### `GET /api/v1/faculties`

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `universityId` | string | No | Filter by university |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "universityId": "uuid",
      "name": "Facultad de Ciencias Exactas",
      "slug": "facet",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Careers

#### `GET /api/v1/careers`

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `facultyId` | string | No | Filter by faculty |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "facultyId": "uuid",
      "name": "Ingeniería en Sistemas",
      "slug": "ingenieria-en-sistemas",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Subjects

#### `GET /api/v1/subjects`

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `careerId` | string | No | Filter by career |
| `facultyId` | string | No | Filter by faculty |
| `year` | number (1–5) | No | Academic year |
| `quadmester` | number (1–2) | No | Semester |
| `search` | string | No | Search by title |
| `page` | number | No | Default `1` |
| `limit` | number | No | Default `20`, max `100` |

**Response `200`:**

```json
{
  "data": [
    {
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
      "careers": [
        { "careerId": "uuid", "year": 2, "quadmester": 1 }
      ],
      "prerequisites": ["uuid"],
      "correlatives": ["uuid"]
    }
  ],
  "total": 42,
  "page": 1,
  "totalPages": 3
}
```

---

#### `GET /api/v1/subjects/:id`

**Response `200`:**

Same as item above, plus expanded relations:

```json
{
  "subject": {
    "...": "same fields as list item",
    "prerequisiteSubjects": [
      {
        "id": "uuid",
        "title": "Análisis Matemático I",
        "slug": "analisis-matematico-i",
        "year": 1,
        "quadmester": 1
      }
    ],
    "correlativeSubjects": [
      {
        "id": "uuid",
        "title": "Análisis Matemático III",
        "slug": "analisis-matematico-iii",
        "year": 3,
        "quadmester": 1
      }
    ]
  }
}
```

**Response `404`:**

```json
{ "error": "Materia no encontrada" }
```

---

### Resources

#### `GET /api/v1/resources`

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `subjectId` | string | No | Filter by subject |
| `type` | `resumen` \| `parcial` \| `final` | No | Filter by type |
| `page` | number | No | Default `1` |
| `limit` | number | No | Default `20`, max `100` |

**Response `200`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "subjectId": "uuid",
      "title": "Resumen Unidad 3",
      "type": "resumen",
      "status": "published",
      "driveFileId": "1BxiM...",
      "driveSize": 204800,
      "downloadCount": 17,
      "publishedAt": "2025-01-01T00:00:00.000Z",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "previewUrl": "https://drive.google.com/file/d/1BxiM.../preview",
      "downloadUrl": "https://drive.google.com/uc?export=download&id=1BxiM..."
    }
  ],
  "total": 8,
  "page": 1,
  "totalPages": 1
}
```

Only resources with `status: "published"` are returned.

---

## Error Responses

| Status | When | Body |
|--------|------|------|
| `400` | Validation error | `{ "error": "..." }` or Zod error detail |
| `401` | Missing/invalid/expired token | `{ "error": "Token inválido o expirado" }` |
| `403` | Insufficient role | `{ "error": "No tenés permisos para realizar esta acción" }` |
| `404` | Resource not found | `{ "error": "..." }` |
| `500` | Unexpected server error | `{ "error": "Error interno del servidor" }` |

---

## CORS

The API accepts requests from the origin set in `CORS_ORIGIN` env variable (defaults to `*`).

Allowed headers: `Content-Type`, `Authorization`
Allowed methods: `GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS`

---

## Environment Variables (backend)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `CORS_ORIGIN` | No | Allowed origin (default `*`) |
| `PORT` | No | Server port (default `3000`) |
