import { blogComments, blogImages, blogPosts } from '@/db/schema';
import { storage } from '@/services/storage';

export type PostRow = typeof blogPosts.$inferSelect;
export type CommentRow = typeof blogComments.$inferSelect;
export type BlogImageRow = typeof blogImages.$inferSelect;

const DELETED_BODY = '[Eliminado]';

export function commentToResponse(
  comment: CommentRow,
  authorName: string | null,
  images: BlogImageRow[],
  userId: string | null,
  myVote = 0,
) {
  const deleted = comment.status === 'deleted';
  return {
    id: comment.id,
    postId: comment.postId,
    parentId: comment.parentId,
    body: deleted ? DELETED_BODY : comment.body,
    authority: comment.authority,
    status: comment.status,
    netScore: comment.netScore,
    depth: comment.depth,
    createdAt: comment.createdAt.toISOString(),
    author:
      deleted || comment.authority === 'anonymous'
        ? null
        : authorName
          ? { name: authorName }
          : null,
    images: deleted
      ? []
      : images.map((img) => ({ id: img.id, url: storage.getPublicUrl(img.r2Key) })),
    mine: userId !== null && userId === comment.authorId,
    myVote,
  };
}

export function postToResponse(
  post: PostRow,
  authorName: string | null,
  images: BlogImageRow[],
  comments: {
    row: CommentRow;
    authorName: string | null;
    images: BlogImageRow[];
    myVote: number;
  }[],
  userId: string | null,
  myVote = 0,
) {
  const deleted = post.status === 'deleted';
  return {
    id: post.id,
    subtopicId: post.subtopicId,
    body: deleted ? DELETED_BODY : post.body,
    authority: post.authority,
    status: post.status,
    netScore: post.netScore,
    createdAt: post.createdAt.toISOString(),
    author:
      deleted || post.authority === 'anonymous' ? null : authorName ? { name: authorName } : null,
    images: deleted
      ? []
      : images.map((img) => ({ id: img.id, url: storage.getPublicUrl(img.r2Key) })),
    comments: comments.map((c) =>
      commentToResponse(c.row, c.authorName, c.images, userId, c.myVote),
    ),
    mine: userId !== null && userId === post.authorId,
    myVote,
  };
}
