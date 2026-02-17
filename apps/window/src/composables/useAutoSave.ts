// @ts-nocheck

export function useAutoSave(options: any) {
  const { refs, getSessionDataAsObject, debounceMs = 1800, fallbackMs = 60000 } = options;
  const {
    loading,
    currentConfig,
    CODE,
    chat_show,
    defaultConversationName,
    currentConversationId,
    isSessionDirty,
    hasSessionInitialized,
  } = refs;

  let autoSaveInterval: any = null;
  let autoSaveDebounceTimer: any = null;
  let autoSaveInFlight = false;
  let autoSaveQueued = false;
  let autoSaveInFlightPromise: Promise<any> | null = null;
  let titleGenerationInFlight: Promise<string> | null = null;

  const hasAtLeastOneValidRound = () => {
    const list = Array.isArray(chat_show.value) ? chat_show.value : [];
    if (!list.length) return false;

    let seenUser = false;
    for (const message of list) {
      const role = String(message?.role || '').toLowerCase();
      if (role !== 'user' && role !== 'assistant') continue;

      const content = message?.content;
      const hasContent =
        (typeof content === 'string' && content.trim().length > 0) ||
        (Array.isArray(content) && content.length > 0);
      if (!hasContent) continue;

      if (role === 'user') {
        seenUser = true;
      } else if (role === 'assistant' && seenUser) {
        return true;
      }
    }

    return false;
  };

  const ensureGeneratedConversationName = async () => {
    if (defaultConversationName.value) return defaultConversationName.value;
    if (!hasAtLeastOneValidRound()) return '';

    if (!titleGenerationInFlight) {
      titleGenerationInFlight = (async () => {
        try {
          if (typeof window.api.generateConversationTitle !== 'function') {
            return '新对话';
          }
          const result = await window.api.generateConversationTitle({
            sessionData: getSessionDataAsObject(),
            language: String(
              currentConfig.value?.language || localStorage.getItem('language') || '',
            ),
            fallbackModelKey: String(currentConfig.value?.quickModel || ''),
          });
          const title = String(result?.title || '').trim() || '新对话';
          defaultConversationName.value = title;
          return title;
        } catch (error) {
          console.error('Generate conversation title failed:', error);
          defaultConversationName.value = '新对话';
          return '新对话';
        } finally {
          titleGenerationInFlight = null;
        }
      })();
    }

    return await titleGenerationInFlight;
  };

  const autoSaveSession = async ({ force = false } = {}) => {
    if (!force && loading.value) {
      return;
    }
    if (!force && !isSessionDirty.value) {
      return;
    }

    const promptConfig = currentConfig.value?.prompts?.[CODE.value];
    const isAutoSaveConfigEnabled = promptConfig?.autoSaveChat ?? true;

    if (!defaultConversationName.value && hasAtLeastOneValidRound()) {
      await ensureGeneratedConversationName();
    }

    if (!isAutoSaveConfigEnabled && !currentConversationId.value) {
      return;
    }

    if (!defaultConversationName.value) {
      return;
    }

    try {
      const sessionData = getSessionDataAsObject();
      const result = await window.api.upsertConversation({
        conversationId: currentConversationId.value || sessionData.conversationId || '',
        conversationName: defaultConversationName.value,
        assistantCode: CODE.value,
        sessionData,
      });
      if (result?.conversationId) {
        currentConversationId.value = result.conversationId;
      }
      isSessionDirty.value = false;
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  };

  const flushAutoSave = async (force = false) => {
    if (autoSaveInFlight) {
      autoSaveQueued = true;
      if (force && autoSaveInFlightPromise) {
        await autoSaveInFlightPromise;
        if (isSessionDirty.value) {
          await flushAutoSave(true);
        }
      }
      return;
    }

    if (!force && !isSessionDirty.value) return;

    autoSaveInFlight = true;
    autoSaveInFlightPromise = autoSaveSession({ force });
    try {
      await autoSaveInFlightPromise;
    } finally {
      autoSaveInFlight = false;
      autoSaveInFlightPromise = null;
      if (autoSaveQueued) {
        autoSaveQueued = false;
        if (isSessionDirty.value) {
          scheduleAutoSave({ immediate: true });
        }
      }
    }
  };

  const scheduleAutoSave = (options: any = {}) => {
    const immediate = options.immediate === true;
    if (autoSaveDebounceTimer) {
      clearTimeout(autoSaveDebounceTimer);
      autoSaveDebounceTimer = null;
    }

    if (immediate) {
      void flushAutoSave(options.force === true);
      return;
    }

    autoSaveDebounceTimer = setTimeout(() => {
      autoSaveDebounceTimer = null;
      void flushAutoSave();
    }, debounceMs);
  };

  const markSessionDirty = () => {
    if (!hasSessionInitialized.value) return;
    isSessionDirty.value = true;
    scheduleAutoSave();
  };

  const startAutoSaveFallback = () => {
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
    }
    autoSaveInterval = setInterval(() => {
      if (isSessionDirty.value) {
        void flushAutoSave();
      }
    }, fallbackMs);
  };

  const stopAutoSave = () => {
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
      autoSaveInterval = null;
    }
    if (autoSaveDebounceTimer) {
      clearTimeout(autoSaveDebounceTimer);
      autoSaveDebounceTimer = null;
    }
    titleGenerationInFlight = null;
    autoSaveInFlightPromise = null;
  };

  return {
    scheduleAutoSave,
    markSessionDirty,
    flushAutoSave,
    startAutoSaveFallback,
    stopAutoSave,
  };
}
