# Resources

## Endpoints

### Público

- `GET /api/v1/resources` — listar recursos publicados
  - Query: `{ subjectId?, type?: 'resumen'|'parcial'|'final', page?, limit? }`
  - Response: `PaginatedResponse<Resource>`
  - Solo devuelve `status = 'published'`; ordenados por `publishedAt` desc

- `POST /api/v1/resources` — subir recurso (auth requerida)
  - Content-Type: `multipart/form-data`
  - Fields: `file` (PDF, max 20 MB) · `subjectId` · `type` · `title` (requerido si type='resumen') · `subtype` (requerido si type='parcial') · `examYear` · `examMonth` · `examDay` (requerido si type='final') · `topic?` (1-5) · `notes?`
  - Response 201: `{ id, subjectId, title, type, subtype, status: 'pending', examYear, examMonth, examDay, topic, notes, createdAt }`
  - Errores: `400` (no es PDF / >20 MB / validación) · `404` materia no existe

### Admin (requieren `Authorization: Bearer <admin_token>`)

- `GET /api/v1/admin/resources` — listar todos los estados
  - Query: `{ status?: 'pending'|'published'|'rejected', subjectId?, careerId?, page?, limit? }`
  - Response: `PaginatedResponse<AdminResource>`

- `POST /api/v1/admin/resources` — subir recurso auto-publicado
  - Mismos campos que el upload de usuario
  - Resultado: `status = 'published'` directamente (sin moderación)

- `GET /api/v1/admin/resources/:id/preview`
  - Response: `{ signedUrl: string }` — URL temporal firmada para previsualizar el PDF

- `PATCH /api/v1/admin/resources/:id/approve`
  - Response: `AdminResource`
  - Errores: `404` · `409` (no está en estado pending)

- `PATCH /api/v1/admin/resources/:id/reject`
  - Request: `{ reason: string }`
  - Response: `AdminResource`
  - Errores: `404` · `409` (no está en estado pending)

- `PATCH /api/v1/admin/resources/bulk-approve`
  - Request: `{ ids: string[] }` (1-100 UUIDs)
  - Response: `{ approved: string[], errors: Array<{ id: string, reason: string }> }`
  - Operación parcial: procesa todos; errores individuales no detienen el resto

## Schemas / Tipos principales

```ts
Resource {
  id: string
  subjectId: string
  title: string            // para resúmenes: provisto por usuario; para parcial/final: auto-generado ej: "Recuperatorio - Álgebra - Jun 2024 (Tema 2)"
  type: 'resumen' | 'parcial' | 'final'
  subtype: 'parcial' | 'recuperatorio' | 'prefinal' | 'parcialito' | null  // requerido cuando type='parcial'
  status: 'pending' | 'published' | 'rejected'
  examYear: number | null
  examMonth: number | null  // 1–12
  examDay: number | null    // 1–31; requerido para type='final', null para parcial/resumen
  topic: number | null      // 1–5
  notes: string | null
  downloadCount: number
  publishedAt: string | null  // ISO 8601
  createdAt: string
  fileUrl: string | null   // URL pública del archivo; null si no está publicado
}

AdminResource extends Resource {
  subjectTitle: string | null
  uploadedBy: string       // user ID
  reviewedBy: string | null
  r2Key: string | null
  rejectionReason: string | null
  updatedAt: string
}
```

## Reglas de negocio relevantes

- **Usuario sube** → `status = 'pending'`, `fileUrl = null` hasta aprobación.
- **Admin sube** → `status = 'published'` inmediatamente, `fileUrl` disponible.
- Solo se aceptan archivos PDF, máximo 20 MB.
- `fileUrl` ya viene resuelta en la respuesta — no construir URLs manualmente.
- `subtype` es requerido para `type='parcial'` y prohibido para otros tipos.
- `examDay` es requerido para `type='final'` (hay varios finales por mes), null para parcial/resumen.
- `examYear` y `examMonth` son requeridos en el upload; se usan para el título auto-generado y la detección de duplicados.
- Detección de duplicados: solo aplica a `parcial` y `final` (no resúmenes). Para parcial: materia + tipo + subtype + año + mes + tema. Para final: agrega `examDay` al match.
- Aprobar/rechazar solo funciona sobre recursos en estado `pending`. Intentar sobre otro estado → `409`.
