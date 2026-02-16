import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface StorageServiceInstance {
  init: () => Promise<void>;
  dispose: () => Promise<void>;
  docGetSync: (id: string) => any;
  docPutSync: (doc: any) => any;
  docRemoveSync: (id: string) => any;
  runLegacyMigrations: () => Promise<void>;
}

const { StorageService } = require('../src/storage_service.ts') as {
  StorageService: new (options: any) => StorageServiceInstance;
};

const createdServices: { service: StorageServiceInstance; tempDir: string }[] = [];

const createTempDir = () => {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sanft-storage-docs-'));
};

const createService = async (options: { legacyDocsPath?: string } = {}) => {
  const tempDir = createTempDir();
  const legacyDocsPath = options.legacyDocsPath || path.join(tempDir, 'documents.json');
  const service = new StorageService({
    dataRoot: tempDir,
    legacyDocsPath,
  });
  await service.init();
  createdServices.push({ service, tempDir });
  return service;
};

afterEach(async () => {
  while (createdServices.length > 0) {
    const item = createdServices.pop();
    try {
      await item?.service.dispose();
    } catch {
      // ignore
    }
    try {
      fs.rmSync(String(item?.tempDir || ''), { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('storage docs', () => {
  it('supports put/get/remove with _rev conflict checks', async () => {
    const service = await createService();

    const first = service.docPutSync({
      _id: 'config',
      data: { config: { database: { postgresUrl: '' } } },
    });
    expect(first.ok).toBe(true);
    expect(typeof first.rev).toBe('string');

    const loaded = service.docGetSync('config');
    expect(loaded?._id).toBe('config');
    expect(loaded?._rev).toBe(first.rev);

    const conflict = service.docPutSync({
      _id: 'config',
      _rev: '1-deadbeef',
      data: { config: { database: { postgresUrl: 'postgres://invalid' } } },
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.name).toBe('conflict');

    const removed = service.docRemoveSync('config');
    expect(removed.ok).toBe(true);
    expect(service.docGetSync('config')).toBeNull();
  });

  it('migrates legacy docs once and remains idempotent', async () => {
    const tempDir = createTempDir();
    const legacyDocsPath = path.join(tempDir, 'documents.json');
    fs.writeFileSync(
      legacyDocsPath,
      JSON.stringify(
        {
          config: {
            _id: 'config',
            _rev: '2-legacyrev',
            data: {
              config: {
                language: 'zh',
                database: { postgresUrl: '' },
              },
            },
          },
          prompts: {
            _id: 'prompts',
            _rev: '1-prompts',
            data: {
              AI: { enable: true, type: 'over', prompt: 'hello', model: '0|gpt-4o' },
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const service = new StorageService({
      dataRoot: tempDir,
      legacyDocsPath,
    });
    await service.init();
    createdServices.push({ service, tempDir });

    const configBefore = service.docGetSync('config');
    const promptsBefore = service.docGetSync('prompts');
    expect(configBefore?._id).toBe('config');
    expect(promptsBefore?._id).toBe('prompts');

    await service.runLegacyMigrations();

    const configAfter = service.docGetSync('config');
    const promptsAfter = service.docGetSync('prompts');
    expect(configAfter?._rev).toBe(configBefore?._rev);
    expect(promptsAfter?._rev).toBe(promptsBefore?._rev);
  });
});
