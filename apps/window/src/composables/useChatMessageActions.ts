// @ts-nocheck
import { nextTick } from 'vue';

export function useChatMessageActions(options: any) {
  const {
    refs,
    showDismissibleMessage,
    scheduleCodeBlockEnhancement,
    markSessionDirty,
    askAI,
    getMessageComponentByIndex,
  } = options;
  const {
    loading,
    chat_show,
    history,
    collapsedMessages,
    messageRefs,
    focusedMessageIndex,
    messageIdCounter,
    currentConfig,
    CODE,
    isSessionDirty,
    defaultConversationName,
    chatInputRef,
    chatContainerRef,
  } = refs;

  const mapVisibleIndexToHistoryIndex = (index: number) => {
    let historyIdx = -1;
    let showCounter = -1;
    for (let i = 0; i < history.value.length; i++) {
      if (history.value[i].role !== 'tool') {
        showCounter++;
      }
      if (showCounter === index) {
        historyIdx = i;
        break;
      }
    }
    return historyIdx;
  };

  const updateMessageContent = (message: any, newContent: string) => {
    if (!message) return;
    if (typeof message.content === 'string' || message.content === null) {
      message.content = newContent;
      return;
    }
    if (Array.isArray(message.content)) {
      const textPart = message.content.find(
        (p: any) => p.type === 'text' && !(p.text && p.text.toLowerCase().startsWith('file name:')),
      );
      if (textPart) {
        textPart.text = newContent;
      } else {
        message.content.push({ type: 'text', text: newContent });
      }
    }
  };

  const copyText = async (content: any, index: number) => {
    if (loading.value && index === chat_show.value.length - 1) return;
    await window.api.copyText(content);
  };

  const handleEditMessage = (index: number, newContent: string) => {
    if (index < 0 || index >= chat_show.value.length) return;

    const historyIdx = mapVisibleIndexToHistoryIndex(index);
    updateMessageContent(chat_show.value[index], newContent);

    if (historyIdx !== -1 && history.value[historyIdx]) {
      updateMessageContent(history.value[historyIdx], newContent);
    } else {
      console.error(
        '错误：无法将 chat_show 索引映射到 history 索引。下次API请求可能会使用旧数据。',
      );
    }

    markSessionDirty();
    scheduleCodeBlockEnhancement();
  };

  const handleEditStart = async (index: number) => {
    const scrollContainer = chatContainerRef.value?.$el;
    const childComponent = getMessageComponentByIndex(index);
    const element = childComponent?.$el;

    if (!scrollContainer || !element || !childComponent) return;

    childComponent.switchToEditMode();
    await nextTick();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      });
    });
  };

  const reaskAI = async () => {
    if (loading.value) return;

    const lastVisibleMessageIndexInHistory = history.value.findLastIndex(
      (msg: any) => msg.role !== 'tool',
    );

    if (lastVisibleMessageIndexInHistory === -1) {
      showDismissibleMessage.warning('没有可以重新提问的用户消息');
      return;
    }

    const lastVisibleMessage = history.value[lastVisibleMessageIndexInHistory];
    if (lastVisibleMessage.role === 'assistant') {
      const historyItemsToRemove = history.value.length - lastVisibleMessageIndexInHistory;
      const showItemsToRemove = history.value
        .slice(lastVisibleMessageIndexInHistory)
        .filter((m: any) => m.role !== 'tool').length;

      history.value.splice(lastVisibleMessageIndexInHistory, historyItemsToRemove);
      if (showItemsToRemove > 0) {
        chat_show.value.splice(chat_show.value.length - showItemsToRemove);
      }
    } else if (lastVisibleMessage.role !== 'user') {
      showDismissibleMessage.warning('无法从此消息类型重新提问。');
      return;
    }

    collapsedMessages.value.clear();
    await nextTick();
    await askAI(true);
  };

  const handleEditEnd = async ({ id, action, content }: any) => {
    if (action !== 'save') return;

    const currentIndex = chat_show.value.findIndex((m: any) => m.id === id);
    if (currentIndex === -1) return;

    handleEditMessage(currentIndex, content);
    showDismissibleMessage.success('消息已更新');

    if (
      currentIndex === chat_show.value.length - 1 &&
      chat_show.value[currentIndex].role === 'user'
    ) {
      await nextTick();
      await reaskAI();
    }
  };

  const deleteMessage = (index: number) => {
    if (loading.value) {
      showDismissibleMessage.warning('请等待当前回复完成后再操作');
      return;
    }
    if (index < 0 || index >= chat_show.value.length) return;

    const msgToDeleteInShow = chat_show.value[index];
    if (msgToDeleteInShow?.role === 'system') {
      showDismissibleMessage.info('系统提示词不能被删除');
      return;
    }

    const historyIdx = mapVisibleIndexToHistoryIndex(index);
    if (historyIdx === -1) {
      console.error('关键错误: 无法将 chat_show 索引映射到 history 索引。中止删除。');
      showDismissibleMessage.error('删除失败：消息状态不一致。');
      return;
    }

    let historyStartIdx = historyIdx;
    let historyEndIdx = historyIdx;
    const messageToDeleteInHistory = history.value[historyIdx];

    if (
      messageToDeleteInHistory.role === 'assistant' &&
      messageToDeleteInHistory.tool_calls &&
      messageToDeleteInHistory.tool_calls.length > 0
    ) {
      while (history.value[historyEndIdx + 1]?.role === 'tool') {
        historyEndIdx++;
      }
    }

    const historyDeleteCount = historyEndIdx - historyStartIdx + 1;
    if (historyDeleteCount > 0) {
      history.value.splice(historyStartIdx, historyDeleteCount);
    }
    chat_show.value.splice(index, 1);

    const newCollapsedMessages = new Set();
    for (const collapsedIdx of collapsedMessages.value) {
      if (collapsedIdx < index) {
        newCollapsedMessages.add(collapsedIdx);
      } else if (collapsedIdx > index) {
        newCollapsedMessages.add(collapsedIdx - 1);
      }
    }
    collapsedMessages.value = newCollapsedMessages;
    focusedMessageIndex.value = null;
  };

  const clearHistory = () => {
    if (loading.value) return;

    const systemPromptFromConfig = currentConfig.value.prompts[CODE.value]?.prompt;
    const firstMessageInHistory = history.value.length > 0 ? history.value[0] : null;
    const systemPromptFromHistory =
      firstMessageInHistory && firstMessageInHistory.role === 'system'
        ? firstMessageInHistory
        : null;
    const systemPromptToKeep = systemPromptFromConfig
      ? { role: 'system', content: systemPromptFromConfig }
      : systemPromptFromHistory;

    if (systemPromptToKeep) {
      history.value = [systemPromptToKeep];
      chat_show.value = [{ ...systemPromptToKeep, id: messageIdCounter.value++ }];
    } else {
      history.value = [];
      chat_show.value = [];
    }

    collapsedMessages.value.clear();
    messageRefs.clear();
    focusedMessageIndex.value = null;
    defaultConversationName.value = '';
    isSessionDirty.value = false;
    chatInputRef.value?.focus({ cursor: 'end' });
    showDismissibleMessage.success('历史记录已清除');
  };

  return {
    copyText,
    handleEditMessage,
    handleEditStart,
    handleEditEnd,
    reaskAI,
    deleteMessage,
    clearHistory,
  };
}
