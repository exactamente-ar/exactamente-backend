CREATE TYPE "post_authority" AS ENUM ('visible', 'anonymous');

CREATE TYPE "post_status" AS ENUM ('published', 'deleted');

CREATE TYPE "vote_target" AS ENUM ('post', 'comment');

CREATE TYPE "image_target" AS ENUM ('post', 'comment');

CREATE TABLE "blog_subtopics" (
  "id" text PRIMARY KEY NOT NULL,
  "subject_id" text NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "blog_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "subject_id" text NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "subtopic_id" text NOT NULL REFERENCES "blog_subtopics"("id") ON DELETE CASCADE,
  "author_id" text NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "authority" "post_authority" NOT NULL,
  "status" "post_status" DEFAULT 'published' NOT NULL,
  "net_score" integer DEFAULT 0 NOT NULL,
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

CREATE INDEX "blog_posts_subject_score_idx" ON "blog_posts" ("subject_id", "net_score" DESC);

CREATE TABLE "blog_images" (
  "id" text PRIMARY KEY NOT NULL,
  "target_type" "image_target" NOT NULL,
  "target_id" text NOT NULL,
  "r2_key" text NOT NULL,
  "mime_type" varchar(50) NOT NULL,
  "position" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "blog_images_target_idx" ON "blog_images" ("target_type", "target_id");

CREATE TABLE "blog_votes" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "target_type" "vote_target" NOT NULL,
  "target_id" text NOT NULL,
  "value" smallint NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "blog_votes_user_target_unique" ON "blog_votes" ("user_id", "target_type", "target_id");
CREATE INDEX "blog_votes_target_idx" ON "blog_votes" ("target_type", "target_id");

CREATE TABLE "blog_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "post_id" text NOT NULL REFERENCES "blog_posts"("id") ON DELETE CASCADE,
  "parent_id" text REFERENCES "blog_comments"("id"),
  "author_id" text NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "authority" "post_authority" NOT NULL,
  "status" "post_status" DEFAULT 'published' NOT NULL,
  "net_score" integer DEFAULT 0 NOT NULL,
  "depth" smallint DEFAULT 1 NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "blog_comments_post_idx" ON "blog_comments" ("post_id");
CREATE INDEX "blog_comments_parent_idx" ON "blog_comments" ("parent_id");
