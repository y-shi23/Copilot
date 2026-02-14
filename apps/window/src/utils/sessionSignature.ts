export const summarizeTextForSignature = (value: any) => {
  const text = String(value || '');
  return `${text.length}:${text.slice(-48)}`;
};

export const summarizeContentForSignature = (content: any) => {
  if (!content) return 'null';
  if (typeof content === 'string') return `str:${summarizeTextForSignature(content)}`;
  if (!Array.isArray(content)) {
    let serialized = '';
    try {
      serialized = JSON.stringify(content);
    } catch (_error) {
      serialized = String(content);
    }
    return `obj:${summarizeTextForSignature(serialized)}`;
  }

  return content
    .map((part) => {
      if (part.type === 'text') {
        return `text:${summarizeTextForSignature(part.text)}`;
      }
      if (part.type === 'image_url') {
        return `img:${summarizeTextForSignature(part.image_url?.url)}`;
      }
      if (part.type === 'file') {
        return `file:${part.file?.filename || ''}`;
      }
      if (part.type === 'input_audio') {
        return `audio:${part.input_audio?.format || ''}:${(part.input_audio?.data || '').length}`;
      }
      return `other:${part.type || 'unknown'}`;
    })
    .join('|');
};

export const summarizeToolCallsForSignature = (toolCalls: any) => {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return '';
  return toolCalls
    .map((tool) =>
      [
        tool.id || '',
        tool.name || '',
        tool.approvalStatus || '',
        summarizeTextForSignature(tool.result || ''),
      ].join(':'),
    )
    .join('|');
};

export const buildMessageSignature = (message: any) => {
  if (!message) return '';

  return [
    message.id || '',
    message.role || '',
    message.status || '',
    summarizeTextForSignature(message.reasoning_content || ''),
    summarizeToolCallsForSignature(message.tool_calls),
    summarizeContentForSignature(message.content),
  ].join('~');
};
