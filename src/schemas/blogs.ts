import { z } from 'zod/v4';
import { IsoDateTime } from './common';

/**
 * Subtema del blog de una materia. `isDefault` marca el "Subtema general",
 * que existe siempre y no se puede borrar (FR-2).
 */
export const BlogSubtopicSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    isDefault: z.boolean(),
  })
  .meta({ id: 'BlogSubtopic' });

/**
 * Autoría proyectada de un post o comentario. `null` significa "Anónimo": el
 * autor real existe en la base (`author_id`) pero no se expone por data
 * governance (FR-10).
 */
export const BlogAuthorSchema = z
  .object({
    name: z.string(),
  })
  .meta({ id: 'BlogAuthor' });

export const BlogPostImageSchema = z
  .object({
    id: z.string(),
    url: z.string(),
  })
  .meta({ id: 'BlogPostImage' });

export const BlogCommentImageSchema = z
  .object({
    id: z.string(),
    url: z.string(),
  })
  .meta({ id: 'BlogCommentImage' });

/** Comentario anidado de un post. `parentId` null = comentario raíz. */
export const BlogCommentSchema = z
  .object({
    id: z.string(),
    postId: z.string(),
    parentId: z.string().nullable(),
    body: z.string(),
    authority: z.enum(['visible', 'anonymous']),
    status: z.enum(['published', 'deleted']),
    netScore: z.number().int(),
    depth: z.number().int(),
    createdAt: IsoDateTime,
    author: BlogAuthorSchema.nullable(),
    images: z.array(BlogCommentImageSchema),
    mine: z.boolean().describe('true si el token actual es el autor'),
    myVote: z.number().int().describe('voto del token actual: 1, -1 o 0'),
  })
  .meta({ id: 'BlogComment' });

/**
 * Post del blog. `authority` es `visible` o `anonymous` (FR-10); `status` es
 * `published` o `deleted` (soft delete, AD-2). `comments` viene plano (con
 * `parentId`) para que el cliente arme el árbol.
 */
export const BlogPostSchema = z
  .object({
    id: z.string(),
    subtopicId: z.string(),
    body: z.string(),
    authority: z.enum(['visible', 'anonymous']),
    status: z.enum(['published', 'deleted']),
    netScore: z.number().int(),
    createdAt: IsoDateTime,
    author: BlogAuthorSchema.nullable(),
    images: z.array(BlogPostImageSchema),
    comments: z.array(BlogCommentSchema),
    mine: z.boolean().describe('true si el token actual es el autor'),
    myVote: z.number().int().describe('voto del token actual: 1, -1 o 0'),
  })
  .meta({ id: 'BlogPost' });

/** Respuesta de `GET /blogs/:subjectId`. */
export const BlogResponseSchema = z
  .object({
    subjectId: z.string(),
    subtopics: z.array(BlogSubtopicSchema),
    posts: z.array(BlogPostSchema),
  })
  .meta({ id: 'BlogResponse' });

/** Respuesta de votar un post o comentario. `myVote` es 1, -1 o 0 (sin voto). */
export const BlogVoteResponseSchema = z
  .object({
    netScore: z.number().int(),
    myVote: z.number().int(),
  })
  .meta({ id: 'BlogVoteResponse' });

/**
 * Ítem de la actividad global del panel admin (moderación). Une posts y
 * comentarios; `type` distingue, `postId` es el post padre en los comentarios.
 * El contenido `deleted` llega enmascarado (`[Eliminado]` / author null).
 */
export const BlogActivityItemSchema = z
  .object({
    id: z.string(),
    type: z.enum(['post', 'comment']),
    subjectId: z.string(),
    subjectTitle: z.string(),
    postId: z.string().nullable(),
    body: z.string(),
    authority: z.enum(['visible', 'anonymous']),
    status: z.enum(['published', 'deleted']),
    createdAt: IsoDateTime,
    author: BlogAuthorSchema.nullable(),
  })
  .meta({ id: 'BlogActivityItem' });

export const BlogActivityResponseSchema = z
  .object({
    data: z.array(BlogActivityItemSchema),
  })
  .meta({ id: 'BlogActivityResponse' });

/** Listado de subtemas de un blog para el panel admin. */
export const BlogSubtopicListSchema = z
  .object({
    subtopics: z.array(BlogSubtopicSchema),
  })
  .meta({ id: 'BlogSubtopicList' });

export type BlogSubtopic = z.infer<typeof BlogSubtopicSchema>;
export type BlogPost = z.infer<typeof BlogPostSchema>;
export type BlogResponse = z.infer<typeof BlogResponseSchema>;
export type BlogVoteResponse = z.infer<typeof BlogVoteResponseSchema>;
export type BlogComment = z.infer<typeof BlogCommentSchema>;
export type BlogActivityItem = z.infer<typeof BlogActivityItemSchema>;
