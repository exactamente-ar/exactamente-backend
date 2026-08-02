# Backend API — Exactamente

Base URL: `/api/v1` · Runtime: Bun + Hono · DB: PostgreSQL + Drizzle ORM · Storage: Cloudflare R2

## 📖 La referencia de la API es el OpenAPI, no este archivo

- **`/docs`** — referencia navegable
- **`/openapi.json`** — el spec, también versionado en la raíz del repo

Se genera de los schemas Zod en `src/schemas/`, así que **no puede quedar
desactualizado**: si cambiás una respuesta y no regenerás, `bun run check:openapi`
falla en CI. Frontend, panel admin y servidor MCP generan sus tipos desde ahí.

Estos `CLAUDE.*.md` guardan lo que el spec **no** puede expresar: reglas de
negocio, invariantes y trampas conocidas.

- @./CLAUDE.auth.md — cuentas Google vs contraseña, flujo OAuth, roles
- @./CLAUDE.resources.md — estados, campos por tipo, duplicados
- @./CLAUDE.subjects.md — listado vs detalle, relación N:M con carreras
- @./CLAUDE.catalog.md — jerarquía, las dos rutas que no paginan
- @./CLAUDE.admin.md — qué significan las métricas

## Stack

| Capa       | Tecnología                           |
| ---------- | ------------------------------------ |
| Runtime    | Bun                                  |
| Framework  | Hono v4                              |
| DB         | PostgreSQL 16 (Docker) + Drizzle ORM |
| Validación | Zod + @hono/zod-validator            |
| Contrato   | Zod (`zod/v4`) + hono-openapi        |
| Auth       | JWT via hono/jwt                     |
| Storage    | Cloudflare R2 (AWS S3-compatible)    |

## Cambiar el contrato de la API

Toda respuesta se define en `src/schemas/`. Para cambiar la forma de una:

1. Editá el schema en `src/schemas/`.
2. `bun run gen:openapi` y commiteá el `openapi.json`.
3. En cada cliente afectado: `pnpm gen:api`, y arreglá lo que TypeScript marque.

**Los tres pasos, o el CI de alguno de los cuatro repos se pone en rojo.** Es a
propósito: es la única forma de que un cambio de contrato no pase inadvertido.

Los schemas describen lo que los handlers devuelven **de verdad**. Si encontrás
una diferencia, es un bug — arreglá el que corresponda, no maquilles el schema.

Dos detalles que ya mordieron:

- `src/validators/` (entrada) sigue en el **zod clásico**; `src/schemas/`
  (salida) usa **`zod/v4`**. No son intercambiables.
- Los schemas de `components` se arman con `z.toJSONSchema()`, no con
  `resolver()`. Con `resolver()` el spec queda válido pero vacío, y los clientes
  generan `unknown` en silencio. Ver el comentario en `src/openapi/document.ts`.

## Convenciones generales

### Auth

Rutas protegidas: `Authorization: Bearer <jwt_token>`.
Rutas `/admin/*`: rol `admin` o `superadmin`.

### Paginación

`page` (default 1) · `limit` (default 20, máx 100) → `{ data, total, page, totalPages }`

⚠️ **Excepciones:** `GET /careers` y `GET /career-plans` devuelven `{ data }` sin
paginar. Sus versiones `/admin/*` sí paginan.

### Errores

Siempre `{ "error": "mensaje descriptivo" }`.

| Código | Causa                                                      |
| ------ | ---------------------------------------------------------- |
| 400    | Validación fallida                                         |
| 401    | Sin token o token inválido                                 |
| 403    | Rol insuficiente                                           |
| 404    | Recurso no encontrado                                      |
| 409    | Conflicto de estado (ej: aprobar algo que no está pending) |
| 429    | Rate limit excedido                                        |
| 500    | Error interno                                              |

### Comandos

```bash
bun dev              # hot reload
bun test             # tests unitarios
bun run typecheck    # tsc --noEmit
bun run lint         # eslint
bun run gen:openapi  # regenera openapi.json
bun db:generate      # nueva migración desde el schema
bun db:migrate       # aplicar migraciones
bun db:studio        # Drizzle UI
```

Los tests **no dependen de tu `.env`**: los valores salen de
`scripts/lib/placeholder-env.ts`, que pisa el entorno a propósito para que den
igual en toda máquina. Si agregás una variable obligatoria, agregala también ahí.

### Setup de base de datos (una vez por entorno)

```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS unaccent;"
```

Requerida para la búsqueda de materias sin acentos.

## ⚠️ Producción

`main` despliega solo a `api.exactamente.com.ar` vía Dokploy. Mergear = deployar.

- Nada de push directo a `main`. Todo por PR con CI en verde.
- El `Dockerfile` corre `bun run db:migrate` al arrancar: **toda migración que
  llegue a `main` se auto-aplica en producción**, en el camino crítico del
  arranque. El server no escucha hasta que termina.
- Un script `prepare` que falle rompe el build entero. Por eso está como
  `lefthook install || true`.

### `CREATE INDEX CONCURRENTLY` no se puede por esta vía

Drizzle-kit envuelve cada migración en una transacción, y `CONCURRENTLY` no corre
dentro de un bloque transaccional. O sea que un índice agregado por migración
toma un lock `SHARE` que **bloquea escrituras** mientras se construye, en el
arranque del contenedor y sin ensayo previo.

Con las tablas del tamaño actual son milisegundos. Si alguna vez no lo son, la
salida es aplicar el índice **a mano por `psql`** fuera del runner y después
registrar la fila correspondiente en `drizzle.__drizzle_migrations` para que el
runner no lo intente de nuevo.

Regla asociada: una migración va **sola en su PR**, nunca mezclada con una
feature. Un PR con las dos cosas no se puede revertir a mitad.
