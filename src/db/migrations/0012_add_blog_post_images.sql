CREATE TABLE "blog_post_images" (
  "id" text PRIMARY KEY NOT NULL,
  "post_id" text NOT NULL REFERENCES "blog_posts"("id") ON DELETE CASCADE,
  "r2_key" text NOT NULL,
  "mime_type" varchar(50) NOT NULL,
  "position" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "blog_post_images_post_idx" ON "blog_post_images" ("post_id");
