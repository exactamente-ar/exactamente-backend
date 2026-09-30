import { db } from '../src/db';
import { blogSubtopics } from '../src/db/schema';
import { MATERIAS_SISTEMAS } from './data/materias';
import { SUBTEMA_GENERAL, SUBTEMAS_POR_MATERIA } from './data/subtemas';
import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';

// Solo el plan actual de Ingeniería en Sistemas. El plan 2011 no tiene subtemas.
const PLAN_ID = 'C1P2024';

async function seedSubtemas() {
  console.log('🌱 Iniciando seed de subtemas...');

  const materiasPlan = MATERIAS_SISTEMAS.filter((m) => m.planId === PLAN_ID);

  if (materiasPlan.length === 0) {
    console.error(`❌ No hay materias del plan ${PLAN_ID} en scripts/data/materias.ts`);
    process.exit(1);
  }

  // Índice de materias ya sembradas en la BD (para dar mensajes útiles).
  const existing = await db.query.subjects.findMany({ columns: { id: true } });
  const knownIds = new Set(existing.map((s) => s.id));

  let generalCount = 0;
  let subtemaCount = 0;
  let missingCount = 0;

  for (const materia of materiasPlan) {
    const subtemas = SUBTEMAS_POR_MATERIA[materia.id];
    if (!subtemas || subtemas.length === 0) {
      console.warn(`⚠️  Sin subtemas definidos para ${materia.id} (${materia.title})`);
      missingCount++;
      continue;
    }

    if (!knownIds.has(materia.id)) {
      console.warn(
        `⚠️  La materia ${materia.id} (${materia.title}) no existe en la BD. ` +
          'Corré "bun run seed" primero.',
      );
      missingCount++;
      continue;
    }

    // 1. Asegurar el Subtema general. La migración 0010 lo crea solo para las
    //    materias que ya existían al migrar; si la materia se sembró después,
    //    no lo tiene y lo creamos acá.
    const generalExistente = await db.query.blogSubtopics.findFirst({
      where: and(eq(blogSubtopics.subjectId, materia.id), eq(blogSubtopics.isDefault, true)),
    });

    if (!generalExistente) {
      await db.insert(blogSubtopics).values({
        id: crypto.randomUUID(),
        subjectId: materia.id,
        name: SUBTEMA_GENERAL.name,
        slug: SUBTEMA_GENERAL.slug,
        isDefault: true,
      });
      generalCount++;
    }

    // 2. Insertar los subtemas específicos (idempotente vía unique subjectId+slug).
    for (const subtema of subtemas) {
      await db
        .insert(blogSubtopics)
        .values({
          id: crypto.randomUUID(),
          subjectId: materia.id,
          name: subtema.name,
          slug: subtema.slug,
          isDefault: false,
        })
        .onConflictDoNothing({ target: [blogSubtopics.subjectId, blogSubtopics.slug] });
      subtemaCount++;
    }
  }

  console.log('✅ Seed de subtemas completo');
  console.log(`   - ${generalCount} subtemas "General" creados`);
  console.log(`   - ${subtemaCount} subtemas específicos insertados (idempotente)`);
  if (missingCount > 0) {
    console.log(`   - ${missingCount} materias saltadas (sin subtemas o sin sembrar)`);
  }

  process.exit(0);
}

seedSubtemas().catch((err) => {
  console.error('❌ Error en el seed de subtemas:', err);
  process.exit(1);
});
