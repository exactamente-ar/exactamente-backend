# Prompt: Admin Frontend para Exactamente

Usá este prompt en una carpeta vacía con Claude CLI para generar el admin frontend.

---

## Instrucciones para Claude

Vas a construir un panel de administración como una **Single Page Application con React + Vite + React Router**. No usar Next.js, Astro ni ningún meta-framework.

## Setup inicial

```bash
npm create vite@latest . -- --template react-ts
npm install react-router-dom axios
```

Estructura de carpetas objetivo:

```
src/
├── api/          # Funciones de llamada al backend (una por recurso)
├── components/   # Componentes reutilizables (Modal, Breadcrumb, TreeNode, etc.)
├── pages/        # Una página por sección (Login, Universities, Faculties, etc.)
├── hooks/        # Custom hooks (useAuth, useDrive, usePagination)
├── context/      # AuthContext
└── main.tsx
```

## Variables de entorno

Crear `.env`:
```
VITE_API_URL=http://localhost:3000/api/v1
```

## Backend — URL base y autenticación

- Base URL: `VITE_API_URL` del `.env`
- Autenticación: JWT en `Authorization: Bearer <token>` header
- El token se obtiene haciendo `POST /auth/login` con `{ email, password }`
- El token incluye el campo `role` en su payload (decodificable con atob o jwt-decode)
- Guardar el token en `localStorage` y eliminarlo al hacer logout o al recibir 401/403

## Auth

### Pantalla de login

- Ruta: `/login`
- Formulario: email + password
- Al submit: `POST /auth/login` → guardar token → redirigir a `/`
- Si ya hay token válido con role admin: redirigir a `/` directamente

### Rutas protegidas

- Todas las rutas excepto `/login` requieren token con `role === 'admin'` o `'superadmin'`
- Si no hay token: redirigir a `/login`
- Si el backend responde 401 o 403: limpiar token y redirigir a `/login`
- Implementar un `<PrivateRoute>` wrapper que haga esta verificación

## ABM de entidades

Implementar ABM completo con **navegación jerárquica**:

```
/ (dashboard)
/universities                → lista de universidades
/universities/:id/faculties  → lista de facultades de esa universidad
/faculties/:id/careers       → lista de carreras de esa facultad
/careers/:id/plans           → lista de planes de esa carrera
/faculties/:id/subjects      → lista de materias de esa facultad
```

### Comportamiento por sección

Cada sección muestra:
- Breadcrumb: ej. "UNICEN > FACET > Sistemas de Información"
- Tabla paginada con nombre, fecha de creación, acciones
- Botón "Nuevo" → abre modal con formulario de creación
- Botón "Editar" → abre modal con formulario de edición (mismo componente)
- Botón "Eliminar" → confirma y llama al endpoint DELETE

### Formularios

- **Universidad:** `name`
- **Facultad:** `name` (universityId viene del contexto de navegación)
- **Carrera:** `name` (facultyId viene del contexto de navegación)
- **Plan:** `name`, `year` (careerId viene del contexto de navegación)
- **Materia:** `title`, `year`, `quadmester` (1 o 2), `description?`, `urlMoodle?`, `urlPrograma?` (facultyId viene del contexto)

Validación mínima: campos requeridos no vacíos. Mostrar errores del backend en el formulario.

## Referencia completa de endpoints

### Auth
| Método | Ruta | Body |
|--------|------|------|
| POST | `/auth/login` | `{ email, password }` |
| GET | `/auth/me` | — |

### Universidades
| Método | Ruta | Body / Query |
|--------|------|------|
| GET | `/admin/universities` | `?page&limit` |
| POST | `/admin/universities` | `{ name }` |
| GET | `/admin/universities/:id` | — |
| PATCH | `/admin/universities/:id` | `{ name }` |
| DELETE | `/admin/universities/:id` | — |

### Facultades
| Método | Ruta | Body / Query |
|--------|------|------|
| GET | `/admin/faculties` | `?universityId&page&limit` |
| POST | `/admin/faculties` | `{ universityId, name }` |
| GET | `/admin/faculties/:id` | — |
| PATCH | `/admin/faculties/:id` | `{ name }` |
| DELETE | `/admin/faculties/:id` | — |

### Carreras
| Método | Ruta | Body / Query |
|--------|------|------|
| GET | `/admin/careers` | `?facultyId&page&limit` |
| POST | `/admin/careers` | `{ facultyId, name }` |
| GET | `/admin/careers/:id` | — |
| PATCH | `/admin/careers/:id` | `{ name }` |
| DELETE | `/admin/careers/:id` | — |

### Planes
| Método | Ruta | Body / Query |
|--------|------|------|
| GET | `/admin/career-plans` | `?careerId&page&limit` |
| POST | `/admin/career-plans` | `{ careerId, name, year }` |
| GET | `/admin/career-plans/:id` | — |
| PATCH | `/admin/career-plans/:id` | `{ name?, year? }` |
| DELETE | `/admin/career-plans/:id` | — |

### Materias
| Método | Ruta | Body / Query |
|--------|------|------|
| GET | `/admin/subjects` | `?facultyId&page&limit` |
| POST | `/admin/subjects` | `{ facultyId, title, year, quadmester, description?, urlMoodle?, urlPrograma? }` |
| GET | `/admin/subjects/:id` | — |
| PATCH | `/admin/subjects/:id` | campos parciales del POST |
| DELETE | `/admin/subjects/:id` | — |

### Carpetas Drive
| Método | Ruta | Body / Query |
|--------|------|------|
| GET | `/admin/drive/tree` | `?depth=2` |
| GET | `/admin/drive/folder/:folderId` | — |
| POST | `/admin/drive/folder` | `{ parentId, name }` |
| PATCH | `/admin/drive/folder/:folderId` | `{ name }` |
| DELETE | `/admin/drive/folder/:folderId` | — |

### Formato de respuesta — lista paginada
```json
{ "data": [...], "total": 100, "page": 1, "totalPages": 5 }
```

### Errores
```json
{ "error": "Mensaje descriptivo" }
```

- `400`: validación de input
- `401`: token faltante o inválido → limpiar y redirigir a /login
- `403`: rol insuficiente → limpiar y redirigir a /login
- `404`: recurso no encontrado
- `409`: conflicto (ej. intentar eliminar entidad con hijos)

## Explorador de Drive

### Sección `/drive`

Mostrar un árbol visual de carpetas similar a un explorador de archivos.

### Carga inicial

Al entrar a la sección: `GET /admin/drive/tree?depth=2` para obtener los primeros 2 niveles del árbol.

### Carga lazy

- Las carpetas comienzan colapsadas (excepto la raíz)
- Al expandir una carpeta: `GET /admin/drive/folder/:folderId` → insertar hijos en el árbol local
- No volver a cargar si ya se cargaron los hijos

### UI del árbol

- Ícono de carpeta cerrada / abierta según estado
- Click en carpeta: toggle expand/collapse
- Breadcrumb en la parte superior mostrando la carpeta actualmente seleccionada
- Indicador de loading por carpeta mientras se cargan sus hijos

### Acciones por carpeta

Mostrar botones al hacer hover o en un menú contextual:

- **Crear subcarpeta**: abre modal con input de nombre → `POST /admin/drive/folder` con `{ parentId: folderId, name }`
- **Renombrar**: abre modal con input pre-poblado → `PATCH /admin/drive/folder/:folderId` con `{ name }`
- **Eliminar**: pide confirmación → `DELETE /admin/drive/folder/:folderId`. Deshabilitar este botón en la carpeta raíz (el backend también lo bloquea con 400).

### Botón global

"Nueva carpeta" en la raíz del árbol → crea carpeta en el nivel raíz.

### Feedback

- Spinner por carpeta durante operaciones asíncronas
- Mensajes de error inline si una operación falla (no solo console.error)
- Al crear/renombrar/eliminar: actualizar el árbol local sin recargar toda la página

## Nota sobre desarrollo sin Drive

El backend soporta `STORAGE_PROVIDER=local` (valor por defecto). En ese modo, las rutas `/admin/drive/...` usan el filesystem local para simular el árbol de carpetas. El explorador de Drive funciona igual sin necesitar credenciales reales de Google Drive.

Para inicializar una carpeta raíz local de prueba:

```bash
mkdir -p ./storage/drive/FACET/Sistemas
mkdir -p ./storage/drive/FACET/Civil
mkdir -p ./storage/drive/FACE/Economia
```

El `GET /admin/drive/tree` con `STORAGE_PROVIDER=local` leerá esa estructura.
