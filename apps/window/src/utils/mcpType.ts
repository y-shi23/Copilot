export const getDisplayTypeName = (type: string) => {
  if (!type) return '';
  const streamableHttpRegex = /^streamable[\s_-]?http$/i;
  const lowerType = type.toLowerCase();

  if (lowerType === 'builtin') {
    return '内置';
  }

  if (streamableHttpRegex.test(lowerType) || lowerType === 'http') {
    return '可流式 HTTP';
  }
  return type;
};
