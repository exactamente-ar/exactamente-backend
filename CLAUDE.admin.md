# Admin — Stats

**Endpoint y forma de la respuesta:** `/docs` (o `openapi.json`).

## Una sola llamada

`GET /admin/stats` devuelve todos los contadores del dashboard de una. **No hay
endpoints por métrica** — si necesitás un número suelto, sale de acá.

## Qué significan

- **`resources.byStatus.pending`** es el indicador de trabajo pendiente: cuántos
  recursos esperan moderación. Es el número que alimenta el badge rojo del panel.
- **`coverage`** solo cuenta recursos `published` para decidir si una materia
  "tiene" recursos. Una materia con tres recursos pendientes cuenta como
  **sin** recursos, que es lo correcto: todavía no le sirven a nadie.
