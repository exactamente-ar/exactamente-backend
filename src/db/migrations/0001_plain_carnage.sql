CREATE TABLE "career_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"career_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"year" smallint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "career_plans" ADD CONSTRAINT "career_plans_career_id_careers_id_fk" FOREIGN KEY ("career_id") REFERENCES "public"."careers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "career_plans_career_idx" ON "career_plans" USING btree ("career_id");--> statement-breakpoint
ALTER TABLE "career_subjects" DROP CONSTRAINT "career_subjects_career_id_subject_id_pk";--> statement-breakpoint
TRUNCATE TABLE "career_subjects";--> statement-breakpoint
ALTER TABLE "career_subjects" ADD COLUMN "plan_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "career_subjects" ADD CONSTRAINT "career_subjects_career_id_plan_id_subject_id_pk" PRIMARY KEY("career_id","plan_id","subject_id");--> statement-breakpoint
ALTER TABLE "career_subjects" ADD CONSTRAINT "career_subjects_plan_id_career_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."career_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "career_subjects_plan_idx" ON "career_subjects" USING btree ("plan_id");
