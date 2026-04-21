# Admin Backend — Análisis y estado actual

**Fecha:** 2026-04-20

## Estado previo a la implementación del admin

### ✅ Ya existía

| Componente | Detalle |
|-----------|---------|
| JWT con `role` | El payload incluye `sub`, `role` (`user/admin/superadmin`), `facultyId`, `iat`, `exp` |
| `verifyToken` | Middleware que verifica el Bearer token y popula `c.get('user')` |
| `requireRole(minRole)` | Middleware con jerarquía `user < admin < superadmin` |
| Rate limiting en login | 10 requests / 15 min |
| Admin recursos | `GET/POST /admin/resources`, `POST /admin/resources/:id/publish|reject` |
| `StorageProvider` interface | Con implementaciones local (funcional) y drive (stub) |
| Schema completo | Tablas: `universities`, `faculties`, `careers`, `careerPlans`, `subjects`, `resources`, `users` |
| Rutas públicas | Lectura de universities, faculties, careers, subjects, resources |

### ❌ Faltaba implementar

| Componente | Estado después |
|-----------|---------------|
| Admin CRUD de universidades | ✅ Implementado |
| Admin CRUD de facultades | ✅ Implementado |
| Admin CRUD de carreras | ✅ Implementado |
| Admin CRUD de planes de carrera | ✅ Implementado |
| Admin CRUD de materias | ✅ Implementado |
| Rutas de gestión de carpetas Drive | ✅ Implementado |
| Integración real con Google Drive API | ✅ Implementado (requiere credenciales) |
| `STORAGE_PROVIDER` env var | ✅ Implementado |
| CORS para admin frontend (`ADMIN_ORIGIN`) | ✅ Implementado |
| `DriveService` separado de `StorageProvider` | ✅ Implementado |

## Respuestas a las preguntas del análisis

### ¿Existen rutas CRUD para universidades, facultades, carreras, materias y planes?

**Antes:** Solo rutas GET (lectura pública) para todos.
**Después:** CRUD completo bajo `/api/v1/admin/{entidad}`, protegido con `requireRole('admin')`.

### ¿El JWT incluye `role`? ¿Hay middleware de autorización por rol?

**Sí, ya existían.** El JWT incluye `role: 'user' | 'admin' | 'superadmin'`. El middleware `requireRole(minRole)` ya implementaba la jerarquía correctamente.

### ¿Hay integración con Google Drive API?

**Antes:** El `DriveStorageProvider` era un stub que lanzaba errores en todos los métodos.
**Después:** Se implementó `DriveApiProvider` usando `googleapis`, autenticado con service account. Además se creó un `DriveService` separado (`src/services/drive/`) para manejar carpetas independientemente del `StorageProvider` (que maneja archivos).

### ¿Qué faltaba?

Ver tabla de arriba.
