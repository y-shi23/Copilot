// @ts-nocheck
import { h, nextTick, ref } from 'vue';
import { ElButton, ElInput, ElMessageBox } from 'element-plus';

import { formatTimestamp } from '../utils/formatters';
import { createWebdavClient, getMarkdownRuntime } from '../utils/lazyRuntime';
import {
  buildHtmlSessionContent,
  buildMarkdownSessionContent,
  getDefaultExportBasename,
  getExportFileTimestamp,
  getExportTimestamp,
} from '../utils/sessionExportBuilders';

export function useSessionPersistence(options: any) {
  const {
    refs,
    messageRefs,
    showDismissibleMessage,
    handleTogglePin,
    applyMcpTools,
    scrollToBottom,
  } = options;

  const {
    CODE,
    basic_msg,
    isInit,
    autoCloseOnBlur,
    model,
    currentConfig,
    history,
    chat_show,
    selectedVoice,
    sessionMcpServerIds,
    sessionSkillIds,
    isAutoApproveTools,
    defaultConversationName,
    zoomLevel,
    modelMap,
    currentSystemPrompt,
    UserAvart,
    AIAvart,
    currentOS,
    loading,
    hasSessionInitialized,
    isSessionDirty,
    collapsedMessages,
    focusedMessageIndex,
    messageIdCounter,
    tempReasoningEffort,
    tempSessionSkillIds,
    favicon,
    modelList,
    currentProviderID,
    base_url,
    api_key,
    tempSessionMcpServerIds,
  } = refs;

  const saveWindowSize = async () => {
    if (!CODE.value || !currentConfig.value.prompts[CODE.value]) {
      showDismissibleMessage.warning('无法保存窗口设置，因为当前不是一个已定义的快捷助手。');
      return;
    }

    if (window.fullScreen) {
      showDismissibleMessage.warning('无法在全屏模式下保存窗口位置和大小。');
      return;
    }

    const settingsToSave = {
      window_height: window.outerHeight,
      window_width: window.outerWidth,
      zoom: zoomLevel.value,
      position_x: window.screenX,
      position_y: window.screenY,
    };

    try {
      const result = await window.api.savePromptWindowSettings(CODE.value, settingsToSave);
      if (result.success) {
        showDismissibleMessage.success('当前快捷助手的窗口大小、位置与缩放已保存');
        if (currentConfig.value.prompts[CODE.value]) {
          Object.assign(currentConfig.value.prompts[CODE.value], settingsToSave);
        }
      } else {
        showDismissibleMessage.error(`保存失败: ${result.message}`);
      }
    } catch (error: any) {
      console.error('Error saving window settings:', error);
      showDismissibleMessage.error('保存窗口设置时出错');
    }
  };

  const getSessionDataAsObject = () => {
    const currentPromptConfig = currentConfig.value.prompts[CODE.value] || {};
    return {
      anywhere_history: true,
      CODE: CODE.value,
      basic_msg: basic_msg.value,
      isInit: isInit.value,
      autoCloseOnBlur: autoCloseOnBlur.value,
      model: model.value,
      currentPromptConfig,
      history: history.value,
      chat_show: chat_show.value,
      selectedVoice: selectedVoice.value,
      activeMcpServerIds: sessionMcpServerIds.value || [],
      activeSkillIds: sessionSkillIds.value || [],
      isAutoApproveTools: isAutoApproveTools.value,
    };
  };

  const saveSessionToCloud = async () => {
    const now = new Date();
    const fileTimestamp = getExportFileTimestamp(now);
    const defaultBasename = getDefaultExportBasename(
      defaultConversationName.value,
      CODE.value,
      fileTimestamp,
    );
    const inputValue = ref(defaultBasename);
    try {
      await ElMessageBox({
        title: '保存到云端',
        message: () =>
          h('div', null, [
            h(
              'p',
              {
                style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);',
              },
              '请输入要保存到云端的会话名称。',
            ),
            h(
              ElInput,
              {
                modelValue: inputValue.value,
                'onUpdate:modelValue': (val: string) => {
                  inputValue.value = val;
                },
                placeholder: '文件名',
                ref: (elInputInstance: any) => {
                  if (elInputInstance) {
                    setTimeout(() => elInputInstance.focus(), 100);
                  }
                },
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    document
                      .querySelector(
                        '.filename-prompt-dialog .el-message-box__btns .el-button--primary',
                      )
                      ?.click();
                  }
                },
              },
              { append: () => h('div', { class: 'input-suffix-display' }, '.json') },
            ),
          ]),
        showCancelButton: true,
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        customClass: 'filename-prompt-dialog',
        beforeClose: async (action: string, instance: any, done: any) => {
          if (action === 'confirm') {
            let finalBasename = inputValue.value.trim();
            if (!finalBasename) {
              showDismissibleMessage.error('文件名不能为空');
              return;
            }
            if (finalBasename.toLowerCase().endsWith('.json')) {
              finalBasename = finalBasename.slice(0, -5);
            }
            const filename = `${finalBasename}.json`;
            instance.confirmButtonLoading = true;
            showDismissibleMessage.info('正在保存到云端...');
            try {
              const sessionData = getSessionDataAsObject();
              const jsonString = JSON.stringify(sessionData, null, 2);
              const { url, username, password, data_path } = currentConfig.value.webdav;
              const client = await createWebdavClient(url, username, password);
              const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
              const remoteFilePath = `${remoteDir}/${filename}`;
              if (!(await client.exists(remoteDir))) {
                await client.createDirectory(remoteDir, { recursive: true });
              }
              await client.putFileContents(remoteFilePath, jsonString, { overwrite: true });
              defaultConversationName.value = finalBasename;
              showDismissibleMessage.success('会话已成功保存到云端！');
              done();
            } catch (error: any) {
              console.error('WebDAV save failed:', error);
              showDismissibleMessage.error(`保存到云端失败: ${error.message}`);
            } finally {
              instance.confirmButtonLoading = false;
            }
          } else {
            done();
          }
        },
      });
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        console.error('MessageBox error:', error);
      }
    }
  };

  const saveSessionAsMarkdown = async () => {
    const now = new Date();
    const timestamp = getExportTimestamp(now);
    const fileTimestamp = getExportFileTimestamp(now);
    const defaultBasename = getDefaultExportBasename(
      defaultConversationName.value,
      CODE.value,
      fileTimestamp,
    );
    const markdownContent = buildMarkdownSessionContent({
      code: CODE.value,
      timestamp,
      modelLabel: modelMap.value[model.value] || 'N/A',
      currentSystemPrompt: currentSystemPrompt.value,
      chatShow: chat_show.value,
      formatTimestamp,
    });

    const inputValue = ref(defaultBasename);
    try {
      await ElMessageBox({
        title: '保存为 Markdown',
        message: () =>
          h('div', null, [
            h(
              'p',
              {
                style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);',
              },
              '请输入会话名称。',
            ),
            h(
              ElInput,
              {
                modelValue: inputValue.value,
                'onUpdate:modelValue': (val: string) => {
                  inputValue.value = val;
                },
                placeholder: '文件名',
                ref: (elInputInstance: any) => {
                  if (elInputInstance) {
                    setTimeout(() => elInputInstance.focus(), 100);
                  }
                },
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    document
                      .querySelector(
                        '.filename-prompt-dialog .el-message-box__btns .el-button--primary',
                      )
                      ?.click();
                  }
                },
              },
              { append: () => h('div', { class: 'input-suffix-display' }, '.md') },
            ),
          ]),
        showCancelButton: true,
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        customClass: 'filename-prompt-dialog',
        beforeClose: async (action: string, instance: any, done: any) => {
          if (action === 'confirm') {
            let finalBasename = inputValue.value.trim();
            if (!finalBasename) {
              showDismissibleMessage.error('文件名不能为空');
              return;
            }
            if (finalBasename.toLowerCase().endsWith('.md')) {
              finalBasename = finalBasename.slice(0, -3);
            }
            const finalFilename = `${finalBasename}.md`;
            instance.confirmButtonLoading = true;
            try {
              await window.api.saveFile({
                title: '保存为 Markdown',
                defaultPath: finalFilename,
                buttonLabel: '保存',
                filters: [
                  { name: 'Markdown 文件', extensions: ['md'] },
                  { name: '所有文件', extensions: ['*'] },
                ],
                fileContent: markdownContent,
              });
              defaultConversationName.value = finalBasename;
              showDismissibleMessage.success('会话已成功保存为 Markdown！');
              done();
            } catch (error: any) {
              if (!error.message.includes('canceled by the user')) {
                console.error('保存 Markdown 失败:', error);
                showDismissibleMessage.error(`保存失败: ${error.message}`);
              }
              done();
            } finally {
              instance.confirmButtonLoading = false;
            }
          } else {
            done();
          }
        },
      });
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        console.error('MessageBox error:', error);
      }
    }
  };

  const saveSessionAsHtml = async () => {
    const now = new Date();
    const timestamp = getExportTimestamp(now);
    const fileTimestamp = getExportFileTimestamp(now);
    const defaultBasename = getDefaultExportBasename(
      defaultConversationName.value,
      CODE.value,
      fileTimestamp,
    );
    const inputValue = ref(defaultBasename);

    try {
      await ElMessageBox({
        title: '保存为 HTML',
        message: () =>
          h('div', null, [
            h(
              'p',
              {
                style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);',
              },
              '请输入会话名称。',
            ),
            h(
              ElInput,
              {
                modelValue: inputValue.value,
                'onUpdate:modelValue': (val: string) => {
                  inputValue.value = val;
                },
                placeholder: '文件名',
                ref: (elInputInstance: any) => {
                  if (elInputInstance) {
                    setTimeout(() => elInputInstance.focus(), 100);
                  }
                },
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    document
                      .querySelector(
                        '.filename-prompt-dialog .el-message-box__btns .el-button--primary',
                      )
                      ?.click();
                  }
                },
              },
              { append: () => h('div', { class: 'input-suffix-display' }, '.html') },
            ),
          ]),
        showCancelButton: true,
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        customClass: 'filename-prompt-dialog',
        beforeClose: async (action: string, instance: any, done: any) => {
          if (action === 'confirm') {
            let finalBasename = inputValue.value.trim();
            if (!finalBasename) {
              showDismissibleMessage.error('文件名不能为空');
              return;
            }
            if (finalBasename.toLowerCase().endsWith('.html')) {
              finalBasename = finalBasename.slice(0, -5);
            }
            const finalFilename = `${finalBasename}.html`;
            instance.confirmButtonLoading = true;
            try {
              const htmlContent = await buildHtmlSessionContent({
                code: CODE.value,
                timestamp,
                modelLabel: modelMap.value[model.value] || 'N/A',
                currentSystemPrompt: currentSystemPrompt.value,
                chatShow: chat_show.value,
                userAvatar: UserAvart.value,
                aiAvatar: AIAvart.value,
                formatTimestamp,
                getMarkdownRuntime,
              });
              await window.api.saveFile({
                title: '保存为 HTML',
                defaultPath: finalFilename,
                buttonLabel: '保存',
                filters: [
                  { name: 'HTML 文件', extensions: ['html'] },
                  { name: '所有文件', extensions: ['*'] },
                ],
                fileContent: htmlContent,
              });
              defaultConversationName.value = finalBasename;
              showDismissibleMessage.success('会话已成功保存为 HTML！');
              done();
            } catch (error: any) {
              if (
                !error.message.includes('User cancelled') &&
                !error.message.includes('用户取消')
              ) {
                console.error('保存 HTML 失败:', error);
                showDismissibleMessage.error(`保存失败: ${error.message}`);
              }
              done();
            } finally {
              instance.confirmButtonLoading = false;
            }
          } else {
            done();
          }
        },
      });
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        console.error('MessageBox error:', error);
      }
    }
  };

  const saveSessionAsJson = async () => {
    const sessionData = getSessionDataAsObject();
    const jsonString = JSON.stringify(sessionData, null, 2);
    const now = new Date();
    const fileTimestamp = getExportFileTimestamp(now);
    const defaultBasename = getDefaultExportBasename(
      defaultConversationName.value,
      CODE.value,
      fileTimestamp,
    );
    const inputValue = ref(defaultBasename);
    try {
      await ElMessageBox({
        title: '保存为 JSON',
        message: () =>
          h('div', null, [
            h(
              'p',
              {
                style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);',
              },
              '请输入会话名称。',
            ),
            h(
              ElInput,
              {
                modelValue: inputValue.value,
                'onUpdate:modelValue': (val: string) => {
                  inputValue.value = val;
                },
                placeholder: '文件名',
                ref: (elInputInstance: any) => {
                  if (elInputInstance) {
                    setTimeout(() => elInputInstance.focus(), 100);
                  }
                },
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    document
                      .querySelector(
                        '.filename-prompt-dialog .el-message-box__btns .el-button--primary',
                      )
                      ?.click();
                  }
                },
              },
              { append: () => h('div', { class: 'input-suffix-display' }, '.json') },
            ),
          ]),
        showCancelButton: true,
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        customClass: 'filename-prompt-dialog',
        beforeClose: async (action: string, instance: any, done: any) => {
          if (action === 'confirm') {
            let finalBasename = inputValue.value.trim();
            if (!finalBasename) {
              showDismissibleMessage.error('文件名不能为空');
              return;
            }
            if (finalBasename.toLowerCase().endsWith('.json')) {
              finalBasename = finalBasename.slice(0, -5);
            }
            const finalFilename = `${finalBasename}.json`;
            instance.confirmButtonLoading = true;
            try {
              const localChatPath = currentConfig.value.webdav?.localChatPath;

              if (localChatPath) {
                const separator = currentOS.value === 'win' ? '\\' : '/';
                const fullPath = `${localChatPath}${separator}${finalFilename}`;
                await window.api.writeLocalFile(fullPath, jsonString);
              } else {
                await window.api.saveFile({
                  title: '保存聊天会话',
                  defaultPath: finalFilename,
                  buttonLabel: '保存',
                  filters: [
                    { name: 'JSON 文件', extensions: ['json'] },
                    { name: '所有文件', extensions: ['*'] },
                  ],
                  fileContent: jsonString,
                });
              }

              defaultConversationName.value = finalBasename;
              showDismissibleMessage.success('会话已成功保存！');
              done();
            } catch (error: any) {
              if (
                !error.message.includes('canceled by the user') &&
                !error.message.includes('用户取消')
              ) {
                console.error('保存会话失败:', error);
                showDismissibleMessage.error(`保存失败: ${error.message}`);
              }
              done();
            } finally {
              instance.confirmButtonLoading = false;
            }
          } else {
            done();
          }
        },
      });
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        console.error('MessageBox error:', error);
      }
    }
  };

  const handleRenameSession = async () => {
    if (autoCloseOnBlur.value) {
      handleTogglePin();
    }

    const localPath = currentConfig.value.webdav?.localChatPath;
    if (!localPath) {
      showDismissibleMessage.error('请先在设置中配置本地对话路径');
      return;
    }
    if (!defaultConversationName.value) {
      showDismissibleMessage.warning('当前对话尚未保存，无法重命名');
      return;
    }

    const oldBaseName = defaultConversationName.value;
    const oldFilename = `${oldBaseName}.json`;
    const oldFilePath = `${localPath}/${oldFilename}`;

    try {
      const { value: userInput } = await ElMessageBox.prompt('请输入新的会话名称', '重命名对话', {
        inputValue: oldBaseName,
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        inputValidator: (val: string) => {
          if (!val || !val.trim()) return '名称不能为空';
          if (/[\\/:*?"<>|]/.test(val)) return '文件名包含非法字符';
          return true;
        },
        customClass: 'filename-prompt-dialog',
      });

      let newBaseName = (userInput || '').trim();
      if (newBaseName.toLowerCase().endsWith('.json')) {
        newBaseName = newBaseName.slice(0, -5);
      }

      if (newBaseName === oldBaseName) return;

      const newFilename = `${newBaseName}.json`;
      const newFilePath = `${localPath}/${newFilename}`;

      const files = await window.api.listJsonFiles(localPath);
      if (files.some((f: any) => f.basename === newFilename)) {
        showDismissibleMessage.error(`文件名 "${newFilename}" 已存在，操作取消`);
        return;
      }

      await window.api.renameLocalFile(oldFilePath, newFilePath);
      defaultConversationName.value = newBaseName;
      showDismissibleMessage.success('本地重命名成功');

      const { url, username, password, data_path } = currentConfig.value.webdav || {};
      if (url && data_path) {
        try {
          const client = await createWebdavClient(url, username, password);
          const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
          const oldRemotePath = `${remoteDir}/${oldFilename}`;
          const newRemotePath = `${remoteDir}/${newFilename}`;

          if (await client.exists(oldRemotePath)) {
            await ElMessageBox.confirm('云端也存在同名文件，是否同步重命名？', '同步操作提示', {
              confirmButtonText: '是',
              cancelButtonText: '否',
              type: 'info',
            });
            await client.moveFile(oldRemotePath, newRemotePath);
            showDismissibleMessage.success('云端同步重命名成功');
          }
        } catch (e) {
          if (e !== 'cancel' && e !== 'close') {
            console.warn('Cloud rename skipped:', e);
          }
        }
      }
    } catch (error: any) {
      if (error !== 'cancel' && error !== 'close') {
        showDismissibleMessage.error(`操作失败: ${error.message}`);
      }
    }
  };

  const handleSaveAction = async () => {
    if (autoCloseOnBlur.value) {
      handleTogglePin();
    }

    const isCloudEnabled = currentConfig.value.webdav?.url && currentConfig.value.webdav?.data_path;
    const saveOptions: any[] = [];

    if (currentConfig.value.webdav?.localChatPath && defaultConversationName.value) {
      saveOptions.push({
        title: '重命名对话',
        description: '修改当前对话名称，并同步修改本地文件（以及云端文件）。',
        buttonType: 'warning',
        action: handleRenameSession,
      });
    }

    if (isCloudEnabled) {
      saveOptions.push({
        title: '保存到云端',
        description: '同步到 WebDAV 服务器，支持跨设备访问。',
        buttonType: 'success',
        action: saveSessionToCloud,
      });
    }

    saveOptions.push({
      title: '保存为 JSON',
      description: '保存为可恢复的会話文件，便于下次继续。',
      buttonType: 'primary',
      action: saveSessionAsJson,
      isDefault: true,
    });
    saveOptions.push({
      title: '保存为 Markdown',
      description: '导出为可读性更强的 .md 文件，适合分享。',
      buttonType: '',
      action: saveSessionAsMarkdown,
    });
    saveOptions.push({
      title: '保存为 HTML',
      description: '导出为带样式的网页文件，保留格式和图片。',
      buttonType: '',
      action: saveSessionAsHtml,
    });

    const messageVNode = h(
      'div',
      { class: 'save-options-list' },
      saveOptions.map((opt) => {
        const trigger = () => {
          ElMessageBox.close();
          opt.action();
        };

        return h('div', { class: 'save-option-item', onClick: trigger }, [
          h('div', { class: 'save-option-text' }, [
            h('h4', null, opt.title),
            h('p', null, opt.description),
          ]),
          h(
            ElButton,
            {
              type: opt.buttonType,
              plain: true,
              class: opt.isDefault ? 'default-save-target' : '',
              onClick: (e: MouseEvent) => {
                e.stopPropagation();
                trigger();
              },
            },
            { default: () => '选择' },
          ),
        ]);
      }),
    );

    ElMessageBox({
      title: '',
      message: messageVNode,
      showConfirmButton: false,
      showCancelButton: false,
      customClass: 'save-options-dialog no-header-msgbox',
      width: '450px',
      showClose: false,
    }).catch(() => {});

    setTimeout(() => {
      const targetBtn = document.querySelector('.default-save-target') as HTMLElement | null;
      if (targetBtn) {
        targetBtn.focus();
      }
    }, 100);
  };

  const loadSession = async (jsonData: any) => {
    loading.value = true;
    hasSessionInitialized.value = false;
    isSessionDirty.value = false;
    collapsedMessages.value.clear();
    messageRefs.clear();
    focusedMessageIndex.value = null;

    try {
      CODE.value = jsonData.CODE;
      document.title = CODE.value;
      basic_msg.value = jsonData.basic_msg;
      isInit.value = jsonData.isInit;
      autoCloseOnBlur.value = jsonData.autoCloseOnBlur;

      history.value = jsonData.history;
      chat_show.value = jsonData.chat_show;
      selectedVoice.value = jsonData.selectedVoice || '';
      tempReasoningEffort.value = jsonData.currentPromptConfig?.reasoning_effort || 'default';
      isAutoApproveTools.value = jsonData.isAutoApproveTools || true;

      const configData = await window.api.getConfig();
      currentConfig.value = configData.config;

      zoomLevel.value = currentConfig.value.zoom || 1;
      if (window.api && typeof window.api.setZoomFactor === 'function') {
        window.api.setZoomFactor(zoomLevel.value);
      }

      if (currentConfig.value.isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      const currentPromptConfigFromLoad =
        jsonData.currentPromptConfig || currentConfig.value.prompts[CODE.value];
      if (currentPromptConfigFromLoad && currentPromptConfigFromLoad.icon) {
        AIAvart.value = currentPromptConfigFromLoad.icon;
        favicon.value = currentPromptConfigFromLoad.icon;
      } else {
        AIAvart.value = 'ai.svg';
        favicon.value = currentConfig.value.isDarkMode ? 'favicon-b.png' : 'favicon.png';
      }

      modelList.value = [];
      modelMap.value = {};
      currentConfig.value.providerOrder.forEach((id: string) => {
        const provider = currentConfig.value.providers[id];
        if (provider?.enable) {
          provider.modelList.forEach((m: string) => {
            const key = `${id}|${m}`;
            modelList.value.push({ key, value: key, label: `${provider.name}|${m}` });
            modelMap.value[key] = `${provider.name}|${m}`;
          });
        }
      });

      let restoredModel = '';
      if (jsonData.model && modelMap.value[jsonData.model]) {
        restoredModel = jsonData.model;
      } else if (
        jsonData.currentPromptConfig?.model &&
        modelMap.value[jsonData.currentPromptConfig.model]
      ) {
        restoredModel = jsonData.currentPromptConfig.model;
      } else {
        const currentPromptConfig = currentConfig.value.prompts[CODE.value];
        restoredModel =
          currentPromptConfig?.model && modelMap.value[currentPromptConfig.model]
            ? currentPromptConfig.model
            : modelList.value[0]?.value || '';
      }
      model.value = restoredModel;

      if (jsonData.activeSkillIds && Array.isArray(jsonData.activeSkillIds)) {
        sessionSkillIds.value = [...jsonData.activeSkillIds];
        tempSessionSkillIds.value = [...jsonData.activeSkillIds];
      } else {
        sessionSkillIds.value = [];
        tempSessionSkillIds.value = [];
      }

      if (chat_show.value && chat_show.value.length > 0) {
        chat_show.value.forEach((msg: any) => {
          if (msg.id === undefined) {
            msg.id = messageIdCounter.value++;
          }
        });
        const maxId = Math.max(...chat_show.value.map((m: any) => m.id || 0));
        messageIdCounter.value = maxId + 1;
      }

      const systemMessageIndex = history.value.findIndex((m: any) => m.role === 'system');
      if (systemMessageIndex !== -1) {
        currentSystemPrompt.value = history.value[systemMessageIndex].content;

        if (
          !chat_show.value[systemMessageIndex] ||
          chat_show.value[systemMessageIndex].role !== 'system'
        ) {
          chat_show.value.unshift({
            role: 'system',
            content: currentSystemPrompt.value,
            id: messageIdCounter.value++,
          });
        }
      } else if (currentConfig.value.prompts[CODE.value]?.prompt) {
        currentSystemPrompt.value = currentConfig.value.prompts[CODE.value].prompt;
        history.value.unshift({ role: 'system', content: currentSystemPrompt.value });
        chat_show.value.unshift({
          role: 'system',
          content: currentSystemPrompt.value,
          id: messageIdCounter.value++,
        });
      } else {
        currentSystemPrompt.value = '';
      }

      if (model.value) {
        currentProviderID.value = model.value.split('|')[0];
        const provider = currentConfig.value.providers[currentProviderID.value];
        base_url.value = provider?.url;
        api_key.value = provider?.api_key;
      } else {
        showDismissibleMessage.error('没有可用的模型。请检查您的服务商配置。');
        loading.value = false;
        return;
      }

      loading.value = false;
      await nextTick();
      scrollToBottom();

      let mcpServersToLoad: string[] = [];
      if (jsonData.activeMcpServerIds && Array.isArray(jsonData.activeMcpServerIds)) {
        mcpServersToLoad = jsonData.activeMcpServerIds;
      } else {
        mcpServersToLoad = jsonData.currentPromptConfig?.defaultMcpServers || [];
      }

      if (sessionSkillIds.value.length > 0 && currentConfig.value.mcpServers) {
        const builtinIds = Object.entries(currentConfig.value.mcpServers)
          .filter(([, server]: any) => server.type === 'builtin')
          .map(([id]) => id as string);
        mcpServersToLoad = [...new Set([...mcpServersToLoad, ...builtinIds])];
      }

      const validMcpServerIds = mcpServersToLoad.filter(
        (id: string) => currentConfig.value.mcpServers && currentConfig.value.mcpServers[id],
      );

      if (validMcpServerIds.length > 0) {
        sessionMcpServerIds.value = [...validMcpServerIds];
        tempSessionMcpServerIds.value = [...validMcpServerIds];
        applyMcpTools(false);
      } else {
        sessionMcpServerIds.value = [];
        tempSessionMcpServerIds.value = [];
        applyMcpTools(false);
      }

      isSessionDirty.value = false;
      hasSessionInitialized.value = true;
    } catch (error: any) {
      console.error('加载会话失败:', error);
      showDismissibleMessage.error(`加载会话失败: ${error.message}`);
      loading.value = false;
      hasSessionInitialized.value = true;
    }
  };

  const checkAndLoadSessionFromFile = async (file: any) => {
    if (file && file.name.toLowerCase().endsWith('.json')) {
      try {
        const fileContent = await file.text();
        const jsonData = JSON.parse(fileContent);
        if (jsonData && jsonData.anywhere_history === true) {
          defaultConversationName.value = file.name.replace(/\.json$/i, '');
          await loadSession(jsonData);
          return true;
        }
      } catch (e: any) {
        console.warn('一个JSON文件被检测到，但它不是一个有效的会话文件:', e.message);
      }
    }
    return false;
  };

  return {
    saveWindowSize,
    getSessionDataAsObject,
    saveSessionToCloud,
    saveSessionAsMarkdown,
    saveSessionAsHtml,
    saveSessionAsJson,
    handleRenameSession,
    handleSaveAction,
    loadSession,
    checkAndLoadSessionFromFile,
  };
}
