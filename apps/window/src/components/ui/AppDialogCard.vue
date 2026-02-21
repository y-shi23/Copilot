<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { ElDialog } from 'element-plus';

type DialogVariant = 'standard' | 'compact' | 'tools';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    width?: string | number;
    top?: string;
    variant?: DialogVariant;
    hideHeader?: boolean;
    appendToBody?: boolean;
    closeOnClickModal?: boolean;
    showClose?: boolean;
    lockScroll?: boolean;
    center?: boolean;
    dialogClass?: string;
  }>(),
  {
    title: '',
    width: undefined,
    top: undefined,
    variant: 'standard',
    hideHeader: false,
    appendToBody: true,
    closeOnClickModal: false,
    showClose: true,
    lockScroll: true,
    center: false,
    dialogClass: '',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'open'): void;
  (e: 'opened'): void;
  (e: 'close'): void;
  (e: 'closed'): void;
}>();

const attrs = useAttrs();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const dialogClasses = computed(() => [
  'app-dialog-card',
  `app-dialog-card--${props.variant}`,
  props.hideHeader ? 'app-dialog-card--no-header' : '',
  props.dialogClass,
]);
</script>

<template>
  <el-dialog
    v-bind="attrs"
    v-model="visible"
    :title="props.title"
    :width="props.width"
    :top="props.top"
    :append-to-body="props.appendToBody"
    :close-on-click-modal="props.closeOnClickModal"
    :show-close="props.showClose"
    :lock-scroll="props.lockScroll"
    :center="props.center"
    :class="dialogClasses"
    @open="emit('open')"
    @opened="emit('opened')"
    @close="emit('close')"
    @closed="emit('closed')"
  >
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>

    <slot />

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </el-dialog>
</template>
