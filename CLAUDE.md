# CLAUDE.md — exactamente-backend

## 1. Descripción del proyecto

**Exactamente** es una API REST para una plataforma académica que permite a estudiantes universitarios acceder a materias, carreras y recursos de estudio (resúmenes, parciales, finales).

### Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Framework HTTP | [Hono](https://hono.dev) v4.6 |
| Base de datos | PostgreSQL 16 (via Docker) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) v0.38 |
| Driver DB | `pg` (node-postgres) |
| Validación | [Zod](https://zod.dev) v3.23 + `@hono/zod-validator` |
| Autenticación | JWT via `hono/jwt` |
| Testing | Bun test runner (built-in) |
| Almacenamiento | Google Drive (via file ID) |

---

## 2. Comandos esenciales

```bash
# Instalar dependencias
bun install

# Levantar base de datos local (PostgreSQL)
docker compose up -d

# Correr en desarrollo (hot reload)
bun dev

# Correr en producción
bun start

# Correr todos los tests
bun test

# Generar nueva migración a partir del schema
bun db:generate

# Aplicar migraciones pendientes
bun db:migrate

# Abrir Drizzle Studio (UI de base de datos)
bun db:studio

# Poblar la base de datos con datos iniciales
bun seed

# Convertir archivo Excel de recursos a TypeScript
bun xlsx-to-ts
```

---

## 3. Arquitectura

### Estructura de carpetas

```
src/
├── __tests__/          # Tests unitarios y de integración ligera
├── db/
│   ├── index.ts        # Conexión a la base de datos (singleton)
│   ├── schema.ts       # Fuente de verdad: tablas, enums y relaciones Drizzle
│   └── migrations/     # SQL generado por Drizzle — NO editar a mano
├── middleware/
│   ├── auth.ts         # Verificación de JWT (extrae y valida Bearer token)
│   └── requireRole.ts  # Control de acceso por rol (user < admin < superadmin)
├── routes/             # Un archivo por recurso REST
│   ├── auth.ts         # POST /auth/register, /auth/login, GET /auth/me
│   ├── universities.ts
│   ├── faculties.ts
│   ├── careers.ts
│   ├── subjects.ts
│   └── resources.ts
├── services/
│   └── auth.service.ts # Lógica de negocio de autenticación (hash, JWT, DTOs)
├── types/
│   └── index.ts        # Tipos TypeScript compartidos (PublicUser, Subject, etc.)
├── utils/
│   ├── drive-urls.ts   # Builders de URLs de Google Drive (preview y descarga)
│   ├── paginate.ts     # getPaginationParams() y buildPaginatedResponse()
│   └── slugify.ts      # Normalización de texto a slugs URL-safe
├── validators/
│   ├── auth.validators.ts     # Zod schemas: registerSchema, loginSchema
│   └── subject.validators.ts  # Zod schema: subjectFiltersSchema
├── app.ts              # Instancia Hono con todas las rutas montadas y CORS
└── index.ts            # Entry point: levanta el servidor HTTP
scripts/
├── seed.ts             # Script de seed (UNICEN → FACET → carreras → materias → recursos)
├── xlsx-to-ts.ts       # Conversor de recursos.xlsx a resources.ts
└── data/               # Datos estáticos para el seed (NO son archivos de config)
```

### Patrones usados

- **Route handlers planos**: Sin capa de controladores separada. Cada archivo en `routes/` define un `Hono` app y exporta sus handlers directamente.
- **Service layer mínimo**: Solo `auth.service.ts` encapsula lógica reutilizable (hashing, tokens, DTO mapping). Las rutas de datos consultan directamente con Drizzle.
- **Schema como fuente de verdad**: `src/db/schema.ts` define tablas, enums y relaciones. De ahí se derivan tipos TypeScript con `InferSelectModel`.
- **Middleware composable**: `verifyToken` + `requireRole(minRole)` se encadenan en las rutas protegidas.
- **Paginación consistente**: Todas las rutas de listado usan `getPaginationParams()` y devuelven `PaginatedResponse<T>`.

---

## 4. Variables de entorno

Copiar `.env.example` a `.env` y completar:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | URL de conexión PostgreSQL. Formato: `postgresql://user:password@host:port/dbname` |
| `JWT_SECRET` | Clave secreta para firmar JWTs. Mínimo 32 caracteres. Usar valor aleatorio en producción. |
| `PORT` | Puerto en el que escucha el servidor HTTP (default: `3000`) |
| `NODE_ENV` | Entorno de ejecución: `development` o `production` |
| `CORS_ORIGIN` | Origen permitido para CORS (e.g., URL del frontend) |
| `SEED_ADMIN_PASSWORD` | Contraseña del usuario superadmin creado por `bun seed`. Mínimo 12 caracteres. Solo se necesita al correr el seed. |

---

## 5. Convenciones de código

### Naming

- **Tablas**: `camelCase` en schema Drizzle, `snake_case` en SQL generado.
- **Rutas**: kebab-case en URLs (`/career-plans`), camelCase en variables TS.
- **Archivos**: kebab-case para archivos de rutas y utilidades (`auth.service.ts`, `drive-urls.ts`).
- **Tipos**: PascalCase para interfaces y types exportados.

### Estructura de endpoints

Todas las rutas están bajo el prefijo `/api/v1`. Cada archivo de ruta crea una instancia `new Hono()` y se monta en `app.ts`.

```typescript
// Patrón de ruta pública con validación
app.get('/', zValidator('query', filtersSchema), async (c) => {
  const filters = c.req.valid('query')
  // ... query con Drizzle
  return c.json(buildPaginatedResponse(data, total, page))
})

// Patrón de ruta protegida
app.get('/me', verifyToken, async (c) => {
  const user = c.get('user') // JwtPayload
  // ...
})
```

### Manejo de errores

- Validación de input: `@hono/zod-validator` devuelve `400` automáticamente con los errores de Zod.
- Auth: `401` si falta o es inválido el token; `403` si el rol es insuficiente.
- Not found: `404` con `{ error: 'Recurso no encontrado' }` en español.
- Errores inesperados: `500` con mensaje genérico (no exponer stack traces).

### Formato de respuestas API

**Lista paginada:**
```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "totalPages": 10
}
```

**Recurso único:**
```json
{ "id": 1, "title": "...", ... }
```

**Error:**
```json
{ "error": "Mensaje descriptivo" }
```

---

## 6. Testing

### Framework

Bun test runner nativo (`bun:test`). No requiere instalación adicional.

### Correr tests

```bash
# Todos los tests
bun test

# Un archivo específico
bun test src/__tests__/auth.service.test.ts

# Con watch mode
bun test --watch
```

### Ubicación de tests

Todos los tests viven en `src/__tests__/`. Convención de naming: `<módulo>.test.ts`.

| Archivo | Qué prueba |
|---------|-----------|
| `auth.service.test.ts` | Hash de passwords, verificación, sign/verify de JWT |
| `middleware.test.ts` | `verifyToken` y `requireRole` con contexto Hono simulado |
| `utils.test.ts` | `slugify`, `getPaginationParams`, `buildPaginatedResponse`, URL builders |

### Tipo de tests

Los tests actuales son **unitarios** (sin base de datos). Los tests de middleware simulan el contexto Hono directamente. No hay tests de integración con base de datos aún.

---

## 7. Restricciones importantes

### NO modificar sin revisión manual

| Ruta | Razón |
|------|-------|
| `src/db/migrations/*.sql` | Generadas por Drizzle. Editarlas manualmente rompe el historial de migraciones. Usar `bun db:generate`. |
| `src/db/migrations/meta/` | Metadata interna de Drizzle. Nunca tocar. |
| `scripts/data/materias.ts` | Datos de producción con 100+ materias. Cambios requieren validar integridad referencial (IDs de prerrequisitos). |
| `scripts/data/recursos.xlsx` | Fuente de verdad de recursos. Cambios deben procesarse con `bun xlsx-to-ts` para regenerar `resources.ts`. |
| `docker-compose.yml` | Cambios de puerto o credenciales requieren actualizar `.env` y documentación. |

### Consideraciones de schema

- Al agregar columnas a tablas existentes, siempre hacer nullable o con default para no romper datos existentes.
- Los enums en PostgreSQL (`user_role`, `resource_status`, `resource_type`) requieren una migración para agregar valores nuevos.
- Las relaciones en `schema.ts` (bloque `relations()`) son solo para Drizzle query — no generan constraints SQL.

---

## 8. Checklist pre-producción

### Seguridad
- [ ] `JWT_SECRET` tiene al menos 32 caracteres y es aleatorio (no el valor del `.env.example`)
- [ ] `NODE_ENV=production` está seteado
- [ ] `CORS_ORIGIN` apunta al dominio del frontend en producción (no `localhost`)
- [ ] No hay `console.log` con datos sensibles (passwords, tokens) en el código
- [ ] Passwords nunca se devuelven en respuestas API (usar `toPublicUser()`)

### Base de datos
- [ ] Todas las migraciones están aplicadas (`bun db:migrate`)
- [ ] El seed inicial fue ejecutado si es una instalación nueva (`bun seed`)
- [ ] `DATABASE_URL` apunta a la base de producción

### Aplicación
- [ ] `GET /health` responde `200 OK`
- [ ] Los tests pasan (`bun test`)
- [ ] No hay dependencias con versiones `*` o `latest` sin fijar

### Infraestructura
- [ ] El servidor escucha en el `PORT` configurado
- [ ] Las variables de entorno están seteadas en el entorno de deploy (no solo en `.env`)
- [ ] Los archivos de Google Drive referenciados en recursos son accesibles públicamente
