<script setup>
const props = defineProps({
  iconNode: {
    type: Array,
    required: true,
  },
  size: {
    type: [Number, String],
    default: 16,
  },
  strokeWidth: {
    type: [Number, String],
    default: 2,
  },
});

const normalizeAttrs = (attrs = {}) => {
  const { key, ...rest } = attrs;
  return rest;
};
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="lucide"
  >
    <template v-for="(node, index) in iconNode" :key="node[1]?.key ?? `${node[0]}-${index}`">
      <component :is="node[0]" v-bind="normalizeAttrs(node[1])" />
    </template>
  </svg>
</template>
