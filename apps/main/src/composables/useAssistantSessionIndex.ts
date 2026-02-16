// @ts-nocheck
import { computed, ref, watch } from 'vue';
import { getMessagePreviewText } from '@window/utils/messagePreview';

let createWebdavClientPromise = null;
const getCreateWebdavClient = async () => {
  if (!createWebdavClientPromise) {
    createWebdavClientPromise = import('webdav/web').then((module) => module.createClient);
  }
  return createWebdavClientPromise;
};

const createWebdavClient = async (url, username, password) => {
  const createClient = await getCreateWebdavClient();
  return createClient(url, { username, password });
};

const toConversationName = (basename = '') => {
  return basename.toLowerCase().endsWith('.json') ? basename.slice(0, -5) : basename;
};

const toPreview = (sessionObject) => {
  const messages = Array.isArray(sessionObject?.chat_show) ? sessionObject.chat_show : [];
  const firstMessage = messages.find((msg) => msg?.role === 'user' || msg?.role === 'assistant');
  if (!firstMessage) return '';
  return getMessagePreviewText(firstMessage);
};

const parseSessionMetadata = (jsonString, basename) => {
  try {
    const sessionObject = JSON.parse(jsonString);
    if (!sessionObject || typeof sessionObject !== 'object') return null;

    const code = String(sessionObject.CODE || '').trim();
    if (!code) return null;

    if (
      sessionObject.anywhere_history !== true &&
      !Array.isArray(sessionObject.chat_show) &&
      !Array.isArray(sessionObject.history)
    ) {
      return null;
    }

    return {
      code,
      conversationName: toConversationName(basename),
      preview: toPreview(sessionObject),
    };
  } catch {
    return null;
  }
};

const toMillis = (raw) => {
  const ms = new Date(raw || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export function useAssistantSessionIndex(configRef) {
  const loading = ref(false);
  const errorMessage = ref('');
  const sessionMap = ref({});
  const metadataCache = new Map();
  const cloudClientCache = ref(null);
  const isRefreshing = ref(false);

  const enabledAssistants = computed(() => {
    const prompts = configRef.value?.prompts || {};
    return Object.entries(prompts)
      .filter(([, prompt]) => prompt?.enable)
      .map(([code, prompt]) => ({
        code,
        icon: prompt?.icon || '',
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  });

  const enabledAssistantCodeSet = computed(() => {
    return new Set(enabledAssistants.value.map((item) => item.code));
  });

  const getCloudClient = async () => {
    const webdav = configRef.value?.webdav || {};
    if (!webdav.url || !webdav.data_path) return null;
    if (
      cloudClientCache.value &&
      cloudClientCache.value.url === webdav.url &&
      cloudClientCache.value.username === (webdav.username || '') &&
      cloudClientCache.value.password === (webdav.password || '')
    ) {
      return cloudClientCache.value.client;
    }

    const client = await createWebdavClient(webdav.url, webdav.username, webdav.password);
    cloudClientCache.value = {
      url: webdav.url,
      username: webdav.username || '',
      password: webdav.password || '',
      client,
    };
    return client;
  };

  const normalizeRemoteDir = (path) => {
    if (!path) return '';
    return path.endsWith('/') ? path.slice(0, -1) : path;
  };

  const addSession = (targetMap, assistantCode, sessionItem) => {
    if (!targetMap[assistantCode]) {
      targetMap[assistantCode] = [];
    }
    targetMap[assistantCode].push(sessionItem);
  };

  const readMetadataByCache = async (cacheKey, loader) => {
    if (metadataCache.has(cacheKey)) {
      return metadataCache.get(cacheKey);
    }
    const meta = await loader();
    metadataCache.set(cacheKey, meta);
    return meta;
  };

  const buildInitialMap = () => {
    const initial = {};
    enabledAssistants.value.forEach((assistant) => {
      initial[assistant.code] = [];
    });
    return initial;
  };

  const refreshIndex = async (options = {}) => {
    if (isRefreshing.value && !options.force) return;
    isRefreshing.value = true;
    loading.value = true;
    errorMessage.value = '';

    const nextMap = buildInitialMap();

    try {
      const enabledCodes = enabledAssistantCodeSet.value;
      const webdav = configRef.value?.webdav || {};
      const localChatPath = webdav.localChatPath || '';

      if (localChatPath) {
        try {
          const localFiles = await window.api.listJsonFiles(localChatPath);
          for (const file of localFiles) {
            const cacheKey = `local:${file.path}:${file.lastmod}:${file.size || 0}`;
            const metadata = await readMetadataByCache(cacheKey, async () => {
              const jsonString = await window.api.readLocalFile(file.path);
              return parseSessionMetadata(jsonString, file.basename);
            });

            if (!metadata || !enabledCodes.has(metadata.code)) continue;

            addSession(nextMap, metadata.code, {
              id: `local:${file.path}`,
              source: 'local',
              assistantCode: metadata.code,
              conversationName: metadata.conversationName,
              preview: metadata.preview,
              basename: file.basename,
              lastmod: file.lastmod,
              size: file.size || 0,
              localPath: file.path,
            });
          }
        } catch (error) {
          console.warn('[SessionIndex] Failed to read local sessions:', error);
        }
      }

      if (webdav.url && webdav.data_path) {
        try {
          const client = await getCloudClient();
          if (client) {
            const remoteDir = normalizeRemoteDir(webdav.data_path);
            if (await client.exists(remoteDir)) {
              const response = await client.getDirectoryContents(remoteDir, { details: true });
              const cloudFiles = (response?.data || []).filter(
                (item) => item.type === 'file' && item.basename?.toLowerCase().endsWith('.json'),
              );

              for (const file of cloudFiles) {
                const remotePath = `${remoteDir}/${file.basename}`;
                const cacheKey = `cloud:${file.basename}:${file.lastmod}:${file.size || 0}`;
                const metadata = await readMetadataByCache(cacheKey, async () => {
                  const jsonString = await client.getFileContents(remotePath, { format: 'text' });
                  return parseSessionMetadata(jsonString, file.basename);
                });

                if (!metadata || !enabledCodes.has(metadata.code)) continue;

                addSession(nextMap, metadata.code, {
                  id: `cloud:${remotePath}`,
                  source: 'cloud',
                  assistantCode: metadata.code,
                  conversationName: metadata.conversationName,
                  preview: metadata.preview,
                  basename: file.basename,
                  lastmod: file.lastmod,
                  size: file.size || 0,
                  remotePath,
                });
              }
            }
          }
        } catch (error) {
          console.warn('[SessionIndex] Failed to read cloud sessions:', error);
        }
      }

      Object.keys(nextMap).forEach((assistantCode) => {
        nextMap[assistantCode].sort((a, b) => {
          const diff = toMillis(b.lastmod) - toMillis(a.lastmod);
          if (diff !== 0) return diff;
          if (a.source !== b.source) return a.source === 'local' ? -1 : 1;
          return a.conversationName.localeCompare(b.conversationName);
        });
      });

      sessionMap.value = nextMap;
    } catch (error) {
      console.error('[SessionIndex] Failed to refresh index:', error);
      errorMessage.value = String(error?.message || error);
    } finally {
      loading.value = false;
      isRefreshing.value = false;
    }
  };

  const loadSessionPayload = async (sessionItem) => {
    let jsonString = '';
    if (sessionItem.source === 'local') {
      jsonString = await window.api.readLocalFile(sessionItem.localPath);
    } else {
      const client = await getCloudClient();
      if (!client) {
        throw new Error('WebDAV client is not available');
      }
      jsonString = await client.getFileContents(sessionItem.remotePath, { format: 'text' });
    }

    const sessionData = JSON.parse(jsonString);
    if (!sessionData || typeof sessionData !== 'object') {
      throw new Error('Session payload is invalid');
    }

    return {
      sessionData,
      conversationName: sessionItem.conversationName,
      assistantCode: String(sessionData.CODE || sessionItem.assistantCode || ''),
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
        localPath: configRef.value?.webdav?.localChatPath || '',
        cloudUrl: configRef.value?.webdav?.url || '',
        cloudPath: configRef.value?.webdav?.data_path || '',
        cloudUser: configRef.value?.webdav?.username || '',
      }),
    () => {
      refreshIndex().catch((error) => {
        console.error('[SessionIndex] auto refresh failed:', error);
      });
    },
    { immediate: true },
  );

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
