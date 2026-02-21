// @ts-nocheck
import './assets/main.css';
import '@window/assets/dialog-card.css';

import { createApp } from 'vue';
import GlobalQuickLauncher from './components/GlobalQuickLauncher.vue';

const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
if (prefersDark) {
  document.documentElement.classList.add('dark');
}

createApp(GlobalQuickLauncher).mount('#launcher-app');
