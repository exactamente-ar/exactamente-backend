# Subjects

**Endpoints, request/response y códigos de error:** `/docs` (o `openapi.json`).

## ⚠️ El listado y el detalle devuelven formas distintas

|                     | `careers[]` | `resourceCounts` |
| ------------------- | ----------- | ---------------- |
| `GET /subjects`     | ✅          | ✅               |
| `GET /subjects/:id` | ✅          | ❌               |

No es un descuido del tipado: son dos schemas distintos (`SubjectWithCareers` y
`SubjectDetail`). Ya causó un bug en el servidor MCP, que leía `resourceCounts`
del detalle y siempre obtenía `undefined`.

Si necesitás los conteos, usá el listado filtrado o contá con `GET /resources`.

## Una materia pertenece a varias carreras

Relación N:M vía `career_subjects`. Consecuencia importante:

- `year` y `quadmester` de la **materia** son sus valores originales.
- `year` y `quadmester` dentro de `careers[]` son los de **ese plan concreto**, y
  pueden diferir.

Para "en qué año se cursa esto", el valor correcto es el del plan, no el de la
materia.

## Rangos

`year` va de 1 a 5 y `quadmester` es 1 o 2 — lo impone el validator de entrada.
Ojo: las columnas son `smallint` **sin CHECK constraint**, así que un seed o un
script podrían meter otro valor. Por eso el contrato declara un rango y no una
unión literal.

## Otros

- El `slug` se regenera solo si cambia el `title` vía PATCH.
- `urlMoodle` y `urlPrograma` pueden ser cadena vacía `""`, nunca `null`.
- No se puede eliminar una materia con recursos `published` → `409`. Hay que
  rechazarlos o borrarlos primero.
- La búsqueda por `search` es case-insensitive y sin acentos: necesita la
  extensión `unaccent` habilitada en la base (ver el README).
