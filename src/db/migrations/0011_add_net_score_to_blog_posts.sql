ALTER TABLE "blog_posts" ADD COLUMN "net_score" integer DEFAULT 0 NOT NULL;

CREATE INDEX "blog_posts_subject_score_idx" ON "blog_posts" ("subject_id", "net_score" DESC);
