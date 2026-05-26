# Resources

## Endpoints

### Público

- `GET /api/v1/resources` — listar recursos publicados
  - Query: `{ subjectId?, type?: 'resumen'|'parcial'|'final', page?, limit? }`
  - Response: `PaginatedResponse<Resource>`
  - Solo devuelve `status = 'published'`; ordenados por `publishedAt` desc

- `POST /api/v1/resources` — subir recurso (auth requerida)
  - Content-Type: `multipart/form-data`
  - Fields: `file` (PDF, max 20 MB) · `subjectId` · `type` · `examDate?` (YYYY-MM-DD) · `period?` (max 20 chars) · `notes?`
  - Response 201: `{ id, subjectId, title, type, status: 'pending', examDate, period, notes, createdAt }`
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
  title: string            // auto-generado: "Parcial - Álgebra - 1C 2024"
  type: 'resumen' | 'parcial' | 'final'
  status: 'pending' | 'published' | 'rejected'
  examDate: string | null  // YYYY-MM-DD
  period: string | null    // ej: "1C 2024", "Final Feb 2024"
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
- `examDate` y `period` son opcionales pero ayudan a identificar el recurso. Se muestran en el título auto-generado si `period` está presente.
- Aprobar/rechazar solo funciona sobre recursos en estado `pending`. Intentar sobre otro estado → `409`.
