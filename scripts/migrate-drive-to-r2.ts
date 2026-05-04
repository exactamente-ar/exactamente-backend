import { db } from '../src/db';
import { resources } from '../src/db/schema';
import { storage } from '../src/services/storage';
import { eq } from 'drizzle-orm';
import { RESOURCES } from './data/resources';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type MigrationResult = {
  id: string;
  driveFileId: string;
  status: 'migrated' | 'skipped' | 'deleted' | 'failed';
  r2Key?: string;
  reason?: string;
};

type DownloadResult =
  | { ok: true;  buffer: Buffer; mimeType: string; ext: string }
  | { ok: false; reason: 'not_found' | 'access_denied' | 'unknown_mime'; detail?: string };

// ─── Constantes ───────────────────────────────────────────────────────────────

const FAKE_IDS = new Set([
  '1TUDAI_TD1C2M2_guia_sql',
  '1TUDAI_TD2C1M1_guia_rest',
  '1TUDAI_TD3C1M3_guia_jest',
]);

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
};

// ─── Utilidades ───────────────────────────────────────────────────────────────

const DELAY_MS = 1000;

function detectMime(buf: Buffer): { mime: string; ext: string } | null {
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) // %PDF
    return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) // JPEG
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) // PNG
    return { mime: 'image/png', ext: 'png' };
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) // WEBP
    return { mime: 'image/webp', ext: 'webp' };
  return null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Descarga desde Drive ─────────────────────────────────────────────────────

async function downloadFromDrive(driveFileId: string, retries = 3): Promise<DownloadResult> {
  // &confirm=t bypassa virus scan warning sin necesidad de parsear HTML
  const url = `https://drive.google.com/uc?export=download&confirm=t&id=${driveFileId}`;
  const res = await fetch(url, { redirect: 'follow' });

  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (!res.ok) return { ok: false, reason: 'access_denied', detail: `HTTP ${res.status}` };

  const contentType = res.headers.get('content-type') ?? '';

  // Si sigue devolviendo HTML a pesar de &confirm=t → rate-limiting/captcha
  if (contentType.includes('text/html')) {
    if (retries > 0) {
      const wait = (4 - retries) * 2000; // 2s, 4s, 6s
      await sleep(wait);
      return downloadFromDrive(driveFileId, retries - 1);
    }
    return { ok: false, reason: 'access_denied', detail: 'HTML tras reintentos' };
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  // Detectar tipo por magic bytes (Drive suele devolver application/octet-stream)
  const detected = detectMime(buffer);
  const headerMime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  const mimeType = detected?.mime ?? (MIME_TO_EXT[headerMime] ? headerMime : null);
  const ext = detected?.ext ?? MIME_TO_EXT[headerMime];

  if (!mimeType || !ext) return { ok: false, reason: 'unknown_mime', detail: headerMime };

  return { ok: true, buffer, mimeType, ext };
}

// ─── Migración por recurso ────────────────────────────────────────────────────

async function migrateResource(
  resource: { id: string; driveFileId: string; subjectId: string }
): Promise<MigrationResult> {
  const { id, driveFileId, subjectId } = resource;

  // 1. Skip idempotente
  const row = await db.query.resources.findFirst({
    where: eq(resources.id, id),
    columns: { r2Key: true },
  });
  if (row?.r2Key) return { id, driveFileId, status: 'skipped', r2Key: row.r2Key };

  // 2. IDs falsos conocidos
  if (FAKE_IDS.has(driveFileId)) {
    await db.delete(resources).where(eq(resources.id, id));
    return { id, driveFileId, status: 'deleted', reason: 'ID falso' };
  }

  // 3. Descarga desde Drive
  let download: DownloadResult;
  try {
    download = await downloadFromDrive(driveFileId);
  } catch (err) {
    return { id, driveFileId, status: 'failed', reason: `Red: ${err}` };
  }

  if (!download.ok) {
    if (download.reason === 'not_found') {
      // 404 real → eliminar de DB (el archivo ya no existe en Drive)
      await db.delete(resources).where(eq(resources.id, id));
      return { id, driveFileId, status: 'deleted', reason: '404 en Drive' };
    }
    // Acceso denegado o MIME desconocido → failed (no borrar, requiere revisión)
    return { id, driveFileId, status: 'failed', reason: `${download.reason}: ${download.detail ?? ''}` };
  }

  const { buffer, mimeType, ext } = download;

  // 4. Upload a R2 con MIME y extensión reales
  const r2Key = `public/${subjectId}/${id}.${ext}`;
  try {
    await storage.uploadFile(r2Key, buffer, mimeType);
  } catch (err) {
    return { id, driveFileId, status: 'failed', reason: `R2 upload: ${err}` };
  }

  // 5. Actualizar DB
  await db.update(resources)
    .set({ r2Key, updatedAt: new Date() })
    .where(eq(resources.id, id));

  return { id, driveFileId, status: 'migrated', r2Key };
}

// ─── Reescritura de resources.ts ─────────────────────────────────────────────

async function rewriteResourcesFile(results: MigrationResult[]) {
  const deletedIds = new Set(results.filter(r => r.status === 'deleted').map(r => r.id));
  const r2ByID    = new Map(results.filter(r => r.r2Key).map(r => [r.id, r.r2Key!]));

  const surviving = (RESOURCES as any[]).filter((r: any) => !deletedIds.has(r.id));

  const lines = [
    '// Generado por scripts/xlsx-to-ts.ts + scripts/migrate-drive-to-r2.ts',
    '// No editar manualmente',
    '',
    'export const RESOURCES = [',
  ];

  for (const r of surviving) {
    const r2Key = r2ByID.get(r.id) ?? `public/${r.subjectId}/${r.id}.pdf`;
    lines.push(`  {`);
    lines.push(`    id: '${r.id}',`);
    lines.push(`    subjectId: '${r.subjectId}',`);
    lines.push(`    uploadedBy: '${r.uploadedBy}',`);
    lines.push(`    title: ${JSON.stringify(r.title)},`);
    lines.push(`    type: '${r.type}' as const,`);
    lines.push(`    status: '${r.status}' as const,`);
    lines.push(`    r2Key: '${r2Key}',`);
    lines.push(`    publishedAt: new Date('${r.publishedAt.toISOString()}'),`);
    lines.push(`  },`);
  }

  lines.push('];');
  lines.push('');

  const outPath = new URL('./data/resources.ts', import.meta.url).pathname;
  await Bun.write(outPath, lines.join('\n'));
  console.log(`✍️  resources.ts reescrito: ${surviving.length} entradas (${deletedIds.size} eliminadas)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function checkR2() {
  const testKey = `migration-test-${Date.now()}.txt`;
  await storage.uploadFile(testKey, Buffer.from('ok', 'utf-8'), 'text/plain');
  await storage.deleteFile(testKey);
}

async function main() {
  console.log('🔌 Verificando conexión R2...');
  try {
    await checkR2();
    console.log('✅ R2 OK\n');
  } catch (err) {
    console.error(`❌ R2 no disponible: ${err}`);
    console.error('Verificá R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME en .env');
    process.exit(1);
  }

  console.log(`📋 Recursos a procesar: ${RESOURCES.length}`);
  console.log('');

  const results: MigrationResult[] = [];

  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.replace('--limit=', '') ?? '0') || RESOURCES.length;
  const toProcess = RESOURCES.slice(0, limit);
  console.log(limit < RESOURCES.length ? `🔬 Smoke test: ${limit} de ${RESOURCES.length}\n` : '');

  for (let i = 0; i < toProcess.length; i++) {
    process.stdout.write(`\r⏳ ${i + 1}/${toProcess.length}...`);
    results.push(await migrateResource(toProcess[i] as any));
    if (i < toProcess.length - 1) await sleep(DELAY_MS);
  }

  console.log('\n');

  const byStatus = (s: string) => results.filter(r => r.status === s);
  const migrated = byStatus('migrated');
  const skipped  = byStatus('skipped');
  const deleted  = byStatus('deleted');
  const failed   = byStatus('failed');

  console.log('═══════════════════════════════════════');
  console.log('📊 RESULTADO DE MIGRACIÓN');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Migrados:   ${migrated.length}`);
  console.log(`⏭️  Skipped:    ${skipped.length}`);
  console.log(`🗑️  Eliminados: ${deleted.length}`);
  console.log(`⚠️  Fallidos:   ${failed.length}`);
  console.log(`📋 Total:      ${results.length}`);

  if (failed.length > 0) {
    console.log('\n⚠️  FALLIDOS:');
    for (const f of failed) console.log(`  - ${f.id} (${f.driveFileId}): ${f.reason}`);
  }

  if (deleted.length > 0) {
    console.log('\n🗑️  ELIMINADOS:');
    for (const d of deleted) console.log(`  - ${d.id} (${d.driveFileId}): ${d.reason}`);
  }

  const logPath = `scripts/migration-log-${Date.now()}.json`;
  await Bun.write(logPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Log guardado en ${logPath}`);

  if (failed.length === 0) {
    await rewriteResourcesFile(results);
  } else {
    console.log('\n⚠️  resources.ts NO reescrito — hay fallidos. Re-ejecutar para reintentar.');
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
