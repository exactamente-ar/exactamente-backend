# Admin Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin API to the backend — CRUD for all entities plus Drive folder management — following existing Hono/Drizzle patterns.

**Architecture:** All new routes live under `src/routes/admin/`. A new `src/services/drive/` module handles folder operations (separate from the existing `StorageProvider` which handles file upload/publish). Provider selection (local vs. Drive API) is controlled by the new `STORAGE_PROVIDER` env var.

**Tech Stack:** Hono v4, Drizzle ORM, Zod, Bun runtime, googleapis (new dep), PostgreSQL 16.

---

## File map

| Action | Path |
|--------|------|
| Modify | `src/env.ts` |
| Modify | `src/app.ts` |
| Modify | `src/services/storage/index.ts` |
| Modify | `.env.example` |
| Create | `bunfig.toml` |
| Create | `src/__tests__/env-setup.ts` |
| Create | `src/services/drive/types.ts` |
| Create | `src/services/drive/local.provider.ts` |
| Create | `src/services/drive/drive.provider.ts` |
| Create | `src/services/drive/index.ts` |
| Create | `src/routes/admin/drive.ts` |
| Create | `src/routes/admin/universities.ts` |
| Create | `src/routes/admin/faculties.ts` |
| Create | `src/routes/admin/careers.ts` |
| Create | `src/routes/admin/career-plans.ts` |
| Create | `src/routes/admin/subjects.ts` |
| Create | `src/__tests__/drive.local.test.ts` |
| Create | `src/__tests__/admin.routes.test.ts` |
| Create | `docs/admin-backend-analysis.md` |
| Create | `docs/admin-setup-backend.md` |
| Create | `docs/admin-frontend-prompt.md` |

---

## Task 1: Install googleapis

**Files:**
- Modify: `package.json` (via bun add)

- [ ] **Step 1: Install the package**

```bash
bun add googleapis
```

Expected output: package added to `package.json` dependencies.

- [ ] **Step 2: Verify install**

```bash
bun -e "import('googleapis').then(m => console.log('ok', typeof m.google))"
```

Expected: `ok function`

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore(deps): agregar googleapis"
```

---

## Task 2: Update env schema and .env.example

**Files:**
- Modify: `src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Replace src/env.ts**

```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL:                z.string().min(1, 'DATABASE_URL es requerida'),
  JWT_SECRET:                  z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  PORT:                        z.coerce.number().int().positive().default(3000),
  NODE_ENV:                    z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN:                 z.string().min(1, 'CORS_ORIGIN es requerida'),
  ADMIN_ORIGIN:                z.string().min(1, 'ADMIN_ORIGIN es requerida'),
  STORAGE_PROVIDER:            z.enum(['local', 'drive']).default('local'),
  STORAGE_PATH:                z.string().default('./storage'),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  DRIVE_ROOT_FOLDER_ID:        z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas o faltantes:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
```

- [ ] **Step 2: Replace .env.example**

```
# Base de datos
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/exactamente

# Auth
JWT_SECRET=super-secret-key-minimo-32-characters-long

# Servidor
PORT=3000
NODE_ENV=development

# CORS — frontend principal
CORS_ORIGIN=http://localhost:4321

# CORS — admin frontend
ADMIN_ORIGIN=http://localhost:5173

# Seed (solo necesario al correr `bun seed`, mínimo 12 caracteres)
SEED_ADMIN_PASSWORD=

# Storage
# "local" usa el filesystem, "drive" usa Google Drive API
STORAGE_PROVIDER=local
STORAGE_PATH=./storage

# Google Drive (solo necesario cuando STORAGE_PROVIDER=drive)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
DRIVE_ROOT_FOLDER_ID=
```

- [ ] **Step 3: Add ADMIN_ORIGIN to your local .env file**

Open `.env` and add:
```
ADMIN_ORIGIN=http://localhost:5173
```

- [ ] **Step 4: Verify the server still starts**

```bash
bun dev
```

Expected: server starts without env errors.

- [ ] **Step 5: Commit**

```bash
git add src/env.ts .env.example
git commit -m "feat(env): agregar ADMIN_ORIGIN, STORAGE_PROVIDER y DRIVE_ROOT_FOLDER_ID"
```

---

## Task 3: Update CORS and storage selector

**Files:**
- Modify: `src/app.ts` (CORS origin array)
- Modify: `src/services/storage/index.ts` (selector)

- [ ] **Step 1: Update CORS in src/app.ts**

Find this block:
```typescript
app.use('*', cors({
  origin: env.CORS_ORIGIN,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));
```

Replace with:
```typescript
app.use('*', cors({
  origin: [env.CORS_ORIGIN, env.ADMIN_ORIGIN],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));
```

- [ ] **Step 2: Update selector in src/services/storage/index.ts**

Replace the entire file with:
```typescript
import { env } from '@/env';
import { LocalStorageProvider } from './local.provider';
import { DriveStorageProvider } from './drive.provider';
import type { StorageProvider } from './types';

export const storage: StorageProvider =
  env.STORAGE_PROVIDER === 'drive'
    ? new DriveStorageProvider()
    : new LocalStorageProvider();

export type { StorageProvider, StagingResult, PublishResult } from './types';
```

- [ ] **Step 3: Verify server starts**

```bash
bun dev
```

Expected: starts without errors.

- [ ] **Step 4: Commit**

```bash
git add src/app.ts src/services/storage/index.ts
git commit -m "feat(cors,storage): soporte multi-origen y selector STORAGE_PROVIDER"
```

---

## Task 4: Drive service interface

**Files:**
- Create: `src/services/drive/types.ts`

- [ ] **Step 1: Create src/services/drive/types.ts**

```typescript
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface DriveNode {
  id: string;
  name: string;
  mimeType: string;
  children?: DriveNode[];
}

export interface DriveService {
  /** Recursive tree from folderId up to `depth` levels. */
  getTree(folderId: string, depth: number): Promise<DriveNode>;
  /** List immediate children of a folder (1 level). */
  listFolder(folderId: string): Promise<DriveNode[]>;
  /** Create a new folder inside parentId. */
  createFolder(parentId: string, name: string): Promise<DriveNode>;
  /** Rename an existing folder. */
  renameFolder(folderId: string, name: string): Promise<DriveNode>;
  /** Delete a folder recursively. */
  deleteFolder(folderId: string): Promise<void>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/drive/types.ts
git commit -m "feat(drive): agregar interfaz DriveService"
```

---

## Task 5: Local drive provider

**Files:**
- Create: `src/services/drive/local.provider.ts`

This provider stores folders on the filesystem. The `root` path is passed as a constructor arg (makes it testable without env). IDs are relative paths from the root (e.g. `""` = root, `"FACET"` = root/FACET, `"FACET/Sistemas"` = root/FACET/Sistemas).

- [ ] **Step 1: Create src/services/drive/local.provider.ts**

```typescript
import { mkdir, readdir, rename as fsRename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { FOLDER_MIME_TYPE } from './types';
import type { DriveService, DriveNode } from './types';

export class LocalDriveProvider implements DriveService {
  constructor(private root: string) {}

  private resolve(id: string): string {
    return id === '' ? this.root : join(this.root, id);
  }

  async getTree(folderId: string, depth: number): Promise<DriveNode> {
    await mkdir(this.resolve(folderId), { recursive: true });
    return this.buildNode(folderId, depth);
  }

  private async buildNode(id: string, depth: number): Promise<DriveNode> {
    const name = id === '' ? 'root' : id.split('/').at(-1)!;
    const node: DriveNode = { id, name, mimeType: FOLDER_MIME_TYPE };
    if (depth > 0) {
      const entries = await readdir(this.resolve(id), { withFileTypes: true });
      node.children = await Promise.all(
        entries
          .filter(e => e.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(e => this.buildNode(id === '' ? e.name : `${id}/${e.name}`, depth - 1)),
      );
    }
    return node;
  }

  async listFolder(folderId: string): Promise<DriveNode[]> {
    const entries = await readdir(this.resolve(folderId), { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({
        id: folderId === '' ? e.name : `${folderId}/${e.name}`,
        name: e.name,
        mimeType: FOLDER_MIME_TYPE,
      }));
  }

  async createFolder(parentId: string, name: string): Promise<DriveNode> {
    const id = parentId === '' ? name : `${parentId}/${name}`;
    await mkdir(this.resolve(id), { recursive: true });
    return { id, name, mimeType: FOLDER_MIME_TYPE };
  }

  async renameFolder(folderId: string, name: string): Promise<DriveNode> {
    const parts = folderId.split('/');
    parts[parts.length - 1] = name;
    const newId = parts.join('/');
    await fsRename(this.resolve(folderId), this.resolve(newId));
    return { id: newId, name, mimeType: FOLDER_MIME_TYPE };
  }

  async deleteFolder(folderId: string): Promise<void> {
    await rm(this.resolve(folderId), { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/drive/local.provider.ts
git commit -m "feat(drive): implementar LocalDriveProvider"
```

---

## Task 6: Tests for local drive provider

**Files:**
- Create: `bunfig.toml`
- Create: `src/__tests__/env-setup.ts`
- Create: `src/__tests__/drive.local.test.ts`

The local provider tests use a temp dir and don't need env vars. The `env-setup.ts` preload is needed for other tests that import modules which read `process.env` at load time.

- [ ] **Step 1: Create bunfig.toml**

```toml
[test]
preload = ["src/__tests__/env-setup.ts"]
```

- [ ] **Step 2: Create src/__tests__/env-setup.ts**

```typescript
// Set all required env vars before any module is imported.
// This runs before every test file via bunfig.toml preload.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET    = 'test-secret-that-is-at-least-32-characters-long';
process.env.CORS_ORIGIN   = 'http://localhost:4321';
process.env.ADMIN_ORIGIN  = 'http://localhost:5173';
process.env.STORAGE_PROVIDER = 'local';
process.env.STORAGE_PATH  = '/tmp/exactamente-test';
```

- [ ] **Step 3: Create src/__tests__/drive.local.test.ts**

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDriveProvider } from '@/services/drive/local.provider';
import { FOLDER_MIME_TYPE } from '@/services/drive/types';

let tmpDir: string;
let provider: LocalDriveProvider;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'drive-test-'));
  provider = new LocalDriveProvider(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('getTree', () => {
  test('root is empty at depth=1 when no folders exist', async () => {
    const tree = await provider.getTree('', 1);
    expect(tree.id).toBe('');
    expect(tree.name).toBe('root');
    expect(tree.mimeType).toBe(FOLDER_MIME_TYPE);
    expect(tree.children).toEqual([]);
  });

  test('returns children at depth=1', async () => {
    await provider.createFolder('', 'FACET');
    await provider.createFolder('', 'FACS');
    const tree = await provider.getTree('', 1);
    expect(tree.children?.map(c => c.name)).toEqual(['FACS', 'FACET']);
  });

  test('stops at depth limit', async () => {
    await provider.createFolder('', 'A');
    await provider.createFolder('A', 'B');
    const tree = await provider.getTree('', 1);
    expect(tree.children![0].children).toBeUndefined();
  });

  test('depth=2 includes grandchildren', async () => {
    await provider.createFolder('', 'A');
    await provider.createFolder('A', 'B');
    const tree = await provider.getTree('', 2);
    expect(tree.children![0].children![0].name).toBe('B');
  });
});

describe('listFolder', () => {
  test('returns immediate children only', async () => {
    await provider.createFolder('', 'X');
    await provider.createFolder('X', 'Y');
    const list = await provider.listFolder('');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('X');
    expect(list[0].id).toBe('X');
  });

  test('nested folder has correct id', async () => {
    await provider.createFolder('', 'X');
    await provider.createFolder('X', 'Y');
    const list = await provider.listFolder('X');
    expect(list[0].id).toBe('X/Y');
  });
});

describe('createFolder', () => {
  test('creates folder and returns node', async () => {
    const node = await provider.createFolder('', 'NewDir');
    expect(node.id).toBe('NewDir');
    expect(node.name).toBe('NewDir');
    expect(node.mimeType).toBe(FOLDER_MIME_TYPE);
  });

  test('creates nested folder', async () => {
    await provider.createFolder('', 'Parent');
    const node = await provider.createFolder('Parent', 'Child');
    expect(node.id).toBe('Parent/Child');
  });
});

describe('renameFolder', () => {
  test('renames folder and returns new id', async () => {
    await provider.createFolder('', 'Old');
    const node = await provider.renameFolder('Old', 'New');
    expect(node.id).toBe('New');
    expect(node.name).toBe('New');
    const list = await provider.listFolder('');
    expect(list.map(n => n.name)).toContain('New');
    expect(list.map(n => n.name)).not.toContain('Old');
  });
});

describe('deleteFolder', () => {
  test('removes folder', async () => {
    await provider.createFolder('', 'ToDelete');
    await provider.deleteFolder('ToDelete');
    const list = await provider.listFolder('');
    expect(list.map(n => n.name)).not.toContain('ToDelete');
  });

  test('removes folder recursively', async () => {
    await provider.createFolder('', 'Parent');
    await provider.createFolder('Parent', 'Child');
    await provider.deleteFolder('Parent');
    const list = await provider.listFolder('');
    expect(list).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
bun test src/__tests__/drive.local.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add bunfig.toml src/__tests__/env-setup.ts src/__tests__/drive.local.test.ts
git commit -m "test(drive): tests unitarios para LocalDriveProvider"
```

---

## Task 7: Drive API provider

**Files:**
- Create: `src/services/drive/drive.provider.ts`

This provider calls the Google Drive v3 API using a service account. It does NOT need tests (would require mocking googleapis) — integration is verified manually with real credentials.

- [ ] **Step 1: Create src/services/drive/drive.provider.ts**

```typescript
import { google } from 'googleapis';
import { FOLDER_MIME_TYPE } from './types';
import type { DriveService, DriveNode } from './types';

export class DriveApiProvider implements DriveService {
  private drive;

  constructor(credentials: object) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async getTree(folderId: string, depth: number): Promise<DriveNode> {
    return this.buildNode(folderId, depth);
  }

  private async buildNode(folderId: string, depth: number): Promise<DriveNode> {
    const { data } = await this.drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType',
    });
    const node: DriveNode = {
      id: data.id!,
      name: data.name!,
      mimeType: data.mimeType!,
    };
    if (depth > 0) {
      const children = await this.listFolder(folderId);
      const folders = children.filter(c => c.mimeType === FOLDER_MIME_TYPE);
      node.children = await Promise.all(folders.map(f => this.buildNode(f.id, depth - 1)));
    }
    return node;
  }

  async listFolder(folderId: string): Promise<DriveNode[]> {
    const { data } = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType)',
      orderBy: 'name',
      pageSize: 1000,
    });
    return (data.files ?? []).map(f => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
    }));
  }

  async createFolder(parentId: string, name: string): Promise<DriveNode> {
    const { data } = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME_TYPE,
        parents: [parentId],
      },
      fields: 'id,name,mimeType',
    });
    return { id: data.id!, name: data.name!, mimeType: data.mimeType! };
  }

  async renameFolder(folderId: string, name: string): Promise<DriveNode> {
    const { data } = await this.drive.files.update({
      fileId: folderId,
      requestBody: { name },
      fields: 'id,name,mimeType',
    });
    return { id: data.id!, name: data.name!, mimeType: data.mimeType! };
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.drive.files.delete({ fileId: folderId });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/drive/drive.provider.ts
git commit -m "feat(drive): implementar DriveApiProvider con googleapis"
```

---

## Task 8: Drive service index

**Files:**
- Create: `src/services/drive/index.ts`

- [ ] **Step 1: Create src/services/drive/index.ts**

```typescript
import { join } from 'node:path';
import { env } from '@/env';
import { LocalDriveProvider } from './local.provider';
import { DriveApiProvider } from './drive.provider';
import type { DriveService } from './types';

function createDriveService(): DriveService {
  if (env.STORAGE_PROVIDER === 'drive') {
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.DRIVE_ROOT_FOLDER_ID) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON y DRIVE_ROOT_FOLDER_ID son requeridos cuando STORAGE_PROVIDER=drive',
      );
    }
    const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new DriveApiProvider(credentials);
  }
  return new LocalDriveProvider(join(env.STORAGE_PATH, 'drive'));
}

export const driveService: DriveService = createDriveService();
export type { DriveService, DriveNode } from './types';
```

- [ ] **Step 2: Run all tests to check nothing broke**

```bash
bun test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/services/drive/index.ts
git commit -m "feat(drive): exportar driveService singleton"
```

---

## Task 9: Admin Drive routes

**Files:**
- Create: `src/routes/admin/drive.ts`

- [ ] **Step 1: Create src/routes/admin/drive.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { driveService } from '@/services/drive';
import { env } from '@/env';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET /tree — árbol recursivo desde la raíz
const treeQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(5).default(2),
});

app.get('/tree', ...adminGuard, zValidator('query', treeQuerySchema), async (c) => {
  const { depth } = c.req.valid('query');
  const rootId = env.DRIVE_ROOT_FOLDER_ID ?? '';
  const tree = await driveService.getTree(rootId, depth);
  return c.json(tree);
});

// GET /folder/:folderId — contenido de una carpeta (1 nivel)
app.get('/folder/:folderId', ...adminGuard, async (c) => {
  const folderId = c.req.param('folderId');
  const children = await driveService.listFolder(folderId);
  return c.json(children);
});

// POST /folder — crear carpeta
const createFolderSchema = z.object({
  parentId: z.string().min(1),
  name:     z.string().min(1).max(255),
});

app.post('/folder', ...adminGuard, zValidator('json', createFolderSchema), async (c) => {
  const { parentId, name } = c.req.valid('json');
  const folder = await driveService.createFolder(parentId, name);
  return c.json(folder, 201);
});

// PATCH /folder/:folderId — renombrar carpeta
const renameFolderSchema = z.object({
  name: z.string().min(1).max(255),
});

app.patch('/folder/:folderId', ...adminGuard, zValidator('json', renameFolderSchema), async (c) => {
  const folderId = c.req.param('folderId');
  const { name } = c.req.valid('json');
  const folder = await driveService.renameFolder(folderId, name);
  return c.json(folder);
});

// DELETE /folder/:folderId — eliminar carpeta (no se puede eliminar la raíz)
app.delete('/folder/:folderId', ...adminGuard, async (c) => {
  const folderId = c.req.param('folderId');
  const rootId = env.DRIVE_ROOT_FOLDER_ID ?? '';
  if (rootId !== '' && folderId === rootId) {
    return c.json({ error: 'No se puede eliminar la carpeta raíz' }, 400);
  }
  await driveService.deleteFolder(folderId);
  return new Response(null, { status: 204 });
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/admin/drive.ts
git commit -m "feat(admin): agregar rutas de gestión de carpetas Drive"
```

---

## Task 10: Admin universities routes

**Files:**
- Create: `src/routes/admin/universities.ts`

- [ ] **Step 1: Create src/routes/admin/universities.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { universities, faculties } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { slugify } from '@/utils/slugify';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada
const listSchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
  const [data, countResult] = await Promise.all([
    db.query.universities.findMany({
      orderBy: (u, { asc }) => [asc(u.name)],
      limit: safeLimit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(universities),
  ]);
  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// POST / — crear
const createSchema = z.object({
  name: z.string().min(1).max(255),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const { name } = c.req.valid('json');
  const id = crypto.randomUUID();
  const slug = slugify(name);
  const [university] = await db.insert(universities).values({ id, name, slug }).returning();
  return c.json(university, 201);
});

// GET /:id — detalle
app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const university = await db.query.universities.findFirst({ where: eq(universities.id, id) });
  if (!university) return c.json({ error: 'Universidad no encontrada' }, 404);
  return c.json(university);
});

// PATCH /:id — actualizar
const updateSchema = z.object({
  name: z.string().min(1).max(255),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const { name } = c.req.valid('json');
  const slug = slugify(name);
  const [university] = await db
    .update(universities)
    .set({ name, slug })
    .where(eq(universities.id, id))
    .returning();
  if (!university) return c.json({ error: 'Universidad no encontrada' }, 404);
  return c.json(university);
});

// DELETE /:id — eliminar (bloquea si tiene facultades)
app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(faculties)
    .where(eq(faculties.universityId, id));
  if (count > 0) {
    return c.json({ error: 'No se puede eliminar una universidad con facultades asociadas' }, 409);
  }
  const [university] = await db.delete(universities).where(eq(universities.id, id)).returning();
  if (!university) return c.json({ error: 'Universidad no encontrada' }, 404);
  return new Response(null, { status: 204 });
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/admin/universities.ts
git commit -m "feat(admin): CRUD de universidades"
```

---

## Task 11: Admin faculties routes

**Files:**
- Create: `src/routes/admin/faculties.ts`

- [ ] **Step 1: Create src/routes/admin/faculties.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { faculties, careers } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { slugify } from '@/utils/slugify';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada, filtrable por universidad
const listSchema = z.object({
  universityId: z.string().optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { universityId, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
  const whereClause = universityId ? eq(faculties.universityId, universityId) : undefined;
  const [data, countResult] = await Promise.all([
    db.query.faculties.findMany({
      where: whereClause,
      orderBy: (f, { asc }) => [asc(f.name)],
      limit: safeLimit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(faculties).where(whereClause),
  ]);
  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// POST / — crear
const createSchema = z.object({
  universityId: z.string().min(1),
  name:         z.string().min(1).max(255),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const { universityId, name } = c.req.valid('json');
  const id = crypto.randomUUID();
  const slug = slugify(name);
  const [faculty] = await db.insert(faculties).values({ id, universityId, name, slug }).returning();
  return c.json(faculty, 201);
});

// GET /:id — detalle
app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const faculty = await db.query.faculties.findFirst({ where: eq(faculties.id, id) });
  if (!faculty) return c.json({ error: 'Facultad no encontrada' }, 404);
  return c.json(faculty);
});

// PATCH /:id — actualizar nombre
const updateSchema = z.object({
  name: z.string().min(1).max(255),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const { name } = c.req.valid('json');
  const slug = slugify(name);
  const [faculty] = await db
    .update(faculties)
    .set({ name, slug })
    .where(eq(faculties.id, id))
    .returning();
  if (!faculty) return c.json({ error: 'Facultad no encontrada' }, 404);
  return c.json(faculty);
});

// DELETE /:id — eliminar (bloquea si tiene carreras)
app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(careers)
    .where(eq(careers.facultyId, id));
  if (count > 0) {
    return c.json({ error: 'No se puede eliminar una facultad con carreras asociadas' }, 409);
  }
  const [faculty] = await db.delete(faculties).where(eq(faculties.id, id)).returning();
  if (!faculty) return c.json({ error: 'Facultad no encontrada' }, 404);
  return new Response(null, { status: 204 });
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/admin/faculties.ts
git commit -m "feat(admin): CRUD de facultades"
```

---

## Task 12: Admin careers routes

**Files:**
- Create: `src/routes/admin/careers.ts`

- [ ] **Step 1: Create src/routes/admin/careers.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { careers, careerPlans } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { slugify } from '@/utils/slugify';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada, filtrable por facultad
const listSchema = z.object({
  facultyId: z.string().optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { facultyId, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
  const whereClause = facultyId ? eq(careers.facultyId, facultyId) : undefined;
  const [data, countResult] = await Promise.all([
    db.query.careers.findMany({
      where: whereClause,
      orderBy: (ca, { asc }) => [asc(ca.name)],
      limit: safeLimit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(careers).where(whereClause),
  ]);
  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// POST / — crear
const createSchema = z.object({
  facultyId: z.string().min(1),
  name:      z.string().min(1).max(255),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const { facultyId, name } = c.req.valid('json');
  const id = crypto.randomUUID();
  const slug = slugify(name);
  const [career] = await db.insert(careers).values({ id, facultyId, name, slug }).returning();
  return c.json(career, 201);
});

// GET /:id — detalle
app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const career = await db.query.careers.findFirst({ where: eq(careers.id, id) });
  if (!career) return c.json({ error: 'Carrera no encontrada' }, 404);
  return c.json(career);
});

// PATCH /:id — actualizar nombre
const updateSchema = z.object({
  name: z.string().min(1).max(255),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const { name } = c.req.valid('json');
  const slug = slugify(name);
  const [career] = await db
    .update(careers)
    .set({ name, slug })
    .where(eq(careers.id, id))
    .returning();
  if (!career) return c.json({ error: 'Carrera no encontrada' }, 404);
  return c.json(career);
});

// DELETE /:id — eliminar (bloquea si tiene planes)
app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(careerPlans)
    .where(eq(careerPlans.careerId, id));
  if (count > 0) {
    return c.json({ error: 'No se puede eliminar una carrera con planes asociados' }, 409);
  }
  const [career] = await db.delete(careers).where(eq(careers.id, id)).returning();
  if (!career) return c.json({ error: 'Carrera no encontrada' }, 404);
  return new Response(null, { status: 204 });
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/admin/careers.ts
git commit -m "feat(admin): CRUD de carreras"
```

---

## Task 13: Admin career-plans routes

**Files:**
- Create: `src/routes/admin/career-plans.ts`

- [ ] **Step 1: Create src/routes/admin/career-plans.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { careerPlans, careerSubjects } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada, filtrable por carrera
const listSchema = z.object({
  careerId: z.string().optional(),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { careerId, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
  const whereClause = careerId ? eq(careerPlans.careerId, careerId) : undefined;
  const [data, countResult] = await Promise.all([
    db.query.careerPlans.findMany({
      where: whereClause,
      orderBy: (p, { asc }) => [asc(p.year), asc(p.name)],
      limit: safeLimit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(careerPlans).where(whereClause),
  ]);
  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// POST / — crear
const createSchema = z.object({
  careerId: z.string().min(1),
  name:     z.string().min(1).max(100),
  year:     z.number().int().positive(),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const { careerId, name, year } = c.req.valid('json');
  const id = crypto.randomUUID();
  const [plan] = await db.insert(careerPlans).values({ id, careerId, name, year }).returning();
  return c.json(plan, 201);
});

// GET /:id — detalle
app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const plan = await db.query.careerPlans.findFirst({ where: eq(careerPlans.id, id) });
  if (!plan) return c.json({ error: 'Plan no encontrado' }, 404);
  return c.json(plan);
});

// PATCH /:id — actualizar nombre o año
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  year: z.number().int().positive().optional(),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const { name, year } = c.req.valid('json');
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (year !== undefined) updates.year  = year;
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'Se debe proporcionar al menos un campo para actualizar' }, 400);
  }
  const [plan] = await db.update(careerPlans).set(updates).where(eq(careerPlans.id, id)).returning();
  if (!plan) return c.json({ error: 'Plan no encontrado' }, 404);
  return c.json(plan);
});

// DELETE /:id — eliminar (bloquea si tiene materias asignadas)
app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(careerSubjects)
    .where(eq(careerSubjects.planId, id));
  if (count > 0) {
    return c.json({ error: 'No se puede eliminar un plan con materias asignadas' }, 409);
  }
  const [plan] = await db.delete(careerPlans).where(eq(careerPlans.id, id)).returning();
  if (!plan) return c.json({ error: 'Plan no encontrado' }, 404);
  return new Response(null, { status: 204 });
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/admin/career-plans.ts
git commit -m "feat(admin): CRUD de planes de carrera"
```

---

## Task 14: Admin subjects routes

**Files:**
- Create: `src/routes/admin/subjects.ts`

- [ ] **Step 1: Create src/routes/admin/subjects.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { subjects, resources } from '@/db/schema';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { slugify } from '@/utils/slugify';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET / — lista paginada, filtrable por facultad
const listSchema = z.object({
  facultyId: z.string().optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

app.get('/', ...adminGuard, zValidator('query', listSchema), async (c) => {
  const { facultyId, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);
  const whereClause = facultyId ? eq(subjects.facultyId, facultyId) : undefined;
  const [data, countResult] = await Promise.all([
    db.query.subjects.findMany({
      where: whereClause,
      orderBy: (s, { asc }) => [asc(s.year), asc(s.quadmester), asc(s.title)],
      limit: safeLimit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)::int` }).from(subjects).where(whereClause),
  ]);
  return c.json(buildPaginatedResponse(data, countResult[0]?.count ?? 0, safePage, safeLimit));
});

// POST / — crear
const createSchema = z.object({
  facultyId:   z.string().min(1),
  title:       z.string().min(1).max(255),
  description: z.string().default(''),
  urlMoodle:   z.string().url().optional().or(z.literal('')),
  urlPrograma: z.string().url().optional().or(z.literal('')),
  year:        z.number().int().positive(),
  quadmester:  z.number().int().min(1).max(2),
});

app.post('/', ...adminGuard, zValidator('json', createSchema), async (c) => {
  const data = c.req.valid('json');
  const id = crypto.randomUUID();
  const slug = slugify(data.title);
  const now = new Date();
  const [subject] = await db.insert(subjects).values({
    id,
    facultyId:   data.facultyId,
    title:       data.title,
    slug,
    description: data.description,
    urlMoodle:   data.urlMoodle ?? '',
    urlPrograma: data.urlPrograma ?? '',
    year:        data.year,
    quadmester:  data.quadmester,
    createdAt:   now,
    updatedAt:   now,
  }).returning();
  return c.json(subject, 201);
});

// GET /:id — detalle
app.get('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, id) });
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);
  return c.json(subject);
});

// PATCH /:id — actualizar campos parcialmente
const updateSchema = z.object({
  title:       z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  urlMoodle:   z.string().url().optional().or(z.literal('')),
  urlPrograma: z.string().url().optional().or(z.literal('')),
  year:        z.number().int().positive().optional(),
  quadmester:  z.number().int().min(1).max(2).optional(),
});

app.patch('/:id', ...adminGuard, zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined)       { updates.title = data.title; updates.slug = slugify(data.title); }
  if (data.description !== undefined) updates.description = data.description;
  if (data.urlMoodle !== undefined)   updates.urlMoodle   = data.urlMoodle;
  if (data.urlPrograma !== undefined) updates.urlPrograma = data.urlPrograma;
  if (data.year !== undefined)        updates.year        = data.year;
  if (data.quadmester !== undefined)  updates.quadmester  = data.quadmester;

  const [subject] = await db.update(subjects).set(updates).where(eq(subjects.id, id)).returning();
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);
  return c.json(subject);
});

// DELETE /:id — eliminar (bloquea si tiene recursos publicados)
app.delete('/:id', ...adminGuard, async (c) => {
  const id = c.req.param('id');
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resources)
    .where(and(eq(resources.subjectId, id), eq(resources.status, 'published')));
  if (count > 0) {
    return c.json({ error: 'No se puede eliminar una materia con recursos publicados' }, 409);
  }
  const [subject] = await db.delete(subjects).where(eq(subjects.id, id)).returning();
  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);
  return new Response(null, { status: 204 });
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/admin/subjects.ts
git commit -m "feat(admin): CRUD de materias"
```

---

## Task 15: Mount all new routes in app.ts

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Add imports at top of src/app.ts**

After the existing admin import line:
```typescript
import adminResourcesRoutes from '@/routes/admin/resources';
```

Add:
```typescript
import adminDriveRoutes       from '@/routes/admin/drive';
import adminUniversitiesRoutes from '@/routes/admin/universities';
import adminFacultiesRoutes   from '@/routes/admin/faculties';
import adminCareersRoutes     from '@/routes/admin/careers';
import adminCareerPlansRoutes from '@/routes/admin/career-plans';
import adminSubjectsRoutes    from '@/routes/admin/subjects';
```

- [ ] **Step 2: Mount routes in app.ts**

After the existing:
```typescript
api.route('/admin/resources', adminResourcesRoutes);
```

Add:
```typescript
api.route('/admin/drive',         adminDriveRoutes);
api.route('/admin/universities',  adminUniversitiesRoutes);
api.route('/admin/faculties',     adminFacultiesRoutes);
api.route('/admin/careers',       adminCareersRoutes);
api.route('/admin/career-plans',  adminCareerPlansRoutes);
api.route('/admin/subjects',      adminSubjectsRoutes);
```

- [ ] **Step 3: Verify the server starts without errors**

```bash
bun dev
```

Expected: server starts, no TypeScript errors.

- [ ] **Step 4: Smoke-test one route**

```bash
curl -s http://localhost:3000/api/v1/admin/universities \
  -H "Authorization: Bearer invalid-token"
```

Expected: `{"error":"Token inválido o expirado"}` with status 401.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts
git commit -m "feat(app): montar rutas admin en el servidor"
```

---

## Task 16: Admin route auth and validation tests

**Files:**
- Create: `src/__tests__/admin.routes.test.ts`

These tests verify auth guards and input validation without needing a real database connection. Responses from middleware (401/403) and from `zValidator` (400) happen before any DB query is executed.

- [ ] **Step 1: Create src/__tests__/admin.routes.test.ts**

```typescript
import { test, expect, describe } from 'bun:test';
import { sign } from 'hono/jwt';
import adminUniversitiesApp from '@/routes/admin/universities';
import adminFacultiesApp    from '@/routes/admin/faculties';
import adminCareersApp      from '@/routes/admin/careers';
import adminCareerPlansApp  from '@/routes/admin/career-plans';
import adminSubjectsApp     from '@/routes/admin/subjects';
import adminDriveApp        from '@/routes/admin/drive';

const SECRET = process.env.JWT_SECRET!;
const now    = Math.floor(Date.now() / 1000);

async function token(role: 'user' | 'admin') {
  return sign({ sub: 'u1', role, facultyId: null, iat: now, exp: now + 3600 }, SECRET, 'HS256');
}

// ─── Helper: make a request to a Hono app ─────────────────────────────────────

async function req(
  app: typeof adminUniversitiesApp,
  path: string,
  opts: { method?: string; authRole?: 'user' | 'admin' | null; body?: unknown } = {},
) {
  const { method = 'GET', authRole = null, body } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authRole) headers['Authorization'] = `Bearer ${await token(authRole)}`;
  return app.request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── Universities ─────────────────────────────────────────────────────────────

describe('admin/universities', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminUniversitiesApp, '/');
    expect(res.status).toBe(401);
  });

  test('GET / returns 403 with user role', async () => {
    const res = await req(adminUniversitiesApp, '/', { authRole: 'user' });
    expect(res.status).toBe(403);
  });

  test('POST / returns 400 when name is missing', async () => {
    const res = await req(adminUniversitiesApp, '/', {
      method: 'POST', authRole: 'admin', body: {},
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /:id returns 400 when name is missing', async () => {
    const res = await req(adminUniversitiesApp, '/some-id', {
      method: 'PATCH', authRole: 'admin', body: {},
    });
    expect(res.status).toBe(400);
  });
});

// ─── Faculties ────────────────────────────────────────────────────────────────

describe('admin/faculties', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminFacultiesApp, '/');
    expect(res.status).toBe(401);
  });

  test('GET / returns 403 with user role', async () => {
    const res = await req(adminFacultiesApp, '/', { authRole: 'user' });
    expect(res.status).toBe(403);
  });

  test('POST / returns 400 when universityId is missing', async () => {
    const res = await req(adminFacultiesApp, '/', {
      method: 'POST', authRole: 'admin', body: { name: 'FACET' },
    });
    expect(res.status).toBe(400);
  });
});

// ─── Careers ──────────────────────────────────────────────────────────────────

describe('admin/careers', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminCareersApp, '/');
    expect(res.status).toBe(401);
  });

  test('POST / returns 400 when facultyId is missing', async () => {
    const res = await req(adminCareersApp, '/', {
      method: 'POST', authRole: 'admin', body: { name: 'Sistemas' },
    });
    expect(res.status).toBe(400);
  });
});

// ─── Career Plans ─────────────────────────────────────────────────────────────

describe('admin/career-plans', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminCareerPlansApp, '/');
    expect(res.status).toBe(401);
  });

  test('POST / returns 400 when year is missing', async () => {
    const res = await req(adminCareerPlansApp, '/', {
      method: 'POST', authRole: 'admin', body: { careerId: 'c1', name: 'Plan 2019' },
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /:id returns 400 when body is empty', async () => {
    const res = await req(adminCareerPlansApp, '/some-id', {
      method: 'PATCH', authRole: 'admin', body: {},
    });
    expect(res.status).toBe(400);
  });
});

// ─── Subjects ─────────────────────────────────────────────────────────────────

describe('admin/subjects', () => {
  test('GET / returns 401 without token', async () => {
    const res = await req(adminSubjectsApp, '/');
    expect(res.status).toBe(401);
  });

  test('POST / returns 400 when required fields are missing', async () => {
    const res = await req(adminSubjectsApp, '/', {
      method: 'POST', authRole: 'admin', body: { title: 'Análisis' },
    });
    expect(res.status).toBe(400);
  });
});

// ─── Drive ────────────────────────────────────────────────────────────────────

describe('admin/drive', () => {
  test('GET /tree returns 401 without token', async () => {
    const res = await req(adminDriveApp, '/tree');
    expect(res.status).toBe(401);
  });

  test('GET /tree returns 403 with user role', async () => {
    const res = await req(adminDriveApp, '/tree', { authRole: 'user' });
    expect(res.status).toBe(403);
  });

  test('POST /folder returns 400 when name is missing', async () => {
    const res = await req(adminDriveApp, '/folder', {
      method: 'POST', authRole: 'admin', body: { parentId: 'root' },
    });
    expect(res.status).toBe(400);
  });

  test('PATCH /folder/:id returns 400 when name is missing', async () => {
    const res = await req(adminDriveApp, '/folder/some-id', {
      method: 'PATCH', authRole: 'admin', body: {},
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
bun test src/__tests__/admin.routes.test.ts
```

Expected: all tests pass. (These do NOT need a real DB — middleware and validators respond before any DB query.)

- [ ] **Step 3: Run the full test suite**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/admin.routes.test.ts
git commit -m "test(admin): tests de autenticación y validación para rutas admin"
```

---

## Task 17: Backend analysis document

**Files:**
- Create: `docs/admin-backend-analysis.md`

- [ ] **Step 1: Create docs/admin-backend-analysis.md**

```markdown
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
**Después:** Se implementó `DriveApiProvider` usando `googleapis`, autenticado con service account.

### ¿Qué faltaba?

Ver tabla de arriba.
```

- [ ] **Step 2: Commit**

```bash
git add docs/admin-backend-analysis.md
git commit -m "docs: agregar análisis del backend admin"
```

---

## Task 18: Admin setup documentation

**Files:**
- Create: `docs/admin-setup-backend.md`

- [ ] **Step 1: Create docs/admin-setup-backend.md**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add docs/admin-setup-backend.md
git commit -m "docs: agregar guía de setup y referencia de endpoints admin"
```

---

## Task 19: Frontend admin prompt

**Files:**
- Create: `docs/admin-frontend-prompt.md`

- [ ] **Step 1: Create docs/admin-frontend-prompt.md**

````markdown
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

- ➕ **Crear subcarpeta**: abre modal con input de nombre → `POST /admin/drive/folder` con `{ parentId: folderId, name }`
- ✏️ **Renombrar**: abre modal con input pre-poblado → `PATCH /admin/drive/folder/:folderId` con `{ name }`
- 🗑️ **Eliminar**: pide confirmación → `DELETE /admin/drive/folder/:folderId`. Deshabilitar este botón en la carpeta raíz (el backend también lo bloquea con 400).

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
````

- [ ] **Step 2: Commit**

```bash
git add docs/admin-frontend-prompt.md
git commit -m "docs: agregar prompt para el admin frontend"
```

---

## Final verification

- [ ] Run the full test suite one last time:

```bash
bun test
```

Expected: all tests pass.

- [ ] Start the server and verify health:

```bash
bun dev &
curl -s http://localhost:3000/health
```

Expected: `{"status":"ok","timestamp":"..."}`

- [ ] Verify a protected route rejects unauthenticated requests:

```bash
curl -s http://localhost:3000/api/v1/admin/universities
# Expected: {"error":"Token requerido"}

curl -s http://localhost:3000/api/v1/admin/drive/tree
# Expected: {"error":"Token requerido"}
```
