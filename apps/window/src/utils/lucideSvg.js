const escapeAttrValue = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const serializeAttrs = (attrs = {}) => {
  const entries = Object.entries(attrs).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return '';
  return ` ${entries.map(([name, value]) => `${name}="${escapeAttrValue(value)}"`).join(' ')}`;
};

export const renderLucideSvg = (iconNode, options = {}) => {
  const size = options.size ?? 16;
  const strokeWidth = options.strokeWidth ?? 2;
  const className = options.className ? ` class="${escapeAttrValue(options.className)}"` : '';

  const children = (iconNode || [])
    .map(([tag, attrs]) => {
      const { key, ...rest } = attrs || {};
      void key;
      return `<${tag}${serializeAttrs(rest)}></${tag}>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${escapeAttrValue(size)}" height="${escapeAttrValue(size)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${escapeAttrValue(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${className}>${children}</svg>`;
};

export default renderLucideSvg;
