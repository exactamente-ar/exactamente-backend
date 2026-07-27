import * as xlsx from 'xlsx';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const MONTH_NAMES: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  sep: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
};

const MONTH_PATTERN = Object.keys(MONTH_NAMES)
  .sort((a, b) => b.length - a.length)
  .join('|');
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

function parseSubtype(title: string): string {
  const t = title.toLowerCase();
  if (t.startsWith('recuperatorio')) return 'recuperatorio';
  if (t.startsWith('prefinal')) return 'prefinal';
  if (t.startsWith('parcialito')) return 'parcialito';
  return 'parcial';
}

const SHEET_TYPE_MAP: Record<string, string> = {
  Parciales: 'parcial',
  Finales: 'final',
  Resumenes: 'resumen',
};

function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/file\/d\/([^/?]+)/);
  return match ? match[1] : null;
}

function parsePlanId(args: string[]): string | null {
  const idx = args.indexOf('--planId');
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const xlsxPath = args[0];
  if (!xlsxPath) {
    console.error('Uso: bun scripts/xlsx-to-ts.ts /ruta/al/archivo.xlsx [--planId <id>]');
    process.exit(1);
  }

  const planId = parsePlanId(process.argv.slice(2));

  const workbook = xlsx.readFile(resolve(xlsxPath));
  const entries: string[] = [];
  let total = 0;
  const skipped: string[] = [];

  for (const [sheetName, type] of Object.entries(SHEET_TYPE_MAP)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.warn(`⚠️  Hoja "${sheetName}" no encontrada, saltando...`);
      continue;
    }

    const rows = xlsx.utils.sheet_to_json<Record<string, string>>(sheet);

    for (const row of rows) {
      const idMateria = (row['idMateria'] ?? '').trim();
      const title = (row['title'] ?? '').trim();
      const urlDrive = (row['urlDrive'] ?? '').trim();

      if (!idMateria || !title || !urlDrive) {
        skipped.push(`[${sheetName}] fila con datos incompletos: ${JSON.stringify(row)}`);
        continue;
      }

      const driveFileId = extractDriveFileId(urlDrive);
      if (!driveFileId) {
        skipped.push(`[${sheetName}] URL de Drive inválida en "${title}": ${urlDrive}`);
        continue;
      }

      const id = crypto.randomUUID();
      const parsed = parseFromTitle(title);
      const subtypeField =
        type === 'parcial' ? `    subtype: '${parseSubtype(title)}' as const,\n` : '';
      const optionalFields =
        subtypeField +
        (parsed.examYear ? `    examYear: ${parsed.examYear},\n` : '') +
        (parsed.examMonth ? `    examMonth: ${parsed.examMonth},\n` : '') +
        (parsed.topic ? `    topic: ${parsed.topic},\n` : '');
      entries.push(
        `  {\n` +
          `    id: '${id}',\n` +
          `    subjectId: '${idMateria}',\n` +
          `    uploadedBy: 'SEED_ADMIN',\n` +
          `    title: ${JSON.stringify(title)},\n` +
          `    type: '${type}' as const,\n` +
          `    status: 'published' as const,\n` +
          `    driveFileId: '${driveFileId}',\n` +
          optionalFields +
          `    publishedAt: new Date('2024-01-01'),\n` +
          `  }`,
      );
      total++;
    }
  }

  if (skipped.length > 0) {
    console.warn('\n⚠️  Filas saltadas:');
    skipped.forEach((s) => console.warn(' -', s));
  }

  const planComment = planId ? `// Plan: ${planId}\n` : '';
  const output =
    `// Generado automáticamente por scripts/xlsx-to-ts.ts\n` +
    `// No editar manualmente — regenerar desde el Excel original\n` +
    planComment +
    `\n` +
    `export const RESOURCES = [\n` +
    entries.join(',\n') +
    '\n' +
    `];\n`;

  const outPath = resolve('scripts/data/resources.ts');
  writeFileSync(outPath, output, 'utf-8');
  console.log(`\n✅ ${total} recursos generados en scripts/data/resources.ts`);
}

main();
