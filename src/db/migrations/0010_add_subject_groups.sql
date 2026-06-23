CREATE TABLE "subject_groups" (
  "id" text PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "subject_group_members" (
  "id" text PRIMARY KEY NOT NULL,
  "group_id" text NOT NULL REFERENCES "subject_groups"("id") ON DELETE CASCADE,
  "subject_id" text NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "subject_group_members_group_id_subject_id_unique" UNIQUE("group_id", "subject_id")
);

CREATE INDEX "sgm_group_idx" ON "subject_group_members" ("group_id");
CREATE INDEX "sgm_subject_idx" ON "subject_group_members" ("subject_id");
