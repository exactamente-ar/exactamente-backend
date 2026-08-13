import { and, eq } from 'drizzle-orm';
import { blogVotes } from '@/db/schema';
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
 */
export async function applyVote(
  tx: Tx,
  userId: string,
  targetType: 'post' | 'comment',
  targetId: string,
  value: number,
  updateScore: (delta: number) => Promise<number>,
): Promise<{ netScore: number; myVote: number }> {
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
