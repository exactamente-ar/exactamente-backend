/**
 * Bulk upload resources from a JSON manifest.
 *
 * Usage: bun bulk-upload <manifest.json>
 *
 * Manifest format:
 * [
 *   {
 *     "subjectId": "S1",
 *     "type": "parcial",
 *     "filePath": "./pdfs/parcial-s1-2024.pdf",
 *     "period": "2024-1",       // optional
 *     "examDate": "2024-06-15", // optional, YYYY-MM-DD
 *     "notes": "..."            // optional
 *   }
 * ]
 *
 * All resources are inserted as published directly (no pending step).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { resources, subjects, users } from '../src/db/schema';
import { storage } from '../src/services/storage';

const entrySchema = z.object({
  subjectId: z.string().min(1),
  type:      z.enum(['resumen', 'parcial', 'final']),
  filePath:  z.string().min(1),
  period:    z.string().max(20).optional(),
  examDate:  z.string().date().optional(),
  notes:     z.string().optional(),
});

const manifestSchema = z.array(entrySchema).min(1);

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('Uso: bun bulk-upload <manifest.json>');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(resolve(manifestPath), 'utf-8'));
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('Manifest inválido:', parsed.error.issues);
    process.exit(1);
  }
  const entries = parsed.data;

  // Obtener el primer admin disponible para asignar como uploader
  const adminUser = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
  });
  if (!adminUser) {
    console.error('No se encontró ningún usuario admin. Ejecutar bun seed primero.');
    process.exit(1);
  }

  console.log(`Subiendo ${entries.length} recursos como ${adminUser.email}...`);

  let ok = 0;
  let failed = 0;

  for (const [i, entry] of entries.entries()) {
    const label = `[${i + 1}/${entries.length}] ${entry.filePath}`;
    try {
      // Verificar que la materia existe
      const subject = await db.query.subjects.findFirst({
        where: eq(subjects.id, entry.subjectId),
      });
      if (!subject) {
        console.error(`${label} — materia no encontrada: ${entry.subjectId}`);
        failed++;
        continue;
      }

      const fileBuffer = readFileSync(resolve(entry.filePath));
      const resourceId = crypto.randomUUID();
      const r2Key = `public/${entry.subjectId}/${resourceId}.pdf`;
      await storage.uploadFile(r2Key, fileBuffer, 'application/pdf');

      const typeLabel = entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
      const title = entry.period
        ? `${typeLabel} - ${subject.title} - ${entry.period}`
        : `${typeLabel} - ${subject.title}`;

      await db.insert(resources).values({
        id:          resourceId,
        subjectId:   entry.subjectId,
        uploadedBy:  adminUser.id,
        reviewedBy:  adminUser.id,
        title,
        type:        entry.type,
        status:      'published',
        r2Key,
        examDate:    entry.examDate  ?? null,
        period:      entry.period    ?? null,
        notes:       entry.notes     ?? null,
        publishedAt: new Date(),
      });

      console.log(`✓ ${label} → ${r2Key}`);
      ok++;
    } catch (err) {
      console.error(`✗ ${label} — error:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nListo: ${ok} subidos, ${failed} fallidos.`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
