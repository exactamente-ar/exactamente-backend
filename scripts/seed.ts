import { db } from '../src/db';
import {
  universities,
  faculties,
  careers,
  careerPlans,
  subjects,
  careerSubjects,
  subjectPrerequisites,
  users,
  resources,
} from '../src/db/schema';
import { MATERIAS_SISTEMAS, MATERIAS_TUDAI } from './data/materias';
import { carreras } from './data/carreras';
import { planes } from './data/planes';
import { slugify } from '../src/utils/slugify';
import { hashPassword } from '../src/services/auth.service';

let RESOURCES: typeof import('./data/resources').RESOURCES = [];
try {
  RESOURCES = (await import('./data/resources')).RESOURCES;
} catch {
  // archivo no generado todavía, se saltea el seed de resources
}

async function seed() {
  console.log('🌱 Iniciando seed...');

  // 0. Seed admin user
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    console.error('❌ SEED_ADMIN_PASSWORD debe estar definida y tener al menos 12 caracteres.');
    process.exit(1);
  }

  await db.insert(users).values({
    id: 'SEED_ADMIN',
    email: 'admin@exactamente.app',
    passwordHash: await hashPassword(adminPassword),
    displayName: 'Admin Seed',
    role: 'superadmin',
  }).onConflictDoNothing();
  console.log('✓ Usuario admin insertado');

  // 1. Universidad
  await db.insert(universities).values({
    id: 'UNICEN',
    name: 'Universidad Nacional del Centro de la Provincia de Buenos Aires',
    slug: 'unicen',
  }).onConflictDoNothing();
  console.log('✓ Universidad insertada');

  // 2. Facultad
  await db.insert(faculties).values({
    id: 'FACET',
    universityId: 'UNICEN',
    name: 'Facultad de Ciencias Exactas',
    slug: 'exactas',
  }).onConflictDoNothing();
  console.log('✓ Facultad insertada');

  // 3. Carreras
  for (const carrera of carreras) {
    await db.insert(careers).values({
      id: carrera.id,
      facultyId: 'FACET',
      name: carrera.name,
      slug: slugify(carrera.name),
    }).onConflictDoNothing();
  }
  console.log(`✓ ${carreras.length} carreras insertadas`);

  // 3.5. Planes de carrera
  for (const plan of planes) {
    await db.insert(careerPlans).values(plan).onConflictDoNothing();
  }
  console.log(`✓ ${planes.length} planes insertados`);

  // 4. Materias (deduplicar por ID — la misma materia no se repite aunque
  //    aparezca en múltiples carreras)
  const ALL_MATERIAS = [...MATERIAS_SISTEMAS, ...MATERIAS_TUDAI];
  const uniqueSubjects = new Map<string, typeof ALL_MATERIAS[number]>();
  for (const m of ALL_MATERIAS) {
    if (!uniqueSubjects.has(m.id)) uniqueSubjects.set(m.id, m);
  }

  for (const materia of uniqueSubjects.values()) {
    await db.insert(subjects).values({
      id: materia.id,
      facultyId: 'FACET',
      title: materia.title,
      slug: slugify(materia.title),
      description: materia.description,
      urlMoodle: materia.urlMoodle ?? '',
      urlPrograma: materia.urlPrograma ?? '',
      year: materia.year,
      quadmester: materia.quadmester,
    }).onConflictDoNothing();
  }
  console.log(`✓ ${uniqueSubjects.size} materias insertadas`);

  // 5. career_subjects — cada materia con su carrera y plan
  for (const materia of ALL_MATERIAS) {
    await db.insert(careerSubjects).values({
      careerId: materia.idCarrer,
      planId: materia.planId,
      subjectId: materia.id,
      year: materia.year,
      quadmester: materia.quadmester,
    }).onConflictDoNothing();
  }
  console.log(`✓ ${ALL_MATERIAS.length} relaciones carrera-plan-materia insertadas`);

  // 6. Prerequisitos
  let prereqCount = 0;
  for (const materia of ALL_MATERIAS) {
    for (const requiredId of materia.required) {
      await db.insert(subjectPrerequisites).values({
        subjectId: materia.id,
        requiredId,
      }).onConflictDoNothing();
      prereqCount++;
    }
  }
  console.log(`✓ ${prereqCount} prerequisitos insertados`);

  // 7. Resources — solo los que tienen un subjectId que existe en la BD
  if (RESOURCES.length > 0) {
    const knownSubjectIds = new Set(uniqueSubjects.keys());
    const validResources = RESOURCES.filter(r => knownSubjectIds.has(r.subjectId));
    const skippedCount = RESOURCES.length - validResources.length;

    for (const resource of validResources) {
      await db.insert(resources).values(resource).onConflictDoNothing();
    }
    console.log(`✓ ${validResources.length} resources insertados`);
    if (skippedCount > 0) {
      console.log(`⚠️  ${skippedCount} resources ignorados (subjectId no existe — plan anterior pendiente)`);
    }
  } else {
    console.log('⚠️  Sin resources (ejecutá xlsx-to-ts primero si tenés el Excel)');
  }

  console.log('✅ Seed completo');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Error en seed:', err);
  process.exit(1);
});
