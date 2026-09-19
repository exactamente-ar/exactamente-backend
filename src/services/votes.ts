import { and, eq } from 'drizzle-orm';
import { blogComments, blogPosts, blogVotes } from '@/db/schema';
import type { db } from '@/db';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Toggle atómico de un voto (AD-5 / addendum). Corre dentro de una transacción
 * y delega en `updateScore` el incremento del net_score de la entidad votada
 * (posts o comentarios).
 *
 * Semántica:
 * - Sin voto previo → inserta y suma `value`.
 * - Mismo valor → elimina el voto (quita) y resta `value`.
 * - Valor opuesto → cambia y ajusta el delta.
 *
 * Antes de leer el voto, lockea la fila del target (`SELECT … FOR UPDATE`).
 * Sin ese lock, dos votos casi simultáneos del mismo usuario sobre el mismo
 * target (doble click o retry del cliente) ven ambos `!existing` y el segundo
 * insert viola `blog_votes_user_target_unique` → 500. Con la fila lockeada, el
 * segundo espera a que el primero commitee y ve el voto ya insertado.
 */
export async function applyVote(
  tx: Tx,
  userId: string,
  targetType: 'post' | 'comment',
  targetId: string,
  value: number,
  updateScore: (delta: number) => Promise<number>,
): Promise<{ netScore: number; myVote: number }> {
  if (targetType === 'post') {
    await tx
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.id, targetId))
      .for('update');
  } else {
    await tx
      .select({ id: blogComments.id })
      .from(blogComments)
      .where(eq(blogComments.id, targetId))
      .for('update');
  }

  const existing = await tx.query.blogVotes.findFirst({
    where: and(
      eq(blogVotes.userId, userId),
      eq(blogVotes.targetType, targetType),
      eq(blogVotes.targetId, targetId),
    ),
  });

  let delta: number;
  let myVote: number;
  if (!existing) {
    await tx.insert(blogVotes).values({
      id: crypto.randomUUID(),
      userId,
      targetType,
      targetId,
      value,
    });
    delta = value;
    myVote = value;
  } else if (existing.value === value) {
    await tx.delete(blogVotes).where(eq(blogVotes.id, existing.id));
    delta = -value;
    myVote = 0;
  } else {
    await tx.update(blogVotes).set({ value }).where(eq(blogVotes.id, existing.id));
    delta = value - existing.value;
    myVote = value;
  }

  const netScore = await updateScore(delta);
  return { netScore, myVote };
}
