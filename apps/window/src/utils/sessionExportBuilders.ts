export const getExportTimestamp = (now: Date = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;

export const getExportFileTimestamp = (now: Date = new Date()) =>
  `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(
    2,
    '0',
  )}${String(now.getSeconds()).padStart(2, '0')}`;

export const getDefaultExportBasename = (
  defaultConversationName: string,
  code: string,
  fileTimestamp: string,
) => defaultConversationName || `${code || 'AI'}-${fileTimestamp}`;

export const buildMarkdownSessionContent = ({
  code,
  timestamp,
  modelLabel,
  currentSystemPrompt,
  chatShow,
  formatTimestamp,
}: {
  code: string;
  timestamp: string;
  modelLabel: string;
  currentSystemPrompt: string;
  chatShow: any[];
  formatTimestamp: (value: any) => string;
}) => {
  let markdownContent = '';

  const formatContent = (content: any) =>
    !Array.isArray(content)
      ? String(content).trim()
      : content.map((p: any) => (p.type === 'text' ? p.text.trim() : '')).join(' ');

  const formatFiles = (content: any) =>
    Array.isArray(content)
      ? content
          .filter((p: any) => p.type !== 'text')
          .map((p: any) => (p.type === 'file' ? p.file.filename : 'Image'))
      : [];

  const addBlockquote = (text: string) => {
    if (!text) return '';
    return text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  };

  const truncate = (str: string, len = 50) => {
    if (!str) return '';
    const s = String(str);
    return s.length > len ? `${s.substring(0, len)}...` : s;
  };

  markdownContent += `# 聊天记录: ${code} (${timestamp})\n\n### 当前模型: ${modelLabel || 'N/A'}\n\n`;

  if (currentSystemPrompt && currentSystemPrompt.trim()) {
    markdownContent += `### 系统提示词\n\n${addBlockquote(currentSystemPrompt.trim())}\n\n`;
  }
  markdownContent += '---\n\n';

  for (const message of chatShow) {
    if (message.role === 'system') continue;

    if (message.role === 'user') {
      let userHeader = '### 👤 用户';
      if (message.timestamp) userHeader += ` - *${formatTimestamp(message.timestamp)}*`;
      markdownContent += `${userHeader}\n\n`;

      const mainContent = formatContent(message.content);
      const files = formatFiles(message.content);

      if (mainContent) markdownContent += `${addBlockquote(mainContent)}\n\n`;

      if (files.length > 0) {
        markdownContent += '> **附件列表:**\n';
        files.forEach((f: string) => {
          markdownContent += `> - \`${f}\`\n`;
        });
        markdownContent += '\n';
      }
    } else if (message.role === 'assistant') {
      let assistantHeader = `### 🤖 ${message.aiName || 'AI'}`;
      if (message.voiceName) assistantHeader += ` (${message.voiceName})`;
      if (message.completedTimestamp)
        assistantHeader += ` - *${formatTimestamp(message.completedTimestamp)}*`;
      markdownContent += `${assistantHeader}\n\n`;

      if (message.reasoning_content) {
        markdownContent += `> *思考过程:*\n${addBlockquote(message.reasoning_content)}\n\n`;
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        markdownContent += '> **工具调用:**\n';
        message.tool_calls.forEach((tool: any) => {
          markdownContent += `> - 🛠️ \`${tool.name}\`: ${truncate(tool.result)}\n`;
        });
        markdownContent += '\n';
      }

      const mainContent = formatContent(message.content);
      if (mainContent) markdownContent += `${addBlockquote(mainContent)}\n\n`;
      else if (message.status) markdownContent += '> *(AI正在思考...)*\n\n';
    }
    markdownContent += '---\n\n';
  }

  return markdownContent;
};

export const buildHtmlSessionContent = async ({
  code,
  timestamp,
  modelLabel,
  currentSystemPrompt,
  chatShow,
  userAvatar,
  aiAvatar,
  formatTimestamp,
  getMarkdownRuntime,
}: {
  code: string;
  timestamp: string;
  modelLabel: string;
  currentSystemPrompt: string;
  chatShow: any[];
  userAvatar: string;
  aiAvatar: string;
  formatTimestamp: (value: any) => string;
  getMarkdownRuntime: () => Promise<any>;
}) => {
  const { marked, DOMPurify } = await getMarkdownRuntime();
  let bodyContent = '';
  let tocContent = '';

  const defaultAiSvg = `<svg width="200" height="200" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#FDA5A5" /><g stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><rect x="25" y="32" width="50" height="42" rx="8" /><line x1="40" y1="63" x2="60" y2="63" /><line x1="35" y1="32" x2="32" y2="22" /><line x1="65" y1="32" x2="68" y2="22" /></g><g fill="white" stroke="none"><circle cx="40" cy="48" r="3.5" /><circle cx="60" cy="48" r="3.5" /><circle cx="32" cy="20" r="3" /><circle cx="68" cy="20" r="3" /></g></svg>`;

  const truncate = (str: string, len = 50) => {
    if (!str) return '';
    const s = String(str);
    return s.length > len ? `${s.substring(0, len)}...` : s;
  };

  const formatMessageText = (content: any) => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return String(content);

    let textString = '';
    content.forEach((part: any) => {
      if (
        part.type === 'text' &&
        part.text &&
        !(
          part.text.toLowerCase().startsWith('file name:') &&
          part.text.toLowerCase().endsWith('file end')
        )
      ) {
        textString += part.text;
      }
    });
    return textString.trim();
  };

  const processContentToHtml = (content: any) => {
    if (!content) return '';
    let markdownString = '';
    if (typeof content === 'string') {
      markdownString = content;
    } else if (Array.isArray(content)) {
      markdownString = content
        .map((part: any) => {
          if (part.type === 'text') {
            return part.text || '';
          }
          if (part.type === 'image_url' && part.image_url?.url) {
            return `![Image](${part.image_url.url})`;
          }
          if (part.type === 'input_audio' && part.input_audio?.data) {
            return `<audio controls src="data:audio/${part.input_audio.format};base64,${part.input_audio.data}"></audio>`;
          }
          if (part.type === 'file' && part.file?.filename) {
            return `*📎 附件: ${part.file.filename}*`;
          }
          return '';
        })
        .join(' ');
    } else {
      markdownString = String(content);
    }
    return marked.parse(markdownString);
  };

  if (currentSystemPrompt && currentSystemPrompt.trim()) {
    const sysTocText = '系统提示词';
    const sysDotClass = 'system-dot';
    const sysMsgId = 'msg-system';
    tocContent += `
        <li class="timeline-item">
            <a href="#${sysMsgId}" class="timeline-dot ${sysDotClass}" aria-label="${sysTocText}">
                <span class="timeline-tooltip">${sysTocText}</span>
            </a>
        </li>`;

    bodyContent += `
            <div id="${sysMsgId}" class="message-wrapper align-left">
              <div class="header system-header"><strong>系统提示词</strong></div>
              <div class="message-body system-body">${DOMPurify.sanitize(marked.parse(currentSystemPrompt))}</div>
            </div>
          `;
  }

  chatShow.forEach((message: any, index: number) => {
    if (message.role === 'system') return;

    const isUser = message.role === 'user';
    const msgId = `msg-${index}`;

    let tocText = '';
    if (isUser) tocText = truncate(formatMessageText(message.content), 30) || '用户发送图片/文件';
    else tocText = truncate(formatMessageText(message.content), 30) || 'AI 回复';

    const dotClass = isUser ? 'user-dot' : 'ai-dot';

    tocContent += `
        <li class="timeline-item">
            <a href="#${msgId}" class="timeline-dot ${dotClass}" aria-label="${tocText}">
                <span class="timeline-tooltip">${tocText}</span>
            </a>
        </li>`;

    let avatar = isUser ? userAvatar : aiAvatar;
    if (!isUser) {
      if (avatar === 'ai.svg' || (!avatar.startsWith('http') && !avatar.startsWith('data:'))) {
        avatar = `data:image/svg+xml;base64,${btoa(defaultAiSvg)}`;
      }
    }

    const author = isUser ? '用户' : message.aiName || 'AI';
    const time = message.timestamp || message.completedTimestamp;
    const alignClass = isUser ? 'align-right' : 'align-left';

    const processedHtml = processContentToHtml(message.content);
    let contentHtml = '';
    if (processedHtml && processedHtml.trim() !== '') {
      contentHtml = DOMPurify.sanitize(processedHtml, {
        ADD_TAGS: ['video', 'audio', 'source', 'blockquote'],
        USE_PROFILES: { html: true, svg: true },
        ADD_ATTR: ['style'],
      });
    }

    let toolsHtml = '';
    if (message.tool_calls && message.tool_calls.length > 0) {
      toolsHtml = '<div class="tool-calls-wrapper">';
      message.tool_calls.forEach((tool: any) => {
        const truncatedResult = truncate(tool.result, 100);
        const safeResult = truncatedResult
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        toolsHtml += `
                <div class="tool-call-box">
                    <span class="tool-icon">🛠️</span>
                    <span class="tool-name">${tool.name}</span>
                    <span class="tool-result">${safeResult}</span>
                </div>`;
      });
      toolsHtml += '</div>';
    }

    if (contentHtml || toolsHtml) {
      let headerHtml = '';
      if (isUser) {
        headerHtml = `
               <div class="header user-header">
                 <span class="timestamp">${time ? formatTimestamp(time) : ''}</span>
                 <img src="${avatar}" class="avatar" alt="avatar">
               </div>`;
      } else {
        headerHtml = `
               <div class="header ai-header">
                 <img src="${avatar}" class="avatar" alt="avatar">
                 <div class="ai-meta">
                    <div class="ai-name-row">
                        <strong>${author}</strong>
                        ${message.voiceName ? `<span class="voice-tag">(${message.voiceName})</span>` : ''}
                    </div>
                    <span class="timestamp">${time ? formatTimestamp(time) : ''}</span>
                 </div>
               </div>`;
      }

      const bodyHtml = contentHtml
        ? `<div class="message-body ${isUser ? 'user-body' : 'ai-body'}">${contentHtml}</div>`
        : '';

      bodyContent += `
            <div id="${msgId}" class="message-wrapper ${alignClass}">
              ${headerHtml}
              ${toolsHtml}
              ${bodyHtml}
            </div>
          `;
    }
  });

  const cssStyles = `
      <style>
        :root { 
            --bg-color: #fbfbfb; 
            --text-color: #202020; 
            --card-bg: #f8f8f5; 
            --user-bg: #e1f5fe; 
            --ai-bg: #f8f8f5; 
            --border-color: #e5e5e5; 
            --accent-color: #3f5567; 
            --timeline-line: #e0e0e0;
            --timeline-dot-default: #bdbdbd;
            --timeline-dot-active: #3f5567;
        }
        @media (prefers-color-scheme: dark) {
          :root { 
              --bg-color: #1a1a1a; 
              --text-color: #e0e0e0; 
              --card-bg: #2a2a2a; 
              --user-bg: #0d47a1; 
              --ai-bg: #3a3a3a; 
              --border-color: #444; 
              --accent-color: #64b5f6; 
              --timeline-line: #444;
              --timeline-dot-default: #666;
              --timeline-dot-active: #64b5f6;
          }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 20px; background-color: var(--bg-color); color: var(--text-color); line-height: 1.6; }
        .main-container { max-width: 900px; margin: 0 auto; background-color: var(--card-bg); border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); position: relative; }
        .page-header { margin-bottom: 40px; border-bottom: 1px solid var(--border-color); padding-bottom: 20px; }
        .page-header h1 { margin: 0 0 10px 0; font-size: 24px; }
        .page-header p { margin: 0; color: #888; font-size: 13px; }
        .timeline-toc {
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            z-index: 100;
            max-height: 80vh;
            overflow-y: auto;
            scrollbar-width: none; 
            padding: 10px;
        }
        .timeline-toc::-webkit-scrollbar { display: none; }
        .timeline-list {
            list-style: none;
            padding: 0;
            margin: 0;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px; 
        }
        .timeline-list::before {
            content: '';
            position: absolute;
            top: 0;
            bottom: 0;
            left: 50%;
            width: 2px;
            background-color: var(--timeline-line);
            transform: translateX(-50%);
            z-index: -1;
            border-radius: 2px;
        }
        .timeline-item { position: relative; }
        .timeline-dot {
            display: block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: var(--card-bg);
            border: 2px solid var(--timeline-dot-default);
            transition: all 0.2s ease;
            position: relative;
        }
        .timeline-dot.user-dot {
            background-color: var(--timeline-dot-active);
            border-color: var(--timeline-dot-active);
            width: 12px; 
            height: 12px;
        }
        .timeline-dot.ai-dot {
            border-color: var(--timeline-dot-default);
        }
        .timeline-dot.system-dot {
            border-color: #795548;
            background-color: #795548;
        }
        .timeline-dot:hover {
            transform: scale(1.4);
            border-color: var(--accent-color);
            background-color: var(--accent-color);
        }
        .timeline-tooltip {
            position: absolute;
            right: 25px;
            top: 50%;
            transform: translateY(-50%);
            background-color: var(--accent-color);
            color: #f7f7f3;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s, transform 0.2s;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .timeline-dot:hover .timeline-tooltip {
            opacity: 1;
            transform: translateY(-50%) translateX(-5px);
        }
        .message-wrapper { display: flex; flex-direction: column; margin-bottom: 30px; scroll-margin-top: 60px; max-width: 100%; }
        .align-right { align-items: flex-end; }
        .align-left { align-items: flex-start; }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; font-size: 12px; color: #888; }
        .user-header { flex-direction: row; }
        .ai-header { flex-direction: row; align-items: flex-start; }
        .avatar { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; background-color: #eee; flex-shrink: 0; }
        .ai-meta { display: flex; flex-direction: column; line-height: 1.3; }
        .ai-name-row { display: flex; align-items: center; gap: 5px; }
        .voice-tag { opacity: 0.8; font-size: 11px; }
        .message-body { padding: 12px 16px; border-radius: 12px; word-break: break-word; overflow-wrap: break-word; max-width: 100%; }
        .user-body { background-color: var(--user-bg); border-bottom-right-radius: 2px; color: var(--text-color); max-width: 90%; }
        .ai-body { background-color: var(--ai-bg); border: 1px solid var(--border-color); border-top-left-radius: 2px; width: 100%; box-sizing: border-box; }
        .system-body { background-color: #fff3e0; color: #5d4037; border: 1px dashed #d7ccc8; width: 100%; text-align: center; }
        .tool-calls-wrapper { width: 100%; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
        .tool-call-box { background-color: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #666; display: flex; align-items: center; gap: 8px; }
        .tool-name { font-weight: bold; }
        .tool-result { opacity: 0.7; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        img { max-width: 100%; border-radius: 8px; margin: 5px 0; }
        pre { background-color: #2d2d2d; color: #f8f8f2; padding: 1em; border-radius: 8px; overflow-x: auto; font-family: monospace; }
        blockquote { border-left: 4px solid #ccc; padding-left: 1em; margin: 1em 0; color: #666; background: rgba(0,0,0,0.03); }
        @media (max-width: 768px) {
          .timeline-toc { display: none; }
          .main-container { padding: 20px; width: 100%; box-sizing: border-box; border-radius: 0; box-shadow: none; background-color: transparent; }
          .message-body { max-width: 100%; }
          .user-body { max-width: 95%; }
          body { padding: 0; }
        }
      </style>
    `;

  return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>聊天记录: ${code} (${timestamp})</title>
        ${cssStyles}
      </head>
      <body>
        <nav class="timeline-toc">
            <ul class="timeline-list">
                ${tocContent}
            </ul>
        </nav>
        <div class="main-container">
            <header class="page-header">
                <h1>${code}</h1>
                <p>模型: ${modelLabel || 'N/A'} &bull; 导出时间: ${timestamp}</p>
            </header>
            <div class="chat-container">
                ${bodyContent}
            </div>
        </div>
      </body>
      </html>
    `;
};
