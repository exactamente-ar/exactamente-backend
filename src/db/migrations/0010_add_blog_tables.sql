CREATE TYPE "post_authority" AS ENUM ('visible', 'anonymous');

CREATE TYPE "post_status" AS ENUM ('published', 'deleted');

CREATE TABLE "blog_subtopics" (
  "id" text PRIMARY KEY NOT NULL,
  "subject_id" text NOT NULL REFERENCES "subjects"("id"),
  "name" varchar(100) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "blog_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "subject_id" text NOT NULL REFERENCES "subjects"("id"),
  "subtopic_id" text NOT NULL REFERENCES "blog_subtopics"("id"),
  "author_id" text NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "authority" "post_authority" NOT NULL,
  "status" "post_status" DEFAULT 'published' NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "blog_subtopics_subject_slug_unique" ON "blog_subtopics" ("subject_id", "slug");
CREATE INDEX "blog_subtopics_subject_idx" ON "blog_subtopics" ("subject_id");
CREATE INDEX "blog_posts_subject_idx" ON "blog_posts" ("subject_id");
CREATE INDEX "blog_posts_subtopic_idx" ON "blog_posts" ("subtopic_id");
CREATE INDEX "blog_posts_author_idx" ON "blog_posts" ("author_id");

-- Todo blog nace con el "Subtema general" (PRD FR-2). La migración corre una
-- sola vez; ON CONFLICT protege contra un re-run en entornos que resetean.
INSERT INTO "blog_subtopics" ("id", "subject_id", "name", "slug", "is_default")
SELECT gen_random_uuid()::text, "id", 'General', 'general', true
FROM "subjects"
ON CONFLICT DO NOTHING;
