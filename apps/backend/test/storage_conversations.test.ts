import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface StorageServiceInstance {
  init: () => Promise<void>;
  dispose: () => Promise<void>;
  upsertConversation: (payload: any) => any;
  listConversations: (filter?: any) => any[];
  getConversation: (conversationId: string) => any;
  renameConversation: (conversationId: string, conversationName: string) => any;
  deleteConversations: (ids: string[]) => any;
  cleanConversations: (days: number) => any;
  runMutation: (sql: string, params?: any[]) => void;
}

const { StorageService } = require('../src/storage_service.ts') as {
  StorageService: new (options: any) => StorageServiceInstance;
};

const createdServices: { service: StorageServiceInstance; tempDir: string }[] = [];

const createService = async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanft-storage-conv-'));
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

describe('storage conversations', () => {
  it('supports upsert/list/get/rename/delete', async () => {
    const service = await createService();
    const sessionData = {
      anywhere_history: true,
      CODE: 'AI',
      history: [{ role: 'system', content: 'test' }],
      chat_show: [{ role: 'user', content: 'hello' }],
    };

    const upsertResult = service.upsertConversation({
      assistantCode: 'AI',
      conversationName: 'Session A',
      sessionData,
    });
    expect(upsertResult.ok).toBe(true);
    expect(typeof upsertResult.conversationId).toBe('string');

    const conversationId = upsertResult.conversationId;
    const listResult = service.listConversations();
    expect(listResult.length).toBe(1);
    expect(listResult[0].conversationId).toBe(conversationId);
    expect(listResult[0].conversationName).toBe('Session A');

    const detail = service.getConversation(conversationId);
    expect(detail?.assistantCode).toBe('AI');
    expect(detail?.sessionData?.anywhere_history).toBe(true);

    const renameResult = service.renameConversation(conversationId, 'Session B');
    expect(renameResult.ok).toBe(true);
    expect(service.getConversation(conversationId)?.conversationName).toBe('Session B');

    const deleteResult = service.deleteConversations([conversationId]);
    expect(deleteResult.ok).toBe(true);
    expect(deleteResult.deletedCount).toBe(1);
    expect(service.listConversations().length).toBe(0);
  });

  it('cleans conversations older than cutoff', async () => {
    const service = await createService();
    const recent = service.upsertConversation({
      assistantCode: 'AI',
      conversationName: 'Recent',
      sessionData: { anywhere_history: true, CODE: 'AI', history: [], chat_show: [] },
    });
    const old = service.upsertConversation({
      assistantCode: 'AI',
      conversationName: 'Old',
      sessionData: { anywhere_history: true, CODE: 'AI', history: [], chat_show: [] },
    });

    const oldTimestamp = Date.now() - 45 * 24 * 60 * 60 * 1000;
    service.runMutation('UPDATE conversations SET updated_at = ? WHERE id = ?;', [
      oldTimestamp,
      old.conversationId,
    ]);

    const cleanResult = service.cleanConversations(30);
    expect(cleanResult.ok).toBe(true);
    expect(cleanResult.deletedCount).toBe(1);

    const visibleRows = service.listConversations();
    expect(visibleRows.length).toBe(1);
    expect(visibleRows[0].conversationId).toBe(recent.conversationId);
  });
});
