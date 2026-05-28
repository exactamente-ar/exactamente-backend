CREATE TYPE "public"."resource_subtype" AS ENUM('parcial', 'recuperatorio', 'prefinal', 'parcialito');--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "subtype" "resource_subtype";--> statement-breakpoint
ALTER TABLE "resources" DROP COLUMN IF EXISTS "exam_date";