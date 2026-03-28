import { db } from '../src/db';
import {
  universities,
  faculties,
  careers,
  subjects,
  careerSubjects,
  subjectPrerequisites,
} from '../src/db/schema';
import { MATERIAS_SISTEMAS } from './data/materias';
import { carreras } from './data/carreras';
import { slugify } from '../src/utils/slugify';

async function seed() {
  console.log('🌱 Iniciando seed...');

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

  // 4. Materias (deduplicar por ID — la misma materia no se repite aunque
  //    aparezca en múltiples carreras)
  const uniqueSubjects = new Map<string, typeof MATERIAS_SISTEMAS[number]>();
  for (const m of MATERIAS_SISTEMAS) {
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

  // 5. career_subjects — cada materia con su carrera
  for (const materia of MATERIAS_SISTEMAS) {
    await db.insert(careerSubjects).values({
      careerId: materia.idCarrer,
      subjectId: materia.id,
      year: materia.year,
      quadmester: materia.quadmester,
    }).onConflictDoNothing();
  }
  console.log(`✓ ${MATERIAS_SISTEMAS.length} relaciones carrera-materia insertadas`);

  // 6. Prerequisitos
  let prereqCount = 0;
  for (const materia of MATERIAS_SISTEMAS) {
    for (const requiredId of materia.required) {
      await db.insert(subjectPrerequisites).values({
        subjectId: materia.id,
        requiredId,
      }).onConflictDoNothing();
      prereqCount++;
    }
  }
  console.log(`✓ ${prereqCount} prerequisitos insertados`);

  console.log('✅ Seed completo');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Error en seed:', err);
  process.exit(1);
});
