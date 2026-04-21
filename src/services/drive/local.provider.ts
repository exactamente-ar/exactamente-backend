import { mkdir, readdir, rename as fsRename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { FOLDER_MIME_TYPE } from './types';
import type { DriveService, DriveNode } from './types';

export class LocalDriveProvider implements DriveService {
  constructor(private root: string) {}

  private resolve(id: string): string {
    return id === '' ? this.root : join(this.root, id);
  }

  async getTree(folderId: string, depth: number): Promise<DriveNode> {
    await mkdir(this.resolve(folderId), { recursive: true });
    return this.buildNode(folderId, depth);
  }

  private async buildNode(id: string, depth: number): Promise<DriveNode> {
    const name = id === '' ? 'root' : id.split('/').at(-1)!;
    const node: DriveNode = { id, name, mimeType: FOLDER_MIME_TYPE };
    if (depth > 0) {
      const entries = await readdir(this.resolve(id), { withFileTypes: true });
      node.children = await Promise.all(
        entries
          .filter(e => e.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(e => this.buildNode(id === '' ? e.name : `${id}/${e.name}`, depth - 1)),
      );
    }
    return node;
  }

  async listFolder(folderId: string): Promise<DriveNode[]> {
    const entries = await readdir(this.resolve(folderId), { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({
        id: folderId === '' ? e.name : `${folderId}/${e.name}`,
        name: e.name,
        mimeType: FOLDER_MIME_TYPE,
      }));
  }

  async createFolder(parentId: string, name: string): Promise<DriveNode> {
    const id = parentId === '' ? name : `${parentId}/${name}`;
    await mkdir(this.resolve(id), { recursive: true });
    return { id, name, mimeType: FOLDER_MIME_TYPE };
  }

  async renameFolder(folderId: string, name: string): Promise<DriveNode> {
    const parts = folderId.split('/');
    parts[parts.length - 1] = name;
    const newId = parts.join('/');
    await fsRename(this.resolve(folderId), this.resolve(newId));
    return { id: newId, name, mimeType: FOLDER_MIME_TYPE };
  }

  async deleteFolder(folderId: string): Promise<void> {
    await rm(this.resolve(folderId), { recursive: true, force: true });
  }
}
