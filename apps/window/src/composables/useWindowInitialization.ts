// @ts-nocheck

export function useWindowInitialization(options: any) {
  const {
    refs,
    defaultConfig,
    showDismissibleMessage,
    loadBackground,
    loadSession,
    checkAndLoadSessionFromFile,
    processFilePath,
    closePage,
    applyMcpTools,
    fetchSkillsList,
    scrollToBottom,
    askAI,
    scheduleCodeBlockEnhancement,
  } = options;

  const {
    hasSessionInitialized,
    isSessionDirty,
    currentConfig,
    UserAvart,
    currentOS,
    modelList,
    modelMap,
    CODE,
    sourcePromptConfig,
    AIAvart,
    favicon,
    autoCloseOnBlur,
    tempReasoningEffort,
    model,
    selectedVoice,
    currentProviderID,
    base_url,
    api_key,
    currentSystemPrompt,
    history,
    chat_show,
    messageIdCounter,
    sessionSkillIds,
    tempSessionSkillIds,
    basic_msg,
    defaultConversationName,
    fileList,
    sessionMcpServerIds,
    tempSessionMcpServerIds,
    isAlwaysOnTop,
    zoomLevel,
    prompt,
    chatInputRef,
  } = refs;

  const rebuildModelRegistry = () => {
    modelList.value = [];
    modelMap.value = {};
    currentConfig.value.providerOrder.forEach((id: string) => {
      const provider = currentConfig.value.providers[id];
      if (!provider?.enable) return;

      provider.modelList.forEach((m: string) => {
        const key = `${id}|${m}`;
        modelList.value.push({ key, value: key, label: `${provider.name}|${m}` });
        modelMap.value[key] = `${provider.name}|${m}`;
      });
    });
  };

  const initializeWindow = async (data: any = null) => {
    hasSessionInitialized.value = false;
    isSessionDirty.value = false;

    try {
      const configData = await window.api.getConfig();
      currentConfig.value = configData.config;
    } catch (err) {
      currentConfig.value = defaultConfig.config;
      showDismissibleMessage.error('加载用户配置失败，使用默认配置。');
    }

    try {
      const userInfo = await window.api.getUser();
      UserAvart.value = userInfo.avatar;
    } catch (err) {
      UserAvart.value = 'user.png';
    }

    if (data?.os) {
      currentOS.value = data.os;
    }

    rebuildModelRegistry();

    const code = data?.code || 'AI';
    const currentPromptConfig =
      currentConfig.value.prompts[code] || defaultConfig.config.prompts.AI;
    if (currentPromptConfig.backgroundImage) {
      loadBackground(currentPromptConfig.backgroundImage);
    }

    isAlwaysOnTop.value = data?.isAlwaysOnTop ?? currentPromptConfig.isAlwaysOnTop ?? true;
    zoomLevel.value = currentPromptConfig.zoom || currentConfig.value.zoom || 1;
    if (window.api && typeof window.api.setZoomFactor === 'function') {
      window.api.setZoomFactor(zoomLevel.value);
    }
    if (currentConfig.value.isDarkMode) {
      document.documentElement.classList.add('dark');
    }

    CODE.value = code;
    document.title = code;
    sourcePromptConfig.value = currentPromptConfig;

    if (currentPromptConfig.icon) {
      AIAvart.value = currentPromptConfig.icon;
      favicon.value = currentPromptConfig.icon;
    } else {
      AIAvart.value = 'ai.svg';
      favicon.value = currentConfig.value.isDarkMode ? 'favicon-b.png' : 'favicon.png';
    }

    autoCloseOnBlur.value = currentPromptConfig.autoCloseOnBlur ?? false;
    tempReasoningEffort.value = currentPromptConfig.reasoning_effort || 'default';
    model.value = currentPromptConfig.model || modelList.value[0]?.value || '';
    selectedVoice.value = currentPromptConfig.voice || null;

    if (model.value) {
      currentProviderID.value = model.value.split('|')[0];
      base_url.value = currentConfig.value.providers[currentProviderID.value]?.url;
      api_key.value = currentConfig.value.providers[currentProviderID.value]?.api_key;
    }

    if (currentPromptConfig.prompt) {
      currentSystemPrompt.value = currentPromptConfig.prompt;
      history.value = [{ role: 'system', content: currentPromptConfig.prompt }];
      chat_show.value = [
        {
          role: 'system',
          content: currentPromptConfig.prompt,
          id: messageIdCounter.value++,
        },
      ];
    } else {
      currentSystemPrompt.value = '';
      history.value = [];
      chat_show.value = [];
    }

    if (currentPromptConfig.defaultSkills && Array.isArray(currentPromptConfig.defaultSkills)) {
      sessionSkillIds.value = [...currentPromptConfig.defaultSkills];
      tempSessionSkillIds.value = [...currentPromptConfig.defaultSkills];
    } else {
      sessionSkillIds.value = [];
      tempSessionSkillIds.value = [];
    }

    let shouldDirectSend = false;
    let isFileDirectSend = false;
    if (data) {
      basic_msg.value = { code: data.code, type: data.type, payload: data.payload };
      if (data.filename) defaultConversationName.value = data.filename.replace(/\.json$/i, '');

      if (data.type === 'over' && data.payload) {
        let sessionLoaded = false;
        try {
          const oldSession = JSON.parse(data.payload);
          if (oldSession && oldSession.anywhere_history === true) {
            sessionLoaded = true;
            await loadSession(oldSession);
            autoCloseOnBlur.value = false;
          }
        } catch (error) {}

        if (!sessionLoaded) {
          if (CODE.value.trim().toLowerCase().includes(data.payload.trim().toLowerCase())) {
            // no-op
          } else if (currentPromptConfig.isDirectSend_normal) {
            history.value.push({ role: 'user', content: data.payload });
            chat_show.value.push({
              id: messageIdCounter.value++,
              role: 'user',
              content: [{ type: 'text', text: data.payload }],
            });
            shouldDirectSend = true;
          } else {
            prompt.value = data.payload;
          }
        }
      } else if (data.type === 'img' && data.payload) {
        if (currentPromptConfig.isDirectSend_normal) {
          history.value.push({
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: String(data.payload) } }],
          });
          chat_show.value.push({
            id: messageIdCounter.value++,
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: String(data.payload) } }],
          });
          shouldDirectSend = true;
        } else {
          fileList.value.push({
            uid: 1,
            name: '截图.png',
            size: 0,
            type: 'image/png',
            url: String(data.payload),
          });
        }
      } else if (data.type === 'files' && data.payload) {
        try {
          let sessionLoaded = false;
          if (data.payload.length === 1 && data.payload[0].path.toLowerCase().endsWith('.json')) {
            const fileObject = await window.api.handleFilePath(data.payload[0].path);
            if (fileObject) {
              sessionLoaded = await checkAndLoadSessionFromFile(fileObject);
            }
          }

          if (!sessionLoaded) {
            const fileProcessingPromises = data.payload.map((fileInfo: any) =>
              processFilePath(fileInfo.path),
            );
            await Promise.all(fileProcessingPromises);
            if (currentPromptConfig.isDirectSend_file) {
              shouldDirectSend = true;
              isFileDirectSend = true;
            }
          }
        } catch (error: any) {
          console.error('Error during initial file processing:', error);
          showDismissibleMessage.error('文件处理失败: ' + error.message);
        }
      }
    }

    if (autoCloseOnBlur.value) {
      window.addEventListener('blur', closePage);
    }

    const defaultMcpServers = currentPromptConfig.defaultMcpServers || [];
    let mcpServersToLoad = [...defaultMcpServers];

    if (sessionSkillIds.value.length > 0 && currentConfig.value.mcpServers) {
      const builtinIds = Object.entries(currentConfig.value.mcpServers)
        .filter(([, server]: any) => server.type === 'builtin')
        .map(([id]) => id);
      mcpServersToLoad = [...new Set([...mcpServersToLoad, ...builtinIds])];
    }

    if (mcpServersToLoad.length > 0) {
      const validIds = mcpServersToLoad.filter(
        (id) => currentConfig.value.mcpServers && currentConfig.value.mcpServers[id],
      );

      sessionMcpServerIds.value = [...validIds];
      tempSessionMcpServerIds.value = [...validIds];
      await applyMcpTools(false);
    }

    await fetchSkillsList();

    if (shouldDirectSend) {
      scrollToBottom();
      if (isFileDirectSend) await askAI(false);
      else await askAI(true);
    }

    scheduleCodeBlockEnhancement();
    isSessionDirty.value = false;
    hasSessionInitialized.value = true;
    setTimeout(() => {
      chatInputRef.value?.focus({ cursor: 'end' });
    }, 100);
  };

  return {
    rebuildModelRegistry,
    initializeWindow,
  };
}
