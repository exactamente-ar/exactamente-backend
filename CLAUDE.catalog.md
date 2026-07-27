# Catalog — Universities · Faculties · Careers · Career Plans

**Endpoints, request/response y códigos de error:** `/docs` (o `openapi.json`).

Jerarquía: `University → Faculty → Career → CareerPlan → Subject` (vía `career_subjects`).

## ⚠️ Dos rutas públicas NO paginan

`GET /careers` y `GET /career-plans` devuelven `{ data: [...] }` a secas, sin
`total` ni `totalPages`. Sus equivalentes bajo `/admin/*` **sí** paginan.

Es la trampa más fácil de este módulo: se asume la forma paginada, se lee
`res.total` y sale `undefined` sin que nada falle.

## `shortName`

Existe en University, Faculty y Career, y puede ser `null`. Cuando está, es el
que se usa como nombre de display en las respuestas de subjects — el cliente no
tiene que elegir, ya viene resuelto.

## Slugs

Se auto-generan desde `name` y son únicos **dentro del padre**: el slug de una
facultad es único por universidad, no globalmente. Dos universidades pueden
tener cada una su facultad `exactas`.

## Eliminación

Cascada protegida: no se puede borrar nada que tenga hijos. El error siempre es
`409`, con un mensaje que dice qué lo está reteniendo.

Hay que vaciar de abajo hacia arriba: materias → planes → carreras → facultades
→ universidad.
