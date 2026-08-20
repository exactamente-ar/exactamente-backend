import {
  pgTable,
  text,
  varchar,
  integer,
  smallint,
  boolean,
  timestamp,
  pgEnum,
  primaryKey,
  index,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── ENUMS ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['superadmin', 'admin', 'user']);

export const resourceStatusEnum = pgEnum('resource_status', ['pending', 'published', 'rejected']);

export const resourceTypeEnum = pgEnum('resource_type', ['resumen', 'parcial', 'final']);

export const resourceSubtypeEnum = pgEnum('resource_subtype', [
  'parcial',
  'recuperatorio',
  'prefinal',
  'parcialito',
]);

export const postAuthorityEnum = pgEnum('post_authority', ['visible', 'anonymous']);

export const postStatusEnum = pgEnum('post_status', ['published', 'deleted']);

export const voteTargetEnum = pgEnum('vote_target', ['post', 'comment']);
export const imageTargetEnum = pgEnum('image_target', ['post', 'comment']);

// ─── JERARQUÍA ────────────────────────────────────────────────────────────────

export const universities = pgTable('universities', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  shortName: varchar('short_name', { length: 50 }),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const faculties = pgTable(
  'faculties',
  {
    id: text('id').primaryKey(),
    universityId: text('university_id')
      .notNull()
      .references(() => universities.id),
    name: varchar('name', { length: 255 }).notNull(),
    shortName: varchar('short_name', { length: 50 }),
    slug: varchar('slug', { length: 100 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqueSlugPerUniversity: unique().on(t.universityId, t.slug),
    universityIdx: index('faculties_university_idx').on(t.universityId),
  }),
);

export const careers = pgTable(
  'careers',
  {
    id: text('id').primaryKey(),
    facultyId: text('faculty_id')
      .notNull()
      .references(() => faculties.id),
    name: varchar('name', { length: 255 }).notNull(),
    shortName: varchar('short_name', { length: 50 }),
    slug: varchar('slug', { length: 100 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqueSlugPerFaculty: unique().on(t.facultyId, t.slug),
    facultyIdx: index('careers_faculty_idx').on(t.facultyId),
  }),
);

export const careerPlans = pgTable(
  'career_plans',
  {
    id: text('id').primaryKey(),
    careerId: text('career_id')
      .notNull()
      .references(() => careers.id),
    name: varchar('name', { length: 100 }).notNull(),
    year: smallint('year').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    careerIdx: index('career_plans_career_idx').on(t.careerId),
  }),
);

export const subjects = pgTable(
  'subjects',
  {
    id: text('id').primaryKey(),
    facultyId: text('faculty_id')
      .notNull()
      .references(() => faculties.id),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description').notNull().default(''),
    urlMoodle: varchar('url_moodle', { length: 512 }).default(''),
    urlPrograma: varchar('url_programa', { length: 512 }).default(''),
    year: smallint('year').notNull(),
    quadmester: smallint('quadmester').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    facultyIdx: index('subjects_faculty_idx').on(t.facultyId),
    slugIdx: index('subjects_slug_idx').on(t.slug),
  }),
);

export const careerSubjects = pgTable(
  'career_subjects',
  {
    careerId: text('career_id')
      .notNull()
      .references(() => careers.id, { onDelete: 'cascade' }),
    planId: text('plan_id')
      .notNull()
      .references(() => careerPlans.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    year: smallint('year').notNull(),
    quadmester: smallint('quadmester').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.careerId, t.planId, t.subjectId] }),
    subjectIdx: index('career_subjects_subject_idx').on(t.subjectId),
    planIdx: index('career_subjects_plan_idx').on(t.planId),
  }),
);

export const subjectPrerequisites = pgTable(
  'subject_prerequisites',
  {
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    requiredId: text('required_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.subjectId, t.requiredId] }),
  }),
);

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }),
    googleId: varchar('google_id', { length: 255 }).unique(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    photoUrl: varchar('photo_url', { length: 500 }),
    role: userRoleEnum('role').notNull().default('user'),
    adminFacultyId: text('admin_faculty_id').references(() => faculties.id),
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index('users_email_idx').on(t.email),
    facultyIdx: index('users_faculty_idx').on(t.adminFacultyId),
    googleIdIdx: index('users_google_id_idx').on(t.googleId),
  }),
);

// ─── RECURSOS ─────────────────────────────────────────────────────────────────

export const resources = pgTable(
  'resources',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
    reviewedBy: text('reviewed_by').references(() => users.id),
    title: varchar('title', { length: 255 }).notNull(),
    type: resourceTypeEnum('type').notNull(),
    subtype: resourceSubtypeEnum('subtype'),
    status: resourceStatusEnum('status').notNull().default('pending'),
    r2Key: text('r2_key'),
    period: varchar('period', { length: 20 }),
    topic: smallint('topic'),
    examYear: smallint('exam_year'),
    examMonth: smallint('exam_month'),
    examDay: smallint('exam_day'),
    notes: text('notes'),
    rejectionReason: text('rejection_reason'),
    downloadCount: integer('download_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    publishedAt: timestamp('published_at'),
  },
  (t) => ({
    subjectIdx: index('resources_subject_idx').on(t.subjectId),
    statusIdx: index('resources_status_idx').on(t.status),
    typeIdx: index('resources_type_idx').on(t.type),
    uploadedByIdx: index('resources_uploaded_by_idx').on(t.uploadedBy),
  }),
);

// ─── BLOGS ────────────────────────────────────────────────────────────────────

export const blogSubtopics = pgTable(
  'blog_subtopics',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    subjectIdx: index('blog_subtopics_subject_idx').on(t.subjectId),
    uniqueSubjectSlug: unique().on(t.subjectId, t.slug),
  }),
);

export const blogPosts = pgTable(
  'blog_posts',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    subtopicId: text('subtopic_id')
      .notNull()
      .references(() => blogSubtopics.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    authority: postAuthorityEnum('authority').notNull(),
    status: postStatusEnum('status').notNull().default('published'),
    netScore: integer('net_score').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    subjectIdx: index('blog_posts_subject_idx').on(t.subjectId),
    subtopicIdx: index('blog_posts_subtopic_idx').on(t.subtopicId),
    authorIdx: index('blog_posts_author_idx').on(t.authorId),
  }),
);

export const blogImages = pgTable(
  'blog_images',
  {
    id: text('id').primaryKey(),
    targetType: imageTargetEnum('target_type').notNull(),
    targetId: text('target_id').notNull(),
    r2Key: text('r2_key').notNull(),
    mimeType: varchar('mime_type', { length: 50 }).notNull(),
    position: smallint('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    targetIdx: index('blog_images_target_idx').on(t.targetType, t.targetId),
  }),
);

export const blogVotes = pgTable(
  'blog_votes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    targetType: voteTargetEnum('target_type').notNull(),
    targetId: text('target_id').notNull(),
    value: smallint('value').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqueVote: unique().on(t.userId, t.targetType, t.targetId),
    targetIdx: index('blog_votes_target_idx').on(t.targetType, t.targetId),
  }),
);

export const blogComments = pgTable(
  'blog_comments',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => blogPosts.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnyPgColumn => blogComments.id),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    authority: postAuthorityEnum('authority').notNull(),
    status: postStatusEnum('status').notNull().default('published'),
    netScore: integer('net_score').notNull().default(0),
    depth: smallint('depth').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    postIdx: index('blog_comments_post_idx').on(t.postId),
    parentIdx: index('blog_comments_parent_idx').on(t.parentId),
  }),
);

// ─── RELACIONES ───────────────────────────────────────────────────────────────

export const universitiesRelations = relations(universities, ({ many }) => ({
  faculties: many(faculties),
}));

export const facultiesRelations = relations(faculties, ({ one, many }) => ({
  university: one(universities, {
    fields: [faculties.universityId],
    references: [universities.id],
  }),
  careers: many(careers),
  subjects: many(subjects),
  adminUsers: many(users),
}));

export const careersRelations = relations(careers, ({ one, many }) => ({
  faculty: one(faculties, { fields: [careers.facultyId], references: [faculties.id] }),
  careerPlans: many(careerPlans),
  careerSubjects: many(careerSubjects),
}));

export const careerPlansRelations = relations(careerPlans, ({ one, many }) => ({
  career: one(careers, { fields: [careerPlans.careerId], references: [careers.id] }),
  careerSubjects: many(careerSubjects),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  faculty: one(faculties, { fields: [subjects.facultyId], references: [faculties.id] }),
  careerSubjects: many(careerSubjects),
  prerequisites: many(subjectPrerequisites, { relationName: 'subject' }),
  dependents: many(subjectPrerequisites, { relationName: 'required' }),
  resources: many(resources),
  blogSubtopics: many(blogSubtopics),
  blogPosts: many(blogPosts),
}));

export const careerSubjectsRelations = relations(careerSubjects, ({ one }) => ({
  career: one(careers, { fields: [careerSubjects.careerId], references: [careers.id] }),
  plan: one(careerPlans, { fields: [careerSubjects.planId], references: [careerPlans.id] }),
  subject: one(subjects, { fields: [careerSubjects.subjectId], references: [subjects.id] }),
}));

export const subjectPrerequisitesRelations = relations(subjectPrerequisites, ({ one }) => ({
  subject: one(subjects, {
    fields: [subjectPrerequisites.subjectId],
    references: [subjects.id],
    relationName: 'subject',
  }),
  required: one(subjects, {
    fields: [subjectPrerequisites.requiredId],
    references: [subjects.id],
    relationName: 'required',
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  adminFaculty: one(faculties, { fields: [users.adminFacultyId], references: [faculties.id] }),
  uploadedResources: many(resources, { relationName: 'uploadedBy' }),
  reviewedResources: many(resources, { relationName: 'reviewedBy' }),
  blogPosts: many(blogPosts),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  subject: one(subjects, { fields: [resources.subjectId], references: [subjects.id] }),
  uploadedBy: one(users, {
    fields: [resources.uploadedBy],
    references: [users.id],
    relationName: 'uploadedBy',
  }),
  reviewedBy: one(users, {
    fields: [resources.reviewedBy],
    references: [users.id],
    relationName: 'reviewedBy',
  }),
}));

export const blogSubtopicsRelations = relations(blogSubtopics, ({ one, many }) => ({
  subject: one(subjects, { fields: [blogSubtopics.subjectId], references: [subjects.id] }),
  posts: many(blogPosts),
}));

export const blogPostsRelations = relations(blogPosts, ({ one, many }) => ({
  subject: one(subjects, { fields: [blogPosts.subjectId], references: [subjects.id] }),
  subtopic: one(blogSubtopics, {
    fields: [blogPosts.subtopicId],
    references: [blogSubtopics.id],
  }),
  author: one(users, { fields: [blogPosts.authorId], references: [users.id] }),
  comments: many(blogComments),
}));

export const blogVotesRelations = relations(blogVotes, ({ one }) => ({
  user: one(users, { fields: [blogVotes.userId], references: [users.id] }),
}));

export const blogCommentsRelations = relations(blogComments, ({ one, many }) => ({
  post: one(blogPosts, { fields: [blogComments.postId], references: [blogPosts.id] }),
  parent: one(blogComments, {
    fields: [blogComments.parentId],
    references: [blogComments.id],
    relationName: 'parent',
  }),
  author: one(users, { fields: [blogComments.authorId], references: [users.id] }),
  replies: many(blogComments, { relationName: 'parent' }),
}));
