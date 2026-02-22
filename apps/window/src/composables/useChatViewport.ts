// @ts-nocheck
import { computed, nextTick, ref, watch } from 'vue';

import { pickActiveOutlineMessageId } from '../utils/activeOutlineMessage';

export function useChatViewport(options: any) {
  const {
    chatShow,
    chatContainerRef,
    zoomLevel,
    currentConfig,
    imageViewerVisible,
    imageViewerSrcList,
    imageViewerInitialIndex,
  } = options;

  const isAtBottom = ref(true);
  const showScrollToBottomButton = ref(false);
  const isForcingScroll = ref(false);
  const focusedMessageIndex = ref(null);
  const activeOutlineMessageId = ref(null);
  const isSticky = ref(true);
  const messageRefs = new Map();

  let chatObserver: MutationObserver | null = null;
  let observerFlushFrame = 0;
  let activeOutlineFrame = 0;
  let shouldFlushStickyScroll = false;

  const setMessageRef = (el: any, id: any) => {
    if (el) {
      messageRefs.set(id, el);
    } else {
      messageRefs.delete(id);
    }
    scheduleActiveOutlineUpdate();
  };

  const getMessageComponentByIndex = (index: number) => {
    const msg = chatShow.value[index];
    if (!msg) return undefined;
    return messageRefs.get(msg.id);
  };

  const getMessageComponentById = (messageId: any) => {
    if (messageId === undefined || messageId === null) return undefined;
    if (messageRefs.has(messageId)) return messageRefs.get(messageId);
    for (const [key, component] of messageRefs.entries()) {
      if (String(key) === String(messageId)) return component;
    }
    return undefined;
  };

  const focusedMessageId = computed(() => {
    if (focusedMessageIndex.value === null) return null;
    const msg = chatShow.value[focusedMessageIndex.value];
    return msg ? msg.id : null;
  });

  const updateActiveOutlineMessage = () => {
    const container = chatContainerRef.value?.$el;
    if (!container) {
      activeOutlineMessageId.value = null;
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;
    const candidates = [];

    for (let index = 0; index < chatShow.value.length; index += 1) {
      const message = chatShow.value[index];
      if (String(message?.role || '').toLowerCase() !== 'assistant') continue;

      const component = getMessageComponentById(message?.id);
      const element = component?.$el;
      if (!element || element.nodeType !== 1) continue;

      const rect = element.getBoundingClientRect();
      candidates.push({
        id: message.id,
        role: message.role,
        top: rect.top,
        bottom: rect.bottom,
        order: index,
      });
    }

    activeOutlineMessageId.value = pickActiveOutlineMessageId(candidates, centerY);
  };

  const scheduleActiveOutlineUpdate = () => {
    if (activeOutlineFrame) return;
    activeOutlineFrame = window.requestAnimationFrame(() => {
      activeOutlineFrame = 0;
      updateActiveOutlineMessage();
    });
  };

  const scrollToBottom = async (behavior = 'auto') => {
    await nextTick();
    const el = chatContainerRef.value?.$el;
    if (el) {
      isSticky.value = true;
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  };

  const forceScrollToBottom = () => {
    isForcingScroll.value = true;
    isSticky.value = true;
    isAtBottom.value = true;
    showScrollToBottomButton.value = false;
    focusedMessageIndex.value = null;

    scrollToBottom('smooth');

    setTimeout(() => {
      isForcingScroll.value = false;
    }, 500);
  };

  const findFocusedMessageIndex = () => {
    const container = chatContainerRef.value?.$el;
    if (!container) return;

    const scrollTop = container.scrollTop;
    let closestIndex = -1;
    let smallestDistance = Infinity;

    for (let i = chatShow.value.length - 1; i >= 0; i--) {
      const msgComponent = getMessageComponentByIndex(i);
      if (msgComponent) {
        const el = msgComponent.$el;
        const elTop = el.offsetTop;
        const elBottom = elTop + el.clientHeight;
        if (elTop < scrollTop + container.clientHeight && elBottom > scrollTop) {
          const distance = Math.abs(elTop - scrollTop);
          if (distance < smallestDistance) {
            smallestDistance = distance;
            closestIndex = i;
          }
        }
      }
    }

    if (closestIndex !== -1) {
      focusedMessageIndex.value = closestIndex;
    }
  };

  const handleScroll = (event: Event) => {
    if (isForcingScroll.value) return;

    const el = event.target as HTMLElement | null;
    if (!el) return;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const tolerance = 20;
    const atBottom = distanceToBottom <= tolerance;

    if (atBottom) {
      if (!isSticky.value) isSticky.value = true;
      if (!isAtBottom.value) isAtBottom.value = true;
      showScrollToBottomButton.value = false;
      focusedMessageIndex.value = null;
    } else {
      if (isSticky.value) isSticky.value = false;
      if (isAtBottom.value) isAtBottom.value = false;
      showScrollToBottomButton.value = true;
      findFocusedMessageIndex();
    }

    scheduleActiveOutlineUpdate();
  };

  const scheduleCodeBlockEnhancement = () => {
    // 兼容旧调用链：新的 markdown 渲染器已内置代码块工具栏与交互。
  };

  const flushObservedDomUpdates = () => {
    observerFlushFrame = 0;
    const chatMainElement = chatContainerRef.value?.$el;
    if (!chatMainElement) return;

    if (shouldFlushStickyScroll && isSticky.value) {
      chatMainElement.scrollTop = chatMainElement.scrollHeight;
    }

    shouldFlushStickyScroll = false;
    scheduleActiveOutlineUpdate();
  };

  const handleMarkdownImageClick = (event: any) => {
    if (event.target.tagName !== 'IMG' || !event.target.closest('.markdown-wrapper')) return;
    const imgElement = event.target as HTMLImageElement;
    if (imgElement && imgElement.src) {
      imageViewerSrcList.value = [imgElement.src];
      imageViewerInitialIndex.value = 0;
      imageViewerVisible.value = true;
    }
  };

  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey) {
      event.preventDefault();
      const zoomStep = 0.05;
      const newZoom = event.deltaY < 0 ? zoomLevel.value + zoomStep : zoomLevel.value - zoomStep;
      zoomLevel.value = Math.max(0.5, Math.min(2.0, newZoom));
      if (currentConfig.value) currentConfig.value.zoom = zoomLevel.value;
    }
  };

  const attachChatDomObserver = () => {
    const chatMainElement = chatContainerRef.value?.$el;
    if (!chatMainElement) return;

    chatMainElement.addEventListener('click', handleMarkdownImageClick);

    chatObserver = new MutationObserver(() => {
      shouldFlushStickyScroll = true;
      if (!observerFlushFrame) {
        observerFlushFrame = window.requestAnimationFrame(flushObservedDomUpdates);
      }
    });

    chatObserver.observe(chatMainElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scheduleActiveOutlineUpdate();
  };

  const detachChatDomObserver = () => {
    if (activeOutlineFrame) {
      window.cancelAnimationFrame(activeOutlineFrame);
      activeOutlineFrame = 0;
    }
    if (observerFlushFrame) {
      window.cancelAnimationFrame(observerFlushFrame);
      observerFlushFrame = 0;
    }
    const chatMainElement = chatContainerRef.value?.$el;
    if (chatMainElement) {
      chatMainElement.removeEventListener('click', handleMarkdownImageClick);
    }

    if (chatObserver) {
      chatObserver.disconnect();
      chatObserver = null;
    }
  };

  const navMessages = computed(() => {
    return chatShow.value
      .map((msg: any) => ({ ...msg, messageId: msg.id }))
      .filter((msg: any) => msg.role !== 'system');
  });

  const scrollToMessageById = (messageId: any) => {
    const component = getMessageComponentById(messageId);
    if (component && component.$el && component.$el.nodeType === 1) {
      component.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const index = chatShow.value.findIndex((msg: any) => String(msg?.id) === String(messageId));
      if (index !== -1) {
        focusedMessageIndex.value = index;
      }
      scheduleActiveOutlineUpdate();
    }
  };

  watch(
    () => chatShow.value.length,
    () => {
      void nextTick().then(() => {
        scheduleActiveOutlineUpdate();
      });
    },
    { flush: 'post' },
  );

  return {
    isAtBottom,
    showScrollToBottomButton,
    isForcingScroll,
    focusedMessageIndex,
    activeOutlineMessageId,
    isSticky,
    messageRefs,
    setMessageRef,
    getMessageComponentByIndex,
    getMessageComponentById,
    focusedMessageId,
    scrollToBottom,
    forceScrollToBottom,
    handleScroll,
    scheduleCodeBlockEnhancement,
    handleMarkdownImageClick,
    handleWheel,
    attachChatDomObserver,
    detachChatDomObserver,
    navMessages,
    scrollToMessageById,
  };
}
