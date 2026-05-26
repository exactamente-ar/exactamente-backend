# Admin Panel — Prompt de construcción

## Contexto del proyecto

**Exactamente** es una plataforma académica donde estudiantes universitarios acceden a materiales de estudio (resúmenes, parciales, finales). Este documento describe el panel de administración que debe construirse para gestionar esos recursos y los datos de la plataforma.

**Backend:** API REST en `https://api.exactamente.ar/api/v1` (Hono + Bun + PostgreSQL).
**Auth:** JWT Bearer token. El admin hace login y obtiene un token que va en el header `Authorization: Bearer <token>` en todos los requests admin.

---

## Autenticación

### Login
```
POST /auth/login
Body: { "email": string, "password": string }
Response: { "token": string, "user": { "id", "email", "displayName", "role" } }
```
El token debe guardarse y enviarse en cada request. Si el servidor responde `401`, redirigir al login.

### Perfil
```
GET /auth/me   → { id, email, displayName, role, emailVerified, createdAt }
```
Roles posibles: `"user"`, `"admin"`, `"superadmin"`. Solo admins y superadmins acceden al panel.

---

## Sección 1 — Dashboard

**Endpoint:**
```
GET /admin/stats
```

**Respuesta:**
```json
{
  "resources": {
    "total": 1217,
    "byStatus": { "pending": 3, "published": 1210, "rejected": 4 },
    "byType":   { "resumen": 450, "parcial": 500, "final": 267 }
  },
  "coverage": {
    "subjectsWithResources":    50,
    "subjectsWithoutResources": 15
  },
  "counts": {
    "subjects":     65,
    "careers":       3,
    "faculties":     1,
    "universities":  1
  }
}
```

**Vista:** Tarjetas con los números principales. Destacar:
- Recursos pendientes de moderación (`byStatus.pending`) — si > 0, badge de alerta.
- Cobertura: `subjectsWithResources` / `counts.subjects` como barra de progreso.
- Distribución por tipo: gráfico o pills (resumen / parcial / final).

---

## Sección 2 — Recursos

### 2a. Listar recursos
```
GET /admin/resources?status=pending&careerId=C1&subjectId=S1&page=1&limit=20
```
Todos los parámetros son opcionales. Por defecto devuelve todos los estados.

**Respuesta (paginada):**
```json
{
  "data": [{
    "id": "uuid",
    "subjectId": "S1",
    "subjectTitle": "Análisis Matemático 1",
    "uploadedBy": "user-uuid",
    "reviewedBy": "admin-uuid | null",
    "title": "Parcial - Análisis Matemático 1 - 2024-1",
    "type": "parcial",
    "status": "pending | published | rejected",
    "r2Key": "public/S1/uuid.pdf",
    "examDate": "2024-06-15 | null",
    "period": "2024-1 | null",
    "notes": "... | null",
    "rejectionReason": "... | null",
    "downloadCount": 0,
    "publishedAt": "ISO string | null",
    "createdAt": "ISO string",
    "updatedAt": "ISO string",
    "fileUrl": "https://... | null"
  }],
  "total": 100,
  "page": 1,
  "totalPages": 5
}
```

**Flujo de la vista:**
- Tabs o filtro por status: `Todos | Pendientes | Publicados | Rechazados`.
- Filtros adicionales: por `careerId` (dropdown de carreras), por `subjectId` (dropdown de materias).
- Cada fila muestra: título, materia, tipo (badge), status (badge), fecha, acciones.

### 2b. Subir recurso (admin, auto-publicado)
```
POST /admin/resources
Content-Type: multipart/form-data

Campos:
  file       (File, PDF, max 20MB) — requerido
  subjectId  (string)              — requerido
  type       (resumen|parcial|final) — requerido
  period     (string, max 20)      — opcional, ej: "2024-1"
  examDate   (string, YYYY-MM-DD)  — opcional
  notes      (string)              — opcional
```

**Respuesta `201`:** Objeto recurso completo (ya con `status: "published"`).

> El recurso se publica inmediatamente. No pasa por pending.

**Flujo:** Formulario con selector de materia (búsqueda por título), tipo, archivo PDF, y campos opcionales. Al guardar, aparece en la lista como publicado.

### 2c. Previsualizar recurso
```
GET /admin/resources/:id/preview
Response: { "signedUrl": "https://..." }
```
URL válida por 15 minutos. Abrir en nueva pestaña o iframe para previsualizar el PDF antes de moderar.

### 2d. Aprobar recurso pendiente
```
PATCH /admin/resources/:id/approve
(sin body)
Response: objeto recurso actualizado (status: "published")
```

### 2e. Rechazar recurso pendiente
```
PATCH /admin/resources/:id/reject
Body: { "reason": "string" }
Response: objeto recurso actualizado (status: "rejected")
```

### 2f. Aprobar múltiples a la vez
```
PATCH /admin/resources/bulk-approve
Body: { "ids": ["uuid1", "uuid2", ...] }   (max 100)
Response: { "approved": ["uuid1", ...], "errors": [{ "id": "uuid", "reason": "..." }] }
```

**Flujo de moderación:** En la tab "Pendientes", cada fila tiene botón "Ver PDF" (preview), "Aprobar" y "Rechazar". También hay un checkbox para selección múltiple y un botón "Aprobar seleccionados" (llama a bulk-approve).

---

## Sección 3 — Materias

### Listar con cobertura
```
GET /admin/subjects?facultyId=F1&page=1&limit=50
```
**Respuesta:**
```json
{
  "data": [{
    "id": "S1",
    "facultyId": "F1",
    "title": "Análisis Matemático 1",
    "slug": "analisis-matematico-1",
    "description": "...",
    "urlMoodle": "https://... | null",
    "urlPrograma": "https://... | null",
    "year": 1,
    "quadmester": 1,
    "resourceCount": 12,
    "createdAt": "...",
    "updatedAt": "..."
  }]
}
```

**Vista:** Tabla ordenable. Columna `resourceCount` con badge de color (0 = rojo, 1-3 = amarillo, 4+ = verde). Permite identificar rápidamente materias sin recursos.

### Crear materia
```
POST /admin/subjects
Body (JSON): { facultyId, title, description?, urlMoodle?, urlPrograma?, year, quadmester }
```

### Editar materia
```
PATCH /admin/subjects/:id
Body (JSON): cualquier subconjunto de los campos anteriores (excepto facultyId)
```

### Eliminar materia
```
DELETE /admin/subjects/:id
```
Falla con `409` si tiene recursos publicados.

---

## Sección 4 — Carreras, Facultades, Universidades

Todas siguen el mismo patrón CRUD. Son necesarias para poder crear materias y filtrar recursos.

### Universidades
```
GET    /admin/universities?page=1&limit=20
POST   /admin/universities          Body: { name }
GET    /admin/universities/:id
PATCH  /admin/universities/:id      Body: { name }
DELETE /admin/universities/:id      → 409 si tiene facultades
```

### Facultades
```
GET    /admin/faculties?universityId=U1&page=1&limit=20
POST   /admin/faculties             Body: { universityId, name }
GET    /admin/faculties/:id
PATCH  /admin/faculties/:id         Body: { name }
DELETE /admin/faculties/:id         → 409 si tiene carreras
```

### Carreras
```
GET    /admin/careers?facultyId=F1&page=1&limit=20
POST   /admin/careers               Body: { facultyId, name }
GET    /admin/careers/:id
PATCH  /admin/careers/:id           Body: { name }
DELETE /admin/careers/:id           → 409 si tiene planes de estudio
```

### Planes de estudio
```
GET    /admin/career-plans?careerId=C1&page=1&limit=20
POST   /admin/career-plans          Body: { careerId, name, year }
GET    /admin/career-plans/:id
PATCH  /admin/career-plans/:id      Body: { name?, year? }
DELETE /admin/career-plans/:id      → 409 si tiene materias asignadas
```

Respuestas de CRUD:
- `GET /` → `{ data: [...], total, page, totalPages }`
- `POST` → objeto creado, `201`
- `GET /:id` → objeto o `404`
- `PATCH /:id` → objeto actualizado o `404`
- `DELETE /:id` → `204` sin body, o `409` con `{ error: "..." }`

---

## Manejo de errores global

| Status | Significado |
|--------|------------|
| `400` | Validación fallida — `{ error: "mensaje" }` |
| `401` | Token ausente o inválido — redirigir al login |
| `403` | Rol insuficiente |
| `404` | Recurso no encontrado |
| `409` | Conflicto — no se puede eliminar porque tiene dependencias |
| `500` | Error interno — mostrar mensaje genérico |

---

## Flujos principales resumidos

### Flujo A — Subir nuevo recurso (desde panel)
1. Admin va a Recursos → "Nuevo recurso"
2. Busca la materia por nombre
3. Selecciona tipo (parcial / final / resumen)
4. Carga PDF (max 20MB)
5. Completa campos opcionales (período, fecha de examen, notas)
6. Confirma → `POST /admin/resources`
7. El recurso aparece publicado inmediatamente en la lista

### Flujo B — Moderar recursos de usuarios
1. Dashboard muestra badge si hay pendientes
2. Admin va a Recursos → tab "Pendientes"
3. Por cada recurso: click "Ver PDF" → previsualiza → "Aprobar" o "Rechazar (con motivo)"
4. O selecciona varios y hace "Aprobar seleccionados"

### Flujo C — Detectar materias sin cobertura
1. Admin va a Materias
2. Ordena por `resourceCount` ascendente
3. Identifica las materias en rojo (0 recursos)
4. Va a Recursos → "Nuevo recurso" y sube para esa materia

### Flujo D — Crear nueva materia
1. Verificar que exista la jerarquía: Universidad → Facultad → Carrera → Plan
2. Crear los eslabones faltantes en ese orden
3. `POST /admin/subjects` con `facultyId`, `year`, `quadmester`, etc.
4. La materia aparece con `resourceCount: 0` en la lista

---

## Notas de implementación

- El token JWT expira. Manejar refresh o logout automático al recibir `401`.
- Los dropdowns de materias y carreras en el formulario de recursos deben cargar con paginación o búsqueda, ya que hay 65+ materias.
- `subjectTitle` viene incluido en `GET /admin/resources`, no hace falta un request extra.
- El campo `slug` es autogenerado por el backend al crear/editar, no necesita input del usuario.
- `shortName` existe en universidades, facultades y carreras pero no se edita desde el panel aún (solo vía seed).
