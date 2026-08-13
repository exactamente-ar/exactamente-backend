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
