// @ts-nocheck
import { computed, nextTick, ref } from 'vue';
import { Copy } from 'lucide-vue-next';

import { renderLucideSvg } from '../utils/lucideSvg';

export function useChatViewport(options: any) {
  const {
    chatShow,
    chatContainerRef,
    showDismissibleMessage,
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
  const isSticky = ref(true);
  const messageRefs = new Map();

  let chatObserver: MutationObserver | null = null;
  let observerFlushFrame = 0;
  let shouldFlushStickyScroll = false;
  let shouldFlushCodeBlockScan = false;
  let codeBlockScanFrame = 0;
  let isCodeBlockScanQueued = false;

  const setMessageRef = (el: any, id: any) => {
    if (el) {
      messageRefs.set(id, el);
    } else {
      messageRefs.delete(id);
    }
  };

  const getMessageComponentByIndex = (index: number) => {
    const msg = chatShow.value[index];
    if (!msg) return undefined;
    return messageRefs.get(msg.id);
  };

  const isViewingLastMessage = computed(() => {
    if (focusedMessageIndex.value === null) return false;
    return focusedMessageIndex.value === chatShow.value.length - 1;
  });

  const nextButtonTooltip = computed(() => {
    return isViewingLastMessage.value ? '滚动到底部' : '查看下一条消息';
  });

  const scrollToBottom = async (behavior = 'auto') => {
    await nextTick();
    const el = chatContainerRef.value?.$el;
    if (el) {
      isSticky.value = true;
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  };

  const scrollToTop = () => {
    const el = chatContainerRef.value?.$el;
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
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
  };

  const navigateToPreviousMessage = () => {
    findFocusedMessageIndex();
    const currentIndex = focusedMessageIndex.value;
    if (currentIndex === null) return;

    const targetComponent = getMessageComponentByIndex(currentIndex);
    const container = chatContainerRef.value?.$el;
    if (!targetComponent || !container) return;

    const element = targetComponent.$el;
    const scrollDifference = container.scrollTop - element.offsetTop;
    if (scrollDifference > 5) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      focusedMessageIndex.value = newIndex;
      const previousComponent = getMessageComponentByIndex(newIndex);
      if (previousComponent) {
        previousComponent.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const navigateToNextMessage = () => {
    findFocusedMessageIndex();
    if (
      focusedMessageIndex.value !== null &&
      focusedMessageIndex.value < chatShow.value.length - 1
    ) {
      focusedMessageIndex.value++;
      const targetComponent = getMessageComponentByIndex(focusedMessageIndex.value);
      if (targetComponent) {
        targetComponent.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      forceScrollToBottom();
    }
  };

  const addCopyButtonsToCodeBlocks = async () => {
    await nextTick();
    document.querySelectorAll('.markdown-body pre.hljs').forEach((pre) => {
      if (pre.querySelector('.code-block-copy-button')) return;
      const codeElement = pre.querySelector('code');
      if (!codeElement) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const codeText = codeElement.textContent || '';
      const lines = codeText.trimEnd().split('\n');
      const lineCount = lines.length;
      const copyButtonSVG = renderLucideSvg(Copy, { size: 14, strokeWidth: 2 });

      const createButton = (positionClass: string) => {
        const button = document.createElement('button');
        button.className = `code-block-copy-button ${positionClass}`;
        button.innerHTML = copyButtonSVG;
        button.title = 'Copy code';
        button.addEventListener('click', async (event) => {
          event.stopPropagation();
          try {
            await navigator.clipboard.writeText(codeText.trimEnd());
            showDismissibleMessage.success('Code copied to clipboard!');
          } catch (err) {
            console.error('Failed to copy code:', err);
            showDismissibleMessage.error('Failed to copy code.');
          }
        });
        wrapper.appendChild(button);
      };

      createButton('code-block-copy-button-bottom');
      if (lineCount > 3) createButton('code-block-copy-button-top');
    });
  };

  const scheduleCodeBlockEnhancement = () => {
    if (isCodeBlockScanQueued) return;
    isCodeBlockScanQueued = true;

    codeBlockScanFrame = window.requestAnimationFrame(async () => {
      codeBlockScanFrame = 0;
      isCodeBlockScanQueued = false;
      await addCopyButtonsToCodeBlocks();
    });
  };

  const flushObservedDomUpdates = () => {
    observerFlushFrame = 0;
    const chatMainElement = chatContainerRef.value?.$el;
    if (!chatMainElement) return;

    if (shouldFlushStickyScroll && isSticky.value) {
      chatMainElement.scrollTop = chatMainElement.scrollHeight;
    }

    if (shouldFlushCodeBlockScan) {
      scheduleCodeBlockEnhancement();
    }

    shouldFlushStickyScroll = false;
    shouldFlushCodeBlockScan = false;
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
      shouldFlushCodeBlockScan = true;
      if (!observerFlushFrame) {
        observerFlushFrame = window.requestAnimationFrame(flushObservedDomUpdates);
      }
    });

    chatObserver.observe(chatMainElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  const detachChatDomObserver = () => {
    if (observerFlushFrame) {
      window.cancelAnimationFrame(observerFlushFrame);
      observerFlushFrame = 0;
    }
    if (codeBlockScanFrame) {
      window.cancelAnimationFrame(codeBlockScanFrame);
      codeBlockScanFrame = 0;
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
      .map((msg: any, index: number) => ({ ...msg, originalIndex: index }))
      .filter((msg: any) => msg.role !== 'system');
  });

  const scrollToMessageByIndex = (index: number) => {
    const component = getMessageComponentByIndex(index);
    if (component && component.$el && component.$el.nodeType === 1) {
      component.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      focusedMessageIndex.value = index;
    }
  };

  return {
    isAtBottom,
    showScrollToBottomButton,
    isForcingScroll,
    focusedMessageIndex,
    isSticky,
    messageRefs,
    setMessageRef,
    getMessageComponentByIndex,
    isViewingLastMessage,
    nextButtonTooltip,
    scrollToBottom,
    scrollToTop,
    forceScrollToBottom,
    handleScroll,
    navigateToPreviousMessage,
    navigateToNextMessage,
    scheduleCodeBlockEnhancement,
    handleMarkdownImageClick,
    handleWheel,
    attachChatDomObserver,
    detachChatDomObserver,
    navMessages,
    scrollToMessageByIndex,
  };
}
