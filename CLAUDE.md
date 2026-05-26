# Backend API — Exactamente

Base URL: `/api/v1` · Runtime: Bun + Hono · DB: PostgreSQL + Drizzle ORM · Storage: Cloudflare R2

## Módulos disponibles

- @./CLAUDE.auth.md — autenticación y sesiones
- @./CLAUDE.resources.md — recursos de estudio (upload, moderación)
- @./CLAUDE.subjects.md — materias
- @./CLAUDE.catalog.md — universidades, facultades, carreras, planes de estudio
- @./CLAUDE.admin.md — estadísticas del dashboard admin

## Stack

| Capa | Tecnología |
|------|-----------|
| Runtime | Bun |
| Framework | Hono v4.6 |
| DB | PostgreSQL 16 (Docker) + Drizzle ORM |
| Validación | Zod + @hono/zod-validator |
| Auth | JWT via hono/jwt |
| Storage | Cloudflare R2 (AWS S3-compatible) |

## Variables de entorno que el frontend necesita conocer

Solo la URL base de la API. Los archivos PDF se sirven desde la URL pública de R2 — ya viene resuelta en `fileUrl` en las respuestas de recursos; no construir URLs manualmente.

## Convenciones generales

### Auth

Todas las rutas protegidas requieren:
```
Authorization: Bearer <jwt_token>
```

### Paginación

Query params: `page` (default 1) · `limit` (default 20, max 100)

Response:
```json
{ "data": [...], "total": 100, "page": 1, "totalPages": 10 }
```

**Excepción:** `GET /api/v1/careers` devuelve `{ "data": [...] }` sin paginación.

### Errores

```json
{ "error": "Mensaje descriptivo" }
```

| Código | Causa |
|--------|-------|
| 400 | Validación fallida |
| 401 | Sin token o token inválido |
| 403 | Rol insuficiente |
| 404 | Recurso no encontrado |
| 409 | Conflicto de estado (ej: aprobar algo que no está pending) |
| 429 | Rate limit excedido |
| 500 | Error interno |

### Roles

`user` < `admin` < `superadmin` — rutas `/admin/*` requieren al menos `admin`.

### Comandos esenciales (backend)

```bash
bun dev          # hot reload
bun test         # tests unitarios
bun db:generate  # nueva migración desde schema
bun db:migrate   # aplicar migraciones
bun db:studio    # Drizzle UI
```

### Setup de base de datos (una sola vez por entorno)

Habilitar la extensión `unaccent` (requerida para búsqueda accent-insensitive en materias):

```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS unaccent;"
```
