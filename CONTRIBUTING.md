# Contribuir a Exactamente — Backend

Gracias por querer aportar. Este documento explica cómo hacerlo de forma ordenada.

## Antes de empezar

- Revisá los [issues abiertos](https://github.com/exactamente-ar/exactamente-backend/issues) para ver si ya existe una discusión sobre lo que querés hacer.
- Para cambios grandes (nuevos endpoints, cambios de schema), abrí un issue primero para alinear antes de codear.
- Para bugs o mejoras pequeñas, podés ir directo con un PR.

## Setup local

Requisitos:

- [Bun](https://bun.sh/) >= 1.0
- [Docker](https://www.docker.com/) y Docker Compose

```bash
git clone https://github.com/<tu-usuario>/exactamente-backend.git
cd exactamente-backend
bun install
cp .env.example .env
docker compose up -d   # levanta PostgreSQL
bun db:migrate
bun seed               # datos de ejemplo (opcional)
```

Habilitar la extensión `unaccent` (una sola vez por entorno, necesaria para búsqueda accent-insensitive):

```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS unaccent;"
```

Levantar el servidor:

```bash
bun dev   # http://localhost:3000
```

## Flujo de trabajo

**Si tenés acceso de escritura al repo** (colaborador), trabajás con una rama acá mismo, sin
forkear. Si venís de afuera, forkeá primero y el resto es igual.

1. Crear una rama desde `main`, prefijada con tu usuario de GitHub:
   ```bash
   git checkout -b <tu-usuario>/descripcion-corta
   ```
2. Hacer los cambios
3. Verificar que pasen los gates que después corre el CI:
   ```bash
   bun test
   bun run typecheck
   bun run lint
   bun run format:check
   bun run check:openapi   # si tocaste algo de src/schemas/
   ```
4. Commitear y pushear — [Conventional Commits](https://www.conventionalcommits.org/), los valida
   commitlint en un hook
5. Abrir un Pull Request contra `main`

> ⚠️ **`main` es producción.** Al mergear, Dokploy redespliega solo a `api.exactamente.com.ar`, y
> el contenedor corre `bun run db:migrate` al arrancar — o sea que **toda migración que llegue a
> `main` se aplica sola en producción**. Por eso el merge está restringido: abrí el PR y pedile a
> [@JuanPE44](https://github.com/JuanPE44) que lo mergee cuando el CI esté en verde.

## Convenciones de código

### Estructura

```
src/
├── db/             # Conexión, schema Drizzle, migraciones
├── middleware/     # Auth, autorización por rol, rate limit
├── routes/         # Endpoints de la API (un archivo por dominio)
├── services/       # Lógica de negocio (sin Hono adentro)
├── types/          # Tipos compartidos
├── utils/          # Utilidades generales
├── validators/     # Schemas Zod
├── app.ts          # Configuración Hono (CORS, middleware global)
└── index.ts        # Entry point
```

### Reglas clave

- **Todas las rutas viven bajo `/api/v1/...`** — versionar siempre.
- **Validar todo input con Zod** vía `@hono/zod-validator` — no asumir tipos del body/query.
- **Lógica de negocio en `services/`**, no en `routes/` — `routes/` solo orquesta y devuelve respuestas.
- **Usar Drizzle, no SQL crudo** — si hace falta algo que Drizzle no expone, comentar el por qué.
- **Errores: `{ "error": "mensaje" }` con código HTTP correcto** (400/401/403/404/409/429/500). Ver tabla en `CLAUDE.md`.
- **Paginación estándar**: `{ data, total, page, totalPages }`. Default `limit=20`, max `100`.
- **No construir URLs de R2 manualmente** — la URL pública viene resuelta en `fileUrl`.
- **No exponer datos de usuario sensibles** (password hash, tokens internos) en responses públicas.

### Naming

| Elemento   | Convención           | Ejemplo                                     |
| ---------- | -------------------- | ------------------------------------------- |
| Archivos   | kebab-case           | `subjects.route.ts`, `resources.service.ts` |
| Funciones  | camelCase            | `getSubjectBySlug`                          |
| Tipos      | PascalCase           | `PublicUser`, `Resource`                    |
| Constantes | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE_MB`                          |
| Endpoints  | kebab-case           | `/admin/career-plans`                       |

## Cambios de schema (DB)

1. Editar el schema en `src/db/schema.ts`
2. Generar migración:
   ```bash
   bun db:generate
   ```
3. Aplicar localmente:
   ```bash
   bun db:migrate
   ```
4. Commitear el archivo de migración junto con el cambio de schema.
5. Nunca editar una migración ya commiteada — generar una nueva.

## Archivos críticos — no modificar sin revisión

| Archivo              | Razón                                          |
| -------------------- | ---------------------------------------------- |
| `drizzle.config.ts`  | Configura la conexión y carpeta de migraciones |
| `src/app.ts`         | CORS, middleware global, montaje de rutas      |
| `src/db/schema.ts`   | Schema de la DB — cambios requieren migración  |
| `docker-compose.yml` | Setup local de PostgreSQL                      |

Si tocás alguno, explicalo en el PR.

## Pull Requests

- Título claro: `feat: agregar endpoint de búsqueda por slug`, `fix: corregir paginación en /resources`
- Describí qué cambia y por qué
- Incluí ejemplos de request/response si tocás endpoints
- `bun test` tiene que pasar antes de pedir review

## Reportar un bug

Abrí un issue con:

- Endpoint afectado (método + path)
- Body/query enviado
- Response recibido vs. el esperado
- Logs relevantes si tenés acceso

## Reportar una vulnerabilidad

Si encontrás algo de seguridad **no abras un issue público**. Escribinos por mail o DM al equipo.

## Preguntas

Si tenés dudas sobre arquitectura o cómo encarar algo, abrí un issue con el label `question` antes de empezar.
