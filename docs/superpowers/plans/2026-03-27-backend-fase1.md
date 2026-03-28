# Backend Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la infraestructura base del backend: proyecto Bun+Hono, schema PostgreSQL completo, seed con datos del frontend, endpoints de lectura y autenticación JWT.

**Architecture:** API REST con Hono montada en `/api/v1`. Drizzle ORM como capa de datos sobre PostgreSQL. Rutas delgadas que delegan lógica a services y validators. Middleware de auth reutilizable en fases posteriores.

**Tech Stack:** Bun · Hono · Drizzle ORM · PostgreSQL 16 (Docker) · Zod · `@hono/zod-validator`

---

## File Map

| Archivo | Responsabilidad |
|---------|----------------|
| `package.json` | Scripts, dependencias |
| `tsconfig.json` | TypeScript + path alias `@/*` |
| `docker-compose.yml` | PostgreSQL 16 local |
| `.env.example` | Variables documentadas |
| `drizzle.config.ts` | Config drizzle-kit |
| `src/types/index.ts` | Todas las interfaces y tipos (del spec §4) |
| `src/utils/slugify.ts` | Convierte texto a slug URL-safe |
| `src/utils/paginate.ts` | Helpers de paginación |
| `src/utils/drive-urls.ts` | Construye URLs de Drive desde fileId |
| `src/db/schema.ts` | Schema Drizzle completo (del spec §2.2) |
| `src/db/index.ts` | Pool pg + instancia drizzle |
| `src/db/migrations/` | Generado por drizzle-kit |
| `src/services/auth.service.ts` | Hash de contraseña, sign/verify JWT |
| `src/middleware/auth.ts` | `verifyToken` — extrae JWT del header |
| `src/middleware/requireRole.ts` | `requireRole(minRole)` — guard de roles |
| `src/validators/auth.validators.ts` | Schemas Zod para register/login |
| `src/validators/subject.validators.ts` | Schema Zod para filtros de subjects |
| `src/routes/auth.ts` | POST /auth/register, login, GET /auth/me |
| `src/routes/universities.ts` | GET /universities |
| `src/routes/faculties.ts` | GET /faculties |
| `src/routes/careers.ts` | GET /careers |
| `src/routes/subjects.ts` | GET /subjects, GET /subjects/:id |
| `src/routes/resources.ts` | GET /resources (solo published) |
| `src/app.ts` | Hono app + middlewares globales + rutas |
| `src/index.ts` | Entry point Bun |
| `scripts/data/materias.ts` | Copia de `exactamente-frontend/src/shared/data/materias.ts` |
| `scripts/data/carreras.ts` | Copia de `exactamente-frontend/src/shared/data/carreras.ts` |
| `scripts/seed.ts` | Inserta UNICEN, FACET, carreras, materias, correlativas |
| `src/__tests__/utils.test.ts` | Tests unitarios de utils |
| `src/__tests__/auth.service.test.ts` | Tests unitarios de auth service |
| `src/__tests__/middleware.test.ts` | Tests de verifyToken y requireRole |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.env`
- Create: `.gitignore`

- [ ] **Step 1: Crear package.json**

```json
{
  "name": "exactamente-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "test": "bun test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "seed": "bun scripts/seed.ts"
  },
  "dependencies": {
    "@hono/zod-validator": "^0.4.1",
    "drizzle-orm": "^0.38.0",
    "hono": "^4.6.0",
    "pg": "^8.13.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/pg": "^8.11.0",
    "drizzle-kit": "^0.30.0"
  }
}
```

- [ ] **Step 2: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "scripts"]
}
```

- [ ] **Step 3: Crear docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: exactamente
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

- [ ] **Step 4: Crear .env.example**

```env
# Base de datos
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/exactamente

# Auth
JWT_SECRET=super-secret-key-minimo-32-characters-long

# Servidor
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:4321
```

- [ ] **Step 5: Crear .env** (valores de desarrollo)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/exactamente
JWT_SECRET=dev-secret-key-minimo-32-characters!!
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:4321
```

- [ ] **Step 6: Crear .gitignore**

```
node_modules/
.env
uploads/
*.js
*.d.ts
```

- [ ] **Step 7: Instalar dependencias**

```bash
cd /Users/juanpenalba/Projects/exactamente/exactamente-backend
bun install
```

Expected: `bun install` descarga paquetes sin errores. Aparece `node_modules/` y `bun.lockb`.

- [ ] **Step 8: Levantar PostgreSQL**

```bash
docker compose up -d
```

Expected output:
```
✔ Container exactamente-backend-postgres-1  Started
```

- [ ] **Step 9: Verificar conexión**

```bash
docker compose exec postgres psql -U postgres -d exactamente -c '\l'
```

Expected: lista de bases de datos que incluye `exactamente`.

- [ ] **Step 10: Commit**

```bash
git init
git add package.json tsconfig.json docker-compose.yml .env.example .gitignore bun.lockb
git commit -m "feat: initial project scaffold with Bun, Hono, Drizzle"
```

---

## Task 2: Types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Crear src/types/index.ts**

```typescript
// ─── ENUMS ────────────────────────────────────────────────────────────────────

export type UserRole = 'superadmin' | 'admin' | 'user';
export type ResourceStatus = 'pending' | 'published' | 'rejected';
export type ResourceType = 'resumen' | 'parcial' | 'final';

// ─── ENTIDADES BASE ───────────────────────────────────────────────────────────

export interface University {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Faculty {
  id: string;
  universityId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Career {
  id: string;
  facultyId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Subject {
  id: string;
  facultyId: string;
  title: string;
  slug: string;
  description: string;
  urlMoodle: string;
  urlPrograma: string;
  year: number;
  quadmester: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectWithCorrelatives extends Subject {
  careers: Array<{ careerId: string; year: number; quadmester: number }>;
  prerequisites: string[];
  correlatives: string[];
}

export interface SubjectDetail extends SubjectWithCorrelatives {
  prerequisiteSubjects: Subject[];
  correlativeSubjects: Subject[];
}

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
}

export interface AdminUser extends PublicUser {
  adminFacultyId: string | null;
  adminFaculty: Faculty | null;
}

// ─── RECURSOS ─────────────────────────────────────────────────────────────────

export interface ResourcePublic {
  id: string;
  subjectId: string;
  title: string;
  type: ResourceType;
  status: ResourceStatus;
  driveFileId: string | null;
  driveSize: number | null;
  downloadCount: number;
  publishedAt: string | null;
  createdAt: string;
  previewUrl: string | null;
  downloadUrl: string | null;
}

export interface ResourceDetail extends ResourcePublic {
  subject: Subject;
  uploadedBy: Pick<PublicUser, 'id' | 'displayName'>;
  reviewedBy: Pick<PublicUser, 'id' | 'displayName'> | null;
  rejectionReason: string | null;
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  role: UserRole;
  facultyId: string | null;
  iat: number;
  exp: number;
}

// ─── CONTEXTO HONO ────────────────────────────────────────────────────────────

export type AppContext = {
  Variables: {
    user: JwtPayload;
  };
};

// ─── PAGINACIÓN ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript types and interfaces"
```

---

## Task 3: Utils + tests

**Files:**
- Create: `src/utils/slugify.ts`
- Create: `src/utils/paginate.ts`
- Create: `src/utils/drive-urls.ts`
- Create: `src/__tests__/utils.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Crear `src/__tests__/utils.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { slugify } from '@/utils/slugify';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import { buildPreviewUrl, buildDownloadUrl } from '@/utils/drive-urls';

describe('slugify', () => {
  it('convierte a minúsculas con guiones', () => {
    expect(slugify('Análisis Matemático 1')).toBe('analisis-matematico-1');
  });

  it('elimina acentos y tildes', () => {
    expect(slugify('Introducción a la Programación')).toBe('introduccion-a-la-programacion');
  });

  it('elimina caracteres especiales', () => {
    expect(slugify('Inglés (I)')).toBe('ingles-i');
  });

  it('colapsa múltiples guiones', () => {
    expect(slugify('A  B')).toBe('a-b');
  });

  it('elimina guiones al inicio y final', () => {
    expect(slugify(' Algebra ')).toBe('algebra');
  });
});

describe('getPaginationParams', () => {
  it('devuelve defaults cuando no se pasan parámetros', () => {
    expect(getPaginationParams(undefined, undefined)).toEqual({ offset: 0, limit: 20, page: 1 });
  });

  it('calcula offset correctamente', () => {
    expect(getPaginationParams(3, 10)).toEqual({ offset: 20, limit: 10, page: 3 });
  });

  it('clamp: limit máximo 100', () => {
    expect(getPaginationParams(1, 500).limit).toBe(100);
  });

  it('clamp: page mínimo 1', () => {
    expect(getPaginationParams(0, 20).page).toBe(1);
  });
});

describe('buildPaginatedResponse', () => {
  it('calcula totalPages correctamente', () => {
    const result = buildPaginatedResponse(['a', 'b'], 25, 2, 10);
    expect(result).toEqual({ data: ['a', 'b'], total: 25, page: 2, totalPages: 3 });
  });
});

describe('buildPreviewUrl', () => {
  it('construye la URL de preview de Drive', () => {
    expect(buildPreviewUrl('abc123')).toBe('https://drive.google.com/file/d/abc123/preview');
  });
});

describe('buildDownloadUrl', () => {
  it('construye la URL de descarga de Drive', () => {
    expect(buildDownloadUrl('abc123')).toBe('https://drive.google.com/uc?export=download&id=abc123');
  });
});
```

- [ ] **Step 2: Correr tests — verificar que fallan**

```bash
bun test src/__tests__/utils.test.ts
```

Expected: errores `Cannot find module '@/utils/slugify'`, etc.

- [ ] **Step 3: Implementar slugify**

Crear `src/utils/slugify.ts`:

```typescript
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
```

- [ ] **Step 4: Implementar paginate**

Crear `src/utils/paginate.ts`:

```typescript
import type { PaginatedResponse } from '@/types';

export function getPaginationParams(page: number | undefined, limit: number | undefined) {
  const safePage = Math.max(1, page ?? 1);
  const safeLimit = Math.min(100, Math.max(1, limit ?? 20));
  return {
    offset: (safePage - 1) * safeLimit,
    limit: safeLimit,
    page: safePage,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
```

- [ ] **Step 5: Implementar drive-urls**

Crear `src/utils/drive-urls.ts`:

```typescript
export function buildPreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function buildDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
```

- [ ] **Step 6: Correr tests — verificar que pasan**

```bash
bun test src/__tests__/utils.test.ts
```

Expected:
```
✓ slugify > convierte a minúsculas con guiones
✓ slugify > elimina acentos y tildes
✓ slugify > elimina caracteres especiales
✓ slugify > colapsa múltiples guiones
✓ slugify > elimina guiones al inicio y final
✓ getPaginationParams > devuelve defaults cuando no se pasan parámetros
✓ getPaginationParams > calcula offset correctamente
✓ getPaginationParams > clamp: limit máximo 100
✓ getPaginationParams > clamp: page mínimo 1
✓ buildPaginatedResponse > calcula totalPages correctamente
✓ buildPreviewUrl > construye la URL de preview de Drive
✓ buildDownloadUrl > construye la URL de descarga de Drive
12 pass, 0 fail
```

- [ ] **Step 7: Commit**

```bash
git add src/utils/ src/__tests__/utils.test.ts
git commit -m "feat: add slugify, paginate, drive-urls utils with tests"
```

---

## Task 4: DB Schema

**Files:**
- Create: `src/db/schema.ts`

- [ ] **Step 1: Crear src/db/schema.ts**

```typescript
import {
  pgTable, text, varchar, integer, smallint, boolean,
  timestamp, pgEnum, primaryKey, index, unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── ENUMS ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['superadmin', 'admin', 'user']);

export const resourceStatusEnum = pgEnum('resource_status', [
  'pending',
  'published',
  'rejected',
]);

export const resourceTypeEnum = pgEnum('resource_type', [
  'resumen',
  'parcial',
  'final',
]);

// ─── JERARQUÍA ────────────────────────────────────────────────────────────────

export const universities = pgTable('universities', {
  id:        text('id').primaryKey(),
  name:      varchar('name', { length: 255 }).notNull().unique(),
  slug:      varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const faculties = pgTable('faculties', {
  id:           text('id').primaryKey(),
  universityId: text('university_id').notNull().references(() => universities.id),
  name:         varchar('name', { length: 255 }).notNull(),
  slug:         varchar('slug', { length: 100 }).notNull(),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniqueSlugPerUniversity: unique().on(t.universityId, t.slug),
  universityIdx:           index('faculties_university_idx').on(t.universityId),
}));

export const careers = pgTable('careers', {
  id:        text('id').primaryKey(),
  facultyId: text('faculty_id').notNull().references(() => faculties.id),
  name:      varchar('name', { length: 255 }).notNull(),
  slug:      varchar('slug', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  facultyIdx: index('careers_faculty_idx').on(t.facultyId),
}));

export const subjects = pgTable('subjects', {
  id:          text('id').primaryKey(),
  facultyId:   text('faculty_id').notNull().references(() => faculties.id),
  title:       varchar('title', { length: 255 }).notNull(),
  slug:        varchar('slug', { length: 100 }).notNull(),
  description: text('description').notNull().default(''),
  urlMoodle:   varchar('url_moodle', { length: 512 }).default(''),
  urlPrograma: varchar('url_programa', { length: 512 }).default(''),
  year:        smallint('year').notNull(),
  quadmester:  smallint('quadmester').notNull(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  facultyIdx: index('subjects_faculty_idx').on(t.facultyId),
  slugIdx:    index('subjects_slug_idx').on(t.slug),
}));

export const careerSubjects = pgTable('career_subjects', {
  careerId:   text('career_id').notNull().references(() => careers.id, { onDelete: 'cascade' }),
  subjectId:  text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  year:       smallint('year').notNull(),
  quadmester: smallint('quadmester').notNull(),
}, (t) => ({
  pk:         primaryKey({ columns: [t.careerId, t.subjectId] }),
  subjectIdx: index('career_subjects_subject_idx').on(t.subjectId),
}));

export const subjectPrerequisites = pgTable('subject_prerequisites', {
  subjectId:  text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  requiredId: text('required_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.subjectId, t.requiredId] }),
}));

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:             text('id').primaryKey(),
  email:          varchar('email', { length: 255 }).notNull().unique(),
  passwordHash:   varchar('password_hash', { length: 255 }).notNull(),
  displayName:    varchar('display_name', { length: 100 }).notNull(),
  role:           userRoleEnum('role').notNull().default('user'),
  adminFacultyId: text('admin_faculty_id').references(() => faculties.id),
  emailVerified:  boolean('email_verified').notNull().default(false),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  emailIdx:   index('users_email_idx').on(t.email),
  facultyIdx: index('users_faculty_idx').on(t.adminFacultyId),
}));

// ─── RECURSOS ─────────────────────────────────────────────────────────────────

export const resources = pgTable('resources', {
  id:              text('id').primaryKey(),
  subjectId:       text('subject_id').notNull().references(() => subjects.id),
  uploadedBy:      text('uploaded_by').notNull().references(() => users.id),
  reviewedBy:      text('reviewed_by').references(() => users.id),
  title:           varchar('title', { length: 255 }).notNull(),
  type:            resourceTypeEnum('type').notNull(),
  status:          resourceStatusEnum('status').notNull().default('pending'),
  stagingPath:     text('staging_path'),
  stagingMimeType: varchar('staging_mime_type', { length: 100 }),
  stagingSize:     integer('staging_size'),
  driveFileId:     text('drive_file_id'),
  driveMimeType:   varchar('drive_mime_type', { length: 100 }),
  driveSize:       integer('drive_size'),
  rejectionReason: text('rejection_reason'),
  downloadCount:   integer('download_count').notNull().default(0),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
  publishedAt:     timestamp('published_at'),
}, (t) => ({
  subjectIdx:    index('resources_subject_idx').on(t.subjectId),
  statusIdx:     index('resources_status_idx').on(t.status),
  typeIdx:       index('resources_type_idx').on(t.type),
  uploadedByIdx: index('resources_uploaded_by_idx').on(t.uploadedBy),
}));

// ─── RELACIONES ───────────────────────────────────────────────────────────────

export const universitiesRelations = relations(universities, ({ many }) => ({
  faculties: many(faculties),
}));

export const facultiesRelations = relations(faculties, ({ one, many }) => ({
  university: one(universities, { fields: [faculties.universityId], references: [universities.id] }),
  careers:    many(careers),
  subjects:   many(subjects),
  adminUsers: many(users),
}));

export const careersRelations = relations(careers, ({ one, many }) => ({
  faculty:        one(faculties, { fields: [careers.facultyId], references: [faculties.id] }),
  careerSubjects: many(careerSubjects),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  faculty:        one(faculties, { fields: [subjects.facultyId], references: [faculties.id] }),
  careerSubjects: many(careerSubjects),
  prerequisites:  many(subjectPrerequisites, { relationName: 'subject' }),
  dependents:     many(subjectPrerequisites, { relationName: 'required' }),
  resources:      many(resources),
}));

export const subjectPrerequisitesRelations = relations(subjectPrerequisites, ({ one }) => ({
  subject:  one(subjects, { fields: [subjectPrerequisites.subjectId],  references: [subjects.id], relationName: 'subject' }),
  required: one(subjects, { fields: [subjectPrerequisites.requiredId], references: [subjects.id], relationName: 'required' }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  adminFaculty:      one(faculties, { fields: [users.adminFacultyId], references: [faculties.id] }),
  uploadedResources: many(resources, { relationName: 'uploadedBy' }),
  reviewedResources: many(resources, { relationName: 'reviewedBy' }),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  subject:    one(subjects, { fields: [resources.subjectId],  references: [subjects.id] }),
  uploadedBy: one(users,    { fields: [resources.uploadedBy], references: [users.id], relationName: 'uploadedBy' }),
  reviewedBy: one(users,    { fields: [resources.reviewedBy], references: [users.id], relationName: 'reviewedBy' }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add complete Drizzle schema (universities, subjects, users, resources)"
```

---

## Task 5: DB connection + drizzle-kit + migrations

**Files:**
- Create: `src/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Crear src/db/index.ts**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

- [ ] **Step 2: Crear drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 3: Generar migración**

```bash
bun run db:generate
```

Expected: crea `src/db/migrations/0000_*.sql` con todas las CREATE TABLE y CREATE INDEX.

- [ ] **Step 4: Correr migración**

```bash
bun run db:migrate
```

Expected: `All migrations applied successfully.` Sin errores.

- [ ] **Step 5: Verificar tablas**

```bash
docker compose exec postgres psql -U postgres -d exactamente -c '\dt'
```

Expected: lista con `universities`, `faculties`, `careers`, `subjects`, `career_subjects`, `subject_prerequisites`, `users`, `resources`.

- [ ] **Step 6: Commit**

```bash
git add src/db/index.ts drizzle.config.ts src/db/migrations/
git commit -m "feat: add DB connection and run initial migration"
```

---

## Task 6: Auth service + tests

**Files:**
- Create: `src/services/auth.service.ts`
- Create: `src/__tests__/auth.service.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Crear `src/__tests__/auth.service.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'bun:test';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-exactly-32-chars!!';
});

import { hashPassword, verifyPassword, signToken, verifyTokenPayload } from '@/services/auth.service';

describe('hashPassword / verifyPassword', () => {
  it('produce un hash diferente a la contraseña original', async () => {
    const hash = await hashPassword('mipassword123');
    expect(hash).not.toBe('mipassword123');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifica la contraseña correcta', async () => {
    const hash = await hashPassword('correcta');
    expect(await verifyPassword('correcta', hash)).toBe(true);
  });

  it('rechaza la contraseña incorrecta', async () => {
    const hash = await hashPassword('correcta');
    expect(await verifyPassword('incorrecta', hash)).toBe(false);
  });
});

describe('signToken / verifyTokenPayload', () => {
  it('firma y verifica un token correctamente', async () => {
    const token = await signToken({ sub: 'user-abc', role: 'user', facultyId: null });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const payload = await verifyTokenPayload(token);
    expect(payload.sub).toBe('user-abc');
    expect(payload.role).toBe('user');
    expect(payload.facultyId).toBeNull();
  });

  it('firma token de admin con facultyId', async () => {
    const token = await signToken({ sub: 'admin-1', role: 'admin', facultyId: 'FACET' });
    const payload = await verifyTokenPayload(token);
    expect(payload.role).toBe('admin');
    expect(payload.facultyId).toBe('FACET');
  });
});
```

- [ ] **Step 2: Correr tests — verificar que fallan**

```bash
bun test src/__tests__/auth.service.test.ts
```

Expected: `Cannot find module '@/services/auth.service'`

- [ ] **Step 3: Implementar auth service**

Crear `src/services/auth.service.ts`:

```typescript
import { sign, verify } from 'hono/jwt';
import type { JwtPayload } from '@/types';

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export async function signToken(
  payload: Pick<JwtPayload, 'sub' | 'role' | 'facultyId'>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { ...payload, iat: now, exp: now + 60 * 60 * 24 * 7 },
    process.env.JWT_SECRET!,
  );
}

export async function verifyTokenPayload(token: string): Promise<JwtPayload> {
  return verify(token, process.env.JWT_SECRET!) as Promise<JwtPayload>;
}
```

- [ ] **Step 4: Correr tests — verificar que pasan**

```bash
bun test src/__tests__/auth.service.test.ts
```

Expected:
```
✓ hashPassword / verifyPassword > produce un hash diferente a la contraseña original
✓ hashPassword / verifyPassword > verifica la contraseña correcta
✓ hashPassword / verifyPassword > rechaza la contraseña incorrecta
✓ signToken / verifyTokenPayload > firma y verifica un token correctamente
✓ signToken / verifyTokenPayload > firma token de admin con facultyId
5 pass, 0 fail
```

- [ ] **Step 5: Commit**

```bash
git add src/services/auth.service.ts src/__tests__/auth.service.test.ts
git commit -m "feat: add auth service (hash, JWT) with tests"
```

---

## Task 7: Middleware + tests

**Files:**
- Create: `src/middleware/auth.ts`
- Create: `src/middleware/requireRole.ts`
- Create: `src/__tests__/middleware.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Crear `src/__tests__/middleware.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-exactly-32-chars!!';
});

import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { signToken } from '@/services/auth.service';
import type { AppContext } from '@/types';

describe('verifyToken', () => {
  const app = new Hono<AppContext>();
  app.get('/protected', verifyToken, (c) => {
    const user = c.get('user');
    return c.json({ userId: user.sub, role: user.role });
  });

  it('devuelve 401 sin header Authorization', async () => {
    const res = await app.request('/protected');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Token requerido');
  });

  it('devuelve 401 con token inválido', async () => {
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer token-basura' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Token inválido o expirado');
  });

  it('pasa con token válido y expone el payload', async () => {
    const token = await signToken({ sub: 'user-1', role: 'user', facultyId: null });
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
    expect(body.role).toBe('user');
  });
});

describe('requireRole', () => {
  const app = new Hono<AppContext>();
  app.get('/admin-only', verifyToken, requireRole('admin'), (c) => c.json({ ok: true }));
  app.get('/super-only', verifyToken, requireRole('superadmin'), (c) => c.json({ ok: true }));

  it('devuelve 403 cuando user intenta acceder a ruta de admin', async () => {
    const token = await signToken({ sub: 'u1', role: 'user', facultyId: null });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('pasa cuando admin accede a ruta de admin', async () => {
    const token = await signToken({ sub: 'a1', role: 'admin', facultyId: 'FACET' });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('pasa cuando superadmin accede a ruta de admin (jerarquía)', async () => {
    const token = await signToken({ sub: 'sa1', role: 'superadmin', facultyId: null });
    const res = await app.request('/admin-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('devuelve 403 cuando admin intenta acceder a ruta de superadmin', async () => {
    const token = await signToken({ sub: 'a1', role: 'admin', facultyId: 'FACET' });
    const res = await app.request('/super-only', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr tests — verificar que fallan**

```bash
bun test src/__tests__/middleware.test.ts
```

Expected: `Cannot find module '@/middleware/auth'`

- [ ] **Step 3: Implementar verifyToken middleware**

Crear `src/middleware/auth.ts`:

```typescript
import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { AppContext, JwtPayload } from '@/types';

export const verifyToken = createMiddleware<AppContext>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Token requerido' }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verify(token, process.env.JWT_SECRET!) as JwtPayload;
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Token inválido o expirado' }, 401);
  }
});
```

- [ ] **Step 4: Implementar requireRole middleware**

Crear `src/middleware/requireRole.ts`:

```typescript
import { createMiddleware } from 'hono/factory';
import type { AppContext, UserRole } from '@/types';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 1,
  admin: 2,
  superadmin: 3,
};

export function requireRole(minRole: UserRole) {
  return createMiddleware<AppContext>(async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'No autenticado' }, 401);

    if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[minRole]) {
      return c.json({ error: 'Sin permisos suficientes' }, 403);
    }

    await next();
  });
}
```

- [ ] **Step 5: Correr tests — verificar que pasan**

```bash
bun test src/__tests__/middleware.test.ts
```

Expected:
```
✓ verifyToken > devuelve 401 sin header Authorization
✓ verifyToken > devuelve 401 con token inválido
✓ verifyToken > pasa con token válido y expone el payload
✓ requireRole > devuelve 403 cuando user intenta acceder a ruta de admin
✓ requireRole > pasa cuando admin accede a ruta de admin
✓ requireRole > pasa cuando superadmin accede a ruta de admin (jerarquía)
✓ requireRole > devuelve 403 cuando admin intenta acceder a ruta de superadmin
7 pass, 0 fail
```

- [ ] **Step 6: Correr todos los tests**

```bash
bun test
```

Expected: todos los tests anteriores siguen pasando (19 pass total, 0 fail).

- [ ] **Step 7: Commit**

```bash
git add src/middleware/ src/__tests__/middleware.test.ts
git commit -m "feat: add verifyToken and requireRole middleware with tests"
```

---

## Task 8: Auth validators + routes

**Files:**
- Create: `src/validators/auth.validators.ts`
- Create: `src/routes/auth.ts`

- [ ] **Step 1: Crear src/validators/auth.validators.ts**

```typescript
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  displayName: z.string().min(2).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
```

- [ ] **Step 2: Crear src/routes/auth.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { hashPassword, verifyPassword, signToken } from '@/services/auth.service';
import { registerSchema, loginSchema } from '@/validators/auth.validators';
import { verifyToken } from '@/middleware/auth';
import type { AppContext, PublicUser } from '@/types';

const auth = new Hono<AppContext>();

function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

auth.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, displayName } = c.req.valid('json');

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return c.json({ error: 'Email ya registrado' }, 409);

  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();

  const [user] = await db.insert(users).values({
    id,
    email,
    passwordHash,
    displayName,
    role: 'user',
  }).returning();

  const token = await signToken({
    sub: user.id,
    role: user.role,
    facultyId: user.adminFacultyId ?? null,
  });

  return c.json({ user: toPublicUser(user), token }, 201);
});

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: 'Credenciales inválidas' }, 401);
  }

  const token = await signToken({
    sub: user.id,
    role: user.role,
    facultyId: user.adminFacultyId ?? null,
  });

  return c.json({ user: toPublicUser(user), token });
});

auth.get('/me', verifyToken, async (c) => {
  const { sub } = c.get('user');

  const user = await db.query.users.findFirst({
    where: eq(users.id, sub),
  });

  if (!user) return c.json({ error: 'Usuario no encontrado' }, 404);

  return c.json({ user: toPublicUser(user) });
});

export default auth;
```

- [ ] **Step 3: Commit**

```bash
git add src/validators/auth.validators.ts src/routes/auth.ts
git commit -m "feat: add auth routes (register, login, me)"
```

---

## Task 9: Universities, Faculties, Careers routes

**Files:**
- Create: `src/routes/universities.ts`
- Create: `src/routes/faculties.ts`
- Create: `src/routes/careers.ts`

- [ ] **Step 1: Crear src/routes/universities.ts**

```typescript
import { Hono } from 'hono';
import { db } from '@/db';

const app = new Hono();

app.get('/', async (c) => {
  const data = await db.query.universities.findMany({
    orderBy: (u, { asc }) => [asc(u.name)],
  });
  return c.json({ data });
});

export default app;
```

- [ ] **Step 2: Crear src/routes/faculties.ts**

```typescript
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { faculties } from '@/db/schema';

const app = new Hono();

app.get('/', async (c) => {
  const universityId = c.req.query('universityId');

  const data = await db.query.faculties.findMany({
    where: universityId ? eq(faculties.universityId, universityId) : undefined,
    orderBy: (f, { asc }) => [asc(f.name)],
  });

  return c.json({ data });
});

export default app;
```

- [ ] **Step 3: Crear src/routes/careers.ts**

```typescript
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { careers } from '@/db/schema';

const app = new Hono();

app.get('/', async (c) => {
  const facultyId = c.req.query('facultyId');

  const data = await db.query.careers.findMany({
    where: facultyId ? eq(careers.facultyId, facultyId) : undefined,
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  return c.json({ data });
});

export default app;
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/universities.ts src/routes/faculties.ts src/routes/careers.ts
git commit -m "feat: add universities, faculties, careers read routes"
```

---

## Task 10: Subject validators + routes

**Files:**
- Create: `src/validators/subject.validators.ts`
- Create: `src/routes/subjects.ts`

- [ ] **Step 1: Crear src/validators/subject.validators.ts**

```typescript
import { z } from 'zod';

export const subjectFiltersSchema = z.object({
  careerId:    z.string().optional(),
  facultyId:   z.string().optional(),
  year:        z.coerce.number().int().min(1).max(5).optional(),
  quadmester:  z.coerce.number().int().min(1).max(2).optional(),
  search:      z.string().optional(),
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().positive().max(100).default(20),
});
```

- [ ] **Step 2: Crear src/routes/subjects.ts**

```typescript
import { Hono } from 'hono';
import { eq, and, ilike, inArray, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { db } from '@/db';
import { subjects, careerSubjects } from '@/db/schema';
import { subjectFiltersSchema } from '@/validators/subject.validators';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';
import type { Subject } from '@/types';

const app = new Hono();

function rowToSubject(row: typeof subjects.$inferSelect): Subject {
  return {
    id: row.id,
    facultyId: row.facultyId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    urlMoodle: row.urlMoodle ?? '',
    urlPrograma: row.urlPrograma ?? '',
    year: row.year,
    quadmester: row.quadmester,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

app.get('/', zValidator('query', subjectFiltersSchema), async (c) => {
  const { careerId, facultyId, year, quadmester, search, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);

  // Si hay careerId, obtener los IDs de materias de esa carrera primero
  let careerSubjectIds: string[] | undefined;
  if (careerId) {
    const rows = await db
      .select({ subjectId: careerSubjects.subjectId })
      .from(careerSubjects)
      .where(eq(careerSubjects.careerId, careerId));
    careerSubjectIds = rows.map(r => r.subjectId);
    if (careerSubjectIds.length === 0) {
      return c.json(buildPaginatedResponse([], 0, safePage, safeLimit));
    }
  }

  const conditions = [];
  if (facultyId) conditions.push(eq(subjects.facultyId, facultyId));
  if (year) conditions.push(eq(subjects.year, year));
  if (quadmester) conditions.push(eq(subjects.quadmester, quadmester));
  if (search) conditions.push(ilike(subjects.title, `%${search}%`));
  if (careerSubjectIds) conditions.push(inArray(subjects.id, careerSubjectIds));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.query.subjects.findMany({
      where: whereClause,
      limit: safeLimit,
      offset,
      with: {
        careerSubjects: true,
        prerequisites: true,
        dependents: true,
      },
      orderBy: (s, { asc }) => [asc(s.year), asc(s.quadmester), asc(s.title)],
    }),
    db.select({ count: sql<number>`count(*)::int` })
      .from(subjects)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const data = rows.map(s => ({
    ...rowToSubject(s),
    careers: s.careerSubjects.map(cs => ({
      careerId: cs.careerId,
      year: cs.year,
      quadmester: cs.quadmester,
    })),
    prerequisites: s.prerequisites.map(p => p.requiredId),
    correlatives: s.dependents.map(d => d.subjectId),
  }));

  return c.json(buildPaginatedResponse(data, total, safePage, safeLimit));
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, id),
    with: {
      careerSubjects: true,
      prerequisites: { with: { required: true } },
      dependents:    { with: { subject: true } },
    },
  });

  if (!subject) return c.json({ error: 'Materia no encontrada' }, 404);

  return c.json({
    subject: {
      ...rowToSubject(subject),
      careers: subject.careerSubjects.map(cs => ({
        careerId: cs.careerId,
        year: cs.year,
        quadmester: cs.quadmester,
      })),
      prerequisites: subject.prerequisites.map(p => p.requiredId),
      correlatives:  subject.dependents.map(d => d.subjectId),
      prerequisiteSubjects: subject.prerequisites.map(p => rowToSubject(p.required)),
      correlativeSubjects:  subject.dependents.map(d => rowToSubject(d.subject)),
    },
  });
});

export default app;
```

- [ ] **Step 3: Commit**

```bash
git add src/validators/subject.validators.ts src/routes/subjects.ts
git commit -m "feat: add subjects routes with filtering and pagination"
```

---

## Task 11: Resources route (read-only)

**Files:**
- Create: `src/routes/resources.ts`

- [ ] **Step 1: Crear src/routes/resources.ts**

```typescript
import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@/db';
import { resources } from '@/db/schema';
import { buildPreviewUrl, buildDownloadUrl } from '@/utils/drive-urls';
import { getPaginationParams, buildPaginatedResponse } from '@/utils/paginate';

const resourceQuerySchema = z.object({
  subjectId: z.string().optional(),
  type:      z.enum(['resumen', 'parcial', 'final']).optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

const app = new Hono();

app.get('/', zValidator('query', resourceQuerySchema), async (c) => {
  const { subjectId, type, page, limit } = c.req.valid('query');
  const { offset, limit: safeLimit, page: safePage } = getPaginationParams(page, limit);

  const conditions = [eq(resources.status, 'published')];
  if (subjectId) conditions.push(eq(resources.subjectId, subjectId));
  if (type) conditions.push(eq(resources.type, type));

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.query.resources.findMany({
      where: whereClause,
      limit: safeLimit,
      offset,
      orderBy: (r, { desc }) => [desc(r.publishedAt)],
    }),
    db.select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  const data = rows.map(r => ({
    id: r.id,
    subjectId: r.subjectId,
    title: r.title,
    type: r.type,
    status: r.status,
    driveFileId: r.driveFileId,
    driveSize: r.driveSize,
    downloadCount: r.downloadCount,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    previewUrl:  r.driveFileId ? buildPreviewUrl(r.driveFileId) : null,
    downloadUrl: r.driveFileId ? buildDownloadUrl(r.driveFileId) : null,
  }));

  return c.json(buildPaginatedResponse(data, total, safePage, safeLimit));
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/resources.ts
git commit -m "feat: add resources read route (published only)"
```

---

## Task 12: App assembly

**Files:**
- Create: `src/app.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Crear src/app.ts**

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import authRoutes        from '@/routes/auth';
import universitiesRoutes from '@/routes/universities';
import facultiesRoutes   from '@/routes/faculties';
import careersRoutes     from '@/routes/careers';
import subjectsRoutes    from '@/routes/subjects';
import resourcesRoutes   from '@/routes/resources';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();

app.use('*', logger());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

const api = app.basePath('/api/v1');
api.route('/auth',         authRoutes);
api.route('/universities', universitiesRoutes);
api.route('/faculties',    facultiesRoutes);
api.route('/careers',      careersRoutes);
api.route('/subjects',     subjectsRoutes);
api.route('/resources',    resourcesRoutes);

export default app;
```

- [ ] **Step 2: Crear src/index.ts**

```typescript
import app from './app';

const port = parseInt(process.env.PORT ?? '3000');
console.log(`🚀 Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
```

- [ ] **Step 3: Correr el servidor en modo desarrollo**

```bash
bun run dev
```

Expected:
```
🚀 Server running on http://localhost:3000
```

Sin errores de TypeScript ni de importación.

- [ ] **Step 4: Verificar health endpoint**

```bash
curl http://localhost:3000/health
```

Expected:
```json
{"status":"ok","timestamp":"2026-03-27T..."}
```

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/index.ts
git commit -m "feat: assemble Hono app with all routes and global middleware"
```

---

## Task 13: Seed script + data files

**Files:**
- Create: `scripts/data/materias.ts` (copia del frontend)
- Create: `scripts/data/carreras.ts` (copia del frontend)
- Create: `scripts/seed.ts`

- [ ] **Step 1: Copiar archivos de datos del frontend**

```bash
cp /Users/juanpenalba/Projects/exactamente/exactamente-frontend/src/shared/data/materias.ts \
   /Users/juanpenalba/Projects/exactamente/exactamente-backend/scripts/data/materias.ts

cp /Users/juanpenalba/Projects/exactamente/exactamente-frontend/src/shared/data/carreras.ts \
   /Users/juanpenalba/Projects/exactamente/exactamente-backend/scripts/data/carreras.ts
```

- [ ] **Step 2: Crear scripts/seed.ts**

```typescript
import { db } from '../src/db';
import {
  universities,
  faculties,
  careers,
  subjects,
  careerSubjects,
  subjectPrerequisites,
} from '../src/db/schema';
import { MATERIAS_SISTEMAS } from './data/materias';
import { carreras } from './data/carreras';
import { slugify } from '../src/utils/slugify';

async function seed() {
  console.log('🌱 Iniciando seed...');

  // 1. Universidad
  await db.insert(universities).values({
    id: 'UNICEN',
    name: 'Universidad Nacional del Centro de la Provincia de Buenos Aires',
    slug: 'unicen',
  }).onConflictDoNothing();
  console.log('✓ Universidad insertada');

  // 2. Facultad
  await db.insert(faculties).values({
    id: 'FACET',
    universityId: 'UNICEN',
    name: 'Facultad de Ciencias Exactas',
    slug: 'exactas',
  }).onConflictDoNothing();
  console.log('✓ Facultad insertada');

  // 3. Carreras
  for (const carrera of carreras) {
    await db.insert(careers).values({
      id: carrera.id,
      facultyId: 'FACET',
      name: carrera.name,
      slug: slugify(carrera.name),
    }).onConflictDoNothing();
  }
  console.log(`✓ ${carreras.length} carreras insertadas`);

  // 4. Materias (deduplicar por ID — la misma materia no se repite aunque
  //    aparezca en múltiples carreras)
  const uniqueSubjects = new Map<string, typeof MATERIAS_SISTEMAS[number]>();
  for (const m of MATERIAS_SISTEMAS) {
    if (!uniqueSubjects.has(m.id)) uniqueSubjects.set(m.id, m);
  }

  for (const materia of uniqueSubjects.values()) {
    await db.insert(subjects).values({
      id: materia.id,
      facultyId: 'FACET',
      title: materia.title,
      slug: slugify(materia.title),
      description: materia.description,
      urlMoodle: materia.urlMoodle ?? '',
      urlPrograma: materia.urlPrograma ?? '',
      year: materia.year,
      quadmester: materia.quadmester,
    }).onConflictDoNothing();
  }
  console.log(`✓ ${uniqueSubjects.size} materias insertadas`);

  // 5. career_subjects — cada materia con su carrera
  for (const materia of MATERIAS_SISTEMAS) {
    await db.insert(careerSubjects).values({
      careerId: materia.idCarrer,
      subjectId: materia.id,
      year: materia.year,
      quadmester: materia.quadmester,
    }).onConflictDoNothing();
  }
  console.log(`✓ ${MATERIAS_SISTEMAS.length} relaciones carrera-materia insertadas`);

  // 6. Prerequisitos
  let prereqCount = 0;
  for (const materia of MATERIAS_SISTEMAS) {
    for (const requiredId of materia.required) {
      await db.insert(subjectPrerequisites).values({
        subjectId: materia.id,
        requiredId,
      }).onConflictDoNothing();
      prereqCount++;
    }
  }
  console.log(`✓ ${prereqCount} prerequisitos insertados`);

  console.log('✅ Seed completo');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Error en seed:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Correr el seed**

```bash
bun run seed
```

Expected:
```
🌱 Iniciando seed...
✓ Universidad insertada
✓ Facultad insertada
✓ 2 carreras insertadas
✓ 45+ materias insertadas
✓ 45+ relaciones carrera-materia insertadas
✓ N prerequisitos insertados
✅ Seed completo
```

Sin errores. Si hay errores de FK (referenced subject doesn't exist), revisar que todos los IDs en `required` existen en la lista de materias.

- [ ] **Step 4: Verificar datos en DB**

```bash
docker compose exec postgres psql -U postgres -d exactamente \
  -c "SELECT count(*) FROM subjects;" \
  -c "SELECT count(*) FROM career_subjects;" \
  -c "SELECT count(*) FROM subject_prerequisites;"
```

Expected: counts > 0 en las tres tablas.

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: add seed script with UNICEN, FACET, carreras and materias data"
```

---

## Task 14: Smoke test manual

- [ ] **Step 1: Iniciar el servidor (si no está corriendo)**

```bash
bun run dev
```

- [ ] **Step 2: GET /api/v1/universities**

```bash
curl -s http://localhost:3000/api/v1/universities | jq .
```

Expected:
```json
{
  "data": [
    { "id": "UNICEN", "name": "Universidad Nacional del Centro...", "slug": "unicen", "createdAt": "..." }
  ]
}
```

- [ ] **Step 3: GET /api/v1/careers?facultyId=FACET**

```bash
curl -s "http://localhost:3000/api/v1/careers?facultyId=FACET" | jq .
```

Expected: array con C1 (Ingenieria en Sistemas) y C2 (TUDAI).

- [ ] **Step 4: GET /api/v1/subjects?careerId=C1&limit=5**

```bash
curl -s "http://localhost:3000/api/v1/subjects?careerId=C1&limit=5" | jq .
```

Expected: `{ data: [...], total: 45+, page: 1, totalPages: ... }`

- [ ] **Step 5: GET /api/v1/subjects/:id**

```bash
curl -s "http://localhost:3000/api/v1/subjects/A1C1M1" | jq .
```

Expected: objeto con `subject.title`, `subject.prerequisites`, `subject.correlatives`, `subject.prerequisiteSubjects`, etc.

- [ ] **Step 6: POST /api/v1/auth/register**

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","displayName":"Test User"}' \
  | jq .
```

Expected: `{ "user": { "id": "...", "email": "test@example.com", ... }, "token": "eyJ..." }`

- [ ] **Step 7: GET /api/v1/auth/me** con el token del paso anterior

```bash
TOKEN="<token del paso anterior>"
curl -s http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" \
  | jq .
```

Expected: `{ "user": { "email": "test@example.com", ... } }`

- [ ] **Step 8: GET /api/v1/resources?subjectId=A1C1M1**

```bash
curl -s "http://localhost:3000/api/v1/resources?subjectId=A1C1M1" | jq .
```

Expected: `{ "data": [], "total": 0, "page": 1, "totalPages": 0 }` (vacío, aún no hay recursos cargados).

- [ ] **Step 9: Correr todos los tests**

```bash
bun test
```

Expected: todos los tests pasan (19 pass, 0 fail).

- [ ] **Step 10: Commit final**

```bash
git add -A
git commit -m "chore: fase 1 complete — infra, schema, seed, auth, read endpoints"
```

---

## Resumen de lo construido en Fase 1

| Componente | Estado |
|---|---|
| Proyecto Bun + Hono | ✅ |
| PostgreSQL via Docker | ✅ |
| Schema Drizzle completo | ✅ |
| Migraciones | ✅ |
| Seed con datos reales | ✅ |
| Auth (register, login, me) | ✅ |
| GET /universities, /faculties, /careers | ✅ |
| GET /subjects con filtros y paginación | ✅ |
| GET /subjects/:id con correlativas | ✅ |
| GET /resources (solo published) | ✅ |
| Middleware verifyToken + requireRole | ✅ |
| Tests unitarios (utils, auth, middleware) | ✅ |
