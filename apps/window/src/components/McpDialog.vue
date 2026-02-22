<script setup lang="ts">
import { computed } from 'vue';
import { ElAvatar, ElButtonGroup, ElCheckbox, ElSwitch, ElTag, ElTooltip } from 'element-plus';
import {
  ChevronRight,
  CircleQuestionMark as CircleHelp,
  Search,
  Wrench,
  Zap,
} from 'lucide-vue-next';
import AppDialogCard from './ui/AppDialogCard.vue';

const props = defineProps<{
  modelValue: boolean;
  mcpFilter: string;
  mcpSearchQuery: string;
  filteredMcpServers: any[];
  tempSessionMcpServerIds: string[];
  expandedMcpServers: Set<string>;
  mcpToolCache: Record<string, any[]>;
  mcpConnectionCount: number;
  isAutoApproveTools: boolean;
  getToolCounts: (id: string) => { enabled: number; total: number } | null;
  getDisplayTypeName: (type: string) => string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:mcpFilter', value: string): void;
  (e: 'update:mcpSearchQuery', value: string): void;
  (e: 'update:isAutoApproveTools', value: boolean): void;
  (e: 'dialog-close'): void;
  (e: 'select-all'): void;
  (e: 'clear'): void;
  (e: 'toggle-selection', id: string): void;
  (e: 'toggle-expansion', id: string): void;
  (e: 'toggle-persistence', payload: { id: string; value: boolean }): void;
  (e: 'toggle-tool-status', payload: { serverId: string; toolName: string; value: boolean }): void;
  (e: 'apply'): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const filterModel = computed({
  get: () => props.mcpFilter,
  set: (value: string) => emit('update:mcpFilter', value),
});

const searchModel = computed({
  get: () => props.mcpSearchQuery,
  set: (value: string) => emit('update:mcpSearchQuery', value),
});

const autoApproveModel = computed({
  get: () => props.isAutoApproveTools,
  set: (value: boolean) => emit('update:isAutoApproveTools', value),
});
</script>

<template>
  <AppDialogCard
    v-model="visible"
    width="700px"
    title="MCP 工具"
    variant="tools"
    dialog-class="mcp-dialog mcp-edit-dialog chat-tools-dialog"
    @close="emit('dialog-close')"
  >
    <div class="mcp-dialog-content">
      <div class="mcp-dialog-toolbar">
        <el-button-group>
          <el-button :type="filterModel === 'all' ? 'primary' : ''" @click="filterModel = 'all'"
            >全部</el-button
          >
          <el-button
            :type="filterModel === 'selected' ? 'primary' : ''"
            @click="filterModel = 'selected'"
            >已选
          </el-button>
          <el-button
            :type="filterModel === 'unselected' ? 'primary' : ''"
            @click="filterModel = 'unselected'"
            >未选
          </el-button>
        </el-button-group>
        <el-button-group>
          <el-button @click="emit('select-all')">全选</el-button>
          <el-button @click="emit('clear')">清空</el-button>
        </el-button-group>
      </div>
      <div class="mcp-server-list custom-scrollbar">
        <div
          v-for="server in props.filteredMcpServers"
          :key="server.id"
          class="mcp-server-item-wrapper"
        >
          <div
            class="mcp-server-item"
            :class="{ 'is-checked': props.tempSessionMcpServerIds.includes(server.id) }"
            @click="emit('toggle-selection', server.id)"
          >
            <div class="mcp-server-content">
              <div class="mcp-server-header-row">
                <el-checkbox
                  :model-value="props.tempSessionMcpServerIds.includes(server.id)"
                  @change="() => emit('toggle-selection', server.id)"
                  @click.stop
                  class="header-checkbox"
                />

                <el-avatar :src="server.logoUrl" shape="square" :size="20" class="mcp-server-icon">
                  <Wrench :size="12" />
                </el-avatar>
                <span class="mcp-server-name">
                  {{ server.name }}
                  <span v-if="props.getToolCounts(server.id)" class="mcp-tool-count">
                    ({{ props.getToolCounts(server.id).enabled }}/{{
                      props.getToolCounts(server.id).total
                    }})
                  </span>
                </span>

                <div class="mcp-header-right-group">
                  <el-tooltip
                    :content="server.isPersistent ? '持久连接已开启' : '持久连接已关闭'"
                    placement="top"
                  >
                    <el-button
                      text
                      circle
                      :class="{ 'is-persistent-active': server.isPersistent }"
                      @click.stop="
                        emit('toggle-persistence', { id: server.id, value: !server.isPersistent })
                      "
                      class="persistent-btn"
                    >
                      <Zap :size="16" />
                    </el-button>
                  </el-tooltip>

                  <div class="mcp-server-tags">
                    <el-tag v-if="server.type" type="info" size="small" effect="plain" round>{{
                      props.getDisplayTypeName(server.type)
                    }}</el-tag>
                    <el-tag
                      v-for="tag in (server.tags || []).slice(0, 2)"
                      :key="tag"
                      size="small"
                      effect="plain"
                      round
                      >{{ tag }}</el-tag
                    >
                  </div>
                </div>
              </div>

              <div class="mcp-server-body-row">
                <div class="mcp-tools-toggle" @click.stop="emit('toggle-expansion', server.id)">
                  <ChevronRight
                    :size="10"
                    class="mcp-tools-toggle-icon"
                    :class="{ 'is-expanded': props.expandedMcpServers.has(server.id) }"
                  />
                  <span>{{ props.expandedMcpServers.has(server.id) ? '收起' : '工具' }}</span>
                </div>

                <span
                  v-if="server.description"
                  class="mcp-server-description"
                  @click.stop="emit('toggle-expansion', server.id)"
                  >{{ server.description }}</span
                >
              </div>
            </div>
          </div>

          <div v-if="props.expandedMcpServers.has(server.id)" class="mcp-tools-panel" @click.stop>
            <template
              v-if="props.mcpToolCache[server.id] && props.mcpToolCache[server.id].length > 0"
            >
              <div
                v-for="tool in props.mcpToolCache[server.id]"
                :key="tool.name"
                class="mcp-tool-row"
              >
                <el-switch
                  :model-value="tool.enabled !== false"
                  size="small"
                  @change="
                    (value) =>
                      emit('toggle-tool-status', {
                        serverId: server.id,
                        toolName: tool.name,
                        value: !!value,
                      })
                  "
                />
                <div class="mcp-tool-info">
                  <span class="mcp-tool-name">{{ tool.name }}</span>
                  <span class="mcp-tool-desc" :title="tool.description">{{
                    tool.description || '暂无描述'
                  }}</span>
                </div>
              </div>
            </template>
            <div v-else class="mcp-tools-empty">工具未缓存，使用/测试后即可查看具体工具</div>
          </div>
        </div>
      </div>
      <div class="mcp-dialog-footer-search">
        <el-input v-model="searchModel" placeholder="搜索工具名称或描述..." clearable>
          <template #prefix>
            <Search :size="14" />
          </template>
        </el-input>
      </div>
    </div>
    <template #footer>
      <div class="mcp-dialog-footer">
        <div class="footer-left-controls">
          <span class="mcp-limit-hint" :class="{ warning: props.mcpConnectionCount > 5 }">
            连接数：{{ 5 - props.mcpConnectionCount }}/5
            <el-tooltip placement="top">
              <template #content>
                持久连接各占1个名额<br />
                所有临时连接共占1个名额
              </template>
              <CircleHelp :size="14" class="mcp-limit-help-icon" />
            </el-tooltip>
          </span>
          <el-checkbox
            v-model="autoApproveModel"
            label="自动批准工具调用"
            class="mcp-auto-approve-checkbox"
          />
        </div>
        <div>
          <el-button type="primary" @click="emit('apply')">应用</el-button>
        </div>
      </div>
    </template>
  </AppDialogCard>
</template>
