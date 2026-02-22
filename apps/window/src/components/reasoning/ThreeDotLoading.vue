<template>
  <div class="three-dot-loading" aria-hidden="true">
    <span v-for="i in 3" :key="i" class="dot" :style="dotStyle(i - 1)" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface Props {
  duration?: number;
  dotSize?: number;
  dotGap?: number;
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 1100,
  dotSize: 8,
  dotGap: 6,
  color: 'currentColor',
});

const progress = ref(0);
let frameId: number | null = null;
let startTime: number | null = null;

const animate = (timestamp: number) => {
  if (startTime === null) {
    startTime = timestamp;
  }
  const elapsed = timestamp - startTime;
  progress.value = (elapsed % props.duration) / props.duration;
  frameId = requestAnimationFrame(animate);
};

const stopAnimation = () => {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
};

onMounted(() => {
  frameId = requestAnimationFrame(animate);
});

onBeforeUnmount(() => {
  stopAnimation();
});

const waveValue = (index: number) => {
  const phase = (progress.value - index * 0.22) * 2 * Math.PI;
  return (Math.sin(phase) + 1) / 2;
};

const dotStyle = (index: number) => {
  const wave = waveValue(index);
  const scale = 0.82 + 0.18 * wave;
  const opacity = 0.42 + 0.48 * wave;

  return {
    width: `${props.dotSize}px`,
    height: `${props.dotSize}px`,
    marginRight: index === 2 ? '0' : `${props.dotGap}px`,
    opacity,
    transform: `scale(${scale})`,
    backgroundColor: props.color,
  };
};
</script>

<style scoped>
.three-dot-loading {
  height: 16px;
  display: inline-flex;
  align-items: center;
}

.dot {
  border-radius: 50%;
  transition:
    transform 0.1s ease-out,
    opacity 0.1s ease-out;
}
</style>
