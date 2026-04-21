import { google } from 'googleapis';
import { FOLDER_MIME_TYPE } from './types';
import type { DriveService, DriveNode } from './types';

export class DriveApiProvider implements DriveService {
  private drive;

  constructor(credentials: object) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async getTree(folderId: string, depth: number): Promise<DriveNode> {
    return this.buildNode(folderId, depth);
  }

  private async buildNode(folderId: string, depth: number): Promise<DriveNode> {
    const { data } = await this.drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType',
    });
    const node: DriveNode = {
      id: data.id!,
      name: data.name!,
      mimeType: data.mimeType!,
    };
    if (depth > 0) {
      const children = await this.listFolder(folderId);
      const folders = children.filter(c => c.mimeType === FOLDER_MIME_TYPE);
      node.children = await Promise.all(folders.map(f => this.buildNode(f.id, depth - 1)));
    }
    return node;
  }

  async listFolder(folderId: string): Promise<DriveNode[]> {
    const { data } = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType)',
      orderBy: 'name',
      pageSize: 1000,
    });
    return (data.files ?? []).map(f => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
    }));
  }

  async createFolder(parentId: string, name: string): Promise<DriveNode> {
    const { data } = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME_TYPE,
        parents: [parentId],
      },
      fields: 'id,name,mimeType',
    });
    return { id: data.id!, name: data.name!, mimeType: data.mimeType! };
  }

  async renameFolder(folderId: string, name: string): Promise<DriveNode> {
    const { data } = await this.drive.files.update({
      fileId: folderId,
      requestBody: { name },
      fields: 'id,name,mimeType',
    });
    return { id: data.id!, name: data.name!, mimeType: data.mimeType! };
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.drive.files.delete({ fileId: folderId });
  }
}
