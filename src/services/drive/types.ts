export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface DriveNode {
  id: string;
  name: string;
  mimeType: string;
  children?: DriveNode[];
}

export interface DriveService {
  /** Recursive tree from folderId up to `depth` levels. */
  getTree(folderId: string, depth: number): Promise<DriveNode>;
  /** List immediate children of a folder (1 level). */
  listFolder(folderId: string): Promise<DriveNode[]>;
  /** Create a new folder inside parentId. */
  createFolder(parentId: string, name: string): Promise<DriveNode>;
  /** Rename an existing folder. */
  renameFolder(folderId: string, name: string): Promise<DriveNode>;
  /** Delete a folder recursively. */
  deleteFolder(folderId: string): Promise<void>;
}
