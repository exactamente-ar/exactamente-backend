# Resources

**Endpoints, request/response y códigos de error:** `/docs` (o `openapi.json`).
Se generan de los schemas, así que no pueden quedar desactualizados.

Acá van solo las reglas que el spec no puede expresar.

## Estados y quién los produce

- **Usuario sube** → `pending`, `fileUrl: null` hasta que un admin apruebe.
- **Admin sube** → `published` directo, con `fileUrl` disponible. Salvo que mande
  `autoPublish=false`, que lo deja en `pending` para revisar.

Aprobar y rechazar solo funcionan sobre `pending`. Sobre cualquier otro estado → `409`.

## Archivos

- Solo PDF, máximo 20 MB.
- `fileUrl` ya viene resuelta en la respuesta. **No construir URLs a mano** — el
  bucket y el prefijo son detalle interno.

### Ver ≠ bajar

Son dos caminos distintos y confundirlos rompe la métrica:

| Para                                 | Usar                          | Cuenta descarga |
| ------------------------------------ | ----------------------------- | --------------- |
| **Ver** el PDF (preview, `<iframe>`) | `fileUrl` de la respuesta     | no              |
| **Bajar** el archivo                 | `GET /resources/:id/download` | **sí**          |

`GET /resources/:id/download` es la **única** vía que incrementa
`downloadCount`: linkear directo a `fileUrl` no cuenta nada, porque ese archivo
se sirve desde R2 sin pasar por la API. Es la excepción a "no construir URLs a
mano": esta ruta es parte del contrato público y se arma con el `id`.

Devuelve **302** (nunca 301) y `Cache-Control: no-store`. Un 301 lo cachea el
navegador para siempre y a partir de ahí el contador no se mueve más, en
silencio.

Redirige a una URL **firmada** y no a la pública, para poder mandar
`Content-Disposition: attachment; filename="<título>.<ext>"`. Sin eso el archivo
se guarda con el nombre de la key, que es un uuid — el atributo `download` de un
`<a>` se ignora cuando el archivo está en otro origen. El costo asumido es que
la descarga no pasa por el CDN.

⚠️ La extensión sale de la **key**, no se asume `.pdf`. Hoy la validación de
subida solo acepta PDF, pero la migración de Drive dejó imágenes: hay `.jpg` en
la base. Un JPG bajado con nombre `.pdf` no abre.

⚠️ **`downloadCount` arranca de cero en agosto de 2026.** La columna existía
desde antes pero ningún handler la escribía nunca. Lo que haya en las filas
viejas viene de la migración de Drive, no de descargas medidas.

## Campos por tipo de recurso

| Campo                   | `resumen`  | `parcial`     | `final`       |
| ----------------------- | ---------- | ------------- | ------------- |
| `title`                 | requerido  | auto-generado | auto-generado |
| `subtype`               | prohibido  | **requerido** | prohibido     |
| `examDay`               | null       | null          | **requerido** |
| `examYear`, `examMonth` | requeridos | requeridos    | requeridos    |

`examDay` es requerido en finales porque hay varias fechas de final por mes.

El título auto-generado sale así: `"Recuperatorio - Álgebra - Jun 2024 (Tema 2)"`.

## Detección de duplicados

Solo aplica a `parcial` y `final` — **nunca a resúmenes**, donde dos apuntes
distintos de la misma materia son legítimos.

- **Parcial:** materia + tipo + subtype + año + mes + tema
- **Final:** lo anterior más `examDay`

Es un aviso, no un bloqueo: el usuario puede subir igual.

## Aprobación masiva

`PATCH /admin/resources/bulk-approve` es una operación **parcial**: procesa
todos los ids y los errores individuales no detienen al resto. Por eso devuelve
`approved` y `errors` por separado — hay que mirar ambos.
