import { db } from '../src/db';
import { resources } from '../src/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { RESOURCES } from './data/resources';

// ─── Parsing ──────────────────────────────────────────────────────────────────

type Subtype = 'parcial' | 'recuperatorio' | 'prefinal' | 'parcialito';

function parseSubtype(title: string): Subtype {
  const t = title.toLowerCase();
  if (t.startsWith('recuperatorio')) return 'recuperatorio';
  if (t.startsWith('prefinal')) return 'prefinal';
  if (t.startsWith('parcialito')) return 'parcialito';
  return 'parcial';
}

// ─── Serialización ────────────────────────────────────────────────────────────

type ResourceEntry = (typeof RESOURCES)[number];

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
  if (r.type === 'parcial') {
    lines.push(`    subtype: '${parseSubtype(r.title)}' as const,`);
  }
  if ('examYear' in r && r.examYear) lines.push(`    examYear: ${r.examYear},`);
  if ('examMonth' in r && r.examMonth) lines.push(`    examMonth: ${r.examMonth},`);
  if ('topic' in r && r.topic) lines.push(`    topic: ${r.topic},`);
  lines.push(`    publishedAt: new Date('${r.publishedAt.toISOString()}'),`);
  return `  {\n${lines.join('\n')}\n  }`;
}

// ─── Paso A: actualizar DB ────────────────────────────────────────────────────

async function updateDB() {
  const rows = await db
    .select({ id: resources.id, title: resources.title })
    .from(resources)
    .where(and(eq(resources.type, 'parcial'), isNull(resources.subtype)));

  let updated = 0;
  for (const row of rows) {
    await db
      .update(resources)
      .set({ subtype: parseSubtype(row.title) })
      .where(eq(resources.id, row.id));
    updated++;
  }

  console.log(`✓ DB: ${updated}/${rows.length} registros de tipo parcial actualizados con subtype`);
}

// ─── Paso B: reescribir data/resources.ts ────────────────────────────────────

function rewriteResourcesFile() {
  const entries = RESOURCES.map(serializeEntry);

  const output =
    `// Generado por scripts/xlsx-to-ts.ts + scripts/migrate-drive-to-r2.ts + scripts/migrate-period.ts\n` +
    `// No editar manualmente\n\n` +
    `export const RESOURCES = [\n` +
    entries.join(',\n') +
    '\n' +
    `];\n`;

  const outPath = resolve('scripts/data/resources.ts');
  writeFileSync(outPath, output, 'utf-8');
  console.log(`✓ data/resources.ts reescrito con subtype para parciales`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

await updateDB();
rewriteResourcesFile();
