// @ts-nocheck
import { nextTick } from 'vue';

export function useChatMessageActions(options: any) {
  const {
    refs,
    messageStore,
    showDismissibleMessage,
    scheduleCodeBlockEnhancement,
    markSessionDirty,
    scheduleAutoSave,
    askAI,
    getMessageComponentById,
  } = options;

  const {
    loading,
    collapsedMessages,
    messageRefs,
    focusedMessageIndex,
    currentConfig,
    CODE,
    isSessionDirty,
    defaultConversationName,
    currentConversationId,
    chatInputRef,
    chatContainerRef,
  } = refs;

  const copyText = async (content: any, messageId: string | number) => {
    const visible = messageStore.visibleMessages.value || [];
    const lastMessage = visible.length > 0 ? visible[visible.length - 1] : null;
    if (loading.value && lastMessage && String(lastMessage.id) === String(messageId)) return;
    await window.api.copyText(content);
  };

  const handleEditMessage = (messageId: string | number, newContent: string) => {
    const changed = messageStore.editVisibleById(messageId, newContent);
    if (!changed) return;
    markSessionDirty();
    if (typeof scheduleAutoSave === 'function') {
      scheduleAutoSave({ immediate: true });
    }
    scheduleCodeBlockEnhancement();
  };

  const handleEditStart = async (messageId: string | number) => {
    const scrollContainer = chatContainerRef.value?.$el;
    const childComponent = getMessageComponentById(messageId);
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

  const reaskAI = async (assistantMessageId?: string | number) => {
    if (loading.value) return;

    const visible = (messageStore.visibleMessages.value || []).filter(
      (message: any) => String(message?.role || '').toLowerCase() !== 'system',
    );
    const lastVisibleMessage = visible.length > 0 ? visible[visible.length - 1] : null;

    if (!lastVisibleMessage) {
      showDismissibleMessage.warning('没有可以重新提问的用户消息');
      return;
    }
    if (String(lastVisibleMessage.role || '') !== 'assistant') {
      showDismissibleMessage.warning('仅支持对最后一条 AI 消息重新生成');
      return;
    }
    if (
      assistantMessageId !== undefined &&
      assistantMessageId !== null &&
      String(assistantMessageId) !== String(lastVisibleMessage.id)
    ) {
      showDismissibleMessage.warning('仅支持对最后一条 AI 消息重新生成');
      return;
    }

    const rollbackResult = messageStore.rollbackLastTurnForRegenerate();
    if (!rollbackResult?.ok) {
      showDismissibleMessage.warning('没有可以重新提问的用户消息');
      return;
    }

    collapsedMessages.value.clear();
    await nextTick();
    markSessionDirty();
    if (typeof scheduleAutoSave === 'function') {
      scheduleAutoSave({ immediate: true });
    }
    await askAI(true);
  };

  const handleEditEnd = async ({ id, action, content }: any) => {
    if (action !== 'save') return;

    const currentMessage = messageStore.getVisibleMessageById(id);
    if (!currentMessage) return;

    handleEditMessage(id, content);
    showDismissibleMessage.success('消息已更新');

    const visible = messageStore.visibleMessages.value || [];
    const lastVisible = visible.length > 0 ? visible[visible.length - 1] : null;
    if (
      lastVisible &&
      String(lastVisible.id) === String(id) &&
      String(currentMessage.role || '').toLowerCase() === 'user'
    ) {
      await nextTick();
      await reaskAI();
    }
  };

  const deleteMessage = (messageId: string | number) => {
    if (loading.value) {
      showDismissibleMessage.warning('请等待当前回复完成后再操作');
      return;
    }

    const target = messageStore.getVisibleMessageById(messageId);
    if (!target) return;
    if (String(target.role || '').toLowerCase() === 'system') {
      showDismissibleMessage.info('系统提示词不能被删除');
      return;
    }

    const result = messageStore.deleteVisibleById(messageId);
    if (!result?.ok) {
      showDismissibleMessage.error('删除失败：消息状态不一致。');
      return;
    }

    const removedIndex = Number(result.removedVisibleIndex);
    if (Number.isFinite(removedIndex) && removedIndex >= 0) {
      const reindexed = new Set();
      for (const collapsedIdx of collapsedMessages.value) {
        if (collapsedIdx < removedIndex) {
          reindexed.add(collapsedIdx);
        } else if (collapsedIdx > removedIndex) {
          reindexed.add(collapsedIdx - 1);
        }
      }
      collapsedMessages.value = reindexed;
    }
    focusedMessageIndex.value = null;

    markSessionDirty();
    if (typeof scheduleAutoSave === 'function') {
      scheduleAutoSave({ immediate: true, force: true });
    }
  };

  const clearHistory = () => {
    if (loading.value) return;

    const promptFromConfig = currentConfig.value?.prompts?.[CODE.value]?.prompt;
    const currentSystemMessage = (messageStore.visibleMessages.value || []).find(
      (message: any) => String(message?.role || '').toLowerCase() === 'system',
    );
    const systemPrompt = promptFromConfig || String(currentSystemMessage?.content || '');

    messageStore.clearToSystem({ systemPrompt });

    collapsedMessages.value.clear();
    messageRefs.clear();
    focusedMessageIndex.value = null;
    defaultConversationName.value = '';
    if (currentConversationId) {
      currentConversationId.value = '';
    }
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
