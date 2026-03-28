# Exactamente Backend — Fase 1: Infraestructura Base

**Fecha:** 2026-03-27
**Stack:** Hono · Drizzle ORM · PostgreSQL · Bun
**Scope:** Infraestructura base, schema completo, seed, endpoints de lectura y auth

---

## Contexto

El frontend actual consume datos hardcodeados en archivos `.ts` (materias, carreras) y recursos desde SheetBest/Google Sheets. La Fase 1 crea el backend que reemplaza esa capa de datos sin tocar el frontend todavía.

---

## Runtime y tooling

- **Bun** como runtime y package manager (TypeScript nativo, sin tsx ni compilación)
- **Hono** como framework HTTP
- **Drizzle ORM** con `drizzle-kit` para migraciones
- **Zod** para validación de inputs vía `@hono/zod-validator`
- **Docker Compose** para PostgreSQL 16 en local

---

## Estructura de carpetas

```
exactamente-backend/
├── src/
│   ├── index.ts                    # Entry point
│   ├── app.ts                      # Instancia Hono + middlewares globales
│   ├── db/
│   │   ├── schema.ts               # Schema Drizzle completo
│   │   ├── index.ts                # Pool de conexión PostgreSQL
│   │   └── migrations/             # Generadas por drizzle-kit
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── universities.ts
│   │   ├── faculties.ts
│   │   ├── careers.ts
│   │   ├── subjects.ts
│   │   └── resources.ts
│   ├── middleware/
│   │   ├── auth.ts                 # verifyToken
│   │   └── requireRole.ts
│   ├── services/
│   │   └── auth.service.ts
│   ├── validators/
│   │   ├── auth.validators.ts
│   │   └── subject.validators.ts
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── paginate.ts
│       ├── slugify.ts
│       └── drive-urls.ts
├── scripts/
│   ├── seed.ts
│   └── data/
│       ├── materias.ts             # Copiado del frontend
│       └── carreras.ts             # Copiado del frontend
├── docker-compose.yml
├── drizzle.config.ts
├── .env                            # No versionado
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Base de datos

Schema completo según spec (sección 2.2):

- **Enums:** `user_role`, `resource_status`, `resource_type`
- **Jerarquía:** `universities → faculties → careers → subjects`
- **Relación M:M:** `career_subjects` (materia ↔ carrera con año/cuatrimestre por carrera)
- **Correlativas:** `subject_prerequisites` (self-referencing sobre subjects)
- **Usuarios:** `users` (roles: superadmin, admin, user)
- **Recursos:** `resources` (staging → Drive flow, para fases posteriores)

En Fase 1 las tablas `users` y `resources` se crean en el schema pero solo se usan para auth y lectura de published resources respectivamente.

---

## Seed

`scripts/seed.ts` lee los archivos copiados en `scripts/data/` e inserta:

1. Universidad: `{ id: 'UNICEN', name: 'Universidad Nacional del Centro', slug: 'unicen' }`
2. Facultad: `{ id: 'FACET', name: 'Facultad de Ciencias Exactas', slug: 'exactas', universityId: 'UNICEN' }`
3. Carreras: `C1` (Ingenieria en Sistemas), `C2` (TUDAI) — ambas bajo FACET
4. Materias: las 45+ de `MATERIAS_SISTEMAS`, manteniendo los IDs originales (`A1C1M1`, etc.)
5. `career_subjects`: cruza cada materia con su carrera usando `idCarrer`
6. `subject_prerequisites`: desde el campo `required` de cada materia

El seed es idempotente: usa `onConflictDoNothing()` para poder correrlo múltiples veces.

---

## Endpoints — Fase 1

### Auth

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/api/v1/auth/register` | Público | Crea usuario (role=user), devuelve JWT |
| POST | `/api/v1/auth/login` | Público | Valida credenciales, devuelve JWT |
| GET | `/api/v1/auth/me` | Bearer token | Devuelve usuario autenticado |

JWT: HS256, expira en 7 días. Payload: `{ sub, role, facultyId, iat, exp }`.

### Lectura pública

| Método | Ruta | Query params |
|--------|------|-------------|
| GET | `/api/v1/universities` | — |
| GET | `/api/v1/faculties` | `?universityId=` |
| GET | `/api/v1/careers` | `?facultyId=` |
| GET | `/api/v1/subjects` | `careerId`, `facultyId`, `year`, `quadmester`, `search`, `page`, `limit` |
| GET | `/api/v1/subjects/:id` | — (incluye prerequisites, correlatives, careers) |
| GET | `/api/v1/resources` | `subjectId`, `type`, `page`, `limit` (solo published) |

---

## Middleware

- **`verifyToken`**: extrae y valida JWT del header `Authorization: Bearer <token>`. Pone el payload en `c.set('user', payload)`.
- **`requireRole(minRole)`**: verifica jerarquía de roles (`user < admin < superadmin`). Se aplica en Fase 1 solo a `GET /auth/me`.

---

## Docker Compose

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: exactamente
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

## Variables de entorno

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/exactamente
JWT_SECRET=super-secret-key-minimo-32-chars
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:4321
```

---

## Scripts npm

```json
{
  "dev": "bun --watch src/index.ts",
  "start": "bun src/index.ts",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio",
  "seed": "bun scripts/seed.ts"
}
```

---

## Lo que NO incluye Fase 1

- Subida de archivos (multipart, staging) — Fase 2
- Integración Google Drive — Fase 2
- Endpoints de moderación (approve/reject) — Fase 2
- Panel de admin (stats, gestión de usuarios) — Fase 3
- CRUD de materias/carreras/facultades — Fase 3
- Cambios en el frontend — Fase 4
