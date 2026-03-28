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
