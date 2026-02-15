<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="5 5 90 90"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <g transform="rotate(45, 50, 50)">
      <ellipse cx="50" cy="50" rx="44" ry="18" fill="none" :stroke="color" stroke-width="8" />
    </g>

    <g transform="rotate(-45, 50, 50)">
      <ellipse cx="50" cy="50" rx="44" ry="18" fill="none" :stroke="color" stroke-width="8" />
    </g>
  </svg>
</template>

<script setup lang="ts">
interface Props {
  size?: number;
  color?: string;
}

withDefaults(defineProps<Props>(), {
  size: 18,
  color: 'currentColor',
});
</script>
