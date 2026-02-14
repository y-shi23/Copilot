// @ts-nocheck
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        launcher: fileURLToPath(new URL('./launcher.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (id.includes('/src/components/Chats.vue')) return 'tab-chats';
          if (id.includes('/src/components/Prompts.vue')) return 'tab-prompts';
          if (id.includes('/src/components/Mcp.vue')) return 'tab-mcp';
          if (id.includes('/src/components/Skills.vue')) return 'tab-skills';
          if (id.includes('/src/components/Providers.vue')) return 'tab-providers';
          if (id.includes('/src/components/Setting.vue')) return 'tab-settings';

          if (id.includes('node_modules')) {
            if (id.includes('element-plus')) return 'vendor-element-plus';
            if (id.includes('vue-i18n')) return 'vendor-i18n';
            if (id.includes('lucide-vue-next')) return 'vendor-icons';
            if (id.includes('webdav')) return 'vendor-webdav';
            if (id.includes('marked')) return 'vendor-markdown';
            return 'vendor';
          }
        },
      },
    },
  },
  base: './',
});
