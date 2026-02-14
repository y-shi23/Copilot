// @ts-nocheck

export function useAutoSave(options: any) {
  const { refs, getSessionDataAsObject, debounceMs = 1800, fallbackMs = 60000 } = options;
  const {
    loading,
    currentConfig,
    CODE,
    chat_show,
    defaultConversationName,
    isSessionDirty,
    hasSessionInitialized,
  } = refs;

  let autoSaveInterval: any = null;
  let autoSaveDebounceTimer: any = null;
  let autoSaveInFlight = false;
  let autoSaveQueued = false;
  let autoSaveInFlightPromise: Promise<any> | null = null;

  const autoSaveSession = async ({ force = false } = {}) => {
    if ((!force && loading.value) || !currentConfig.value?.webdav?.localChatPath) {
      return;
    }
    if (!force && !isSessionDirty.value) {
      return;
    }

    const promptConfig = currentConfig.value?.prompts?.[CODE.value];
    const isAutoSaveConfigEnabled = promptConfig?.autoSaveChat ?? true;
    if (!defaultConversationName.value && !isAutoSaveConfigEnabled) {
      return;
    }

    if (!defaultConversationName.value && chat_show.value.length > 0) {
      const firstUserMsg = chat_show.value.find((msg: any) => msg.role === 'user');
      if (firstUserMsg) {
        let namePrefix = '';
        const content = firstUserMsg.content;

        if (Array.isArray(content)) {
          const hasImage = content.some((p: any) => p.type === 'image_url');
          const hasFile = content.some((p: any) => p.type === 'file');
          const textPart = content.find((p: any) => p.type === 'text');

          if (hasImage) {
            namePrefix = '图片';
          } else if (hasFile) {
            namePrefix = '文件';
          } else if (textPart?.text) {
            namePrefix = textPart.text
              .slice(0, 20)
              .replace(/[\\/:*?"<>|\n\r]/g, '')
              .trim();
          }
        } else if (typeof content === 'string') {
          namePrefix = content
            .slice(0, 20)
            .replace(/[\\/:*?"<>|\n\r]/g, '')
            .trim();
        }

        if (namePrefix) {
          const safeCodeName = CODE.value.replace(/[\\/:*?"<>|]/g, '_');
          const now = new Date();
          const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

          defaultConversationName.value = `${namePrefix}-${safeCodeName}-${timestamp}`;
        }
      }
    }

    if (!defaultConversationName.value) {
      return;
    }

    try {
      const sessionData = getSessionDataAsObject();
      const jsonString = JSON.stringify(sessionData, null, 2);
      const filePath = `${currentConfig.value.webdav.localChatPath}/${defaultConversationName.value}.json`;
      await window.api.writeLocalFile(filePath, jsonString);
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
