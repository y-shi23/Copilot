// @ts-nocheck

export function useFileHandlers(options: any) {
  const { refs, showDismissibleMessage, checkAndLoadSessionFromFile } = options;
  const { fileList, chatInputRef } = refs;

  const file2fileList = async (file: any, idx: number) => {
    const isSessionFile = await checkAndLoadSessionFromFile(file);
    if (isSessionFile) {
      chatInputRef.value?.focus({ cursor: 'end' });
      return;
    }

    return new Promise((resolve, reject) => {
      if (!window.api.isFileTypeSupported(file.name)) {
        const errorMsg = `不支持的文件类型: ${file.name}`;
        showDismissibleMessage.warning(errorMsg);
        reject(new Error(errorMsg));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: any) => {
        fileList.value.push({
          uid: idx,
          name: file.name,
          size: file.size,
          type: file.type,
          url: e.target.result,
        });
        resolve();
      };
      reader.onerror = () => {
        const errorMsg = `读取文件 ${file.name} 失败`;
        showDismissibleMessage.error(errorMsg);
        reject(new Error(errorMsg));
      };
      reader.readAsDataURL(file);
    });
  };

  const processFilePath = async (filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      showDismissibleMessage.error('无效的文件路径');
      return;
    }
    try {
      const fileObject = await window.api.handleFilePath(filePath);
      if (fileObject) await file2fileList(fileObject, fileList.value.length + 1);
      else showDismissibleMessage.error('无法读取或访问该文件，请检查路径和权限');
    } catch (error: any) {
      console.error('调用 handleFilePath 时发生意外错误:', error);
      showDismissibleMessage.error('处理文件路径时发生未知错误');
    }
  };

  const sendFile = async () => {
    const contentList: any[] = [];
    if (fileList.value.length === 0) return contentList;

    for (const currentFile of fileList.value) {
      try {
        const processedContent = await window.api.parseFileObject({
          name: currentFile.name,
          url: currentFile.url,
        });

        if (processedContent) {
          contentList.push(processedContent);
        }
      } catch (error: any) {
        if (error.message.includes('不支持的文件类型')) {
          showDismissibleMessage.warning(error.message);
        } else {
          showDismissibleMessage.error(`处理文件 ${currentFile.name} 失败: ${error.message}`);
        }
      }
    }

    fileList.value = [];
    return contentList;
  };

  return {
    file2fileList,
    processFilePath,
    sendFile,
  };
}
