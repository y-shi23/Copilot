export const getMessagePreviewText = (message: any) => {
  let text = '';

  if (typeof message.content === 'string') {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    const textPart = message.content.find((p) => p.type === 'text' && p.text && p.text.trim());
    if (textPart) {
      text = textPart.text;
    } else {
      const filePart = message.content.find((p) => p.type === 'file' || p.type === 'input_file');
      const imgPart = message.content.find((p) => p.type === 'image_url');
      const audioPart = message.content.find((p) => p.type === 'input_audio');

      if (filePart) {
        text = `[文件] ${filePart.filename || filePart.name || '未知文件'}`;
      } else if (imgPart) {
        text = '[图片]';
      } else if (audioPart) {
        text = '[语音消息]';
      }
    }
  }

  if (!text && message.tool_calls && message.tool_calls.length > 0) {
    const toolNames = message.tool_calls.map((t) => t.name).join(', ');
    text = `调用工具: ${toolNames}`;
  }

  if (!text && message.role === 'assistant' && message.status === 'thinking') {
    text = '思考中...';
  }

  if (!text) text = message.role === 'user' ? '用户消息' : 'AI 回复';

  return text.slice(0, 30) + (text.length > 30 ? '...' : '');
};
