CREATE TYPE "vote_target" AS ENUM ('post', 'comment');

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
