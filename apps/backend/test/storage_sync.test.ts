import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface StorageServiceInstance {
  init: () => Promise<void>;
  dispose: () => Promise<void>;
  docPutSync: (doc: any) => any;
  upsertConversation: (payload: any) => any;
  syncNow: () => Promise<any>;
  getStorageHealth: () => any;
  getOutboxQueueSize: () => number;
}

const { StorageService } = require('../src/storage_service.ts') as {
  StorageService: new (options: any) => StorageServiceInstance;
};

const createdServices: { service: StorageServiceInstance; tempDir: string }[] = [];

const createService = async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanft-storage-sync-'));
  const service = new StorageService({
    dataRoot: tempDir,
    legacyDocsPath: path.join(tempDir, 'documents.json'),
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

describe('storage sync', () => {
  it('stays sqlite-only when postgres is not configured', async () => {
    const service = await createService();
    service.upsertConversation({
      assistantCode: 'AI',
      conversationName: 'No Postgres',
      sessionData: { anywhere_history: true, CODE: 'AI', history: [], chat_show: [] },
    });

    const result = await service.syncNow();
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('sqlite-only');

    const health = service.getStorageHealth();
    expect(health.mode).toBe('sqlite-only');
    expect(health.postgresConfigured).toBe(false);
    expect(service.getOutboxQueueSize()).toBe(0);
  });

  it('queues writes in hybrid-offline mode when postgres is unreachable', async () => {
    const service = await createService();
    const saveConfigResult = service.docPutSync({
      _id: 'config',
      data: {
        config: {
          database: {
            postgresUrl: 'postgres://user:password@127.0.0.1:1/sanft',
          },
        },
      },
    });
    expect(saveConfigResult.ok).toBe(true);

    service.upsertConversation({
      assistantCode: 'AI',
      conversationName: 'Offline Queue',
      sessionData: { anywhere_history: true, CODE: 'AI', history: [], chat_show: [] },
    });

    const queueSizeBefore = service.getOutboxQueueSize();
    expect(queueSizeBefore).toBeGreaterThan(0);

    const syncResult = await service.syncNow();
    expect(syncResult.ok).toBe(false);

    const health = service.getStorageHealth();
    expect(health.mode).toBe('hybrid-offline');
    expect(health.postgresConfigured).toBe(true);
    expect(health.postgresConnected).toBe(false);
    expect(service.getOutboxQueueSize()).toBeGreaterThan(0);
  });

  it('applies remote conversation rows with last-write-wins and skips stale rows', async () => {
    const service = (await createService()) as any;

    const created = service.upsertConversation({
      conversationId: 'conv-sync-1',
      assistantCode: 'AI',
      conversationName: 'Local Name',
      sessionData: { anywhere_history: true, CODE: 'AI', history: [], chat_show: [] },
    });
    expect(created.ok).toBe(true);

    const initial = service.getConversation('conv-sync-1');
    const localUpdatedAt = new Date(initial.updatedAt).getTime();

    const staleRemote = service.normalizeConversationForSync({
      id: 'conv-sync-1',
      assistantCode: 'AI',
      conversationName: 'Remote Stale',
      sessionData: { anywhere_history: true, CODE: 'AI', history: [], chat_show: [] },
      updatedAt: localUpdatedAt - 5000,
      createdAt: new Date(initial.createdAt).getTime(),
      deletedAt: null,
    });
    const staleResult = service.applyRemoteConversation(staleRemote);
    expect(staleResult.applied).toBe(false);
    expect(staleResult.stale).toBe(true);
    expect(service.getConversation('conv-sync-1')?.conversationName).toBe('Local Name');

    const newerRemote = service.normalizeConversationForSync({
      id: 'conv-sync-1',
      assistantCode: 'AI',
      conversationName: 'Remote Newer',
      sessionData: { anywhere_history: true, CODE: 'AI', history: [], chat_show: [] },
      updatedAt: localUpdatedAt + 5000,
      createdAt: new Date(initial.createdAt).getTime(),
      deletedAt: null,
    });
    const newerResult = service.applyRemoteConversation(newerRemote);
    expect(newerResult.applied).toBe(true);
    expect(newerResult.stale).toBe(false);
    expect(service.getConversation('conv-sync-1')?.conversationName).toBe('Remote Newer');
  });

  it('uses stable hash tie-breaker for same-timestamp conflict comparisons', async () => {
    const service = (await createService()) as any;

    const left = service.normalizeConversationForSync({
      id: 'conv-sync-2',
      assistantCode: 'AI',
      conversationName: 'Alpha',
      sessionData: { anywhere_history: true, CODE: 'AI', history: [], chat_show: [] },
      updatedAt: 1735689600000,
      createdAt: 1735689590000,
      deletedAt: null,
    });
    const right = service.normalizeConversationForSync({
      id: 'conv-sync-2',
      assistantCode: 'AI',
      conversationName: 'Beta',
      sessionData: { anywhere_history: true, CODE: 'AI', history: [], chat_show: [] },
      updatedAt: 1735689600000,
      createdAt: 1735689590000,
      deletedAt: null,
    });

    const compareForward = service.compareConversationVersions(left, right);
    const compareBackward = service.compareConversationVersions(right, left);
    expect(compareForward).not.toBe(0);
    expect(compareBackward).toBe(compareForward * -1);
  });
});
