<script setup lang="ts">
// -nocheck
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  RefreshCw as Refresh,
  Trash2 as DeleteIcon,
  MessageCircle as ChatDotRound,
  Pencil as Edit,
  BrushCleaning,
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import AppDialogCard from '@window/components/ui/AppDialogCard.vue';

const { t } = useI18n();

const conversations = ref([]);
const isTableLoading = ref(false);
const selectedRows = ref([]);
const tableContainerRef = ref<HTMLElement | null>(null);
const tableBodyScrollEl = ref<HTMLElement | null>(null);
const INITIAL_VISIBLE_COUNT = 100;
const LOAD_MORE_STEP = 100;
const visibleCount = ref(INITIAL_VISIBLE_COUNT);

const showCleanDialog = ref(false);
const cleanDaysOption = ref(30);
const cleanCustomDays = ref(60);
const isCleaning = ref(false);

const visibleRows = computed(() => conversations.value.slice(0, visibleCount.value));

const hasMoreRows = computed(() => visibleCount.value < conversations.value.length);

const resetVisibleRows = () => {
  visibleCount.value = Math.min(INITIAL_VISIBLE_COUNT, conversations.value.length || 0);
};

const loadMoreRows = () => {
  if (!hasMoreRows.value) return;
  visibleCount.value = Math.min(visibleCount.value + LOAD_MORE_STEP, conversations.value.length);
};

const onTableBodyScroll = () => {
  const scroller = tableBodyScrollEl.value;
  if (!scroller) return;
  const distanceToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  if (distanceToBottom <= 120) {
    loadMoreRows();
  }
};

const bindTableBodyScroll = () => {
  const nextScroller = tableContainerRef.value?.querySelector(
    '.el-table__body-wrapper',
  ) as HTMLElement | null;

  if (tableBodyScrollEl.value === nextScroller) return;

  if (tableBodyScrollEl.value) {
    tableBodyScrollEl.value.removeEventListener('scroll', onTableBodyScroll);
  }

  tableBodyScrollEl.value = nextScroller;
  if (tableBodyScrollEl.value) {
    tableBodyScrollEl.value.addEventListener('scroll', onTableBodyScroll, { passive: true });
  }
};

const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const fetchConversations = async () => {
  isTableLoading.value = true;
  try {
    const rows = await window.api.listConversations({ includeDeleted: false });
    conversations.value = Array.isArray(rows) ? rows : [];
    resetVisibleRows();
    await nextTick();
    bindTableBodyScroll();
  } catch (error: any) {
    console.error('[Chats] Failed to fetch conversations:', error);
    ElMessage.error(`读取会话失败: ${error?.message || error}`);
    conversations.value = [];
    resetVisibleRows();
  } finally {
    isTableLoading.value = false;
  }
};

const refreshData = async () => {
  await fetchConversations();
};

const startChat = async (row: any) => {
  try {
    const conversation = await window.api.getConversation(row.conversationId);
    if (!conversation || !conversation.sessionData) {
      throw new Error('会话数据不存在');
    }

    await window.api.coderedirect(
      '恢复聊天',
      JSON.stringify({
        conversationId: conversation.conversationId,
        sessionData: JSON.stringify(conversation.sessionData),
        filename: `${conversation.conversationName || 'session'}.json`,
      }),
    );
    ElMessage.success('已打开会话');
  } catch (error: any) {
    ElMessage.error(`打开会话失败: ${error?.message || error}`);
  }
};

const renameConversation = async (row: any) => {
  try {
    const { value: inputValue } = await ElMessageBox.prompt('请输入新的会话名称', '重命名会话', {
      inputValue: row.conversationName || '',
      inputValidator: (value: string) => {
        if (!value || !value.trim()) return '名称不能为空';
        return true;
      },
    });

    const nextName = String(inputValue || '').trim();
    if (!nextName || nextName === row.conversationName) return;

    await window.api.renameConversation(row.conversationId, nextName);
    ElMessage.success('重命名成功');
    await fetchConversations();
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(`重命名失败: ${error?.message || error}`);
  }
};

const deleteRows = async (rowsToDelete: any[]) => {
  if (!Array.isArray(rowsToDelete) || rowsToDelete.length === 0) {
    ElMessage.warning(t('common.noFileSelected'));
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认删除 ${rowsToDelete.length} 条会话记录吗？`,
      t('common.warningTitle'),
      { type: 'warning' },
    );

    const ids = rowsToDelete
      .map((item) => String(item.conversationId || '').trim())
      .filter((value) => !!value);
    if (!ids.length) return;

    await window.api.deleteConversations(ids);
    selectedRows.value = [];
    ElMessage.success('删除成功');
    await fetchConversations();
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(`删除失败: ${error?.message || error}`);
  }
};

const handleSelectionChange = (rows: any[]) => {
  selectedRows.value = rows;
};

const computedRowsToClean = computed(() => {
  const days = cleanDaysOption.value === -1 ? cleanCustomDays.value : cleanDaysOption.value;
  if (!days || days < 1) return [];

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return conversations.value.filter((row: any) => {
    const updatedAt = new Date(row.updatedAt || row.lastmod || 0).getTime();
    return Number.isFinite(updatedAt) && updatedAt > 0 && updatedAt < cutoff;
  });
});

const cleanSize = computed(() => {
  return computedRowsToClean.value.reduce(
    (acc: number, row: any) => acc + Number(row.size || 0),
    0,
  );
});

const executeAutoClean = async () => {
  const days = cleanDaysOption.value === -1 ? cleanCustomDays.value : cleanDaysOption.value;
  if (!days || days < 1) {
    ElMessage.warning('请输入有效天数');
    return;
  }

  isCleaning.value = true;
  try {
    const result = await window.api.cleanConversations(days);
    const count = Number(result?.deletedCount || 0);
    ElMessage.success(`已清理 ${count} 条会话`);
    showCleanDialog.value = false;
    await fetchConversations();
  } catch (error: any) {
    ElMessage.error(`清理失败: ${error?.message || error}`);
  } finally {
    isCleaning.value = false;
  }
};

const onWindowFocus = () => {
  refreshData();
};

onMounted(async () => {
  await fetchConversations();
  window.addEventListener('focus', onWindowFocus);
});

onUnmounted(() => {
  if (tableBodyScrollEl.value) {
    tableBodyScrollEl.value.removeEventListener('scroll', onTableBodyScroll);
  }
  window.removeEventListener('focus', onWindowFocus);
});
</script>

<template>
  <div class="chats-page-container">
    <div class="chats-content-wrapper">
      <div class="chats-toolbar">
        <div class="toolbar-left">
          <span class="toolbar-title">会话管理</span>
        </div>
        <div class="toolbar-right">
          <el-tooltip content="自动清理" placement="bottom">
            <el-button
              class="rounded-action-btn"
              :icon="BrushCleaning"
              circle
              @click="showCleanDialog = true"
            />
          </el-tooltip>
          <el-tooltip :content="t('common.refresh')" placement="bottom">
            <el-button class="rounded-action-btn" :icon="Refresh" circle @click="refreshData" />
          </el-tooltip>
          <el-tooltip :content="t('common.deleteSelected')" placement="bottom">
            <el-button
              class="rounded-action-btn"
              :icon="DeleteIcon"
              circle
              type="danger"
              plain
              :disabled="selectedRows.length === 0"
              @click="deleteRows(selectedRows)"
            />
          </el-tooltip>
        </div>
      </div>

      <div class="table-container" ref="tableContainerRef">
        <el-table
          :data="visibleRows"
          v-loading="isTableLoading"
          @selection-change="handleSelectionChange"
          class="history-table"
          style="width: 100%"
          height="100%"
          :flexible="false"
        >
          <el-table-column type="selection" width="50" align="center" />
          <el-table-column
            prop="conversationName"
            label="会话名称"
            min-width="200"
            show-overflow-tooltip
          />
          <el-table-column prop="updatedAt" label="更新时间" width="180" align="center" sortable>
            <template #default="scope">{{
              formatDate(scope.row.updatedAt || scope.row.lastmod)
            }}</template>
          </el-table-column>
          <el-table-column prop="size" label="大小" width="100" align="center" sortable>
            <template #default="scope">{{ formatBytes(scope.row.size) }}</template>
          </el-table-column>
          <el-table-column
            label="操作"
            width="120"
            align="center"
            fixed="right"
            class-name="actions-column-cell"
            label-class-name="actions-column-header"
          >
            <template #default="scope">
              <div class="row-action-group">
                <el-tooltip content="打开会话" placement="top">
                  <el-button
                    link
                    class="row-action-btn"
                    type="primary"
                    :icon="ChatDotRound"
                    @click="startChat(scope.row)"
                  />
                </el-tooltip>
                <el-tooltip content="重命名" placement="top">
                  <el-button
                    link
                    class="row-action-btn"
                    type="warning"
                    :icon="Edit"
                    @click="renameConversation(scope.row)"
                  />
                </el-tooltip>
                <el-tooltip :content="t('common.delete')" placement="top">
                  <el-button
                    link
                    class="row-action-btn"
                    type="danger"
                    :icon="DeleteIcon"
                    @click="deleteRows([scope.row])"
                  />
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <AppDialogCard
      v-model="showCleanDialog"
      title="按时间清理会话"
      width="520px"
      variant="compact"
      :close-on-click-modal="true"
    >
      <div class="clean-dialog">
        <el-radio-group v-model="cleanDaysOption">
          <el-radio :value="7">7 天前</el-radio>
          <el-radio :value="30">30 天前</el-radio>
          <el-radio :value="90">90 天前</el-radio>
          <el-radio :value="-1">自定义</el-radio>
        </el-radio-group>

        <div v-if="cleanDaysOption === -1" class="custom-days-input">
          <el-input-number v-model="cleanCustomDays" :min="1" :max="3650" />
          <span>天前</span>
        </div>

        <div class="clean-preview">
          <p>预计清理 {{ computedRowsToClean.length }} 条会话</p>
          <p>预计释放 {{ formatBytes(cleanSize) }}</p>
        </div>
      </div>

      <template #footer>
        <el-button @click="showCleanDialog = false">取消</el-button>
        <el-button type="danger" :loading="isCleaning" @click="executeAutoClean"
          >开始清理</el-button
        >
      </template>
    </AppDialogCard>
  </div>
</template>

<style scoped>
.chats-page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chats-content-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  padding: 0 24px 16px 24px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.chats-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  flex-shrink: 0;
}

.toolbar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.table-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.table-container :deep(.el-table) {
  --el-table-border-color: var(--border-primary, #e4e7ed);
  background-color: transparent;
}

.table-container :deep(.el-table__inner-wrapper::before) {
  display: none;
}

.table-container :deep(.el-table__body-wrapper) {
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.table-container :deep(.el-table__header-wrapper) {
  overflow-x: hidden !important;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.table-container :deep(.el-table__body-wrapper::-webkit-scrollbar:horizontal) {
  height: 0;
}

.table-container :deep(.el-table__header-wrapper::-webkit-scrollbar) {
  display: none;
}

.table-container :deep(.el-scrollbar__bar.is-horizontal) {
  display: none !important;
}

.table-container :deep(.el-table__fixed-right) {
  right: 0 !important;
  background-color: var(--workspace-surface-bg, var(--bg-primary));
}

.table-container :deep(.el-table__fixed-right::before) {
  display: none;
}

.table-container :deep(.el-table__fixed-right-patch) {
  background-color: var(--workspace-surface-bg, var(--bg-primary)) !important;
}

.table-container :deep(.el-table th.el-table__cell) {
  background-color: transparent;
}

.table-container :deep(.el-table tr) {
  background-color: transparent;
}

.table-container :deep(.el-table tbody tr:hover > td.el-table__cell) {
  background-color: var(--bg-tertiary);
}

.table-container :deep(.el-table .actions-column-header.el-table-fixed-column--right),
.table-container :deep(.el-table .actions-column-cell.el-table-fixed-column--right) {
  background-color: var(--workspace-surface-bg, var(--bg-primary)) !important;
}

.table-container
  :deep(.el-table tbody tr:hover > td.actions-column-cell.el-table-fixed-column--right) {
  background-color: var(--bg-tertiary) !important;
}

.row-action-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.row-action-btn {
  padding: 4px;
}

.clean-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.custom-days-input {
  display: flex;
  align-items: center;
  gap: 10px;
}

.clean-preview {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
</style>
