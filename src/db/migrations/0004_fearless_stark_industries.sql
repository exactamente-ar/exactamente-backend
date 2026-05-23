ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" varchar(255);--> statement-breakpoint
CREATE INDEX "users_google_id_idx" ON "users" USING btree ("google_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");