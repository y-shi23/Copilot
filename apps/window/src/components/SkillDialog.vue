<script setup lang="ts">
import { computed } from 'vue';
import { ElAvatar, ElButtonGroup, ElCheckbox, ElDialog, ElTooltip } from 'element-plus';
import { Cpu, Folder, Search, TriangleAlert } from 'lucide-vue-next';

const props = defineProps<{
  modelValue: boolean;
  skillFilter: string;
  skillSearchQuery: string;
  filteredSkillsList: any[];
  tempSessionSkillIds: string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:skillFilter', value: string): void;
  (e: 'update:skillSearchQuery', value: string): void;
  (e: 'select-all'): void;
  (e: 'clear'): void;
  (e: 'toggle-selection', name: string): void;
  (e: 'toggle-fork', skill: any): void;
  (e: 'confirm'): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const filterModel = computed({
  get: () => props.skillFilter,
  set: (value: string) => emit('update:skillFilter', value),
});

const searchModel = computed({
  get: () => props.skillSearchQuery,
  set: (value: string) => emit('update:skillSearchQuery', value),
});
</script>

<template>
  <el-dialog
    v-model="visible"
    width="700px"
    title="Skill 技能库"
    custom-class="mcp-dialog mcp-edit-dialog chat-tools-dialog"
    :close-on-click-modal="false"
    append-to-body
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
            >已选</el-button
          >
          <el-button
            :type="filterModel === 'unselected' ? 'primary' : ''"
            @click="filterModel = 'unselected'"
            >未选</el-button
          >
        </el-button-group>
        <el-button-group>
          <el-button @click="emit('select-all')">全选</el-button>
          <el-button @click="emit('clear')">清空</el-button>
        </el-button-group>
      </div>

      <div class="mcp-server-list custom-scrollbar">
        <div v-if="props.filteredSkillsList.length === 0" class="skill-empty-state">
          暂无匹配的技能
        </div>
        <div
          v-else
          v-for="skill in props.filteredSkillsList"
          :key="skill.name"
          class="mcp-server-item-wrapper"
        >
          <div
            class="mcp-server-item"
            :class="{ 'is-checked': props.tempSessionSkillIds.includes(skill.name) }"
            @click="emit('toggle-selection', skill.name)"
          >
            <div class="skill-single-row">
              <el-checkbox
                :model-value="props.tempSessionSkillIds.includes(skill.name)"
                size="large"
                @change="() => emit('toggle-selection', skill.name)"
                @click.stop
                class="header-checkbox"
              />

              <el-avatar shape="square" :size="20" class="mcp-server-icon skill-folder-avatar">
                <Folder :size="16" />
              </el-avatar>

              <span class="mcp-server-name skill-name-fixed">{{ skill.name }}</span>

              <span class="skill-desc-inline" :title="skill.description">{{
                skill.description
              }}</span>

              <div class="mcp-header-right-group">
                <el-tooltip
                  :content="
                    skill.context === 'fork' ? 'Sub-Agent 模式已开启' : 'Sub-Agent 模式已关闭'
                  "
                  placement="top"
                >
                  <div
                    class="subagent-toggle-btn-small"
                    :class="{ 'is-active': skill.context === 'fork' }"
                    @click.stop="emit('toggle-fork', skill)"
                  >
                    <Cpu :size="14" />
                  </div>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mcp-dialog-footer-search">
        <el-input v-model="searchModel" placeholder="搜索技能名称或描述..." clearable>
          <template #prefix>
            <Search :size="14" />
          </template>
        </el-input>
      </div>
    </div>

    <template #footer>
      <div class="mcp-dialog-footer">
        <div class="footer-left-controls">
          <span
            class="mcp-limit-hint skill-selected-count"
            v-if="props.tempSessionSkillIds.length > 0"
          >
            已选 {{ props.tempSessionSkillIds.length }} 个技能
          </span>
          <span class="mcp-limit-hint warning skill-warning-hint">
            <TriangleAlert :size="14" class="skill-warning-icon" />
            Skill 依赖内置 MCP 服务，请勿禁用
          </span>
        </div>
        <el-button type="primary" @click="emit('confirm')">确定</el-button>
      </div>
    </template>
  </el-dialog>
</template>
