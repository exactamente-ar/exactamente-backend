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
