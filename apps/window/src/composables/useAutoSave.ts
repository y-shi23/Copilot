// @ts-nocheck

export function useAutoSave(options: any) {
  const {
    refs,
    messageStore,
    getSessionDataAsObject,
    debounceMs = 1800,
    fallbackMs = 60000,
    onConversationPersisted,
  } = options;
  const {
    loading,
    currentConfig,
    CODE,
    defaultConversationName,
    currentConversationId,
    isSessionDirty,
    hasSessionInitialized,
  } = refs;

  const FALLBACK_CONVERSATION_TITLE = '新对话';
  let autoSaveInterval: any = null;
  let autoSaveDebounceTimer: any = null;
  let autoSaveInFlight = false;
  let autoSaveQueued = false;
  let autoSaveInFlightPromise: Promise<any> | null = null;
  let titleGenerationInFlight: Promise<string> | null = null;
  let shouldGenerateTitleFromFallback = false;
  let lastPersistedConversationId = '';
  let lastPersistedConversationName = '';

  const buildSerializableSessionData = () => {
    try {
      const source = getSessionDataAsObject();
      return JSON.parse(JSON.stringify(source));
    } catch (error) {
      console.error('Failed to serialize session data for auto-save:', error);
      return null;
    }
  };

  const getVisibleMessages = () => {
    if (messageStore?.visibleMessages?.value && Array.isArray(messageStore.visibleMessages.value)) {
      return messageStore.visibleMessages.value;
    }
    const snapshot = buildSerializableSessionData();
    if (Array.isArray(snapshot?.chat_show)) return snapshot.chat_show;
    return [];
  };

  const hasMessageContent = (message: any) => {
    const content = message?.content;
    return (
      (typeof content === 'string' && content.trim().length > 0) ||
      (Array.isArray(content) && content.length > 0)
    );
  };

  const hasAtLeastOneUserMessage = () => {
    const list = getVisibleMessages();
    if (!list.length) return false;

    return list.some((message) => {
      const role = String(message?.role || '').toLowerCase();
      if (role !== 'user') return false;
      return hasMessageContent(message);
    });
  };

  const hasAtLeastOneValidRound = () => {
    const list = getVisibleMessages();
    if (!list.length) return false;

    let seenUser = false;
    for (const message of list) {
      const role = String(message?.role || '').toLowerCase();
      if (role !== 'user' && role !== 'assistant') continue;

      if (!hasMessageContent(message)) continue;

      if (role === 'user') {
        seenUser = true;
      } else if (role === 'assistant' && seenUser) {
        return true;
      }
    }

    return false;
  };

  const ensureGeneratedConversationName = async (options: any = {}) => {
    const force = options.force === true;
    if (!force && defaultConversationName.value) return defaultConversationName.value;
    if (!hasAtLeastOneValidRound()) return '';

    if (!titleGenerationInFlight) {
      titleGenerationInFlight = (async () => {
        try {
          if (typeof window.api.generateConversationTitle !== 'function') {
            defaultConversationName.value = FALLBACK_CONVERSATION_TITLE;
            return FALLBACK_CONVERSATION_TITLE;
          }
          const serializableSessionData = buildSerializableSessionData();
          if (!serializableSessionData) {
            defaultConversationName.value = FALLBACK_CONVERSATION_TITLE;
            return FALLBACK_CONVERSATION_TITLE;
          }
          const result = await window.api.generateConversationTitle({
            sessionData: serializableSessionData,
            language: String(
              currentConfig.value?.language || localStorage.getItem('language') || '',
            ),
            fallbackModelKey: String(currentConfig.value?.quickModel || ''),
          });
          const title = String(result?.title || '').trim() || FALLBACK_CONVERSATION_TITLE;
          defaultConversationName.value = title;
          return title;
        } catch (error) {
          console.error('Generate conversation title failed:', error);
          defaultConversationName.value = FALLBACK_CONVERSATION_TITLE;
          return FALLBACK_CONVERSATION_TITLE;
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
    const hasUserMessage = hasAtLeastOneUserMessage();
    const hasValidRound = hasAtLeastOneValidRound();
    const shouldCreateFirstConversation =
      !currentConversationId.value && hasUserMessage && !defaultConversationName.value;

    if (hasValidRound && (!defaultConversationName.value || shouldGenerateTitleFromFallback)) {
      await ensureGeneratedConversationName({ force: shouldGenerateTitleFromFallback });
      shouldGenerateTitleFromFallback = false;
    }

    let conversationNameToSave = String(defaultConversationName.value || '').trim();
    if (!conversationNameToSave && hasUserMessage) {
      conversationNameToSave = FALLBACK_CONVERSATION_TITLE;
      defaultConversationName.value = conversationNameToSave;
      shouldGenerateTitleFromFallback = !hasValidRound;
    }

    if (
      !isAutoSaveConfigEnabled &&
      !currentConversationId.value &&
      !shouldCreateFirstConversation
    ) {
      return;
    }

    if (!conversationNameToSave) {
      return;
    }

    try {
      const sessionData = buildSerializableSessionData();
      if (!sessionData) {
        return;
      }
      if (!sessionData?.conversationName) {
        sessionData.conversationName = conversationNameToSave;
      }
      const result = await window.api.upsertConversation({
        conversationId: currentConversationId.value || sessionData.conversationId || '',
        conversationName: conversationNameToSave,
        assistantCode: CODE.value,
        sessionData,
      });

      const nextConversationId = String(
        result?.conversationId || currentConversationId.value || sessionData.conversationId || '',
      ).trim();
      const nextConversationName = String(
        result?.conversationName || defaultConversationName.value || conversationNameToSave,
      ).trim();

      if (result?.conversationId) {
        currentConversationId.value = result.conversationId;
      }
      if (nextConversationName) {
        defaultConversationName.value = nextConversationName;
      }

      if (
        typeof onConversationPersisted === 'function' &&
        nextConversationId &&
        nextConversationName &&
        (nextConversationId !== lastPersistedConversationId ||
          nextConversationName !== lastPersistedConversationName)
      ) {
        lastPersistedConversationId = nextConversationId;
        lastPersistedConversationName = nextConversationName;
        onConversationPersisted({
          conversationId: nextConversationId,
          conversationName: nextConversationName,
          assistantCode: CODE.value,
        });
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
    if (!currentConversationId.value && !defaultConversationName.value) {
      lastPersistedConversationId = '';
      lastPersistedConversationName = '';
      shouldGenerateTitleFromFallback = false;
    }
    if (
      !currentConversationId.value &&
      !defaultConversationName.value &&
      hasAtLeastOneUserMessage()
    ) {
      scheduleAutoSave({ immediate: true, force: true });
      return;
    }
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
    shouldGenerateTitleFromFallback = false;
  };

  return {
    scheduleAutoSave,
    markSessionDirty,
    flushAutoSave,
    startAutoSaveFallback,
    stopAutoSave,
  };
}
