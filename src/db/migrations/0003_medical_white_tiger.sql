ALTER TABLE "resources" ADD COLUMN "r2_key" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "exam_date" date;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "period" varchar(20);--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "resources" DROP COLUMN "staging_path";--> statement-breakpoint
ALTER TABLE "resources" DROP COLUMN "staging_mime_type";--> statement-breakpoint
ALTER TABLE "resources" DROP COLUMN "staging_size";--> statement-breakpoint
ALTER TABLE "resources" DROP COLUMN "drive_file_id";--> statement-breakpoint
ALTER TABLE "resources" DROP COLUMN "drive_mime_type";--> statement-breakpoint
ALTER TABLE "resources" DROP COLUMN "drive_size";