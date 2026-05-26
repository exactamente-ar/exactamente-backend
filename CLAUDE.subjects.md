# Subjects

## Endpoints

### Público

- `GET /api/v1/subjects` — listar materias con sus carreras
  - Query: `{ careerId?, facultyId?, year?, quadmester?, search?, page?, limit? }`
  - Response: `PaginatedResponse<SubjectWithCareers>`
  - `search` busca por título (case-insensitive)
  - Ordenado: year asc, quadmester asc, title asc

- `GET /api/v1/subjects/:id` — detalle de una materia
  - Response: `{ subject: SubjectWithCareers }`
  - Errores: `404`

### Admin (requieren `Authorization: Bearer <admin_token>`)

- `GET /api/v1/admin/subjects` — lista con contador de recursos publicados
  - Query: `{ facultyId?, page?, limit? }`
  - Response: `PaginatedResponse<Subject & { resourceCount: number }>`

- `POST /api/v1/admin/subjects` — crear materia
  - Request: `{ facultyId, title, description?, urlMoodle?, urlPrograma?, year, quadmester }`
  - Response 201: `Subject`

- `GET /api/v1/admin/subjects/:id` → `Subject`
  - Errores: `404`

- `PATCH /api/v1/admin/subjects/:id` — actualización parcial
  - Request (todos opcionales): `{ title?, description?, urlMoodle?, urlPrograma?, year?, quadmester? }`
  - Response: `Subject` actualizada
  - Errores: `404`

- `DELETE /api/v1/admin/subjects/:id`
  - Errores: `404` · `409` si tiene recursos publicados (no se puede borrar)

## Schemas / Tipos principales

```ts
Subject {
  id: string
  facultyId: string
  title: string
  slug: string             // auto-generado desde title
  description: string
  urlMoodle: string        // puede ser vacío ""
  urlPrograma: string      // puede ser vacío ""
  year: number             // 1–5 (año de cursada en el plan)
  quadmester: 1 | 2
  createdAt: string
  updatedAt: string
}

SubjectWithCareers extends Subject {
  careers: Array<{
    careerId: string
    careerName: string
    facultyId: string
    facultyName: string
    universityId: string
    universityName: string
    planId: string
    year: number      // año en ese plan específico
    quadmester: number
  }>
}
```

## Reglas de negocio relevantes

- Una materia puede pertenecer a múltiples carreras (relación N:M vía `career_subjects`).
- `year` y `quadmester` en `Subject` son los valores originales de la materia; los de `careers[]` son los valores en ese plan específico (pueden diferir).
- El `slug` se regenera automáticamente si se cambia el `title` vía PATCH.
- `urlMoodle` y `urlPrograma` pueden ser cadena vacía `""` (no null).
- No se puede eliminar una materia con recursos en estado `published` — hay que rechazarlos/eliminarlos primero.
