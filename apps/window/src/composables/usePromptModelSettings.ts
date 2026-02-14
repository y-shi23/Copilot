// @ts-nocheck

export function usePromptModelSettings(options: any) {
  const { refs, defaultConfig, showDismissibleMessage } = options;
  const {
    currentConfig,
    modelList,
    modelMap,
    currentProviderID,
    base_url,
    api_key,
    model,
    chatInputRef,
    currentSystemPrompt,
    systemPromptContent,
    systemPromptDialogVisible,
    history,
    chat_show,
    messageIdCounter,
    CODE,
    sourcePromptConfig,
    AIAvart,
    changeModel_page,
  } = refs;

  const openModelDialog = async () => {
    try {
      const result = await window.api.getConfig();
      if (result && result.config) {
        currentConfig.value.providers = result.config.providers;
        currentConfig.value.providerOrder = result.config.providerOrder;

        const newModelList: any[] = [];
        const newModelMap: Record<string, string> = {};
        currentConfig.value.providerOrder.forEach((id: string) => {
          const provider = currentConfig.value.providers[id];
          if (provider?.enable) {
            provider.modelList.forEach((m: string) => {
              const key = `${id}|${m}`;
              newModelList.push({ key, value: key, label: `${provider.name}|${m}` });
              newModelMap[key] = `${provider.name}|${m}`;
            });
          }
        });
        modelList.value = newModelList;
        modelMap.value = newModelMap;

        if (currentProviderID.value && currentConfig.value.providers[currentProviderID.value]) {
          const activeProvider = currentConfig.value.providers[currentProviderID.value];
          base_url.value = activeProvider.url;
          api_key.value = activeProvider.api_key;
        }
      }
    } catch (error) {
      console.warn('自动刷新模型列表失败，将使用缓存数据', error);
    }
    changeModel_page.value = true;
  };

  const changeModel = (chosenModel: string) => {
    model.value = chosenModel;
    currentProviderID.value = chosenModel.split('|')[0];
    const provider = currentConfig.value.providers[currentProviderID.value];
    base_url.value = provider.url;
    api_key.value = provider.api_key;
    chatInputRef.value?.focus({ cursor: 'end' });
  };

  const showSystemPromptDialog = () => {
    systemPromptContent.value = currentSystemPrompt.value;
    systemPromptDialogVisible.value = true;
  };

  const saveSystemPrompt = async () => {
    const newPromptContent = systemPromptContent.value;
    currentSystemPrompt.value = newPromptContent;

    const systemMessageIndex = history.value.findIndex((m: any) => m.role === 'system');
    if (systemMessageIndex !== -1) {
      history.value[systemMessageIndex].content = newPromptContent;
      if (chat_show.value[systemMessageIndex]) {
        chat_show.value[systemMessageIndex].content = newPromptContent;
      }
    } else {
      const newMsg = { role: 'system', content: newPromptContent };
      history.value.unshift(newMsg);
      chat_show.value.unshift({ ...newMsg, id: messageIdCounter.value++ });
    }

    try {
      const promptExists = !!currentConfig.value.prompts[CODE.value];
      if (promptExists) {
        await window.api.saveSetting(`prompts.${CODE.value}.prompt`, newPromptContent);
        currentConfig.value.prompts[CODE.value].prompt = newPromptContent;
        showDismissibleMessage.success('快捷助手提示词已更新');
      } else {
        const latestConfigData = await window.api.getConfig();
        const baseConfig = sourcePromptConfig.value || defaultConfig.config.prompts.AI;
        const newPrompt = {
          ...baseConfig,
          icon: AIAvart.value,
          prompt: newPromptContent,
          enable: true,
          model: model.value || baseConfig.model,
          stream: true,
          isTemperature: false,
          temperature: 0.7,
          ifTextNecessary: false,
          isDirectSend_file: true,
          isDirectSend_normal: true,
          voice: '',
          isAlwaysOnTop: latestConfigData.config.isAlwaysOnTop_global,
          autoCloseOnBlur: latestConfigData.config.autoCloseOnBlur_global,
          window_width: 540,
          window_height: 700,
          position_x: 0,
          position_y: 0,
          reasoning_effort: 'default',
          zoom: 1,
        };
        latestConfigData.config.prompts[CODE.value] = newPrompt;
        await window.api.updateConfig(latestConfigData);
        currentConfig.value = latestConfigData.config;
        sourcePromptConfig.value = newPrompt;
        showDismissibleMessage.success(`已为您创建并保存新的快捷助手: "${CODE.value}"`);
      }
    } catch (error: any) {
      console.error('保存系统提示词失败:', error);
      showDismissibleMessage.error(`保存失败: ${error.message}`);
    }

    systemPromptDialogVisible.value = false;
  };

  const saveModel = async (modelToSave: string) => {
    if (!CODE.value || !currentConfig.value.prompts[CODE.value]) {
      showDismissibleMessage.warning('无法保存模型，因为当前不是一个已定义的快捷助手。');
      return;
    }

    try {
      const result = await window.api.saveSetting(`prompts.${CODE.value}.model`, modelToSave);
      changeModel_page.value = false;
      if (result && result.success) {
        currentConfig.value.prompts[CODE.value].model = modelToSave;
        showDismissibleMessage.success(`模型已为快捷助手 "${CODE.value}" 保存成功！`);
      } else {
        throw new Error(result?.message || '保存失败');
      }
    } catch (error: any) {
      console.error('保存模型失败:', error);
      showDismissibleMessage.error(`保存模型失败: ${error.message}`);
    }

    changeModel_page.value = false;
  };

  return {
    openModelDialog,
    changeModel,
    showSystemPromptDialog,
    saveSystemPrompt,
    saveModel,
  };
}
