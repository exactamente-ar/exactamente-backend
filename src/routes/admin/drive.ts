import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { verifyToken } from '@/middleware/auth';
import { requireRole } from '@/middleware/requireRole';
import { driveService } from '@/services/drive';
import { env } from '@/env';
import type { AppContext } from '@/types';

const app = new Hono<AppContext>();
const adminGuard = [verifyToken, requireRole('admin')] as const;

// GET /tree — árbol recursivo desde la raíz
const treeQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(5).default(2),
});

app.get('/tree', ...adminGuard, zValidator('query', treeQuerySchema), async (c) => {
  const { depth } = c.req.valid('query');
  const rootId = env.DRIVE_ROOT_FOLDER_ID ?? '';
  const tree = await driveService.getTree(rootId, depth);
  return c.json(tree);
});

// GET /folder/:folderId — contenido de una carpeta (1 nivel)
app.get('/folder/:folderId', ...adminGuard, async (c) => {
  const folderId = c.req.param('folderId');
  const children = await driveService.listFolder(folderId);
  return c.json(children);
});

// POST /folder — crear carpeta
const createFolderSchema = z.object({
  parentId: z.string().min(1),
  name:     z.string().min(1).max(255),
});

app.post('/folder', ...adminGuard, zValidator('json', createFolderSchema), async (c) => {
  const { parentId, name } = c.req.valid('json');
  const folder = await driveService.createFolder(parentId, name);
  return c.json(folder, 201);
});

// PATCH /folder/:folderId — renombrar carpeta
const renameFolderSchema = z.object({
  name: z.string().min(1).max(255),
});

app.patch('/folder/:folderId', ...adminGuard, zValidator('json', renameFolderSchema), async (c) => {
  const folderId = c.req.param('folderId');
  const { name } = c.req.valid('json');
  const folder = await driveService.renameFolder(folderId, name);
  return c.json(folder);
});

// DELETE /folder/:folderId — eliminar carpeta (no se puede eliminar la raíz)
app.delete('/folder/:folderId', ...adminGuard, async (c) => {
  const folderId = c.req.param('folderId');
  const rootId = env.DRIVE_ROOT_FOLDER_ID ?? '';
  if (rootId !== '' && folderId === rootId) {
    return c.json({ error: 'No se puede eliminar la carpeta raíz' }, 400);
  }
  await driveService.deleteFolder(folderId);
  return new Response(null, { status: 204 });
});

export default app;
