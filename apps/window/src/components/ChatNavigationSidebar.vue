<script setup lang="ts">
import { ElTooltip } from 'element-plus';
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp } from 'lucide-vue-next';

const props = defineProps<{
  navMessages: any[];
  focusedMessageId: string | number | null;
  nextButtonTooltip: string;
  showScrollToBottomButton: boolean;
  getMessagePreviewText: (msg: any) => string;
}>();

const emit = defineEmits<{
  (e: 'scroll-top'): void;
  (e: 'previous'): void;
  (e: 'next'): void;
  (e: 'bottom'): void;
  (e: 'jump', messageId: string | number): void;
}>();
</script>

<template>
  <div class="unified-nav-sidebar">
    <div class="nav-group top">
      <el-tooltip content="回到顶部" placement="left" :show-after="500">
        <div class="nav-mini-btn" @click="emit('scroll-top')">
          <ChevronsUp :size="16" />
        </div>
      </el-tooltip>
      <el-tooltip content="上一条消息" placement="left" :show-after="500">
        <div class="nav-mini-btn" @click="emit('previous')">
          <ArrowUp :size="16" />
        </div>
      </el-tooltip>
    </div>

    <div class="nav-timeline-area">
      <div class="timeline-track"></div>
      <div class="timeline-scroller no-scrollbar">
        <div
          v-for="msg in props.navMessages"
          :key="msg.id"
          class="timeline-node-wrapper"
          @click="emit('jump', msg.messageId)"
        >
          <el-tooltip
            :content="props.getMessagePreviewText(msg)"
            placement="left"
            :show-after="200"
            :enterable="false"
            effect="dark"
          >
            <div
              class="timeline-node"
              :class="[
                msg.role,
                { active: String(props.focusedMessageId ?? '') === String(msg.messageId ?? '') },
              ]"
            ></div>
          </el-tooltip>
        </div>
      </div>
    </div>

    <div class="nav-group bottom">
      <el-tooltip :content="props.nextButtonTooltip" placement="left" :show-after="500">
        <div class="nav-mini-btn" @click="emit('next')">
          <ArrowDown :size="16" />
        </div>
      </el-tooltip>

      <el-tooltip content="跳到底部" placement="left" :show-after="500">
        <div
          class="nav-mini-btn"
          :class="{ 'highlight-bottom': props.showScrollToBottomButton }"
          @click="emit('bottom')"
        >
          <ChevronsDown :size="16" />
        </div>
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped lang="less">
.unified-nav-sidebar {
  position: absolute;
  right: 14px;
  top: 44%;
  transform: translateY(-50%);
  max-height: 58vh;
  width: 28px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  pointer-events: auto;
  border-radius: 14px;
  padding: 4px 2px;
  background: color-mix(in srgb, var(--el-bg-color-overlay) 76%, transparent);
  border: 1px solid var(--el-border-color-lighter);
  box-shadow: var(--el-box-shadow-lighter);
  flex-shrink: 0;
}

.nav-mini-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  background-color: transparent;
  border: none;
  box-shadow: none;
  transition: all 0.2s ease;
  font-size: 13px;
  border-radius: 8px;

  &:hover {
    color: var(--el-text-color-primary);
    background-color: var(--el-fill-color-light);
    transform: none;
  }
}

.nav-mini-btn.highlight-bottom {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
}

.nav-timeline-area {
  flex: 1;
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  overflow: hidden;
  flex-direction: column;
  min-height: 0;
  pointer-events: auto;
}

.timeline-track {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background-color: var(--el-border-color-light);
  transform: translateX(-1px);
  z-index: -1;
  border-radius: 2px;
  opacity: 0.5;
}

.timeline-scroller {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.timeline-node-wrapper {
  width: 100%;
  height: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  padding: 2px 0;

  &:hover .timeline-node {
    transform: scaleX(1.35) scaleY(1.08);
  }
}

.timeline-node {
  width: 10px;
  height: 3px;
  border-radius: 2px;
  transition: all 0.2s ease;
  box-shadow: none;
  border: none;
  opacity: 0.56;

  &.user {
    background-color: var(--el-color-primary);
  }

  &.assistant {
    background-color: color-mix(in srgb, var(--el-text-color-primary) 78%, transparent);
  }

  &.active {
    opacity: 1;
    width: 16px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 20%, transparent);
  }
}
</style>
