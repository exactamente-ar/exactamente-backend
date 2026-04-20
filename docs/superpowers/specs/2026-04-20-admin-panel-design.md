# Admin Panel — Backend Design Spec

**Date:** 2026-04-20
**Status:** Approved

---

## Overview

Add a backend admin panel API to an existing Hono/Bun/Drizzle backend. The implementation is purely additive: new routes go under `/api/v1/admin/`, new services under `src/services/drive/`. No existing public routes are modified.

---

## 1. Infrastructure Changes

### 1.1 New environment variables (`src/env.ts`)

| Variable | Type | Description |
|----------|------|-------------|
| `ADMIN_ORIGIN` | `string` | CORS origin for the admin frontend |
| `STORAGE_PROVIDER` | `"local" \| "drive"` | Selects storage backend (replaces `NODE_ENV` selector) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `string` (optional) | Full service account JSON stringified. Required when `STORAGE_PROVIDER=drive`. |
| `DRIVE_ROOT_FOLDER_ID` | `string` (optional) | Drive folder ID of the `/ing` root. Replaces existing `GOOGLE_DRIVE_ROOT_FOLDER_ID`. Required when `STORAGE_PROVIDER=drive`. |

The existing `GOOGLE_DRIVE_ROOT_FOLDER_ID` is renamed to `DRIVE_ROOT_FOLDER_ID` in the schema for consistency. The old name can be kept as an alias in the schema to avoid breaking `.env` files, but the new name is canonical.

### 1.2 CORS (`src/app.ts`)

Change from single string to array:
```typescript
cors({ origin: [env.CORS_ORIGIN, env.ADMIN_ORIGIN], ... })
```

### 1.3 Storage provider selector (`src/services/storage/index.ts`)

Change selector from `NODE_ENV === 'production'` to `env.STORAGE_PROVIDER === 'drive'`. This decouples environment from provider choice.

---

## 2. Admin CRUD Routes for Entities

Five new files under `src/routes/admin/`. All routes are protected with `[verifyToken, requireRole('admin')]` (referred to as `adminGuard`).

Mounted in `src/app.ts`:
```
/api/v1/admin/universities
/api/v1/admin/faculties
/api/v1/admin/careers
/api/v1/admin/career-plans
/api/v1/admin/subjects
```

### 2.1 Uniform endpoint pattern

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Paginated list. Accepts filter params by parent entity (e.g. `?facultyId=`). |
| `POST` | `/` | Create. Auto-generates `id` via `crypto.randomUUID()` and `slug` via `slugify()`. |
| `GET` | `/:id` | Single entity detail. Returns 404 if not found. |
| `PATCH` | `/:id` | Partial update. Re-generates slug if name changes. |
| `DELETE` | `/:id` | Delete with referential integrity check: rejects with 409 if entity has children. |

### 2.2 Entity-specific filters for `GET /`

| Route | Filter params |
|-------|--------------|
| `/admin/universities` | none |
| `/admin/faculties` | `?universityId=` |
| `/admin/careers` | `?facultyId=` |
| `/admin/career-plans` | `?careerId=` |
| `/admin/subjects` | `?facultyId=` |

### 2.3 Body schemas

**universities POST/PATCH:** `{ name: string }`
**faculties POST:** `{ universityId: string, name: string }` — PATCH: `{ name?: string }`
**careers POST:** `{ facultyId: string, name: string }` — PATCH: `{ name?: string }`
**career-plans POST:** `{ careerId: string, name: string, year: number }` — PATCH: `{ name?: string, year?: number }`
**subjects POST:** `{ facultyId: string, title: string, description?: string, urlMoodle?: string, urlPrograma?: string, year: number, quadmester: number }` — PATCH: partial of all fields

### 2.4 Delete safety

Before deleting, check for children:
- University → check `faculties` table
- Faculty → check `careers` table
- Career → check `careerPlans` table
- Plan → check `careerSubjects` table
- Subject → check `resources` table (published resources block deletion)

Return `409 Conflict` with descriptive message if children exist.

---

## 3. Drive Folder Service

A new service **separate from** `StorageProvider` (which handles file operations). Lives in `src/services/drive/`.

### 3.1 Interface (`src/services/drive/types.ts`)

```typescript
export interface DriveNode {
  id: string;
  name: string;
  mimeType: string;  // 'application/vnd.google-apps.folder' or file mime
  children?: DriveNode[];
}

export interface DriveService {
  getTree(folderId: string, depth: number): Promise<DriveNode>;
  listFolder(folderId: string): Promise<DriveNode[]>;
  createFolder(parentId: string, name: string): Promise<DriveNode>;
  renameFolder(folderId: string, name: string): Promise<DriveNode>;
  deleteFolder(folderId: string): Promise<void>;
}
```

### 3.2 Local provider (`src/services/drive/local.provider.ts`)

Simulates folder structure using the filesystem under `STORAGE_PATH/drive/`. IDs are directory paths encoded as base64. Responses mirror the Drive API shape so the frontend code is provider-agnostic.

### 3.3 Drive provider (`src/services/drive/drive.provider.ts`)

Uses `@googleapis/drive` (v3) authenticated via service account. Credentials loaded from `GOOGLE_SERVICE_ACCOUNT_JSON` env var (parsed JSON). Scopes: `https://www.googleapis.com/auth/drive`.

`getTree` is implemented recursively: for each folder, call `files.list` with `parents in '<folderId>'`. Depth limits recursion to avoid hitting rate limits on deep trees.

### 3.4 Selector (`src/services/drive/index.ts`)

```typescript
export const driveService: DriveService =
  env.STORAGE_PROVIDER === 'drive'
    ? new DriveServiceProvider()
    : new LocalDriveProvider();
```

### 3.5 Routes (`src/routes/admin/drive.ts`)

Mounted at `/api/v1/admin/drive`. All protected with `adminGuard`.

| Method | Path | Query/Body | Description |
|--------|------|-----------|-------------|
| `GET` | `/tree` | `?depth=2` (default 2, max 5) | Recursive tree from `DRIVE_ROOT_FOLDER_ID` |
| `GET` | `/folder/:folderId` | — | List contents of a folder (1 level) |
| `POST` | `/folder` | `{ parentId: string, name: string }` | Create subfolder |
| `PATCH` | `/folder/:folderId` | `{ name: string }` | Rename folder |
| `DELETE` | `/folder/:folderId` | — | Delete folder. Returns 400 if `folderId === DRIVE_ROOT_FOLDER_ID` |

---

## 4. Documentation outputs (Tasks 3 & 4)

### Task 3 — `docs/admin-backend-analysis.md`

Analysis of existing backend state: what exists, what was added, what's missing.

### Task 4 — `docs/admin-setup-backend.md`

- All admin endpoints (method, route, description, expected body/params)
- How to get Google Drive credentials (service account, Google Cloud Console steps)
- How to create the first admin user
- Required env vars with descriptions
- Security measures and production recommendations

### Task 5 — `docs/admin-frontend-prompt.md`

Complete prompt for creating the admin frontend repo (React + Vite + React Router). Includes:
- Auth flow (login, JWT, protected routes, 401/403 handling)
- CRUD ABM for all entities with hierarchical navigation
- Drive folder explorer (lazy loading, breadcrumb, contextual actions)
- Backend URL and full endpoint reference
- Dev setup instructions (`STORAGE_PROVIDER=local` for Drive-free development)

---

## Architecture diagram

```
src/
├── routes/admin/
│   ├── resources.ts     ← exists
│   ├── universities.ts  ← new
│   ├── faculties.ts     ← new
│   ├── careers.ts       ← new
│   ├── career-plans.ts  ← new
│   ├── subjects.ts      ← new
│   └── drive.ts         ← new
├── services/
│   ├── storage/         ← exists, selector updated
│   │   ├── types.ts
│   │   ├── local.provider.ts
│   │   ├── drive.provider.ts
│   │   └── index.ts     ← update selector
│   └── drive/           ← new
│       ├── types.ts
│       ├── local.provider.ts
│       ├── drive.provider.ts
│       └── index.ts
├── env.ts               ← add ADMIN_ORIGIN, STORAGE_PROVIDER, GOOGLE_SERVICE_ACCOUNT_JSON, DRIVE_ROOT_FOLDER_ID
└── app.ts               ← update CORS, mount new routes
```

---

## Key constraints

- Existing public routes are not modified.
- All admin routes require `role >= 'admin'` in the JWT.
- Delete operations validate referential integrity before executing.
- Drive root folder (`DRIVE_ROOT_FOLDER_ID`) cannot be deleted via the API.
- `STORAGE_PROVIDER=local` must work without any Google credentials (safe for development).
- Google credentials are never logged or exposed in API responses.
