# Admin — Stats

**Endpoints y forma de las respuestas:** `/docs` (o `openapi.json`).

## Dónde va cada métrica

`GET /admin/stats` devuelve todos los **contadores escalares** del dashboard de
una. **No hay endpoints por métrica suelta** — si necesitás un número, sale de
acá. Es además la llamada barata que alimenta el badge rojo del sidebar en cada
navegación, así que tiene que seguir siendo ocho `count(*)` y nada más.

Las **agregaciones parametrizables** (series temporales, rankings, percentiles)
viven en `/admin/stats/<vista>`: una ruta por vista del dashboard, no por
métrica. Van aparte por dos razones concretas:

- Tienen query params propios, y `?days=30` no puede significar una cosa para la
  serie temporal y otra para los rankings dentro de una misma respuesta.
- Meterlas en `/admin/stats` haría que el badge del sidebar pague un
  `generate_series` y dos `percentile_cont` en cada click.

## Qué significan

- **`resources.byStatus.pending`** es el indicador de trabajo pendiente: cuántos
  recursos esperan moderación. Es el número que alimenta el badge rojo del panel.
- **`coverage`** solo cuenta recursos `published` para decidir si una materia
  "tiene" recursos. Una materia con tres recursos pendientes cuenta como
  **sin** recursos, que es lo correcto: todavía no le sirven a nadie.

### `/admin/stats/activity`

`uploads` cuenta por `created_at` (cuándo alguien subió el archivo) y
`publications` por `published_at` (cuándo un admin lo aprobó). **Son dos cosas
distintas y no tienen por qué sumar igual**: un recurso subido el lunes y
aprobado el jueves aparece en dos buckets diferentes.

Los buckets se agrupan en **hora argentina**, no en UTC — un upload de las 22:00
del martes es del martes, no del miércoles. El filtro de la ventana, en cambio,
se hace en UTC, que es como están guardadas las columnas.

La serie **no tiene huecos**: los días sin actividad vienen con `0`, no ausentes.
Un cliente puede graficarla directo sin rellenar nada.

⚠️ Con `granularity=week` los buckets arrancan **lunes** (ISO), igual que
`date_trunc('week', …)` de Postgres.

### `/admin/stats/rankings`

`topUploaders` respeta la ventana `days`. **`topResources` no**, y no es un
descuido: `download_count` es un contador escalar sin fecha asociada, así que no
existe forma de preguntarle "las descargas de los últimos 30 días". El ranking de
descargas es siempre histórico.

⚠️ **Los contadores de descarga arrancan de cero en agosto de 2026**, cuando se
agregó `GET /resources/:id/download`. Antes de eso la columna existía pero nadie
la escribía nunca: los archivos se servían directo desde R2 sin pasar por la API.
Lo que haya en las filas viejas viene de la migración de Drive, no de descargas
medidas. No compares períodos que crucen esa fecha.

### `/admin/stats/moderation`

`leadTime` son horas entre subida y publicación, sobre la ventana `days`. Con la
ventana vacía los tres percentiles vienen **`null`, no `0`**: "no hubo
publicaciones" y "tardó cero horas" no son lo mismo, y colapsarlos haría que un
período sin actividad se vea como moderación instantánea.

Se descartan los recursos con `published_at < created_at` — importaciones
históricas con las fechas invertidas, que darían un lead time negativo.

`queue` es **estado presente** y no depende de `days`: cuántos pendientes hay
ahora y hace cuánto esperan. Es el número que dice si la moderación está al día.

## Índices y rendimiento

Estas queries filtran por `created_at` y `published_at`, que **no tienen
índice**. Es a propósito: con ~800 recursos el seq scan tarda 0.6 ms, y son
endpoints admin que se piden unas pocas veces por día.

Si algún día hace falta el índice, leé la nota sobre `CREATE INDEX CONCURRENTLY`
en el `CLAUDE.md` de la raíz antes de escribir la migración.
