import { db } from '../src/db';
import { resources } from '../src/db/schema';
import { isNull, eq } from 'drizzle-orm';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { RESOURCES } from './data/resources';

// ─── Parsing ──────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, sep: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

const MONTH_PATTERN = Object.keys(MONTH_NAMES).sort((a, b) => b.length - a.length).join('|');
const MONTH_RE = new RegExp(`\\b(${MONTH_PATTERN})\\b`, 'i');

function parseFromTitle(title: string): { examYear?: number; examMonth?: number; topic?: number } {
  const result: { examYear?: number; examMonth?: number; topic?: number } = {};

  const yearMatch = title.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) result.examYear = parseInt(yearMatch[1], 10);

  const monthMatch = title.match(MONTH_RE);
  if (monthMatch) {
    const month = MONTH_NAMES[monthMatch[1].toLowerCase()];
    if (month) result.examMonth = month;
  }

  const topicMatch = title.match(/\bTema\s+([1-5])\b/i);
  if (topicMatch) result.topic = parseInt(topicMatch[1], 10);

  return result;
}

// ─── Serialización ────────────────────────────────────────────────────────────

type ResourceEntry = typeof RESOURCES[number] & {
  examYear?: number;
  examMonth?: number;
  topic?: number;
};

function serializeEntry(r: ResourceEntry): string {
  const lines = [
    `    id: '${r.id}',`,
    `    subjectId: '${r.subjectId}',`,
    `    uploadedBy: '${r.uploadedBy}',`,
    `    title: ${JSON.stringify(r.title)},`,
    `    type: '${r.type}' as const,`,
    `    status: '${r.status}' as const,`,
    `    r2Key: '${r.r2Key}',`,
  ];
  if (r.examYear)  lines.push(`    examYear: ${r.examYear},`);
  if (r.examMonth) lines.push(`    examMonth: ${r.examMonth},`);
  if (r.topic)     lines.push(`    topic: ${r.topic},`);
  lines.push(`    publishedAt: new Date('${r.publishedAt.toISOString()}'),`);
  return `  {\n${lines.join('\n')}\n  }`;
}

// ─── Paso A: actualizar DB ────────────────────────────────────────────────────

async function updateDB() {
  const rows = await db.select({
    id: resources.id,
    title: resources.title,
  }).from(resources).where(isNull(resources.examYear));

  let updated = 0;
  for (const row of rows) {
    const parsed = parseFromTitle(row.title);
    if (!parsed.examYear) continue;

    await db.update(resources)
      .set({
        examYear:  parsed.examYear  ?? null,
        examMonth: parsed.examMonth ?? null,
        topic:     parsed.topic     ?? null,
      })
      .where(eq(resources.id, row.id));
    updated++;
  }

  const noYear = rows.length - updated;
  console.log(`✓ DB: ${updated}/${rows.length} registros actualizados (${noYear} sin año — recursos sin fecha en título)`);
}

// ─── Paso B: reescribir data/resources.ts ────────────────────────────────────

function rewriteResourcesFile() {
  const entries = RESOURCES.map((r) => {
    const parsed = parseFromTitle(r.title);
    return serializeEntry({ ...r, ...parsed });
  });

  const output =
    `// Generado por scripts/xlsx-to-ts.ts + scripts/migrate-drive-to-r2.ts + scripts/migrate-period.ts\n` +
    `// No editar manualmente\n\n` +
    `export const RESOURCES = [\n` +
    entries.join(',\n') + '\n' +
    `];\n`;

  const outPath = resolve('scripts/data/resources.ts');
  writeFileSync(outPath, output, 'utf-8');
  console.log(`✓ data/resources.ts reescrito con campos parseados`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

await updateDB();
rewriteResourcesFile();
