import { db } from '../src/db';
import {
  users,
  subjects,
  blogSubtopics,
  blogPosts,
  blogComments,
  blogVotes,
} from '../src/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import crypto from 'node:crypto';

// Configuraciones del seed
const SUBJECT_ID = 'A1C1M1'; // Introducción a la Programación 1

const FAKE_USERS = [
  { id: 'usr_seed_1', displayName: 'Estudiante Curioso', email: 'estudiante1@seed.com' },
  { id: 'usr_seed_2', displayName: 'Tutor Solidario', email: 'tutor@seed.com' },
  { id: 'usr_seed_3', displayName: 'Profesor X', email: 'profe@seed.com' },
  { id: 'usr_seed_4', displayName: 'Anónimo Fan', email: 'anon@seed.com' },
];

async function run() {
  console.log('🌱 Iniciando seed de Blogs...');

  // 1. Verificar si existe la materia
  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, SUBJECT_ID),
  });

  if (!subject) {
    console.error(
      `❌ La materia con ID ${SUBJECT_ID} no existe. Por favor corre "bun run seed" primero.`,
    );
    process.exit(1);
  }

  // 2. Insertar o actualizar usuarios falsos
  console.log('👤 Creando usuarios falsos...');
  for (const u of FAKE_USERS) {
    const existing = await db.query.users.findFirst({ where: eq(users.id, u.id) });
    if (!existing) {
      await db.insert(users).values({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: 'user',
        passwordHash: 'dummy',
        emailVerified: true,
      });
    }
  }

  // 3. Limpiar blogs existentes para esta materia (para que sea idempotente)
  console.log('🧹 Limpiando blogs anteriores de la materia...');
  const existingSubtopics = await db.query.blogSubtopics.findMany({
    where: eq(blogSubtopics.subjectId, SUBJECT_ID),
  });

  if (existingSubtopics.length > 0) {
    const subtopicIds = existingSubtopics.map((s) => s.id);

    const existingPosts = await db.query.blogPosts.findMany({
      where: inArray(blogPosts.subtopicId, subtopicIds),
    });
    const postIds = existingPosts.map((p) => p.id);

    if (postIds.length > 0) {
      await db
        .delete(blogVotes)
        .where(and(eq(blogVotes.targetType, 'post'), inArray(blogVotes.targetId, postIds)));
      await db
        .delete(blogVotes)
        .where(
          and(
            eq(blogVotes.targetType, 'comment'),
            inArray(
              blogVotes.targetId,
              db
                .select({ id: blogComments.id })
                .from(blogComments)
                .where(inArray(blogComments.postId, postIds)),
            ),
          ),
        );
      await db.delete(blogComments).where(inArray(blogComments.postId, postIds));
      await db.delete(blogPosts).where(inArray(blogPosts.id, postIds));
    }

    // No borramos el Subtema general que haya creado la migracion, pero borramos los demás
    await db
      .delete(blogSubtopics)
      .where(and(eq(blogSubtopics.subjectId, SUBJECT_ID), eq(blogSubtopics.isDefault, false)));
  }

  // 4. Crear subtemas
  console.log('🏷️ Creando subtemas...');
  let generalSubtopic = await db.query.blogSubtopics.findFirst({
    where: and(eq(blogSubtopics.subjectId, SUBJECT_ID), eq(blogSubtopics.isDefault, true)),
  });

  if (!generalSubtopic) {
    generalSubtopic = {
      id: crypto.randomUUID(),
      subjectId: SUBJECT_ID,
      name: 'Subtema general',
      slug: 'general',
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.insert(blogSubtopics).values(generalSubtopic);
  }

  const subDudas = {
    id: crypto.randomUUID(),
    subjectId: SUBJECT_ID,
    name: 'Dudas y Ejercicios',
    slug: 'dudas',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const subParciales = {
    id: crypto.randomUUID(),
    subjectId: SUBJECT_ID,
    name: 'Parciales y Finales',
    slug: 'parciales',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(blogSubtopics).values([subDudas, subParciales]);

  // 5. Crear posts
  console.log('📝 Creando posts y comentarios...');

  // Post 1: Duda general (Anónimo)
  const post1Id = crypto.randomUUID();
  await db.insert(blogPosts).values({
    id: post1Id,
    subjectId: SUBJECT_ID,
    subtopicId: subDudas.id,
    authorId: 'usr_seed_1',
    body: 'Alguien pudo resolver el ejercicio 4 del práctico 2? Me quedo trabado cuando pide iterar la pila sin perder los elementos.',
    authority: 'anonymous',
    status: 'published',
    netScore: 5,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // hace 2 dias
    updatedAt: new Date(),
  });

  // Votos Post 1
  await db.insert(blogVotes).values([
    {
      id: crypto.randomUUID(),
      userId: 'usr_seed_2',
      targetType: 'post',
      targetId: post1Id,
      value: 1,
      createdAt: new Date(),
    },
    {
      id: crypto.randomUUID(),
      userId: 'usr_seed_3',
      targetType: 'post',
      targetId: post1Id,
      value: 1,
      createdAt: new Date(),
    },
    {
      id: crypto.randomUUID(),
      userId: 'usr_seed_4',
      targetType: 'post',
      targetId: post1Id,
      value: 1,
      createdAt: new Date(),
    },
    // faltan 2 votos para llegar a 5, no importa es solo seed visual
  ]);

  // Comentarios Post 1
  const c1Id = crypto.randomUUID();
  await db.insert(blogComments).values({
    id: c1Id,
    postId: post1Id,
    parentId: null,
    authorId: 'usr_seed_2', // Tutor Solidario
    body: '¡Hola! La clave está en usar una pila auxiliar. Vas sacando de la principal, procesás, y lo metés en la auxiliar. Cuando terminás, pasás todo de la auxiliar a la principal de nuevo.',
    authority: 'visible',
    status: 'published',
    netScore: 10,
    depth: 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1), // hace 1 dia
    updatedAt: new Date(),
  });

  const c1_1Id = crypto.randomUUID();
  await db.insert(blogComments).values({
    id: c1_1Id,
    postId: post1Id,
    parentId: c1Id,
    authorId: 'usr_seed_1', // Estudiante Curioso
    body: 'Ahhh claro, qué boludo. ¡Mil gracias! Me salvaste.',
    authority: 'anonymous',
    status: 'published',
    netScore: 2,
    depth: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12), // hace 12 horas
    updatedAt: new Date(),
  });

  // Post 2: Parciales (Profe X)
  const post2Id = crypto.randomUUID();
  await db.insert(blogPosts).values({
    id: post2Id,
    subjectId: SUBJECT_ID,
    subtopicId: subParciales.id,
    authorId: 'usr_seed_3',
    body: 'Recordatorio a todos los alumnos: el parcial del sábado incluirá los temas hasta Arreglos Bidimensionales inclusive. No entrarán registros. Éxitos en el estudio.',
    authority: 'visible',
    status: 'published',
    netScore: 15,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5), // hace 5 horas
    updatedAt: new Date(),
  });

  // Post 3: General (Tutor)
  const post3Id = crypto.randomUUID();
  await db.insert(blogPosts).values({
    id: post3Id,
    subjectId: SUBJECT_ID,
    subtopicId: generalSubtopic.id,
    authorId: 'usr_seed_2',
    body: 'Les dejo el link a un apunte súper claro sobre modularización y pasaje de parámetros por valor y por referencia que armamos con los ayudantes. ¡Espero les sirva!',
    authority: 'visible',
    status: 'published',
    netScore: 8,
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // hace 30 minutos
    updatedAt: new Date(),
  });

  const c3Id = crypto.randomUUID();
  await db.insert(blogComments).values({
    id: c3Id,
    postId: post3Id,
    parentId: null,
    authorId: 'usr_seed_4',
    body: 'Esto era exactamente lo que necesitaba antes del recu. Groso!',
    authority: 'anonymous',
    status: 'published',
    netScore: 1,
    depth: 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 15), // hace 15 minutos
    updatedAt: new Date(),
  });

  // Post 4: Borrado por usuario
  const post4Id = crypto.randomUUID();
  await db.insert(blogPosts).values({
    id: post4Id,
    subjectId: SUBJECT_ID,
    subtopicId: subDudas.id,
    authorId: 'usr_seed_1',
    body: 'Gente cómo se declara una variable en Pascal??',
    authority: 'visible',
    status: 'deleted', // soft delete
    netScore: -2,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    updatedAt: new Date(),
  });

  const c4Id = crypto.randomUUID();
  await db.insert(blogComments).values({
    id: c4Id,
    postId: post4Id,
    parentId: null,
    authorId: 'usr_seed_4',
    body: 'Fijate en la filmina 1, literalmente es lo primero que enseñan...',
    authority: 'anonymous',
    status: 'published',
    netScore: 4,
    depth: 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
    updatedAt: new Date(),
  });

  console.log('✅ Seed de blogs completado con éxito!');
  console.log(`Podes ver el resultado en http://localhost:4321/A1C1M1/blog`);

  process.exit(0);
}

run().catch((e) => {
  console.error('❌ Error en el seed de blogs:', e);
  process.exit(1);
});
