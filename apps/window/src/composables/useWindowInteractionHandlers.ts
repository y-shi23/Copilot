// @ts-nocheck

export function useWindowInteractionHandlers(options: any) {
  const { refs, showDismissibleMessage, handleSaveAction } = options;
  const {
    chatInputRef,
    lastSelectionStart,
    lastSelectionEnd,
    isFilePickerOpen,
    systemPromptDialogVisible,
    zoomLevel,
    loading,
  } = refs;

  const handleWindowBlur = () => {
    const textarea = chatInputRef.value?.senderRef?.$refs.textarea;
    if (textarea) {
      lastSelectionStart.value = textarea.selectionStart;
      lastSelectionEnd.value = textarea.selectionEnd;
    }
  };

  const handleWindowFocus = () => {
    if (isFilePickerOpen.value) {
      isFilePickerOpen.value = false;
    }
    setTimeout(() => {
      if (systemPromptDialogVisible.value) return;

      if (
        document.activeElement &&
        document.activeElement.tagName.toLowerCase() === 'textarea' &&
        document.activeElement.closest('.editing-wrapper')
      ) {
        return;
      }

      if (document.activeElement && document.activeElement.closest('.text-search-container')) {
        return;
      }

      const textarea = chatInputRef.value?.senderRef?.$refs.textarea;
      if (!textarea) return;

      if (document.activeElement !== textarea) {
        if (lastSelectionStart.value !== null && lastSelectionEnd.value !== null) {
          chatInputRef.value?.focus({
            position: { start: lastSelectionStart.value, end: lastSelectionEnd.value },
          });
        } else {
          chatInputRef.value?.focus({ cursor: 'end' });
        }
      }
    }, 50);
  };

  const handleCopyImageFromViewer = (url: string) => {
    if (!url) return;
    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`网络错误: ${response.statusText}`);
        const blob = await response.blob();

        try {
          if (['image/png', 'image/jpeg'].includes(blob.type)) {
            const item = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([item]);
            showDismissibleMessage.success('图片已复制到剪贴板 (WebAPI)');
            return;
          }
        } catch (webErr) {
          console.warn('Web Clipboard API 写入失败，尝试回退方案:', webErr);
        }

        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        await window.api.copyImage(base64Data);
        showDismissibleMessage.success('图片已复制到剪贴板');
      } catch (error: any) {
        console.error('复制图片失败:', error);
        showDismissibleMessage.error(`复制失败: ${error.message}`);
      }
    })();
  };

  const handleDownloadImageFromViewer = async (url: string) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const defaultFilename = `image_${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
      await window.api.saveFile({
        title: '保存图片',
        defaultPath: defaultFilename,
        buttonLabel: '保存',
        fileContent: new Uint8Array(arrayBuffer),
      });
      showDismissibleMessage.success('图片保存成功！');
    } catch (error: any) {
      if (!error.message.includes('User cancelled') && !error.message.includes('用户取消')) {
        console.error('下载图片失败:', error);
        showDismissibleMessage.error(`下载失败: ${error.message}`);
      }
    }
  };

  const handleGlobalImageError = (event: any) => {
    const img = event.target;

    if (!(img instanceof HTMLImageElement) || !img.closest('.markdown-wrapper')) {
      return;
    }

    event.preventDefault();
    const originalSrc = img.src;
    if (img.parentNode && img.parentNode.classList.contains('image-error-container')) {
      return;
    }

    const container = document.createElement('div');
    container.className = 'image-error-container';
    container.title = '图片加载失败，点击重试';

    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('viewBox', '0 0 24 24');
    svgIcon.innerHTML = `<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor"></path>`;

    const textLabel = document.createElement('span');
    textLabel.textContent = 'Image';

    container.appendChild(svgIcon);
    container.appendChild(textLabel);

    if (img.parentNode) {
      img.parentNode.replaceChild(container, img);
    }

    container.onclick = (e) => {
      e.stopPropagation();
      const newImg = document.createElement('img');
      newImg.src = `${originalSrc}?t=${new Date().getTime()}`;
      if (container.parentNode) {
        container.parentNode.replaceChild(newImg, container);
      }
    };
  };

  const handleGlobalKeyDown = (event: KeyboardEvent) => {
    const isCtrl = event.ctrlKey || event.metaKey;

    if (isCtrl && event.key.toLowerCase() === 's') {
      event.preventDefault();

      if (loading.value) {
        showDismissibleMessage.warning('请等待 AI 回复完成后再保存');
        return;
      }

      if (document.querySelector('.el-dialog, .el-message-box')) {
        return;
      }
      handleSaveAction();
      return;
    }

    if (!isCtrl) return;

    if (event.key === '0') {
      event.preventDefault();
      zoomLevel.value = 1;
      showDismissibleMessage.info('缩放已重置 (100%)');
      return;
    }

    if (event.key === '=' || event.key === '+') {
      event.preventDefault();
      const newZoom = zoomLevel.value + 0.1;
      zoomLevel.value = Math.min(2.0, newZoom);
      showDismissibleMessage.info(`缩放: ${Math.round(zoomLevel.value * 100)}%`);
      return;
    }

    if (event.key === '-') {
      event.preventDefault();
      const newZoom = zoomLevel.value - 0.1;
      zoomLevel.value = Math.max(0.5, newZoom);
      showDismissibleMessage.info(`缩放: ${Math.round(zoomLevel.value * 100)}%`);
      return;
    }
  };

  const focusOnInput = () => {
    setTimeout(() => {
      chatInputRef.value?.focus({ cursor: 'end' });
    }, 100);
  };

  return {
    handleWindowBlur,
    handleWindowFocus,
    handleCopyImageFromViewer,
    handleDownloadImageFromViewer,
    handleGlobalImageError,
    handleGlobalKeyDown,
    focusOnInput,
  };
}
