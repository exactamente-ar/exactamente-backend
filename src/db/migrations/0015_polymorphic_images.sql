CREATE TYPE "public"."image_target" AS ENUM('post', 'comment');
ALTER TABLE "blog_post_images" RENAME TO "blog_images";
ALTER TABLE "blog_images" DROP CONSTRAINT "blog_post_images_post_id_blog_posts_id_fk";
ALTER TABLE "blog_images" ADD COLUMN "target_type" "image_target" DEFAULT 'post' NOT NULL;
ALTER TABLE "blog_images" RENAME COLUMN "post_id" TO "target_id";
ALTER TABLE "blog_images" ALTER COLUMN "target_type" DROP DEFAULT;

DROP INDEX IF EXISTS "blog_post_images_post_idx";
CREATE INDEX "blog_images_target_idx" ON "blog_images" ("target_type", "target_id");