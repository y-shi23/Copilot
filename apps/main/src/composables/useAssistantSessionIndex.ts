// @ts-nocheck
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const toMillis = (rawValue: string) => {
  const ms = new Date(rawValue || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export function useAssistantSessionIndex(configRef: any) {
  const loading = ref(false);
  const errorMessage = ref('');
  const sessionMap = ref({});
  const isRefreshing = ref(false);
  let refreshDebounceTimer: number | null = null;
  let detachConversationsChangedListener: null | (() => void) = null;

  const enabledAssistants = computed(() => {
    const prompts = configRef.value?.prompts || {};
    const enabledList = Object.entries(prompts)
      .filter(([, prompt]: any) => prompt?.enable)
      .map(([code, prompt]: any) => ({
        code,
        icon: prompt?.icon || '',
      }));

    const assistantMap = new Map<string, any>();
    enabledList.forEach((assistant) => {
      assistantMap.set(String(assistant.code), assistant);
    });

    const configuredOrder = Array.isArray(configRef.value?.assistantOrder)
      ? configRef.value.assistantOrder
      : [];
    const orderedCodes: string[] = [];
    configuredOrder.forEach((rawCode: any) => {
      const code = String(rawCode || '').trim();
      if (!code || !assistantMap.has(code) || orderedCodes.includes(code)) return;
      orderedCodes.push(code);
    });

    const remainingCodes = enabledList
      .map((assistant) => String(assistant.code))
      .filter((code) => !orderedCodes.includes(code))
      .sort((a, b) => a.localeCompare(b));

    return [...orderedCodes, ...remainingCodes]
      .map((code) => assistantMap.get(code))
      .filter(Boolean);
  });

  const enabledAssistantCodeSet = computed(() => {
    return new Set(enabledAssistants.value.map((item) => String(item.code)));
  });

  const buildInitialMap = () => {
    const initial = {};
    enabledAssistants.value.forEach((assistant) => {
      initial[assistant.code] = [];
    });
    return initial;
  };

  const addSession = (
    targetMap: Record<string, any[]>,
    assistantCode: string,
    sessionItem: any,
  ) => {
    if (!targetMap[assistantCode]) {
      targetMap[assistantCode] = [];
    }
    targetMap[assistantCode].push(sessionItem);
  };

  const refreshIndex = async (options: any = {}) => {
    if (isRefreshing.value && !options.force) return;
    isRefreshing.value = true;
    loading.value = true;
    errorMessage.value = '';

    const nextMap = buildInitialMap();

    try {
      const enabledCodes = enabledAssistantCodeSet.value;
      const rows = await window.api.listConversations({ includeDeleted: false });
      const conversations = Array.isArray(rows) ? rows : [];

      for (const row of conversations) {
        const assistantCode = String(row?.assistantCode || '').trim();
        if (!assistantCode || !enabledCodes.has(assistantCode)) continue;

        const conversationId = String(row?.conversationId || '').trim();
        if (!conversationId) continue;

        addSession(nextMap, assistantCode, {
          id: conversationId,
          conversationId,
          assistantCode,
          conversationName: String(row?.conversationName || conversationId),
          preview: String(row?.preview || ''),
          size: Number(row?.size || 0),
          lastmod: String(row?.lastmod || row?.updatedAt || row?.createdAt || ''),
        });
      }

      Object.keys(nextMap).forEach((assistantCode) => {
        nextMap[assistantCode].sort((a, b) => {
          const diff = toMillis(b.lastmod) - toMillis(a.lastmod);
          if (diff !== 0) return diff;
          return String(a.conversationName || '').localeCompare(String(b.conversationName || ''));
        });
      });

      sessionMap.value = nextMap;
    } catch (error: any) {
      console.error('[SessionIndex] Failed to refresh index:', error);
      errorMessage.value = String(error?.message || error);
    } finally {
      loading.value = false;
      isRefreshing.value = false;
    }
  };

  const scheduleRefreshIndex = (force = false) => {
    if (refreshDebounceTimer) {
      window.clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = null;
    }
    refreshDebounceTimer = window.setTimeout(
      () => {
        refreshDebounceTimer = null;
        refreshIndex({ force }).catch((error) => {
          console.error('[SessionIndex] debounced refresh failed:', error);
        });
      },
      force ? 80 : 180,
    );
  };

  const loadSessionPayload = async (sessionItem: any) => {
    const conversationId = String(sessionItem?.conversationId || sessionItem?.id || '').trim();
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const detail = await window.api.getConversation(conversationId);
    if (!detail || typeof detail !== 'object' || !detail.sessionData) {
      throw new Error('Session payload is invalid');
    }

    const assistantCode = String(
      detail.assistantCode || detail.sessionData?.CODE || sessionItem?.assistantCode || '',
    ).trim();
    const conversationName = String(
      detail.conversationName || sessionItem?.conversationName || '',
    ).trim();
    const sessionData = JSON.parse(JSON.stringify(detail.sessionData || {}));
    sessionData.conversationId = conversationId;
    if (conversationName) {
      sessionData.conversationName = conversationName;
    }
    if (assistantCode) {
      sessionData.CODE = assistantCode;
    }

    return {
      conversationId,
      sessionData,
      conversationName,
      assistantCode,
    };
  };

  const sessionCountByAssistant = computed(() => {
    const result = {};
    enabledAssistants.value.forEach((assistant) => {
      result[assistant.code] = (sessionMap.value[assistant.code] || []).length;
    });
    return result;
  });

  watch(
    () =>
      JSON.stringify({
        assistants: enabledAssistants.value.map((item) => item.code),
        postgresUrl: configRef.value?.database?.postgresUrl || '',
      }),
    () => {
      refreshIndex().catch((error) => {
        console.error('[SessionIndex] auto refresh failed:', error);
      });
    },
    { immediate: true },
  );

  if (typeof window.api?.onConversationsChanged === 'function') {
    detachConversationsChangedListener = window.api.onConversationsChanged(() => {
      scheduleRefreshIndex(true);
    });
  }

  onBeforeUnmount(() => {
    if (refreshDebounceTimer) {
      window.clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = null;
    }
    if (typeof detachConversationsChangedListener === 'function') {
      detachConversationsChangedListener();
      detachConversationsChangedListener = null;
    }
  });

  return {
    loading,
    errorMessage,
    enabledAssistants,
    sessionMap,
    sessionCountByAssistant,
    refreshIndex,
    loadSessionPayload,
  };
}
