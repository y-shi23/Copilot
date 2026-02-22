<template>
  <component :is="tag" class="shimmer-wrapper" :class="{ 'shimmer-enabled': enabled }">
    <span class="shimmer-content">
      <slot />
    </span>
    <span v-if="enabled" class="shimmer-shine" :style="shineStyle" aria-hidden="true" />
  </component>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

interface Props {
  enabled?: boolean;
  tag?: string;
  duration?: number;
  gradientWidth?: number;
}

const props = withDefaults(defineProps<Props>(), {
  enabled: false,
  tag: 'span',
  duration: 1200,
  gradientWidth: 0.4,
});

const progress = ref(0);
let frameId: number | null = null;
let startTime: number | null = null;

const stopAnimation = () => {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
  startTime = null;
  progress.value = 0;
};

const animate = (timestamp: number) => {
  if (startTime === null) {
    startTime = timestamp;
  }
  const elapsed = timestamp - startTime;
  progress.value = (elapsed % props.duration) / props.duration;
  frameId = requestAnimationFrame(animate);
};

watch(
  () => props.enabled,
  (enabled) => {
    if (!enabled) {
      stopAnimation();
      return;
    }

    stopAnimation();
    frameId = requestAnimationFrame(animate);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopAnimation();
});

const shineStyle = computed(() => ({
  left: `${progress.value * 100}%`,
  width: `${props.gradientWidth * 100}%`,
}));
</script>

<style scoped>
.shimmer-wrapper {
  position: relative;
  display: inline-flex;
  overflow: hidden;
  align-items: center;
}

.shimmer-content {
  display: inline-flex;
  align-items: center;
}

.shimmer-shine {
  position: absolute;
  inset: 0 auto 0 0;
  pointer-events: none;
  transform: translateX(-50%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.32) 50%,
    transparent 100%
  );
  mix-blend-mode: screen;
}

html.dark .shimmer-shine {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.2) 50%,
    transparent 100%
  );
}
</style>
