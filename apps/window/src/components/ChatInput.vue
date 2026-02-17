<script setup lang="ts">
// -nocheck
import { ref, h, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue';
import {
  ElFooter,
  ElRow,
  ElCol,
  ElText,
  ElDivider,
  ElButton,
  ElInput,
  ElMessage,
  ElTooltip,
  ElScrollbar,
  ElIcon,
} from 'element-plus';
import {
  AudioLines,
  Brain,
  BrushCleaning,
  Check,
  FileText,
  Hammer,
  Library,
  Mic,
  Monitor,
  Paperclip,
  Trash2,
  X,
} from 'lucide-vue-next';

// --- Props and Emits ---
const prompt = defineModel('prompt');
const fileList = defineModel('fileList');
const selectedVoice = defineModel('selectedVoice');
const tempReasoningEffort = defineModel('tempReasoningEffort');

const props = defineProps({
  loading: Boolean,
  ctrlEnterToSend: Boolean,
  voiceList: { type: Array, default: () => [] },
  layout: { type: String, default: 'horizontal' },
  isMcpActive: Boolean,
  allMcpServers: { type: Array, default: () => [] },
  activeMcpIds: { type: Array, default: () => [] },
  activeSkillIds: { type: Array, default: () => [] },
  allSkills: { type: Array, default: () => [] },
});

// 增加 toggle-mcp 事件
const emit = defineEmits([
  'submit',
  'cancel',
  'clear-history',
  'remove-file',
  'upload',
  'send-audio',
  'open-mcp-dialog',
  'pick-file-start',
  'toggle-mcp',
  'toggle-skill',
  'open-skill-dialog',
]);

// --- Refs and State ---
const senderRef = ref(null);
const fileInputRef = ref(null);
const waveformCanvasContainer = ref(null);
const isDragging = ref(false);
const dragCounter = ref(0);
const isRecording = ref(false);
const getDefaultInputTextHeight = () =>
  typeof window !== 'undefined' && window.innerWidth <= 760 ? 32 : 36;
const DEFAULT_INPUT_TEXT_HEIGHT = getDefaultInputTextHeight();
const MIN_INPUT_TEXT_HEIGHT = 28;
const inputTextHeight = ref(DEFAULT_INPUT_TEXT_HEIGHT);
const isInputResizing = ref(false);
let resizeStartY = 0;
let resizeStartHeight = DEFAULT_INPUT_TEXT_HEIGHT;

// --- MCP Quick Select State ---
const showMcpQuickSelect = ref(false);
const mcpFilterKeyword = ref('');
const mcpHighlightIndex = ref(0);

// --- Skill Quick Select State ---
const showSkillQuickSelect = ref(false);
const skillFilterKeyword = ref('');
const skillHighlightIndex = ref(0);

// --- Refs for closing popups ---
const reasoningSelectorRef = ref(null);
const voiceSelectorRef = ref(null);
const audioSourceSelectorRef = ref(null);
const reasoningButtonRef = ref(null);
const voiceButtonRef = ref(null);
const audioButtonRef = ref(null);

let recorder = null;
let wave = null;
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
const currentRecordingSource = ref(null);
const isCancelledByButton = ref(false);

const isAudioSourceSelectorVisible = ref(false);
const isReasoningSelectorVisible = ref(false);
const isVoiceSelectorVisible = ref(false);
const internalVoiceList = ref(props.voiceList || []);
watch(
  () => props.voiceList,
  (newVal) => {
    internalVoiceList.value = newVal || [];
  },
  { immediate: true },
);

// --- Computed Properties ---
const reasoningTooltipContent = computed(() => {
  const map = { default: '默认', low: '低', medium: '中', high: '高' };
  return `思考预算: ${map[tempReasoningEffort.value] || '默认'}`;
});

// 过滤后的 MCP 列表逻辑
const filteredMcpList = computed(() => {
  if (!showMcpQuickSelect.value) return [];
  const keyword = mcpFilterKeyword.value.toLowerCase();

  let list = props.allMcpServers.filter((server) => {
    // 1. 匹配名称 (包含匹配)
    const nameMatch = server.name && server.name.toLowerCase().includes(keyword);

    // 2. 匹配标签
    const tagMatch = server.tags && server.tags.some((tag) => tag.toLowerCase().includes(keyword));

    // 3. 匹配类型 (原始类型 + 中文显示名)
    const typeRaw = (server.type || '').toLowerCase();
    let typeDisplay = '';

    // 简单的类型映射逻辑
    if (typeRaw === 'builtin') typeDisplay = '内置';
    else if (typeRaw === 'stdio') typeDisplay = 'stdio';
    else if (typeRaw === 'sse') typeDisplay = 'sse';
    else if (typeRaw.includes('http')) typeDisplay = '可流式 http';

    const typeMatch = typeRaw.includes(keyword) || typeDisplay.includes(keyword);

    return nameMatch || tagMatch || typeMatch;
  });

  // 限制显示 10 个
  return list.slice(0, 10);
});

// 过滤后的 Skill 列表逻辑
const filteredSkillList = computed(() => {
  if (!showSkillQuickSelect.value) return [];
  const keyword = skillFilterKeyword.value.toLowerCase();

  let list = props.allSkills.filter((skill) => {
    return skill.name.toLowerCase().startsWith(keyword);
  });

  return list.slice(0, 10);
});

// 监听 prompt 变化以触发快捷选择
watch(prompt, (newVal) => {
  // 处理 MCP (@) - 匹配行首或空格后的 @
  const mcpMatch = newVal.match(/(?:^|\s)@([^@\s]*)$/);
  if (mcpMatch) {
    mcpFilterKeyword.value = mcpMatch[1];
    showMcpQuickSelect.value = true;
    showSkillQuickSelect.value = false; // 互斥
    mcpHighlightIndex.value = 0;
    return;
  }

  // 处理 Skill (/) - 匹配行首或空格后的 /
  const skillMatch = newVal.match(/(?:^|\s)\/([^/\s]*)$/);
  if (skillMatch) {
    skillFilterKeyword.value = skillMatch[1];
    showSkillQuickSelect.value = true;
    showMcpQuickSelect.value = false; // 互斥
    skillHighlightIndex.value = 0;
    return;
  }

  // 都不匹配则关闭
  showMcpQuickSelect.value = false;
  showSkillQuickSelect.value = false;
});

// --- Helper function ---
const insertNewline = () => {
  const textarea = senderRef.value?.$refs.textarea;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = prompt.value;
  prompt.value = value.substring(0, start) + '\n' + value.substring(end);
  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = start + 1;
    textarea.focus();
  });
};

const handleToggleSkill = (skillName) => {
  emit('toggle-skill', skillName);
  showSkillQuickSelect.value = false;
  prompt.value = prompt.value.replace(/(?:^|\s)\/([^/\s]*)$/, '').trimEnd();
};

const handleSkillTab = () => {
  const skill = filteredSkillList.value[skillHighlightIndex.value];
  if (skill) {
    prompt.value = prompt.value.replace(/(\/)([^/\s]*)$/, `$1${skill.name} `);
  }
};

// --- Event Handlers ---
const handleKeyDown = (event) => {
  if (event.isComposing) return;

  // [MCP 快捷选择键盘逻辑]
  if (showMcpQuickSelect.value && filteredMcpList.value.length > 0) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      showMcpQuickSelect.value = false;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      mcpHighlightIndex.value =
        (mcpHighlightIndex.value - 1 + filteredMcpList.value.length) % filteredMcpList.value.length;
      nextTick(() => {
        const activeItem = document.querySelector('.mcp-quick-item.highlighted');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
      });
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      mcpHighlightIndex.value = (mcpHighlightIndex.value + 1) % filteredMcpList.value.length;
      nextTick(() => {
        const activeItem = document.querySelector('.mcp-quick-item.highlighted');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const server = filteredMcpList.value[mcpHighlightIndex.value];
      if (server) handleToggleMcp(server.id);
      return;
    }
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      const idx = parseInt(event.key);
      if (idx < filteredMcpList.value.length) handleToggleMcp(filteredMcpList.value[idx].id);
      return;
    }
  }

  // Skill 快捷选择键盘逻辑
  if (showSkillQuickSelect.value && filteredSkillList.value.length > 0) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      showSkillQuickSelect.value = false;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      skillHighlightIndex.value =
        (skillHighlightIndex.value - 1 + filteredSkillList.value.length) %
        filteredSkillList.value.length;
      nextTick(() => {
        const activeItem = document.querySelector('.skill-quick-item.highlighted');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
      });
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      skillHighlightIndex.value = (skillHighlightIndex.value + 1) % filteredSkillList.value.length;
      nextTick(() => {
        const activeItem = document.querySelector('.skill-quick-item.highlighted');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
      });
      return;
    }
    if (event.key === 'Tab') {
      // Tab 补全
      event.preventDefault();
      handleSkillTab();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const skill = filteredSkillList.value[skillHighlightIndex.value];
      if (skill) handleToggleSkill(skill.name);
      return;
    }
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      const idx = parseInt(event.key);
      if (idx < filteredSkillList.value.length)
        handleToggleSkill(filteredSkillList.value[idx].name);
      return;
    }
  }

  // 原有的录音快捷键逻辑
  if (isRecording.value) {
    if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c')) {
      event.preventDefault();
    }
    return;
  }

  // 原有的回车发送逻辑
  if (event.key !== 'Enter') return;

  const isCtrlOrMetaPressed = event.ctrlKey || event.metaKey;
  if (!props.ctrlEnterToSend) {
    if (isCtrlOrMetaPressed) {
      event.preventDefault();
      insertNewline();
    } else if (!event.shiftKey) {
      event.preventDefault();
      if (!props.loading) emit('submit');
    }
  } else {
    if (isCtrlOrMetaPressed) {
      event.preventDefault();
      if (!props.loading) emit('submit');
    }
  }
};

const handleToggleMcp = (serverId) => {
  emit('toggle-mcp', serverId);
  showMcpQuickSelect.value = false;
  prompt.value = prompt.value.replace(/(?:^|\s)@([^@\s]*)$/, '').trimEnd();
};

const handleMcpClick = (server) => {
  handleToggleMcp(server.id);
};

const onSubmit = () => {
  if (props.loading) return;
  emit('submit');
};
const onCancel = () => emit('cancel');
const onClearHistory = () => emit('clear-history');
const onRemoveFile = (index) => emit('remove-file', index);

const toggleReasoningSelector = () => {
  if (isRecording.value) return;
  isReasoningSelectorVisible.value = !isReasoningSelectorVisible.value;
  if (isReasoningSelectorVisible.value) {
    isVoiceSelectorVisible.value = false;
    isAudioSourceSelectorVisible.value = false;
  }
};

const handleReasoningSelection = (effort) => {
  tempReasoningEffort.value = effort;
  isReasoningSelectorVisible.value = false;
};

const toggleVoiceSelector = async () => {
  if (isRecording.value) return;
  if (!isVoiceSelectorVisible.value) {
    try {
      const res = await window.api.getConfig();
      if (res?.config?.voiceList) {
        internalVoiceList.value = res.config.voiceList;
      }
    } catch (e) {
      console.error('刷新语音列表失败', e);
    }
    isReasoningSelectorVisible.value = false;
    isAudioSourceSelectorVisible.value = false;
  }
  isVoiceSelectorVisible.value = !isVoiceSelectorVisible.value;
};

const handleVoiceSelection = (value) => {
  selectedVoice.value = value;
  isVoiceSelectorVisible.value = false;
};

// --- File Handling ---
const triggerFileUpload = () => {
  emit('pick-file-start');
  nextTick(() => {
    fileInputRef.value?.click();
  });
};
const handleFileChange = (event) => {
  const files = event.target.files;
  if (files.length) emit('upload', { file: files[0], fileList: Array.from(files) });
  if (fileInputRef.value) fileInputRef.value.value = '';
};

const hasFileDragData = (event: DragEvent) => {
  const dataTransfer = event?.dataTransfer;
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  const types = Array.isArray(dataTransfer.types)
    ? dataTransfer.types
    : Array.from(dataTransfer.types || []);
  return types.includes('Files');
};

const preventDefaults = (e) => e.preventDefault();
const handleWindowDragOver = (event) => {
  if (!hasFileDragData(event)) return;
  preventDefaults(event);
};
const handleDragEnter = (event) => {
  if (!hasFileDragData(event)) return;
  preventDefaults(event);
  dragCounter.value++;
  isDragging.value = true;
};
const handleDragLeave = (event) => {
  if (!hasFileDragData(event)) return;
  preventDefaults(event);
  dragCounter.value--;
  if (dragCounter.value <= 0) {
    isDragging.value = false;
    dragCounter.value = 0;
  }
};
const handleDrop = (event) => {
  if (!hasFileDragData(event)) return;
  preventDefaults(event);
  isDragging.value = false;
  dragCounter.value = 0;
  const files = event.dataTransfer.files;
  if (files && files.length > 0) {
    emit('upload', { file: files[0], fileList: Array.from(files) });
    focus();
  }
};
const handlePasteEvent = (event) => {
  const clipboardData = event.clipboardData || window.clipboardData;
  if (!clipboardData) return;
  const items = Array.from(clipboardData.items).filter((item) => item.kind === 'file');
  if (items.length > 0) {
    preventDefaults(event);
    const files = items.map((item) => item.getAsFile());
    emit('upload', { file: files[0], fileList: files });
    focus();
  }
};

const toggleAudioSourceSelector = () => {
  if (isRecording.value) return;
  isAudioSourceSelectorVisible.value = !isAudioSourceSelectorVisible.value;
  if (isAudioSourceSelectorVisible.value) {
    isVoiceSelectorVisible.value = false;
    isReasoningSelectorVisible.value = false;
  }
};

const getMaxInputTextHeight = () => {
  const viewport = typeof window !== 'undefined' ? window.innerHeight : 900;
  return Math.max(160, Math.round(viewport * 0.45));
};

const handleInputResizeMove = (event) => {
  if (!isInputResizing.value) return;
  const deltaY = event.clientY - resizeStartY;
  const next = resizeStartHeight - deltaY;
  inputTextHeight.value = Math.max(MIN_INPUT_TEXT_HEIGHT, Math.min(getMaxInputTextHeight(), next));
  event.preventDefault();
};

const stopInputResize = () => {
  if (!isInputResizing.value) return;
  isInputResizing.value = false;
  window.removeEventListener('pointermove', handleInputResizeMove);
  window.removeEventListener('pointerup', stopInputResize);
  window.removeEventListener('pointercancel', stopInputResize);
};

const startInputResize = (event) => {
  if (isRecording.value) return;
  isInputResizing.value = true;
  resizeStartY = event.clientY;
  resizeStartHeight = inputTextHeight.value;
  window.addEventListener('pointermove', handleInputResizeMove, { passive: false });
  window.addEventListener('pointerup', stopInputResize);
  window.addEventListener('pointercancel', stopInputResize);
  event.preventDefault();
};

const startRecordingFromSource = async (sourceType) => {
  isAudioSourceSelectorVisible.value = false;
  if (isRecording.value) return;

  isRecording.value = true;
  currentRecordingSource.value = sourceType;
  isCancelledByButton.value = false;

  try {
    if (sourceType === 'microphone') {
      const RecorderLib = await import('recorder-core');
      const Recorder = RecorderLib.default;
      await import('recorder-core/src/extensions/waveview');
      await import('recorder-core/src/engine/wav');

      await new Promise((resolve, reject) => {
        Recorder.TrafficFree = true;
        recorder = Recorder({
          type: 'wav',
          sampleRate: 16000,
          bitRate: 16,
          onProcess: (buffers, powerLevel, bufferDuration, bufferSampleRate) => {
            if (wave) {
              wave.input(buffers[buffers.length - 1], powerLevel, bufferSampleRate);
            }
          },
        });
        recorder.open(
          () => {
            nextTick(() => {
              if (waveformCanvasContainer.value) {
                wave = Recorder.WaveView({ elem: waveformCanvasContainer.value, lineWidth: 3 });
              }
              recorder.start();
              resolve();
            });
          },
          (msg, isUserNotAllow) => {
            const errorMsg = (isUserNotAllow ? '用户拒绝了权限, ' : '') + '无法录音: ' + msg;
            ElMessage.error(errorMsg);
            recorder = null;
            reject(new Error(errorMsg));
          },
        );
      });
    } else if (sourceType === 'system') {
      const sources = await window.api.desktopCaptureSources({ types: ['screen', 'window'] });
      if (!sources || sources.length === 0) throw new Error('未找到可用的系统音频源');

      // 1. 获取包含视频和音频的原始流 (系统限制必须请求视频才能拿音频)
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } },
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } },
      });

      // 2. 从流中分离出音频轨道
      const audioTrack = audioStream.getAudioTracks()[0];
      if (!audioTrack) {
        // 如果用户在选择窗口时未勾选“分享音频”，这里会获取不到音频轨道
        // 立即停止流并报错
        audioStream.getTracks().forEach((t) => t.stop());
        audioStream = null;
        throw new Error('未检测到系统音频，请务必在屏幕分享窗口中勾选“分享音频”');
      }

      // 3. 创建一个仅包含音频的新流供录制器使用
      const audioOnlyStream = new MediaStream([audioTrack]);

      audioChunks = [];
      // 4. 使用仅音频流初始化录制器
      // 注意：audioStream 变量仍保持原始混合流引用，以便 stopRecordingAndCleanup 能正确关闭屏幕分享状态
      mediaRecorder = new MediaRecorder(audioOnlyStream);

      mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
      mediaRecorder.onstop = () => {
        if (isCancelledByButton.value) {
          stopRecordingAndCleanup();
          return;
        }
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' }); // 浏览器通常输出webm/opus，但保留原逻辑兼容性
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
        const audioFile = new File([audioBlob], `audio-${timestamp}.wav`, { type: 'audio/wav' });
        emit('send-audio', audioFile);
        stopRecordingAndCleanup();
      };

      mediaRecorder.start();
    }
  } catch (err) {
    console.error('录音启动失败:', err);
    ElMessage.error(err.message || '无法开始录音');
    stopRecordingAndCleanup();
  }
};

const stopRecordingAndCleanup = () => {
  if (recorder) {
    recorder.close();
    recorder = null;
  }
  if (wave) {
    if (waveformCanvasContainer.value) waveformCanvasContainer.value.innerHTML = '';
    wave = null;
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
  }
  mediaRecorder = null;
  audioStream = null;
  audioChunks = [];
  isRecording.value = false;
  currentRecordingSource.value = null;
};

const handleCancelRecording = () => {
  isCancelledByButton.value = true;
  ElMessage.info('录音已取消');
  if (currentRecordingSource.value === 'microphone' && recorder) {
    recorder.stop(
      () => stopRecordingAndCleanup(),
      () => stopRecordingAndCleanup(),
    );
  } else if (currentRecordingSource.value === 'system' && mediaRecorder) {
    mediaRecorder.stop();
  }
};

const handleConfirmAndSendRecording = () => {
  isCancelledByButton.value = false;
  if (currentRecordingSource.value === 'microphone' && recorder) {
    recorder.stop(
      (blob) => {
        if (isCancelledByButton.value) {
          stopRecordingAndCleanup();
          return;
        }
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
        const audioFile = new File([blob], `audio-${timestamp}.wav`, { type: 'audio/wav' });
        emit('send-audio', audioFile);
        stopRecordingAndCleanup();
      },
      (msg) => {
        ElMessage.error('录音失败: ' + msg);
        stopRecordingAndCleanup();
      },
    );
  } else if (currentRecordingSource.value === 'system' && mediaRecorder) {
    mediaRecorder.stop();
  }
};

const handleClickOutside = (event) => {
  const target = event.target;
  if (!target) return;
  if (
    isReasoningSelectorVisible.value &&
    reasoningSelectorRef.value &&
    !reasoningSelectorRef.value.contains(target) &&
    reasoningButtonRef.value &&
    !reasoningButtonRef.value.$el.contains(target)
  ) {
    isReasoningSelectorVisible.value = false;
  }
  if (
    isVoiceSelectorVisible.value &&
    voiceSelectorRef.value &&
    !voiceSelectorRef.value.$el.contains(target) &&
    voiceButtonRef.value &&
    !voiceButtonRef.value.$el.contains(target)
  ) {
    isVoiceSelectorVisible.value = false;
  }
  if (
    isAudioSourceSelectorVisible.value &&
    audioSourceSelectorRef.value &&
    !audioSourceSelectorRef.value.contains(target) &&
    audioButtonRef.value &&
    !audioButtonRef.value.$el.contains(target)
  ) {
    isAudioSourceSelectorVisible.value = false;
  }
};

onMounted(() => {
  window.addEventListener('dragenter', handleDragEnter);
  window.addEventListener('dragleave', handleDragLeave);
  window.addEventListener('dragover', handleWindowDragOver);
  window.addEventListener('drop', handleDrop);
  window.addEventListener('paste', handlePasteEvent);
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  stopInputResize();
  window.removeEventListener('dragenter', handleDragEnter);
  window.removeEventListener('dragleave', handleDragLeave);
  window.removeEventListener('dragover', handleWindowDragOver);
  window.removeEventListener('drop', handleDrop);
  window.removeEventListener('paste', handlePasteEvent);
  document.removeEventListener('click', handleClickOutside);
  stopRecordingAndCleanup();
});

const focus = (options = {}) => {
  const textarea = senderRef.value?.$refs.textarea;
  if (!textarea) return;
  textarea.focus();
  nextTick(() => {
    if (options.position && typeof options.position.start === 'number') {
      const textLength = prompt.value?.length || 0;
      const start = Math.min(options.position.start, textLength);
      const end = Math.min(options.position.end, textLength);
      textarea.setSelectionRange(start, end);
    } else if (options.cursor === 'end') {
      const textLength = prompt.value?.length || 0;
      textarea.setSelectionRange(textLength, textLength);
    }
  });
};

const getDisplayTypeName = (type) => {
  if (!type) return '';
  const streamableHttpRegex = /^streamable[\s_-]?http$/i;
  const lowerType = type.toLowerCase();

  if (lowerType === 'builtin') return '内置';
  if (streamableHttpRegex.test(lowerType) || lowerType === 'http') return 'HTTP'; // 简化显示
  if (lowerType === 'sse') return 'SSE';
  if (lowerType === 'stdio') return 'Stdio';

  return type;
};

defineExpose({ focus, senderRef });
</script>

<template>
  <div v-if="isDragging" class="drag-overlay">
    <div class="drag-overlay-content">拖拽文件到此处以上传</div>
  </div>

  <el-footer class="input-footer">
    <!-- 文件列表 -->
    <el-row v-if="fileList.length > 0 && !isRecording">
      <el-col :span="0" />
      <el-col :span="24">
        <div class="file-card-container">
          <div v-for="(file, index) in fileList" :key="index" class="custom-file-card">
            <div class="file-icon">
              <el-icon :size="20">
                <FileText />
              </el-icon>
            </div>
            <div class="file-info">
              <div class="file-name" :title="file.name">{{ file.name }}</div>
              <div class="file-size">{{ (file.size / 1024).toFixed(1) }} KB</div>
            </div>
            <div class="file-actions">
              <el-button type="danger" link size="small" @click="onRemoveFile(index)">
                <Trash2 :size="14" />
              </el-button>
            </div>
          </div>
        </div>
      </el-col>
      <el-col :span="0" />
    </el-row>

    <!-- 录音波形 -->
    <el-row v-show="isRecording" class="waveform-row">
      <el-col :span="0" />
      <el-col :span="24">
        <div class="waveform-display-area">
          <div
            v-if="currentRecordingSource === 'microphone'"
            ref="waveformCanvasContainer"
            class="waveform-canvas"
          ></div>
          <span v-else class="recording-status-text">正在录制系统音频...</span>
        </div>
      </el-col>
      <el-col :span="0" />
    </el-row>

    <!-- 选项弹出层 -->
    <el-row v-if="isAudioSourceSelectorVisible" class="option-selector-row">
      <el-col :span="0" />
      <el-col :span="24">
        <div class="option-selector-wrapper" ref="audioSourceSelectorRef">
          <div class="option-selector-content">
            <el-text tag="b" class="selector-label">选择音源</el-text>
            <el-divider direction="vertical" />
            <el-button @click="startRecordingFromSource('microphone')" round>
              <el-icon><Mic :size="15" /></el-icon>
              麦克风
            </el-button>
            <el-button @click="startRecordingFromSource('system')" round>
              <el-icon><Monitor :size="15" /></el-icon>
              系统音频
            </el-button>
          </div>
        </div>
      </el-col>
      <el-col :span="0" />
    </el-row>

    <el-row v-if="isReasoningSelectorVisible" class="option-selector-row">
      <el-col :span="0" />
      <el-col :span="24">
        <div class="option-selector-wrapper" ref="reasoningSelectorRef">
          <div class="option-selector-content">
            <el-text tag="b" class="selector-label">思考预算</el-text>
            <el-divider direction="vertical" />
            <el-button
              @click="handleReasoningSelection('default')"
              :type="tempReasoningEffort === 'default' ? 'primary' : 'default'"
              round
              >默认</el-button
            >
            <el-button
              @click="handleReasoningSelection('low')"
              :type="tempReasoningEffort === 'low' ? 'primary' : 'default'"
              round
              >快速</el-button
            >
            <el-button
              @click="handleReasoningSelection('medium')"
              :type="tempReasoningEffort === 'medium' ? 'primary' : 'default'"
              round
              >均衡</el-button
            >
            <el-button
              @click="handleReasoningSelection('high')"
              :type="tempReasoningEffort === 'high' ? 'primary' : 'default'"
              round
              >深入</el-button
            >
          </div>
        </div>
      </el-col>
      <el-col :span="0" />
    </el-row>

    <el-row v-if="isVoiceSelectorVisible" class="option-selector-row">
      <el-col :span="0" />
      <el-col :span="24">
        <el-scrollbar class="option-selector-wrapper" ref="voiceSelectorRef">
          <div class="option-selector-content">
            <el-text tag="b" class="selector-label">选择音色</el-text>
            <el-divider direction="vertical" />
            <el-button
              @click="handleVoiceSelection(null)"
              :type="!selectedVoice ? 'primary' : 'default'"
              round
            >
              关闭语音
            </el-button>
            <el-button
              v-for="voice in internalVoiceList"
              :key="voice"
              @click="handleVoiceSelection(voice)"
              :type="selectedVoice === voice ? 'primary' : 'default'"
              round
            >
              {{ voice }}
            </el-button>
          </div>
        </el-scrollbar>
      </el-col>
      <el-col :span="0" />
    </el-row>

    <el-row>
      <el-col :span="0" />
      <el-col :span="24">
        <div
          class="chat-input-area-vertical"
          :class="{ 'is-resizing': isInputResizing }"
          :style="{ '--input-text-height': `${inputTextHeight}px` }"
        >
          <div class="input-top-resizer" @pointerdown="startInputResize">
            <span class="input-top-resizer-grip"></span>
          </div>
          <div v-if="showMcpQuickSelect && filteredMcpList.length > 0" class="mcp-quick-select">
            <!-- 顶部提示栏 -->
            <div class="mcp-quick-header">
              <span class="header-title">MCP快捷选择</span>
              <span class="header-hint"
                >Esc 取消 <span class="divider">|</span> ⇅ 选择
                <span class="divider">|</span> Enter/数字键 确认</span
              >
            </div>

            <!-- 滚动列表区域 -->
            <div class="mcp-quick-list-scroll">
              <div
                v-for="(server, idx) in filteredMcpList"
                :key="server.id"
                class="mcp-quick-item"
                :class="{
                  highlighted: idx === mcpHighlightIndex,
                  active: activeMcpIds.includes(server.id),
                }"
                @mousedown.prevent="handleMcpClick(server)"
              >
                <div class="mcp-item-left">
                  <span class="mcp-index-badge">{{ idx }}</span>
                  <span class="mcp-name">{{ server.name }}</span>
                  <div class="mcp-tags">
                    <!-- 显式显示类型标签 -->
                    <span v-if="server.type" class="mcp-tag type-tag">{{
                      getDisplayTypeName(server.type)
                    }}</span>
                    <!-- 原有的用户标签 -->
                    <span
                      v-for="tag in (server.tags || []).slice(0, 2)"
                      :key="tag"
                      class="mcp-tag"
                      >{{ tag }}</span
                    >
                  </div>
                </div>
                <div class="mcp-item-right">
                  <el-icon v-if="activeMcpIds.includes(server.id)" class="active-icon">
                    <Check />
                  </el-icon>
                </div>
              </div>
            </div>
          </div>

          <div v-if="showSkillQuickSelect && filteredSkillList.length > 0" class="mcp-quick-select">
            <div class="mcp-quick-header">
              <span class="header-title">Skill 技能选择</span>
              <span class="header-hint"
                >Esc 取消 <span class="divider">|</span> Tab 补全
                <span class="divider">|</span> Enter 确认</span
              >
            </div>
            <div class="mcp-quick-list-scroll">
              <div
                v-for="(skill, idx) in filteredSkillList"
                :key="skill.name"
                class="mcp-quick-item skill-quick-item"
                :class="{
                  highlighted: idx === skillHighlightIndex,
                  active: activeSkillIds.includes(skill.name),
                }"
                @mousedown.prevent="handleToggleSkill(skill.name)"
              >
                <div class="mcp-item-left">
                  <span class="mcp-index-badge">{{ idx }}</span>
                  <span class="mcp-name">{{ skill.name }}</span>
                  <div class="mcp-tags skill-tags-container">
                    <span
                      v-if="skill.context === 'fork'"
                      class="mcp-tag type-tag"
                      style="
                        color: #e6a23c;
                        background-color: rgba(230, 162, 60, 0.1);
                        flex-shrink: 0;
                      "
                      >Sub-Agent</span
                    >
                    <span class="mcp-tag skill-desc-tag" :title="skill.description">{{
                      skill.description || '无描述'
                    }}</span>
                  </div>
                </div>
                <div class="mcp-item-right">
                  <el-icon v-if="activeSkillIds.includes(skill.name)" class="active-icon">
                    <Check />
                  </el-icon>
                </div>
              </div>
            </div>
          </div>

          <div class="input-wrapper">
            <el-input
              ref="senderRef"
              class="chat-textarea-vertical"
              v-model="prompt"
              type="textarea"
              :placeholder="
                isRecording
                  ? '录音中... 结束后将连同文本一起发送'
                  : '输入、粘贴、拖拽以发送内容，“ @”选择MCP，“ /”选择skill'
              "
              :autosize="false"
              resize="none"
              @keydown="handleKeyDown"
              :disabled="isRecording"
            />
          </div>
          <div class="input-actions-bar">
            <div class="action-buttons-left">
              <el-tooltip content="清除聊天记录">
                <el-button
                  class="input-icon-btn circle-action-btn"
                  size="default"
                  @click="onClearHistory"
                  circle
                  :disabled="isRecording"
                >
                  <BrushCleaning :size="17" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="添加附件">
                <el-button
                  class="input-icon-btn circle-action-btn"
                  size="default"
                  @click="triggerFileUpload"
                  circle
                  :disabled="isRecording"
                >
                  <Paperclip :size="17" />
                </el-button>
              </el-tooltip>

              <el-tooltip :content="reasoningTooltipContent">
                <el-button
                  ref="reasoningButtonRef"
                  :class="{
                    'is-active-special': tempReasoningEffort && tempReasoningEffort !== 'default',
                  }"
                  class="input-icon-btn circle-action-btn"
                  size="default"
                  circle
                  :disabled="isRecording"
                  @click="toggleReasoningSelector"
                >
                  <Brain :size="17" />
                </el-button>
              </el-tooltip>

              <el-tooltip content="语音回复设置">
                <el-button
                  ref="voiceButtonRef"
                  class="input-icon-btn circle-action-btn"
                  size="default"
                  circle
                  :disabled="isRecording"
                  :class="{ 'is-active-special': selectedVoice }"
                  @click="toggleVoiceSelector"
                >
                  <AudioLines :size="17" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="MCP工具">
                <el-button
                  class="input-icon-btn circle-action-btn"
                  size="default"
                  circle
                  :disabled="isRecording"
                  :class="{ 'is-active-special': isMcpActive }"
                  @click="$emit('open-mcp-dialog')"
                >
                  <Hammer :size="17" />
                </el-button>
              </el-tooltip>
              <el-tooltip content="Skill 技能库">
                <el-button
                  class="input-icon-btn circle-action-btn"
                  size="default"
                  circle
                  :disabled="isRecording"
                  :class="{ 'is-active-special': activeSkillIds && activeSkillIds.length > 0 }"
                  @click="$emit('open-skill-dialog')"
                >
                  <Library :size="17" />
                </el-button>
              </el-tooltip>
            </div>
            <div class="actions-divider"></div>
            <div class="action-buttons-right">
              <template v-if="isRecording">
                <el-tooltip content="取消录音"
                  ><el-button
                    class="input-icon-btn circle-action-btn"
                    size="default"
                    @click="handleCancelRecording"
                    circle
                  >
                    <X :size="17" /> </el-button
                ></el-tooltip>
                <el-tooltip content="结束并发送"
                  ><el-button
                    class="input-icon-btn circle-action-btn"
                    size="default"
                    @click="handleConfirmAndSendRecording"
                    circle
                  >
                    <Check :size="17" /> </el-button
                ></el-tooltip>
              </template>
              <template v-else>
                <el-tooltip content="发送语音">
                  <el-button
                    ref="audioButtonRef"
                    class="input-icon-btn circle-action-btn"
                    size="default"
                    @click="toggleAudioSourceSelector"
                    circle
                  >
                    <Mic :size="17" />
                  </el-button>
                </el-tooltip>
                <el-button
                  v-if="!loading"
                  class="input-icon-btn send-action-btn message-send-btn"
                  @click="onSubmit"
                  circle
                  :disabled="loading"
                >
                  <span class="send-state-icon" aria-hidden="true">
                    <svg
                      class="send-arrow-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M12 17V7"
                        stroke="currentColor"
                        stroke-width="2.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                      <path
                        d="M7 12L12 7L17 12"
                        stroke="currentColor"
                        stroke-width="2.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </span>
                </el-button>
                <el-button
                  v-else
                  @click="onCancel"
                  circle
                  class="input-icon-btn send-action-btn message-send-btn"
                >
                  <span class="send-state-icon" aria-hidden="true">
                    <svg
                      class="stop-square-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect
                        x="5.4"
                        y="5.4"
                        width="13.2"
                        height="13.2"
                        rx="3.2"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                </el-button>
              </template>
            </div>
          </div>
        </div>

        <input
          ref="fileInputRef"
          type="file"
          multiple
          @change="handleFileChange"
          style="display: none"
        />
      </el-col>
      <el-col :span="0" />
    </el-row>
  </el-footer>
</template>

<style scoped>
/* Base Styles */
.drag-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(90, 90, 90, 0.3);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
}

html.dark .drag-overlay {
  background-color: rgba(20, 20, 20, 0.4);
}

.drag-overlay-content {
  color: white;
  font-size: 20px;
  font-weight: bold;
  padding: 20px 40px;
  border: 2px dashed white;
  border-radius: 12px;
  background-color: rgba(0, 0, 0, 0.2);
}

.input-footer {
  padding: 8px 8px 12px;
  height: auto;
  width: 100%;
  flex-shrink: 0;
  z-index: 10;
  background-color: transparent;
  border: none;
  box-shadow: none;
  outline: none;
}

/* --- MCP Quick Select Styles --- */
.mcp-quick-select {
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 100%;
  /* 容器本身不滚动，改为 flex 布局以固定 Header */
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  box-shadow: var(--el-box-shadow-light);
  z-index: 100;
  margin-bottom: 10px;
  padding: 0;
  /* padding 移到内部元素 */
  overflow: hidden;
  /* 防止圆角溢出 */
}

/* 顶部提示栏样式 */
.mcp-quick-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background-color: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
  /* 等宽字体让快捷键更好看 */
}

.header-hint .divider {
  color: var(--el-border-color);
  margin: 0 4px;
}

/* 滚动列表区域 */
.mcp-quick-list-scroll {
  max-height: 260px;
  /* 列表内容的最大高度 */
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 滚动条 */
.mcp-quick-list-scroll::-webkit-scrollbar {
  width: 6px;
}

.mcp-quick-list-scroll::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color);
  border-radius: 3px;
}

.app-container.has-bg .mcp-quick-select {
  background-color: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
}

.app-container.has-bg .mcp-quick-header {
  background-color: rgba(0, 0, 0, 0.03);
  border-bottom-color: rgba(0, 0, 0, 0.05);
}

html.dark .app-container.has-bg .mcp-quick-select {
  background-color: rgba(30, 30, 30, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

html.dark .app-container.has-bg .mcp-quick-header {
  background-color: rgba(255, 255, 255, 0.05);
  border-bottom-color: rgba(255, 255, 255, 0.05);
}

.mcp-quick-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 9px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  /* 增加平滑过渡 */
  border: 1px solid transparent;
  /* 预留边框位置防止跳动 */
}

/* 1. 默认状态：悬浮 (Hover) & 键盘高亮 (Highlighted) */
.mcp-quick-item:hover,
.mcp-quick-item.highlighted {
  background-color: var(--el-fill-color);
}

/* 2. 激活状态 (Active - 已勾选) */
.mcp-quick-item.active {
  background-color: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-8);
}

.mcp-quick-item.active .mcp-name {
  color: var(--el-color-primary);
  /* 激活时名称变为主色 */
  font-weight: 600;
}

/* 3. 激活 + 悬浮/高亮 (叠加状态) */
.mcp-quick-item.active:hover,
.mcp-quick-item.active.highlighted {
  background-color: var(--el-color-primary-light-8);
}

/* --- 深色模式适配 (Dark Mode) --- */
html.dark .mcp-quick-item.active {
  background-color: rgba(64, 158, 255, 0.15);
  /* 使用透明主色，避免 light-9 在暗色下太亮 */
  border-color: rgba(64, 158, 255, 0.2);
}

html.dark .mcp-quick-item.active:hover,
html.dark .mcp-quick-item.active.highlighted {
  background-color: rgba(64, 158, 255, 0.25);
}

/* 1. 悬浮/高亮 */
.app-container.has-bg .mcp-quick-item:hover,
.app-container.has-bg .mcp-quick-item.highlighted {
  background-color: rgba(0, 0, 0, 0.05);
}

html.dark .app-container.has-bg .mcp-quick-item:hover,
html.dark .app-container.has-bg .mcp-quick-item.highlighted {
  background-color: rgba(255, 255, 255, 0.1);
}

/* 2. 激活状态 */
.app-container.has-bg .mcp-quick-item.active {
  /* 浅色背景下：淡淡的蓝色玻璃感 */
  background-color: rgba(64, 158, 255, 0.15);
  border-color: rgba(64, 158, 255, 0.2);
}

html.dark .app-container.has-bg .mcp-quick-item.active {
  /* 深色背景下：稍亮的蓝色玻璃感 */
  background-color: rgba(64, 158, 255, 0.25);
  border-color: rgba(64, 158, 255, 0.3);
}

/* 3. 激活 + 悬浮/高亮 */
.app-container.has-bg .mcp-quick-item.active:hover,
.app-container.has-bg .mcp-quick-item.active.highlighted {
  background-color: rgba(64, 158, 255, 0.25);
}

html.dark .app-container.has-bg .mcp-quick-item.active:hover,
html.dark .app-container.has-bg .mcp-quick-item.active.highlighted {
  background-color: rgba(64, 158, 255, 0.35);
}

.mcp-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.mcp-index-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background-color: var(--el-fill-color-dark);
  /* 浅色模式默认 */
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-weight: bold;
  padding: 2px 4px 0px 4px;
  transition: all 0.15s;
}

.mcp-quick-item.active .mcp-index-badge {
  background-color: var(--el-color-primary);
  color: var(--text-on-accent);
}

html.dark .mcp-index-badge {
  background-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
}

html.dark .mcp-quick-item:hover .mcp-index-badge,
html.dark .mcp-quick-item.highlighted .mcp-index-badge {
  background-color: rgba(255, 255, 255, 0.25);
  color: #f7f7f3;
}

html.dark .mcp-quick-item.active .mcp-index-badge {
  background-color: var(--el-color-primary);
  color: #1a1a1a;
}

.mcp-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.mcp-tags {
  display: flex;
  gap: 4px;
  align-items: center;
}

.mcp-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background-color: var(--el-color-info-light-9);
  color: var(--el-color-info);
  height: 18px;
  line-height: 16px;
  box-sizing: border-box;
}

/* 类型标签特殊样式 */
.mcp-tag.type-tag {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
  padding-bottom: 0px;
  padding-top: 2px;
}

html.dark .mcp-tag.type-tag {
  background-color: var(--el-color-primary-light-8);
  color: var(--el-color-primary-dark-2);
}

.mcp-item-right {
  margin-left: 8px;
  width: 20px;
  display: flex;
  justify-content: center;
}

.active-icon {
  color: var(--el-color-primary);
  font-weight: bold;
}

.skill-tags-container {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.skill-desc-tag {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  padding-top: 1px;
}

/* --- 文件卡片容器样式 (原有) --- */
.file-card-container {
  margin-bottom: 8px;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
  padding-top: 8px;
  max-height: 70px;
}

/* 自定义文件卡片样式 */
.custom-file-card {
  display: flex;
  align-items: center;
  background-color: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  padding: 6px 10px;
  margin-right: 0;
  /* gap已处理间距 */
  min-width: 140px;
  max-width: 220px;
  height: 48px;
  box-sizing: border-box;
  transition: all 0.2s;
  flex-shrink: 0;
}

.custom-file-card:hover {
  border-color: var(--el-color-primary-light-5);
  background-color: var(--el-fill-color);
}

.file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  color: var(--el-text-color-secondary);
}

.file-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  line-height: 1.2;
  min-width: 0;
  /* 修复 flex 子项截断问题 */
}

.file-name {
  font-size: 12px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.file-size {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.file-actions {
  margin-left: 8px;
  display: flex;
  align-items: center;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.custom-file-card:hover .file-actions {
  opacity: 1;
}

/* 深色模式下的文件卡片适配 */
html.dark .custom-file-card {
  background-color: #2c2c2c;
  border-color: #4c4c4c;
}

html.dark .custom-file-card:hover {
  background-color: #363636;
  border-color: #5c5c5c;
}

/* 滚动条样式 */
.file-card-container::-webkit-scrollbar {
  height: 6px;
}

.file-card-container::-webkit-scrollbar-track {
  background: transparent;
}

.file-card-container::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color);
  border-radius: 3px;
}

.file-card-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-text-color-secondary);
}

html.dark .file-card-container::-webkit-scrollbar-thumb {
  background-color: #4c4c4c;
}

html.dark .file-card-container::-webkit-scrollbar-thumb:hover {
  background-color: #6b6b6b;
}

/* --- Waveform Display Area Styles --- */
.waveform-row {
  margin-bottom: 8px;
  transition: all 0.3s ease;
}

.waveform-display-area {
  width: 100%;
  height: 40px;
  background-color: var(--el-bg-color-input);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.waveform-canvas {
  width: 100%;
  height: 100%;
}

.recording-status-text {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  animation: pulse-text 1.5s infinite ease-in-out;
}

@keyframes pulse-text {
  0% {
    opacity: 0.7;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0.7;
  }
}

html.dark .waveform-display-area {
  background-color: var(--el-bg-color-input);
}

/* --- Universal Option Selector Styles --- */
.option-selector-row {
  margin-bottom: 8px;
}

.option-selector-wrapper {
  background-color: var(--el-bg-color-input);
  border-radius: 14px;
  padding: 8px;
  max-height: 132px;
  border: 1px solid var(--el-border-color-light);
}

html.dark .option-selector-wrapper {
  background-color: var(--el-bg-color-input);
}

.option-selector-content {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.option-selector-content .el-button {
  flex-shrink: 0;
}

.option-selector-wrapper :deep(.el-scrollbar__view) {
  padding-right: 8px;
}

.selector-label {
  font-size: 14px;
  color: var(--el-text-color);
  margin: 0 4px 0 8px;
  white-space: nowrap;
}

.el-divider--vertical {
  height: 1.2em;
  border-left: 1px solid var(--el-border-color-lighter);
  margin: 0 4px;
}

html.dark .el-divider--vertical {
  border-left-color: var(--el-border-color);
}

.input-wrapper {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  height: var(--input-text-height, 36px);
  min-height: var(--input-text-height, 36px);
}

/* --- Vertical Layout (Chat Input Area) --- */
.chat-input-area-vertical {
  --input-text-height: 36px;
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  padding: 13px 20px 10px;
  border: 2px solid transparent;
  background:
    linear-gradient(
        color-mix(in srgb, var(--el-bg-color-overlay) 94%, transparent),
        color-mix(in srgb, var(--el-bg-color-overlay) 94%, transparent)
      )
      padding-box,
    linear-gradient(96deg, rgba(229, 190, 120, 0.95) 0%, rgba(163, 153, 221, 0.95) 100%) border-box;
  box-shadow: 0 16px 32px rgba(32, 32, 32, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  position: relative;
}

html.dark .chat-input-area-vertical {
  border-color: var(--el-border-color-light);
  background:
    linear-gradient(
        color-mix(in srgb, var(--el-bg-color-input) 94%, transparent),
        color-mix(in srgb, var(--el-bg-color-input) 94%, transparent)
      )
      padding-box,
    linear-gradient(96deg, rgba(140, 121, 189, 0.82) 0%, rgba(109, 145, 177, 0.82) 100%) border-box;
}

.chat-textarea-vertical {
  width: 100%;
  height: 100%;
}

.chat-textarea-vertical:deep(.el-textarea) {
  height: 100%;
}

.chat-textarea-vertical:deep(.el-textarea__inner) {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  height: 100% !important;
  min-height: 100% !important;
  max-height: none !important;
  padding: 0;
  color: var(--el-text-color-primary);
  font-size: 15px;
  line-height: 1.55;
  resize: none;
  overflow-y: auto;
}

.chat-textarea-vertical:deep(.el-textarea__inner::placeholder) {
  color: color-mix(in srgb, var(--el-text-color-secondary) 72%, #b8b4ad);
  font-size: 15px;
  font-weight: 400;
}

.input-actions-bar {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-top: 8px;
  padding-top: 0;
  border-top: none;
  flex-shrink: 0;
}

.chat-input-area-vertical .action-buttons-left,
.chat-input-area-vertical .action-buttons-right {
  display: flex;
  align-items: center;
  gap: 9px;
}

.chat-input-area-vertical .action-buttons-left .el-button,
.chat-input-area-vertical .action-buttons-right .el-button {
  margin-left: 0 !important;
  margin-right: 0 !important;
}

.chat-input-area-vertical .action-buttons-left {
  margin-left: 0px;
}

.chat-input-area-vertical .action-buttons-right {
  margin-right: 0px;
  padding-left: 10px;
}

.input-top-resizer {
  position: absolute;
  top: -8px;
  left: 16px;
  right: 16px;
  height: 14px;
  cursor: ns-resize;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-top-resizer-grip {
  width: 78px;
  height: 3px;
  border-radius: 999px;
  background-color: color-mix(in srgb, var(--el-border-color-dark) 82%, transparent);
  opacity: 0.7;
  transition: all 0.2s ease;
}

.chat-input-area-vertical:hover .input-top-resizer-grip,
.chat-input-area-vertical.is-resizing .input-top-resizer-grip {
  opacity: 1;
  width: 94px;
}

.chat-input-area-vertical.is-resizing {
  user-select: none;
}

.actions-divider {
  margin-left: auto;
  width: 1px;
  height: 26px;
  border-radius: 99px;
  background-color: color-mix(in srgb, var(--el-border-color) 86%, transparent);
}

.chat-input-area-vertical .input-icon-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}

.chat-input-area-vertical .input-icon-btn.circle-action-btn:not(.message-send-btn) {
  background-color: transparent !important;
  color: var(--text-secondary) !important;
}

.chat-input-area-vertical .input-icon-btn.circle-action-btn:not(.message-send-btn):hover,
.chat-input-area-vertical .input-icon-btn.circle-action-btn:not(.message-send-btn):focus-visible {
  background-color: #ebebef !important;
  color: var(--text-primary) !important;
}

html.dark .chat-input-area-vertical .input-icon-btn.circle-action-btn:not(.message-send-btn):hover,
html.dark
  .chat-input-area-vertical
  .input-icon-btn.circle-action-btn:not(.message-send-btn):focus-visible {
  background-color: #1e1e1e !important;
}

.chat-input-area-vertical .input-icon-btn.circle-action-btn:not(.message-send-btn):disabled {
  background-color: transparent !important;
}

.chat-input-area-vertical .action-buttons-left .el-button.is-active-special {
  color: var(--text-accent) !important;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text-accent) 24%, transparent) inset;
}

.chat-input-area-vertical .send-action-btn {
  width: 34px;
  height: 34px;
}

.chat-input-area-vertical .message-send-btn {
  background-color: #000000;
  color: #ffffff;
}

html.dark .chat-input-area-vertical .message-send-btn {
  background-color: #ffffff;
  color: #000000;
}

.chat-input-area-vertical .action-buttons-right .message-send-btn:hover,
.chat-input-area-vertical .action-buttons-right .message-send-btn:focus-visible {
  background-color: #1a1a1a;
  color: #ffffff;
}

html.dark .chat-input-area-vertical .action-buttons-right .message-send-btn:hover,
html.dark .chat-input-area-vertical .action-buttons-right .message-send-btn:focus-visible {
  background-color: #e5e5e5;
  color: #000000;
}

@media (max-width: 760px) {
  .input-footer {
    padding: 6px 6px 10px;
  }

  .chat-input-area-vertical {
    border-radius: 18px;
    padding: 11px 14px 9px;
  }

  .input-top-resizer {
    left: 10px;
    right: 10px;
  }

  .input-top-resizer-grip {
    width: 64px;
  }

  .chat-textarea-vertical:deep(.el-textarea__inner) {
    font-size: 14px;
  }

  .chat-textarea-vertical:deep(.el-textarea__inner::placeholder) {
    font-size: 14px;
  }

  .chat-input-area-vertical .input-icon-btn {
    width: 32px;
    height: 32px;
  }

  .chat-input-area-vertical .send-action-btn {
    width: 32px;
    height: 32px;
  }
}

/* --- Common Styles --- */
:deep(.el-textarea.is-disabled .el-textarea__inner) {
  cursor: default !important;
  background-color: transparent !important;
}

:deep(.el-textarea__inner::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

:deep(.el-textarea__inner::-webkit-scrollbar-track) {
  background: transparent;
  border-radius: 4px;
}

:deep(.el-textarea__inner::-webkit-scrollbar-thumb) {
  background: var(--el-text-color-disabled, #c0c4cc);
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: content-box;
}

:deep(.el-textarea__inner::-webkit-scrollbar-thumb:hover) {
  background: var(--el-text-color-secondary, #909399);
  background-clip: content-box;
}

html.dark :deep(.el-textarea__inner::-webkit-scrollbar-thumb) {
  background: #6b6b6b;
  background-clip: content-box;
}

html.dark :deep(.el-textarea__inner::-webkit-scrollbar-thumb:hover) {
  background: #999;
  background-clip: content-box;
}

.send-state-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.send-arrow-icon {
  width: 20px;
  height: 20px;
  display: block;
}

.stop-square-icon {
  width: 18px;
  height: 18px;
  display: block;
}
</style>
