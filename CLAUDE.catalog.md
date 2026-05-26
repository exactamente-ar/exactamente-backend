# Catalog (Universities · Faculties · Careers · Career Plans)

Jerarquía: `University → Faculty → Career → CareerPlan → Subject` (via `career_subjects`)

## Endpoints

### Público

- `GET /api/v1/universities` — lista paginada
  - Query: `{ page?, limit? }`
  - Response: `PaginatedResponse<University>`

- `GET /api/v1/faculties` — lista paginada
  - Query: `{ universityId?, page?, limit? }`
  - Response: `PaginatedResponse<Faculty>`

- `GET /api/v1/careers` — lista **sin paginación**
  - Query: `{ facultyId? }`
  - Response: `{ data: Career[] }` — array directo, sin `total`/`totalPages`

### Admin — Universities (requieren `Authorization: Bearer <admin_token>`)

- `GET /api/v1/admin/universities` — `{ page?, limit? }` → `PaginatedResponse<University>`
- `POST /api/v1/admin/universities` — `{ name }` → `University` (201)
- `GET /api/v1/admin/universities/:id` → `University`
- `PATCH /api/v1/admin/universities/:id` — `{ name }` → `University`
- `DELETE /api/v1/admin/universities/:id` — Errores: `409` si tiene facultades

### Admin — Faculties

- `GET /api/v1/admin/faculties` — `{ universityId?, page?, limit? }` → `PaginatedResponse<Faculty>`
- `POST /api/v1/admin/faculties` — `{ universityId, name }` → `Faculty` (201)
- `GET /api/v1/admin/faculties/:id` → `Faculty`
- `PATCH /api/v1/admin/faculties/:id` — `{ name }` → `Faculty`
- `DELETE /api/v1/admin/faculties/:id` — Errores: `409` si tiene carreras

### Admin — Careers

- `GET /api/v1/admin/careers` — `{ facultyId?, page?, limit? }` → `PaginatedResponse<Career>`
- `POST /api/v1/admin/careers` — `{ facultyId, name }` → `Career` (201)
- `GET /api/v1/admin/careers/:id` → `Career`
- `PATCH /api/v1/admin/careers/:id` — `{ name }` → `Career`
- `DELETE /api/v1/admin/careers/:id` — Errores: `409` si tiene planes

### Admin — Career Plans

- `GET /api/v1/admin/career-plans` — `{ careerId?, page?, limit? }` → `PaginatedResponse<CareerPlan>`
- `POST /api/v1/admin/career-plans` — `{ careerId, name, year }` → `CareerPlan` (201)
- `GET /api/v1/admin/career-plans/:id` → `CareerPlan`
- `PATCH /api/v1/admin/career-plans/:id` — `{ name?, year? }` → `CareerPlan`
- `DELETE /api/v1/admin/career-plans/:id` — Errores: `409` si tiene materias asignadas

## Schemas / Tipos principales

```ts
University {
  id: string
  name: string
  shortName: string | null  // nombre corto, ej: "UNICEN"
  slug: string
  createdAt: string
}

Faculty {
  id: string
  universityId: string
  name: string
  shortName: string | null  // ej: "FACET"
  slug: string
  createdAt: string
}

Career {
  id: string
  facultyId: string
  name: string
  shortName: string | null
  slug: string
  createdAt: string
}

CareerPlan {
  id: string
  careerId: string
  name: string   // ej: "Plan 2023"
  year: number   // año del plan, ej: 2023
  createdAt: string
}
```

## Reglas de negocio relevantes

- `shortName` existe en University, Faculty y Career pero puede ser null. Cuando existe, se usa como nombre de display en las respuestas de subjects.
- `slug` se auto-genera desde `name` y es único dentro del padre (ej: slug de facultad es único por universidad).
- Eliminación es cascada protegida: no se puede borrar si hay hijos — el error siempre es `409`.
- `GET /api/v1/careers` **no tiene paginación** — devuelve todos los resultados en `data[]`.
