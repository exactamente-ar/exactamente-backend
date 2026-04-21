import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDriveProvider } from '@/services/drive/local.provider';
import { FOLDER_MIME_TYPE } from '@/services/drive/types';

let tmpDir: string;
let provider: LocalDriveProvider;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'drive-test-'));
  provider = new LocalDriveProvider(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('getTree', () => {
  test('root is empty at depth=1 when no folders exist', async () => {
    const tree = await provider.getTree('', 1);
    expect(tree.id).toBe('');
    expect(tree.name).toBe('root');
    expect(tree.mimeType).toBe(FOLDER_MIME_TYPE);
    expect(tree.children).toEqual([]);
  });

  test('returns children at depth=1', async () => {
    await provider.createFolder('', 'FACET');
    await provider.createFolder('', 'FACS');
    const tree = await provider.getTree('', 1);
    expect(tree.children?.map(c => c.name)).toEqual(['FACET', 'FACS']);
  });

  test('stops at depth limit', async () => {
    await provider.createFolder('', 'A');
    await provider.createFolder('A', 'B');
    const tree = await provider.getTree('', 1);
    expect(tree.children![0].children).toBeUndefined();
  });

  test('depth=2 includes grandchildren', async () => {
    await provider.createFolder('', 'A');
    await provider.createFolder('A', 'B');
    const tree = await provider.getTree('', 2);
    expect(tree.children![0].children![0].name).toBe('B');
  });
});

describe('listFolder', () => {
  test('returns immediate children only', async () => {
    await provider.createFolder('', 'X');
    await provider.createFolder('X', 'Y');
    const list = await provider.listFolder('');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('X');
    expect(list[0].id).toBe('X');
  });

  test('nested folder has correct id', async () => {
    await provider.createFolder('', 'X');
    await provider.createFolder('X', 'Y');
    const list = await provider.listFolder('X');
    expect(list[0].id).toBe('X/Y');
  });
});

describe('createFolder', () => {
  test('creates folder and returns node', async () => {
    const node = await provider.createFolder('', 'NewDir');
    expect(node.id).toBe('NewDir');
    expect(node.name).toBe('NewDir');
    expect(node.mimeType).toBe(FOLDER_MIME_TYPE);
  });

  test('creates nested folder', async () => {
    await provider.createFolder('', 'Parent');
    const node = await provider.createFolder('Parent', 'Child');
    expect(node.id).toBe('Parent/Child');
  });
});

describe('renameFolder', () => {
  test('renames folder and returns new id', async () => {
    await provider.createFolder('', 'Old');
    const node = await provider.renameFolder('Old', 'New');
    expect(node.id).toBe('New');
    expect(node.name).toBe('New');
    const list = await provider.listFolder('');
    expect(list.map(n => n.name)).toContain('New');
    expect(list.map(n => n.name)).not.toContain('Old');
  });
});

describe('deleteFolder', () => {
  test('removes folder', async () => {
    await provider.createFolder('', 'ToDelete');
    await provider.deleteFolder('ToDelete');
    const list = await provider.listFolder('');
    expect(list.map(n => n.name)).not.toContain('ToDelete');
  });

  test('removes folder recursively', async () => {
    await provider.createFolder('', 'Parent');
    await provider.createFolder('Parent', 'Child');
    await provider.deleteFolder('Parent');
    const list = await provider.listFolder('');
    expect(list).toHaveLength(0);
  });
});
