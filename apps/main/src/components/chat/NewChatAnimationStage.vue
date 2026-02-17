<script setup lang="ts">
import { shallowRef, watch } from 'vue';

type AnimationModule = { default?: any } | any;
type AnimationLoader = () => Promise<AnimationModule>;

const props = defineProps({
  refreshNonce: {
    type: Number,
    default: 0,
  },
});

const animationLoaders = import.meta.glob('@animation/*.vue') as Record<string, AnimationLoader>;
const animationEntries = Object.entries(animationLoaders)
  .map(([path, loader]) => ({
    path,
    loader,
  }))
  .sort((a, b) => a.path.localeCompare(b.path));

const activeAnimationComponent = shallowRef<any>(null);

const pickRandomAnimationEntry = () => {
  if (!animationEntries.length) return null;
  const randomIndex = Math.floor(Math.random() * animationEntries.length);
  return animationEntries[randomIndex] || null;
};

const loadRandomAnimation = async () => {
  const selectedEntry = pickRandomAnimationEntry();
  if (!selectedEntry) {
    activeAnimationComponent.value = null;
    return;
  }

  try {
    const module = await selectedEntry.loader();
    activeAnimationComponent.value = module?.default || module || null;
  } catch (error) {
    console.error('[NewChatAnimationStage] Failed to load animation component:', error);
    activeAnimationComponent.value = null;
  }
};

watch(
  () => props.refreshNonce,
  () => {
    void loadRandomAnimation();
  },
  { immediate: true },
);
</script>

<template>
  <div class="new-chat-animation-stage" role="status" aria-live="polite">
    <component
      :is="activeAnimationComponent"
      v-if="activeAnimationComponent"
      class="new-chat-animation-stage-component"
    />
    <div v-else class="new-chat-animation-stage-fallback">
      <span class="new-chat-animation-stage-fallback-text">Start a new conversation</span>
    </div>
  </div>
</template>

<style scoped>
.new-chat-animation-stage {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.new-chat-animation-stage-component {
  max-width: 100%;
}

.new-chat-animation-stage-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border-radius: 999px;
  color: var(--el-text-color-secondary);
  background-color: color-mix(in srgb, var(--el-fill-color-light) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--el-border-color-light) 80%, transparent);
}

.new-chat-animation-stage-fallback-text {
  font-size: 12px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
</style>
