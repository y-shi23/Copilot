// @ts-nocheck
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

function pruneKatexFontFormats() {
  return {
    name: 'prune-katex-font-formats',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('katex/dist/katex.min.css')) return null;
      return {
        code: code.replace(
          /,url\(fonts\/[^)]+\.woff\)\s*format\("woff"\),url\(fonts\/[^)]+\.ttf\)\s*format\("truetype"\)/g,
          '',
        ),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [vue(), pruneKatexFontFormats()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'highlight.js': 'highlight.js/lib/common',
    },
  },
  base: './',
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 2000,
    minify: 'esbuild',
    esbuild: {
      drop: ['console', 'debugger'],
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        manualChunks: {
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
          mermaid: ['mermaid'],
          highlight: ['highlight.js'],
          markdown: ['markdown-it'],
          katex: ['katex'],
          'vendor-utils': ['dompurify', 'recorder-core'],
        },
      },
    },
  },
});
