# Problemas y Soluciones — Exactamente Backend

> Fecha de análisis: 2026-04-20
> Autor: análisis técnico generado a partir del estado actual del codebase

---

## Resumen ejecutivo

El proyecto tiene una base sólida: schema bien modelado, paginación consistente, middleware de auth funcional. Los cuatro problemas descritos son complementarios y apuntan al mismo vacío: **no existe capa de gestión de almacenamiento ni endpoints de escritura para el admin**. El schema ya anticipó parte de la solución (campos `stagingPath`, `stagingMimeType`, `stagingSize` en `resources`), lo que valida la dirección propuesta aquí.

El orden de implementación recomendado es: **Problema 4 → Problema 3 → Problema 2 → Problema 1**, de más estructural a más cosmético.

---

## Problema 1 — Estructura de carpetas en Drive mal organizada

### Análisis

**¿Afecta datos existentes o solo organización visual?**

Solo organización visual. Los recursos en la BD se referencian por `driveFileId` (el ID único del archivo en Drive), no por su ruta o carpeta. Mover un archivo entre carpetas en Drive **no cambia su ID**. Los links existentes (`buildPreviewUrl`, `buildDownloadUrl` en `src/utils/drive-urls.ts`) seguirán funcionando después de una reorganización.

**¿Los links actuales se rompen si se reorganizan las carpetas?**

No, mientras los archivos no sean eliminados ni el sharing se modifique. La API de Drive preserva el `fileId` independientemente de la carpeta contenedora. El único riesgo es mover un archivo a una carpeta con permisos más restrictivos.

**Estructura ideal de carpetas**

```
exactamente/
└── {universidad-slug}/           # ej: unicen
    └── {facultad-slug}/          # ej: facet
        └── {carrera-slug}/       # ej: ing-sistemas
            └── plan-{año}/       # ej: plan-2009
                └── {materia-slug}/   # ej: analisis-matematico-1
                    ├── resumenes/
                    ├── parciales/
                    └── finales/
```

Esta estructura mapea 1:1 con la jerarquía del schema: `universities → faculties → careers → careerPlans → subjects → resources`.

### Solución propuesta

**Corto plazo:** Reorganizar manualmente los archivos existentes en Drive usando la carpeta `ing/` actual como punto de partida. No requiere cambios de código.

**Largo plazo:** Cuando se implemente la creación automática de carpetas (Problema 2), los nuevos recursos quedarán organizados automáticamente. La migración de archivos viejos puede hacerse con un script de Drive API o manualmente.

### Riesgos

- Si un archivo está en una carpeta compartida con permisos específicos, moverlo puede afectar la visibilidad. Verificar permisos antes de reorganizar.
- Si en el futuro se almacena el `driveFolderId` en la BD (ver Problema 2), la migración debe sincronizarse con la reorganización manual.

---

## Problema 2 — Creación manual de entidades sin sincronización con Drive

### Análisis

**Estado actual:**

No existe ningún endpoint de escritura (`POST`, `PUT`, `DELETE`) en las rutas actuales (`universities.ts`, `faculties.ts`, `careers.ts`, `subjects.ts`). Todas son de solo lectura. Tampoco existe ninguna columna `driveFolderId` en las tablas del schema.

**Qué se necesita:**

1. Endpoints de admin para crear/editar entidades.
2. Al crear una entidad, crear la carpeta correspondiente en Drive dentro de la carpeta padre.
3. Guardar el `driveFolderId` en la BD para poder referenciar la carpeta al subir archivos.

### Solución propuesta

#### A. Agregar `driveFolderId` al schema

```typescript
// En schema.ts, agregar a cada tabla de la jerarquía:
export const faculties = pgTable('faculties', {
  // ...campos existentes...
  driveFolderId: text('drive_folder_id'),  // nullable — se llena al crear la carpeta
});

// Mismo patrón para: careers, careerPlans, subjects
```

Requiere `bun db:generate` + `bun db:migrate`.

#### B. Flujo de creación con sincronización

```
POST /api/v1/admin/faculties
  │
  ├─ 1. Validar input (Zod)
  ├─ 2. Insertar en BD (genera ID y slug)
  ├─ 3. Llamar StorageProvider.createFolder(name, parentFolderId)
  ├─ 4. Actualizar BD con el driveFolderId retornado
  └─ 5. Retornar entidad completa
```

#### C. Estrategia de sincronización: llamada directa con fallback

No se recomienda una queue para el MVP. La creación de carpetas en Drive es rápida (<500ms) y el volumen de creaciones es bajo (no es una operación masiva). Propuesta:

```typescript
// En el handler de creación de entidad:
const faculty = await db.insert(faculties).values({ id, name, slug, universityId }).returning();

try {
  const folder = await storage.createFolder(name, parentFolderId);
  await db.update(faculties).set({ driveFolderId: folder.id }).where(eq(faculties.id, id));
} catch (err) {
  // Log el error pero no fallar la creación
  // La carpeta puede crearse manualmente o con un job de reconciliación
  console.error('[Drive] No se pudo crear carpeta para faculty', id, err);
}
```

Si la creación de carpeta falla, la entidad queda en BD sin `driveFolderId`. Un job de reconciliación puede detectar y corregir estos casos.

#### D. Jerarquía de carpetas padre

Al crear una entidad, el `parentFolderId` se obtiene de la entidad padre ya guardada en BD:

| Entidad que se crea | parentFolderId viene de |
|---------------------|------------------------|
| Faculty             | `universities.driveFolderId` |
| Career              | `faculties.driveFolderId` |
| CareerPlan          | `careers.driveFolderId` |
| Subject             | `careerPlans.driveFolderId` (o `careers.driveFolderId` si no hay plan) |

Si el padre no tiene `driveFolderId` todavía, usar la carpeta raíz de la universidad como fallback.

### Riesgos

- **Race condition al crear hijos antes que padre tenga carpeta**: mitigar buscando el `driveFolderId` más arriba en la jerarquía como fallback.
- **Límite de rate de Drive API**: en creaciones masivas (seed), agregar delay o batch.
- **Credenciales de Service Account**: requieren variable de entorno `GOOGLE_SERVICE_ACCOUNT_JSON` y permiso de editor en la carpeta raíz de Drive.

---

## Problema 3 — Subida de recursos desde el admin

### Análisis

**Estado actual:**

El schema ya tiene los campos necesarios para un flujo de dos pasos:

```typescript
// En resources (schema.ts):
stagingPath:     text('staging_path'),      // ruta local del archivo en staging
stagingMimeType: varchar('staging_mime_type', { length: 100 }),
stagingSize:     integer('staging_size'),
driveFileId:     text('drive_file_id'),     // ID en Drive (post-publicación)
driveMimeType:   varchar('drive_mime_type', { length: 100 }),
driveSize:       integer('drive_size'),
```

Esto confirma que la arquitectura de staging fue diseñada intencionalmente. **No existe ningún endpoint de upload implementado** en `src/routes/resources.ts`.

### Solución propuesta

#### Flujo completo de upload

```
Paso 1: SUBIDA
  Usuario (admin) → POST /api/v1/admin/resources/upload
    - Multipart form: archivo + subjectId + title + type
    - Backend guarda en staging local (ej: /tmp/staging/{resourceId})
    - Crea registro en BD con status='pending', stagingPath=...
    - Responde con { resourceId, status: 'pending' }

Paso 2: REVISIÓN
  Admin → GET /api/v1/admin/resources?status=pending
  Admin → POST /api/v1/admin/resources/{id}/publish
    - Verifica que stagingPath existe
    - Llama StorageProvider.uploadFile(stagingPath, targetFolderId)
    - Obtiene driveFileId del resultado
    - Actualiza BD: status='published', driveFileId=..., driveSize=..., publishedAt=now
    - Elimina archivo de staging

  Admin → POST /api/v1/admin/resources/{id}/reject
    - Actualiza BD: status='rejected', rejectionReason=...
    - Elimina archivo de staging
```

#### Implementación del endpoint de upload

```typescript
// src/routes/admin/resources.ts
app.post('/upload', verifyToken, requireRole('admin'), async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'] as File;
  const { subjectId, title, type } = body;

  // Validar con Zod
  // Determinar carpeta destino: buscar subject → su driveFolderId o el del padre
  const targetFolder = await resolveSubjectFolder(subjectId);

  // Guardar en staging
  const stagingPath = await storage.saveToStaging(file, resourceId);

  // Insertar en BD
  await db.insert(resources).values({
    id: resourceId,
    subjectId,
    title,
    type,
    status: 'pending',
    stagingPath,
    stagingMimeType: file.type,
    stagingSize: file.size,
    uploadedBy: user.sub,
  });

  return c.json({ id: resourceId, status: 'pending' }, 201);
});
```

#### Determinación de la carpeta destino en Drive

```typescript
async function resolveSubjectFolder(subjectId: string): Promise<string> {
  // 1. Buscar driveFolderId de la materia
  // 2. Si no tiene, buscar el de la carrera
  // 3. Si no tiene, buscar el de la facultad
  // 4. Si no tiene, usar carpeta raíz de Drive
  // Retornar el primero no-null encontrado
}
```

### Consideraciones de seguridad

- Validar tipo MIME del archivo (solo PDFs e imágenes para recursos académicos).
- Limitar tamaño máximo (ej: 50MB).
- El staging local debe estar fuera del directorio `src/` y no ser accesible públicamente.
- Limpiar staging periódicamente (recursos rechazados o huérfanos).

---

## Problema 4 — Estrategia local vs producción (Storage Abstraction)

### Análisis

**Estado actual:**

`src/utils/drive-urls.ts` solo construye URLs a partir de un `fileId` existente — no hay ninguna abstracción para operaciones de escritura (crear carpetas, subir archivos). Al implementar los problemas 2 y 3, se necesita una capa que permita cambiar el backend sin tocar la lógica de negocio.

### Solución propuesta

#### Interface `StorageProvider`

```typescript
// src/services/storage/types.ts

export interface StorageFolder {
  id: string;       // ID de la carpeta en el provider
  name: string;
  parentId: string | null;
}

export interface StorageFile {
  id: string;       // ID del archivo en el provider
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string | null;
  downloadUrl: string | null;
}

export interface StorageProvider {
  // Crear una carpeta dentro de un padre (null = raíz)
  createFolder(name: string, parentId: string | null): Promise<StorageFolder>;

  // Subir un archivo a una carpeta destino
  uploadFile(localPath: string, folderId: string, fileName: string): Promise<StorageFile>;

  // Generar URLs de acceso (puede ser síncrono o async según el provider)
  getPreviewUrl(fileId: string): string;
  getDownloadUrl(fileId: string): string;

  // Eliminar un archivo (para limpiar staging si se rechaza)
  deleteFile(fileId: string): Promise<void>;
}
```

#### Implementación local (desarrollo)

```typescript
// src/services/storage/local.provider.ts

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;
  private baseUrl: string;  // ej: http://localhost:3000/files

  async createFolder(name: string, parentId: string | null): Promise<StorageFolder> {
    const id = slugify(name) + '-' + Date.now();
    const path = parentId
      ? join(this.basePath, parentId, id)
      : join(this.basePath, id);
    await mkdir(path, { recursive: true });
    return { id, name, parentId };
  }

  async uploadFile(localPath: string, folderId: string, fileName: string): Promise<StorageFile> {
    const destPath = join(this.basePath, folderId, fileName);
    await copyFile(localPath, destPath);
    const stat = await statFile(destPath);
    return {
      id: join(folderId, fileName),  // path relativo como ID
      name: fileName,
      mimeType: detectMimeType(fileName),
      size: stat.size,
      previewUrl: `${this.baseUrl}/${folderId}/${fileName}`,
      downloadUrl: `${this.baseUrl}/${folderId}/${fileName}`,
    };
  }

  getPreviewUrl(fileId: string): string {
    return `${this.baseUrl}/${fileId}`;
  }

  getDownloadUrl(fileId: string): string {
    return `${this.baseUrl}/${fileId}`;
  }

  async deleteFile(fileId: string): Promise<void> {
    await unlink(join(this.basePath, fileId));
  }
}
```

#### Implementación Drive (producción)

```typescript
// src/services/storage/drive.provider.ts

export class DriveStorageProvider implements StorageProvider {
  private driveClient: GoogleDriveClient;  // @googleapis/drive

  async createFolder(name: string, parentId: string | null): Promise<StorageFolder> {
    const res = await this.driveClient.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id, name, parents',
    });
    return { id: res.data.id!, name, parentId };
  }

  async uploadFile(localPath: string, folderId: string, fileName: string): Promise<StorageFile> {
    const fileStream = createReadStream(localPath);
    const res = await this.driveClient.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { body: fileStream },
      fields: 'id, name, mimeType, size',
    });
    // Hacer el archivo público (viewer)
    await this.driveClient.permissions.create({
      fileId: res.data.id!,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    return {
      id: res.data.id!,
      name: fileName,
      mimeType: res.data.mimeType!,
      size: Number(res.data.size),
      previewUrl: buildPreviewUrl(res.data.id!),
      downloadUrl: buildDownloadUrl(res.data.id!),
    };
  }

  getPreviewUrl(fileId: string): string { return buildPreviewUrl(fileId); }
  getDownloadUrl(fileId: string): string { return buildDownloadUrl(fileId); }

  async deleteFile(fileId: string): Promise<void> {
    await this.driveClient.files.delete({ fileId });
  }
}
```

#### Instanciación según entorno

```typescript
// src/services/storage/index.ts

import { env } from '@/env';  // validación Zod existente
import { LocalStorageProvider } from './local.provider';
import { DriveStorageProvider } from './drive.provider';
import type { StorageProvider } from './types';

export const storage: StorageProvider =
  env.NODE_ENV === 'production'
    ? new DriveStorageProvider()
    : new LocalStorageProvider({ basePath: './storage', baseUrl: `http://localhost:${env.PORT}/files` });
```

#### Variable de entorno adicional para producción

```bash
# .env.example — agregar:
GOOGLE_DRIVE_ROOT_FOLDER_ID=  # ID de la carpeta raíz en Drive (ej: la carpeta `ing/` actual)
GOOGLE_SERVICE_ACCOUNT_JSON=  # JSON de credenciales de service account (en una línea o path a archivo)
```

---

## Orden de implementación recomendado

| Paso | Problema | Tarea | Dependencias |
|------|----------|-------|--------------|
| 1 | 4 | Definir interface `StorageProvider` y tipos | Ninguna |
| 2 | 4 | Implementar `LocalStorageProvider` | Paso 1 |
| 3 | 3 | Endpoint `POST /admin/resources/upload` (usa local storage) | Paso 2 |
| 4 | 3 | Endpoints `POST /admin/resources/:id/publish` y `/reject` | Paso 3 |
| 5 | 2 | Agregar `driveFolderId` al schema + migración | Ninguna |
| 6 | 2 | Endpoints de creación de entidades (`POST /admin/faculties`, etc.) | Paso 5 |
| 7 | 4 | Implementar `DriveStorageProvider` | Paso 1 |
| 8 | 2+3 | Integrar `DriveStorageProvider` en producción | Pasos 6 y 7 |
| 9 | 1 | Reorganizar carpetas existentes en Drive manualmente | Paso 8 |

**Criterio del orden:**
- Empezar con la abstracción (Paso 1-2) para que todo lo que se construya después sea compatible con ambos providers.
- El upload local (Pasos 3-4) permite probar el flujo completo sin credenciales de Drive.
- La creación de carpetas (Pasos 5-6) se puede hacer en paralelo con el upload, pero la integración final (Paso 8) necesita ambos.
- La reorganización de Drive (Paso 9) es lo último porque no bloquea nada y puede hacerse en cualquier momento.

---

## Riesgos y consideraciones globales

### Seguridad

- **Service Account credentials**: nunca commitear el JSON de credenciales. Usar variable de entorno y `.gitignore`.
- **Archivos públicos en Drive**: al hacer `permission: reader + anyone`, cualquiera con el link puede acceder. Aceptable para recursos académicos públicos; si se necesita control de acceso, usar links firmados o verificar autenticación antes de redirigir.
- **Staging local**: el directorio de staging no debe ser accesible por el servidor web. Si se sirven archivos locales, usar un endpoint dedicado con validación de path para evitar directory traversal.

### Consistencia de datos

- **Entidad sin carpeta en Drive**: puede pasar si la llamada a Drive falla. Solución: job de reconciliación que detecte entidades con `driveFolderId = null` y reintente la creación.
- **Archivo subido a staging pero no publicado**: limpiar archivos de staging más viejos que N días con un cron job.

### Costos y límites de Drive API

- Drive API tiene cuotas: 12,000 requests/minuto por usuario. Para el volumen esperado de una plataforma educativa, no debería ser un problema.
- El almacenamiento de Drive cuenta contra la cuota de la cuenta Google. Monitorear.

### Staging para servir archivos localmente

Para que el `LocalStorageProvider` sirva archivos, agregar un endpoint estático o middleware en `app.ts`:

```typescript
// Solo en desarrollo:
if (env.NODE_ENV !== 'production') {
  app.use('/files/*', serveStatic({ root: './storage' }));
}
```

Hono tiene `serveStatic` del adaptador de Bun (`hono/bun`).
