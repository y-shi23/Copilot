// @ts-nocheck
import { computed, nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';

export function useMcpSkillManager(options: any) {
  const { currentConfig, showDismissibleMessage, getDisplayTypeName } = options;

  const isMcpDialogVisible = ref(false);
  const sessionMcpServerIds = ref([]);
  const openaiFormattedTools = ref([]);
  const mcpSearchQuery = ref('');
  const isMcpLoading = ref(false);
  const mcpFilter = ref('all');
  const mcpToolCache = ref({});
  const expandedMcpServers = ref(new Set());
  const tempSessionMcpServerIds = ref([]);

  const isSkillDialogVisible = ref(false);
  const sessionSkillIds = ref([]);
  const tempSessionSkillIds = ref([]);
  const allSkillsList = ref([]);
  const skillSearchQuery = ref('');
  const skillFilter = ref('all');

  const isMcpActive = computed(() => sessionMcpServerIds.value.length > 0);

  const mcpConnectionCount = computed(() => {
    if (!currentConfig.value || !currentConfig.value.mcpServers) return 0;

    const persistentCount = tempSessionMcpServerIds.value.filter((id: string) => {
      const server = currentConfig.value.mcpServers[id];
      return server && server.isPersistent && server.type?.toLowerCase() !== 'builtin';
    }).length;

    const hasOnDemand = tempSessionMcpServerIds.value.some((id: string) => {
      const server = currentConfig.value.mcpServers[id];
      return server && !server.isPersistent && server.type?.toLowerCase() !== 'builtin';
    });

    return persistentCount + (hasOnDemand ? 1 : 0);
  });

  const availableMcpServers = computed(() => {
    if (!currentConfig.value || !currentConfig.value.mcpServers) return [];

    return Object.entries(currentConfig.value.mcpServers)
      .filter(([, server]: any) => server.isActive)
      .map(([id, server]) => ({ id, ...server }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  });

  const filteredMcpServers = computed(() => {
    let servers = availableMcpServers.value;

    if (mcpFilter.value === 'selected') {
      servers = servers.filter((server: any) => tempSessionMcpServerIds.value.includes(server.id));
    } else if (mcpFilter.value === 'unselected') {
      servers = servers.filter((server: any) => !tempSessionMcpServerIds.value.includes(server.id));
    }

    if (mcpSearchQuery.value) {
      const query = mcpSearchQuery.value.toLowerCase();
      servers = servers.filter(
        (server: any) =>
          (server.name && server.name.toLowerCase().includes(query)) ||
          (server.description && server.description.toLowerCase().includes(query)) ||
          (server.tags &&
            Array.isArray(server.tags) &&
            server.tags.some((tag: string) => tag.toLowerCase().includes(query))) ||
          (server.type && server.type.toLowerCase().includes(query)) ||
          (server.type && getDisplayTypeName(server.type).toLowerCase().includes(query)),
      );
    }

    return servers;
  });

  const filteredSkillsList = computed(() => {
    let list = allSkillsList.value;

    if (skillFilter.value === 'selected') {
      list = list.filter((s: any) => tempSessionSkillIds.value.includes(s.name));
    } else if (skillFilter.value === 'unselected') {
      list = list.filter((s: any) => !tempSessionSkillIds.value.includes(s.name));
    }

    if (skillSearchQuery.value) {
      const query = skillSearchQuery.value.toLowerCase();
      list = list.filter(
        (s: any) =>
          s.name.toLowerCase().includes(query) ||
          (s.description && s.description.toLowerCase().includes(query)),
      );
    }

    return list;
  });

  const toggleMcpServerExpansion = (serverId: string) => {
    if (expandedMcpServers.value.has(serverId)) {
      expandedMcpServers.value.delete(serverId);
    } else {
      expandedMcpServers.value.add(serverId);
    }
  };

  const handleMcpToolStatusChange = async (
    serverId: string,
    toolName: string,
    enabled: boolean,
  ) => {
    if (!mcpToolCache.value[serverId]) return;

    const tools = mcpToolCache.value[serverId];
    const toolIndex = tools.findIndex((t: any) => t.name === toolName);
    if (toolIndex !== -1) {
      tools[toolIndex].enabled = enabled;

      const toolsToSave = JSON.parse(JSON.stringify(tools));
      try {
        await window.api.saveMcpToolCache(serverId, toolsToSave);
      } catch (e) {
        console.error('Failed to save tool status:', e);
        showDismissibleMessage.error('保存工具状态失败');
        tools[toolIndex].enabled = !enabled;
      }
    }
  };

  const getToolCounts = (serverId: string) => {
    const tools = mcpToolCache.value[serverId];
    if (!tools || !Array.isArray(tools)) return null;

    const total = tools.length;
    const enabled = tools.filter((t: any) => t.enabled !== false).length;

    return { enabled, total };
  };

  const ensureBuiltinMcpForSkills = () => {
    if (sessionSkillIds.value.length <= 0 || !currentConfig.value?.mcpServers) {
      return false;
    }

    const builtinIds = Object.entries(currentConfig.value.mcpServers)
      .filter(([, server]: any) => server.type === 'builtin')
      .map(([id]) => id as string);

    let changed = false;
    builtinIds.forEach((id: string) => {
      if (!sessionMcpServerIds.value.includes(id)) {
        sessionMcpServerIds.value.push(id);
        changed = true;
      }
      if (!tempSessionMcpServerIds.value.includes(id)) {
        tempSessionMcpServerIds.value.push(id);
      }
    });

    return changed;
  };

  async function applyMcpTools(showNone = true) {
    isMcpDialogVisible.value = false;
    isMcpLoading.value = true;
    await nextTick();

    const activeServerConfigs: Record<string, any> = {};
    const serverIdsToLoad = [...sessionMcpServerIds.value];

    for (const id of serverIdsToLoad) {
      if (currentConfig.value.mcpServers[id]) {
        const serverConf = currentConfig.value.mcpServers[id];
        activeServerConfigs[id] = {
          transport: serverConf.type,
          command: serverConf.command,
          args: serverConf.args,
          url: serverConf.baseUrl,
          env: serverConf.env,
          headers: serverConf.headers,
          isPersistent: serverConf.isPersistent,
        };
      }
    }

    try {
      const {
        openaiFormattedTools: newFormattedTools,
        successfulServerIds,
        failedServerIds,
      } = await window.api.initializeMcpClient(activeServerConfigs);

      openaiFormattedTools.value = newFormattedTools;
      sessionMcpServerIds.value = successfulServerIds;

      if (failedServerIds && failedServerIds.length > 0) {
        const failedNames = failedServerIds
          .map((id: string) => currentConfig.value.mcpServers[id]?.name || id)
          .join('、');
        showDismissibleMessage.error({
          message: `以下 MCP 服务加载失败，已自动取消勾选: ${failedNames}`,
          duration: 5000,
        });
      }

      if (newFormattedTools.length > 0) {
        showDismissibleMessage.success(`已成功启用 ${newFormattedTools.length} 个 MCP 工具`);
      } else if (serverIdsToLoad.length > 0 && failedServerIds.length === serverIdsToLoad.length) {
        showDismissibleMessage.info('所有选中的 MCP 工具均加载失败');
      } else if (serverIdsToLoad.length === 0 && showNone) {
        showDismissibleMessage.info('已清除所有 MCP 工具');
      }
    } catch (error: any) {
      console.error('Failed to initialize MCP tools:', error);
      showDismissibleMessage.error(`加载MCP工具失败: ${error.message}`);
      openaiFormattedTools.value = [];
      sessionMcpServerIds.value = [];
    } finally {
      isMcpLoading.value = false;
    }
  }

  function clearMcpTools() {
    tempSessionMcpServerIds.value = [];
  }

  function selectAllMcpServers() {
    const allVisibleIds = filteredMcpServers.value.map((server: any) => server.id);
    const selectedIdsSet = new Set(tempSessionMcpServerIds.value);
    allVisibleIds.forEach((id: string) => selectedIdsSet.add(id));
    tempSessionMcpServerIds.value = Array.from(selectedIdsSet);
  }

  async function toggleMcpDialog() {
    if (!isMcpDialogVisible.value) {
      try {
        const result = await window.api.getConfig();
        if (result && result.config && result.config.mcpServers) {
          const newMcpServers = result.config.mcpServers;
          const currentLocalMcpServers = currentConfig.value.mcpServers || {};

          sessionMcpServerIds.value.forEach((activeId: string) => {
            if (!newMcpServers[activeId] && currentLocalMcpServers[activeId]) {
              newMcpServers[activeId] = currentLocalMcpServers[activeId];
            }
          });

          currentConfig.value.mcpServers = newMcpServers;
        }

        mcpToolCache.value = (await window.api.getMcpToolCache()) || {};
      } catch (error) {
        console.error('Auto refresh MCP config failed:', error);
      }

      tempSessionMcpServerIds.value = [...sessionMcpServerIds.value];
    }

    isMcpDialogVisible.value = !isMcpDialogVisible.value;
  }

  async function toggleMcpPersistence(serverId: string, isPersistent: boolean) {
    if (!currentConfig.value.mcpServers[serverId]) return;

    const keyPath = `mcpServers.${serverId}.isPersistent`;
    try {
      const result = await window.api.saveSetting(keyPath, isPersistent);
      if (result && result.success) {
        currentConfig.value.mcpServers[serverId].isPersistent = isPersistent;
        showDismissibleMessage.success(
          `'${currentConfig.value.mcpServers[serverId].name}' 的持久化设置已更新`,
        );
      } else {
        throw new Error(result?.message || '保存设置到数据库失败');
      }
    } catch (error) {
      console.error('Failed to save MCP persistence setting:', error);
      showDismissibleMessage.error('保存持久化设置失败');
    }
  }

  function toggleMcpServerSelection(serverId: string) {
    const index = tempSessionMcpServerIds.value.indexOf(serverId);
    if (index === -1) {
      tempSessionMcpServerIds.value.push(serverId);
    } else {
      tempSessionMcpServerIds.value.splice(index, 1);
    }
  }

  async function handleQuickMcpToggle(serverId: string) {
    const index = sessionMcpServerIds.value.indexOf(serverId);
    if (index === -1) {
      sessionMcpServerIds.value.push(serverId);
    } else {
      sessionMcpServerIds.value.splice(index, 1);
    }

    tempSessionMcpServerIds.value = [...sessionMcpServerIds.value];
    await applyMcpTools(false);
  }

  const selectAllSkills = () => {
    const visibleNames = filteredSkillsList.value.map((s: any) => s.name);
    const newSet = new Set([...tempSessionSkillIds.value, ...visibleNames]);
    tempSessionSkillIds.value = Array.from(newSet);
  };

  const clearSkills = () => {
    tempSessionSkillIds.value = [];
  };

  const fetchSkillsList = async () => {
    if (
      currentConfig.value?.skillPath ||
      (window.api?.getConfig && (await window.api.getConfig())?.config?.skillPath)
    ) {
      const path =
        currentConfig.value?.skillPath || (await window.api.getConfig()).config.skillPath;
      try {
        const skills = await window.api.listSkills(path);
        allSkillsList.value = skills
          .filter((s: any) => !s.disabled)
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
      } catch (e) {
        console.error('Fetch skills failed:', e);
      }
    }
  };

  const toggleSkillDialog = async () => {
    if (!isSkillDialogVisible.value) {
      tempSessionSkillIds.value = [...sessionSkillIds.value];
      skillFilter.value = 'all';
      skillSearchQuery.value = '';

      if (
        currentConfig.value?.skillPath ||
        (window.api?.getConfig && (await window.api.getConfig())?.config?.skillPath)
      ) {
        const cfg = (await window.api.getConfig()).config;
        const path = cfg.skillPath;

        if (path) {
          try {
            const skills = await window.api.listSkills(path);
            allSkillsList.value = skills
              .filter((s: any) => !s.disabled)
              .sort((a: any, b: any) => a.name.localeCompare(b.name));
          } catch (e) {
            console.error('Fetch skills failed:', e);
            ElMessage.error('刷新技能列表失败');
          }
        }
      }
    }

    isSkillDialogVisible.value = !isSkillDialogVisible.value;
  };

  const toggleSkillSelection = (skillName: string) => {
    const idx = tempSessionSkillIds.value.indexOf(skillName);
    if (idx === -1) {
      tempSessionSkillIds.value.push(skillName);
    } else {
      tempSessionSkillIds.value.splice(idx, 1);
    }
  };

  const handleQuickSkillToggle = async (skillName: string) => {
    const index = sessionSkillIds.value.indexOf(skillName);
    if (index === -1) {
      sessionSkillIds.value.push(skillName);

      if (!tempSessionSkillIds.value.includes(skillName)) {
        tempSessionSkillIds.value.push(skillName);
      }

      const changed = ensureBuiltinMcpForSkills();
      if (changed) {
        showDismissibleMessage.success(`已启用 Skill "${skillName}" (并自动关联内置 MCP)`);
        await applyMcpTools(false);
        return;
      }

      showDismissibleMessage.success(`已启用 Skill "${skillName}"`);
    } else {
      sessionSkillIds.value.splice(index, 1);
      const tempIndex = tempSessionSkillIds.value.indexOf(skillName);
      if (tempIndex !== -1) {
        tempSessionSkillIds.value.splice(tempIndex, 1);
      }
      showDismissibleMessage.info(`已禁用 Skill "${skillName}"`);
    }
  };

  const handleSkillForkToggle = async (skill: any) => {
    const newForkState = skill.context !== 'fork';
    try {
      const configData = await window.api.getConfig();
      const path = configData.config.skillPath;

      await window.api.toggleSkillForkMode(path, skill.id, newForkState);
      skill.context = newForkState ? 'fork' : 'normal';
      ElMessage.success(newForkState ? '已开启 Sub-Agent 模式' : '已关闭 Sub-Agent 模式');
    } catch (e: any) {
      ElMessage.error(`模式切换失败: ${e.message}`);
    }
  };

  const handleSkillSelectionConfirm = async () => {
    sessionSkillIds.value = [...tempSessionSkillIds.value];
    isSkillDialogVisible.value = false;

    const changed = ensureBuiltinMcpForSkills();
    if (changed) {
      showDismissibleMessage.success('已自动启用内置 MCP 服务以支持 Skill');
      await applyMcpTools(false);
    }
  };

  return {
    isMcpDialogVisible,
    sessionMcpServerIds,
    openaiFormattedTools,
    mcpSearchQuery,
    isMcpLoading,
    mcpFilter,
    mcpToolCache,
    expandedMcpServers,
    tempSessionMcpServerIds,
    toggleMcpServerExpansion,
    handleMcpToolStatusChange,
    getToolCounts,
    isMcpActive,
    mcpConnectionCount,
    availableMcpServers,
    filteredMcpServers,
    isSkillDialogVisible,
    sessionSkillIds,
    tempSessionSkillIds,
    allSkillsList,
    skillSearchQuery,
    skillFilter,
    filteredSkillsList,
    selectAllSkills,
    clearSkills,
    toggleSkillDialog,
    fetchSkillsList,
    handleQuickSkillToggle,
    handleSkillForkToggle,
    toggleSkillSelection,
    handleSkillSelectionConfirm,
    applyMcpTools,
    clearMcpTools,
    selectAllMcpServers,
    toggleMcpDialog,
    toggleMcpPersistence,
    toggleMcpServerSelection,
    handleQuickMcpToggle,
  };
}
