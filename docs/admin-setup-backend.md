# Admin Backend — Setup y referencia de endpoints

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | Siempre | URL de conexión PostgreSQL |
| `JWT_SECRET` | Siempre | Mínimo 32 caracteres, aleatorio en producción |
| `PORT` | No (default: 3000) | Puerto del servidor |
| `NODE_ENV` | No (default: development) | `development` o `production` |
| `CORS_ORIGIN` | Siempre | Origen del frontend principal |
| `ADMIN_ORIGIN` | Siempre | Origen del admin frontend |
| `STORAGE_PROVIDER` | No (default: local) | `local` o `drive` |
| `STORAGE_PATH` | No (default: ./storage) | Ruta local para archivos (modo local) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Solo si `STORAGE_PROVIDER=drive` | JSON de la service account completo (stringificado) |
| `DRIVE_ROOT_FOLDER_ID` | Solo si `STORAGE_PROVIDER=drive` | ID de la carpeta raíz en Google Drive |

## Cómo crear el primer usuario admin

El seed crea automáticamente un usuario superadmin. Para crear usuarios admin adicionales, actualizar el rol directamente en la DB:

```sql
UPDATE users SET role = 'admin' WHERE email = 'tu@email.com';
```

O crear uno nuevo con rol admin usando el seed script (modificar `scripts/seed.ts` temporalmente).

## Cómo obtener credenciales de Google Drive (service account)

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un proyecto (o usar uno existente)
3. Habilitar la **Google Drive API**: APIs & Services → Library → buscar "Google Drive API" → Enable
4. Ir a **IAM & Admin → Service Accounts** → Create Service Account
   - Nombre: `exactamente-drive` (o similar)
   - Role: no es necesario asignar rol de proyecto
5. En la service account creada, ir a **Keys** → Add Key → Create new key → JSON
6. Descargar el archivo `.json`
7. Compartir la carpeta raíz de Drive con el email de la service account (el campo `client_email` del JSON) con permiso **Editor**
8. Copiar el contenido del JSON en una sola línea y setearlo como `GOOGLE_SERVICE_ACCOUNT_JSON`

```bash
# Convertir el JSON a una línea (macOS/Linux)
cat service-account.json | jq -c . > service-account-oneline.txt
```

9. Obtener el ID de la carpeta raíz: abrir la carpeta en Drive, copiar el ID de la URL (`https://drive.google.com/drive/folders/<ID>`)

## Endpoints del admin

Todos los endpoints requieren header: `Authorization: Bearer <token>` con rol `admin` o `superadmin`.

### Autenticación

| Método | Ruta | Descripción | Body |
|--------|------|-------------|------|
| `POST` | `/api/v1/auth/login` | Login, devuelve JWT | `{ email, password }` |
| `GET` | `/api/v1/auth/me` | Datos del usuario autenticado | — |

### Universidades

| Método | Ruta | Descripción | Body / Params |
|--------|------|-------------|---------------|
| `GET` | `/api/v1/admin/universities` | Lista paginada | `?page&limit` |
| `POST` | `/api/v1/admin/universities` | Crear | `{ name }` |
| `GET` | `/api/v1/admin/universities/:id` | Detalle | — |
| `PATCH` | `/api/v1/admin/universities/:id` | Actualizar nombre | `{ name }` |
| `DELETE` | `/api/v1/admin/universities/:id` | Eliminar (409 si tiene facultades) | — |

### Facultades

| Método | Ruta | Descripción | Body / Params |
|--------|------|-------------|---------------|
| `GET` | `/api/v1/admin/faculties` | Lista paginada | `?universityId&page&limit` |
| `POST` | `/api/v1/admin/faculties` | Crear | `{ universityId, name }` |
| `GET` | `/api/v1/admin/faculties/:id` | Detalle | — |
| `PATCH` | `/api/v1/admin/faculties/:id` | Actualizar nombre | `{ name }` |
| `DELETE` | `/api/v1/admin/faculties/:id` | Eliminar (409 si tiene carreras) | — |

### Carreras

| Método | Ruta | Descripción | Body / Params |
|--------|------|-------------|---------------|
| `GET` | `/api/v1/admin/careers` | Lista paginada | `?facultyId&page&limit` |
| `POST` | `/api/v1/admin/careers` | Crear | `{ facultyId, name }` |
| `GET` | `/api/v1/admin/careers/:id` | Detalle | — |
| `PATCH` | `/api/v1/admin/careers/:id` | Actualizar nombre | `{ name }` |
| `DELETE` | `/api/v1/admin/careers/:id` | Eliminar (409 si tiene planes) | — |

### Planes de carrera

| Método | Ruta | Descripción | Body / Params |
|--------|------|-------------|---------------|
| `GET` | `/api/v1/admin/career-plans` | Lista paginada | `?careerId&page&limit` |
| `POST` | `/api/v1/admin/career-plans` | Crear | `{ careerId, name, year }` |
| `GET` | `/api/v1/admin/career-plans/:id` | Detalle | — |
| `PATCH` | `/api/v1/admin/career-plans/:id` | Actualizar | `{ name?, year? }` |
| `DELETE` | `/api/v1/admin/career-plans/:id` | Eliminar (409 si tiene materias asignadas) | — |

### Materias

| Método | Ruta | Descripción | Body / Params |
|--------|------|-------------|---------------|
| `GET` | `/api/v1/admin/subjects` | Lista paginada | `?facultyId&page&limit` |
| `POST` | `/api/v1/admin/subjects` | Crear | `{ facultyId, title, year, quadmester, description?, urlMoodle?, urlPrograma? }` |
| `GET` | `/api/v1/admin/subjects/:id` | Detalle | — |
| `PATCH` | `/api/v1/admin/subjects/:id` | Actualizar (parcial) | `{ title?, description?, urlMoodle?, urlPrograma?, year?, quadmester? }` |
| `DELETE` | `/api/v1/admin/subjects/:id` | Eliminar (409 si tiene recursos publicados) | — |

### Recursos (ya existían)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/admin/resources` | Lista todos los recursos (todos los estados) |
| `POST` | `/api/v1/admin/resources` | Subir recurso a staging (multipart/form-data) |
| `POST` | `/api/v1/admin/resources/:id/publish` | Publicar recurso pendiente |
| `POST` | `/api/v1/admin/resources/:id/reject` | Rechazar recurso (`{ reason }`) |

### Carpetas Drive

| Método | Ruta | Descripción | Body / Params |
|--------|------|-------------|---------------|
| `GET` | `/api/v1/admin/drive/tree` | Árbol recursivo desde raíz | `?depth=2` (1–5) |
| `GET` | `/api/v1/admin/drive/folder/:folderId` | Contenido de carpeta (1 nivel) | — |
| `POST` | `/api/v1/admin/drive/folder` | Crear carpeta | `{ parentId, name }` |
| `PATCH` | `/api/v1/admin/drive/folder/:folderId` | Renombrar carpeta | `{ name }` |
| `DELETE` | `/api/v1/admin/drive/folder/:folderId` | Eliminar carpeta (400 si es raíz) | — |

## Formato de respuestas

**Lista paginada:**
```json
{ "data": [...], "total": 100, "page": 1, "totalPages": 5 }
```

**Error:**
```json
{ "error": "Mensaje descriptivo" }
```

## Seguridad

- Todos los endpoints admin requieren JWT con `role >= admin`
- Rate limiting en `/auth/login`: 10 requests / 15 min por IP
- CORS restringido a `CORS_ORIGIN` y `ADMIN_ORIGIN`
- Passwords nunca se devuelven en respuestas
- La carpeta raíz de Drive no puede eliminarse por API
- Eliminar entidades con hijos devuelve 409 (no borra en cascada)

## Recomendaciones para producción

- Usar un `JWT_SECRET` aleatorio de al menos 64 caracteres
- `NODE_ENV=production` — deshabilita stack traces en errores 500
- `CORS_ORIGIN` y `ADMIN_ORIGIN` deben apuntar a dominios reales (sin wildcard)
- Proteger la service account JSON con variables de entorno del sistema, no en archivos
- Hacer la carpeta raíz de Drive compartida solo con la service account (no pública)
