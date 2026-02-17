// @ts-nocheck
import { buildMessageSignature } from '../utils/sessionSignature';

const IDEMPOTENCY_WINDOW_MS = 10 * 1000;

const stableJson = (value: any) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const body = keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',');
  return `{${body}}`;
};

const buildSessionSnapshotSignature = (sessionData: any) => {
  const safe = sessionData || {};
  const history = Array.isArray(safe.history) ? safe.history : [];
  const chatShow = Array.isArray(safe.chat_show) ? safe.chat_show : [];
  const lastHistorySignature = history.length
    ? buildMessageSignature(history[history.length - 1])
    : '';
  const lastChatShowSignature = chatShow.length
    ? buildMessageSignature(chatShow[chatShow.length - 1])
    : '';

  return stableJson({
    anywhere_history: !!safe.anywhere_history,
    CODE: String(safe.CODE || ''),
    conversationName: String(safe.conversationName || ''),
    basic_msg: safe.basic_msg || null,
    selectedVoice: safe.selectedVoice || null,
    model: String(safe.model || ''),
    currentPromptConfigModel: String(safe.currentPromptConfig?.model || ''),
    isAutoApproveTools: !!safe.isAutoApproveTools,
    activeMcpServerIds: Array.isArray(safe.activeMcpServerIds) ? safe.activeMcpServerIds : [],
    activeSkillIds: Array.isArray(safe.activeSkillIds) ? safe.activeSkillIds : [],
    historyLength: history.length,
    chatShowLength: chatShow.length,
    lastHistorySignature,
    lastChatShowSignature,
  });
};

const makeIdempotencyKey = (
  assistantCode: string,
  conversationName: string,
  snapshotSignature: string,
) => {
  return stableJson({
    assistantCode: String(assistantCode || ''),
    conversationName: String(conversationName || ''),
    snapshotSignature: String(snapshotSignature || ''),
  });
};

export function useConversationPersistenceCoordinator(options: any) {
  const { refs, getSessionDataAsObject, onConversationPersisted } = options;

  const { CODE, defaultConversationName, currentConversationId, isSessionDirty } = refs;

  let inFlightPromise: Promise<any> | null = null;
  let queuedRequest: any = null;
  let lastPersistedSignature = '';
  let lastIdempotencyKey = '';
  let lastIdempotencyAt = 0;

  const getSessionSnapshot = () => {
    const source = getSessionDataAsObject();
    return JSON.parse(JSON.stringify(source || {}));
  };

  const applyPersistedMeta = (result: any = {}, fallback: any = {}) => {
    const nextConversationId = String(
      result?.conversationId || fallback?.conversationId || currentConversationId.value || '',
    ).trim();
    const nextConversationName = String(
      result?.conversationName || fallback?.conversationName || defaultConversationName.value || '',
    ).trim();

    if (nextConversationId) {
      currentConversationId.value = nextConversationId;
    }
    if (nextConversationName) {
      defaultConversationName.value = nextConversationName;
    }

    return {
      conversationId: nextConversationId,
      conversationName: nextConversationName,
    };
  };

  const doPersist = async (request: any) => {
    const sessionData = request?.sessionData || getSessionSnapshot();
    const assistantCode = String(request?.assistantCode || CODE.value || sessionData?.CODE || 'AI');
    const conversationName = String(
      request?.conversationName ||
        defaultConversationName.value ||
        sessionData?.conversationName ||
        '新对话',
    ).trim();

    sessionData.conversationName = conversationName;
    sessionData.CODE = assistantCode;
    if (currentConversationId.value) {
      sessionData.conversationId = String(currentConversationId.value);
    }

    const snapshotSignature = buildSessionSnapshotSignature(sessionData);
    const conversationId = String(
      request?.conversationId || currentConversationId.value || sessionData?.conversationId || '',
    ).trim();

    const skipWhenUnchanged = request?.skipWhenUnchanged !== false;
    if (skipWhenUnchanged && conversationId && snapshotSignature === lastPersistedSignature) {
      return {
        ok: true,
        unchanged: true,
        deduped: true,
        conversationId,
        conversationName,
        assistantCode,
        skipped: true,
      };
    }

    const now = Date.now();
    const idempotencyKey = makeIdempotencyKey(assistantCode, conversationName, snapshotSignature);
    const canReuseRecentKey =
      !conversationId &&
      idempotencyKey === lastIdempotencyKey &&
      now - lastIdempotencyAt <= IDEMPOTENCY_WINDOW_MS;

    const payload = {
      conversationId,
      conversationName,
      assistantCode,
      sessionData,
      idempotencyKey,
      idempotencyAt: now,
    };

    if (canReuseRecentKey) {
      payload.conversationId = String(currentConversationId.value || payload.conversationId || '');
    }

    const result = await window.api.upsertConversation(payload);
    const applied = applyPersistedMeta(result, {
      conversationId: payload.conversationId,
      conversationName,
    });

    if (result?.ok) {
      lastPersistedSignature = snapshotSignature;
      lastIdempotencyKey = idempotencyKey;
      lastIdempotencyAt = now;
      isSessionDirty.value = false;
      if (typeof onConversationPersisted === 'function' && applied.conversationId) {
        onConversationPersisted({
          conversationId: applied.conversationId,
          conversationName: applied.conversationName,
          assistantCode,
        });
      }
    }

    return {
      ...result,
      conversationId: applied.conversationId || result?.conversationId || '',
      conversationName: applied.conversationName || result?.conversationName || '',
      assistantCode,
    };
  };

  const drainQueue = async () => {
    let lastResult: any = null;
    while (queuedRequest) {
      const next = queuedRequest;
      queuedRequest = null;
      lastResult = await doPersist(next);
    }
    return lastResult;
  };

  const persistConversation = async (request: any = {}) => {
    if (inFlightPromise) {
      queuedRequest = {
        ...queuedRequest,
        ...request,
        skipWhenUnchanged: request?.skipWhenUnchanged ?? queuedRequest?.skipWhenUnchanged ?? true,
      };
      return inFlightPromise;
    }

    inFlightPromise = (async () => {
      try {
        const result = await doPersist(request);
        await drainQueue();
        return result;
      } finally {
        inFlightPromise = null;
      }
    })();

    return inFlightPromise;
  };

  const syncConversationMeta = (meta: any = {}) => {
    const nextId = String(meta?.conversationId || '').trim();
    const nextName = String(meta?.conversationName || '').trim();
    if (nextId) {
      currentConversationId.value = nextId;
    }
    if (nextName) {
      defaultConversationName.value = nextName;
    }
  };

  const markSnapshotPersisted = (sessionData: any) => {
    const signature = buildSessionSnapshotSignature(sessionData || getSessionSnapshot());
    lastPersistedSignature = signature;
  };

  return {
    persistConversation,
    syncConversationMeta,
    markSnapshotPersisted,
  };
}
