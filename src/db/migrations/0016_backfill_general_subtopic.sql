-- Backfill: las materias creadas después de 0010 quedaron sin su "Subtema
-- general" (FR-2), porque el alta de materias no lo creaba. Sin subtemas, el
-- blog no permite postear. Misma fila semilla que 0010, solo para materias que
-- no tengan ya un subtema por defecto; ON CONFLICT protege el re-run.
INSERT INTO "blog_subtopics" ("id", "subject_id", "name", "slug", "is_default")
SELECT gen_random_uuid()::text, s."id", 'General', 'general', true
FROM "subjects" s
WHERE NOT EXISTS (
  SELECT 1
  FROM "blog_subtopics" b
  WHERE b."subject_id" = s."id" AND b."is_default"
)
ON CONFLICT DO NOTHING;
