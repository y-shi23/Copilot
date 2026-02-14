// @ts-nocheck
import { createApp, h } from 'vue';

const iconRenderCache = new WeakMap();

const getCacheKey = (options = {}) => {
  const size = options.size ?? 16;
  const strokeWidth = options.strokeWidth ?? 2;
  const className = options.className ?? '';
  return `${size}|${strokeWidth}|${className}`;
};

export const renderLucideSvg = (iconComponent, options = {}) => {
  if (!iconComponent || typeof document === 'undefined') return '';

  let componentCache = iconRenderCache.get(iconComponent);
  if (!componentCache) {
    componentCache = new Map();
    iconRenderCache.set(iconComponent, componentCache);
  }

  const cacheKey = getCacheKey(options);
  const cached = componentCache.get(cacheKey);
  if (cached) return cached;

  const size = options.size ?? 16;
  const strokeWidth = options.strokeWidth ?? 2;
  const className = options.className ?? '';

  const container = document.createElement('div');
  const app = createApp({
    render() {
      return h(iconComponent, {
        size,
        strokeWidth,
        class: className || undefined,
      });
    },
  });

  app.mount(container);
  const svgString = container.innerHTML;
  app.unmount();

  componentCache.set(cacheKey, svgString);
  return svgString;
};

export default renderLucideSvg;
