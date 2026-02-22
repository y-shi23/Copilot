// @ts-nocheck
import { nextTick } from 'vue';

import {
  buildAssistantResponseMetrics,
  estimatePromptTokensForMessages,
  mergeUsageMetrics,
  normalizeUsageMetrics,
} from '../utils/aiMetrics';
import { sanitizeToolArgs } from '../utils/formatters';
import { buildMcpSystemPrompt } from '../utils/mcpPrompt';

const DEEPSEEK_OFFICIAL_CHANNEL = 'deepseek-official';
const STAINLESS_HEADER_PREFIX = 'x-stainless-';

function parseDeepSeekUserTokenValue(rawValue: any): string {
  const source = String(rawValue || '').trim();
  if (!source) return '';

  try {
    const parsed = JSON.parse(source);
    if (typeof parsed === 'string') {
      return parseDeepSeekUserTokenValue(parsed);
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const value = (parsed as any).value;
      if (typeof value === 'string') {
        return value.trim();
      }
      if (value !== undefined && value !== null) {
        return String(value).trim();
      }
    }
  } catch (_error) {
    // keep raw source
  }

  return source;
}

function resolveDeepSeekToken(rawApiKey: any): string {
  if (Array.isArray(rawApiKey)) {
    const pool = [...rawApiKey];
    while (pool.length > 0) {
      const index = Math.floor(Math.random() * pool.length);
      const candidate = pool.splice(index, 1)[0];
      const token = parseDeepSeekUserTokenValue(candidate);
      if (token) return token;
    }
    return '';
  }
  return parseDeepSeekUserTokenValue(rawApiKey);
}

function removeStainlessHeaders(headersInput: any) {
  const headers = new Headers(headersInput || {});
  const keysToDelete = [];
  headers.forEach((_value, key) => {
    if (String(key).toLowerCase().startsWith(STAINLESS_HEADER_PREFIX)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => headers.delete(key));
  return headers;
}

async function fetchWithoutStainlessHeaders(input: any, init?: any) {
  if (input instanceof Request) {
    const mergedHeaders = new Headers(input.headers || {});
    const initHeaders = removeStainlessHeaders(init?.headers);
    initHeaders.forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
    const sanitizedHeaders = removeStainlessHeaders(mergedHeaders);
    const request = new Request(input, {
      ...(init || {}),
      headers: sanitizedHeaders,
    });
    return fetch(request);
  }

  return fetch(input, {
    ...(init || {}),
    headers: removeStainlessHeaders(init?.headers),
  });
}

export function useAskAi(options: any) {
  const {
    refs,
    messageStore,
    showDismissibleMessage,
    sendFile,
    scrollToBottom,
    markSessionDirty,
    scheduleAutoSave,
  } = options;

  const {
    loading,
    isMcpLoading,
    prompt,
    isSticky,
    currentConfig,
    CODE,
    selectedVoice,
    openaiFormattedTools,
    sessionSkillIds,
    currentOS,
    model,
    tempReasoningEffort,
    modelMap,
    isAtBottom,
    isAutoApproveTools,
    pendingToolApprovals,
    toolCallControllers,
    api_key,
    base_url,
    signalController,
    chatInputRef,
  } = refs;

  const updateAssistantBubbleMetrics = (
    assistantId: string | number,
    content: any,
    usage: any,
    timingMetrics: any = null,
    fallbackPromptTokens = 0,
  ) => {
    const assistantMessage = messageStore.getVisibleMessageById(assistantId);
    if (!assistantMessage) return;
    assistantMessage.metrics = buildAssistantResponseMetrics(
      content,
      usage,
      timingMetrics,
      fallbackPromptTokens,
    );
  };

  const askAI = async (forceSend = false) => {
    if (loading.value) return;
    if (isMcpLoading.value) {
      showDismissibleMessage.info('正在加载工具，请稍后再试...');
      return;
    }

    if (!forceSend) {
      const file_content = await sendFile();
      const promptText = prompt.value.trim();
      if ((file_content && file_content.length > 0) || promptText) {
        const userContentList = [];
        if (promptText) userContentList.push({ type: 'text', text: promptText });
        if (file_content && file_content.length > 0) userContentList.push(...file_content);
        const userTimestamp = new Date().toLocaleString('sv-SE');
        if (userContentList.length > 0) {
          const contentForHistory =
            userContentList.length === 1 && userContentList[0].type === 'text'
              ? userContentList[0].text
              : userContentList;
          messageStore.appendUser(contentForHistory, {
            visibleContent: userContentList,
            timestamp: userTimestamp,
          });
          markSessionDirty();
        } else {
          return;
        }
      } else {
        return;
      }
      prompt.value = '';
    }

    loading.value = true;
    signalController.value = new AbortController();
    await nextTick();

    isSticky.value = true;
    scrollToBottom('auto');

    const currentPromptConfig = currentConfig.value.prompts[CODE.value];
    const isVoiceReply = !!selectedVoice.value;
    let useStream = currentPromptConfig?.stream && !isVoiceReply;
    let currentAssistantMessageId: string | number | null = null;
    const nowIsoString = () => new Date().toISOString();
    const ensureReasoningStartedAt = (bubble: any, fallback?: string) => {
      if (!bubble) return;
      if (!bubble.reasoningStartedAt) {
        bubble.reasoningStartedAt = fallback || nowIsoString();
      }
      if (bubble.reasoningFinishedAt) {
        bubble.reasoningFinishedAt = null;
      }
    };
    const ensureReasoningFinishedAt = (
      bubble: any,
      options: { startFallback?: string; finishFallback?: string } = {},
    ) => {
      if (!bubble) return;
      if (!bubble.reasoningStartedAt) {
        bubble.reasoningStartedAt = options.startFallback || nowIsoString();
      }
      if (!bubble.reasoningFinishedAt) {
        bubble.reasoningFinishedAt = options.finishFallback || nowIsoString();
      }
    };

    try {
      const selectedModelKey = String(model.value || '');
      const selectedProviderId = selectedModelKey.split('|')[0] || '';
      const selectedProvider = currentConfig.value?.providers?.[selectedProviderId];
      const providerChannel = String(selectedProvider?.channel || '').toLowerCase();

      let effectiveApiKey = api_key.value;
      let effectiveBaseUrl = base_url.value;

      if (providerChannel === DEEPSEEK_OFFICIAL_CHANNEL) {
        const sampledToken = resolveDeepSeekToken(effectiveApiKey);
        if (!sampledToken) {
          throw new Error('DeepSeek userToken 未配置，请先在服务商页面登录 DeepSeek 或手动填写。');
        }
        effectiveApiKey = sampledToken;

        const proxyResult = await window.api.ensureDeepSeekProxy?.();
        if (!proxyResult?.ok || !proxyResult.baseUrl) {
          throw new Error(proxyResult?.error || 'DeepSeek 代理启动失败。');
        }

        effectiveBaseUrl = proxyResult.baseUrl;
        base_url.value = effectiveBaseUrl;
      }

      const { OpenAI } = await import('openai');

      const apiKeyProvider = () =>
        providerChannel === DEEPSEEK_OFFICIAL_CHANNEL
          ? String(effectiveApiKey || '').trim()
          : window.api.getRandomItem(effectiveApiKey);

      const openaiConfig: any = {
        apiKey: apiKeyProvider,
        baseURL: effectiveBaseUrl,
        dangerouslyAllowBrowser: true,
        maxRetries: 3,
      };

      if (providerChannel === DEEPSEEK_OFFICIAL_CHANNEL) {
        openaiConfig.fetch = fetchWithoutStainlessHeaders;
      }

      const openai = new OpenAI(openaiConfig);

      while (!signalController.value.signal.aborted) {
        chatInputRef.value?.focus({ cursor: 'end' });

        let messagesForThisRequest = JSON.parse(JSON.stringify(messageStore.apiHistory.value));

        messagesForThisRequest = messagesForThisRequest.filter((msg: any) => {
          if (msg.role === 'system' && (!msg.content || msg.content.trim() === '')) {
            return false;
          }
          return true;
        });

        messagesForThisRequest.forEach((msg: any) => {
          if (Array.isArray(msg.content)) {
            msg.content = msg.content.filter((part: any) => !part.isTranscript);
            if (msg.content.length === 0) msg.content = null;
          }
          ['content', 'reasoning_content', 'extra_content'].forEach((key) => {
            if (msg[key] === null) {
              delete msg[key];
            }
          });
        });

        if (currentPromptConfig && currentPromptConfig.ifTextNecessary) {
          const now = new Date();
          const timestamp = `current time: ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

          messagesForThisRequest.forEach((msg: any) => {
            if (msg.role === 'user') {
              if (msg.content === undefined || msg.content === null) {
                msg.content = timestamp;
              } else if (typeof msg.content === 'string') {
                if (msg.content.trim() === '') {
                  msg.content = timestamp;
                }
              } else if (Array.isArray(msg.content)) {
                if (msg.content.length === 0) {
                  msg.content = timestamp;
                } else {
                  const hasText = msg.content.some(
                    (part: any) => part.type === 'text' && part.text && part.text.trim() !== '',
                  );
                  if (!hasText) {
                    msg.content.push({
                      type: 'text',
                      text: timestamp,
                    });
                  }
                }
              }
            }
          });
        }

        let mcpSystemPromptStr = '';
        if (openaiFormattedTools.value.length > 0 || sessionSkillIds.value.length > 0) {
          mcpSystemPromptStr = buildMcpSystemPrompt(currentOS.value);
          const systemMessageIndex = messagesForThisRequest.findIndex(
            (m: any) => m.role === 'system',
          );
          if (systemMessageIndex !== -1) {
            if (!messagesForThisRequest[systemMessageIndex].content.includes('## Tool Use Rules')) {
              messagesForThisRequest[systemMessageIndex].content += mcpSystemPromptStr;
            }
          } else {
            messagesForThisRequest.unshift({ role: 'system', content: mcpSystemPromptStr });
          }
        }

        const estimatedPromptTokens = estimatePromptTokensForMessages(messagesForThisRequest);

        const payload: Record<string, any> = {
          model: model.value.split('|')[1],
          messages: messagesForThisRequest,
          stream: useStream,
        };

        if (currentPromptConfig?.isTemperature)
          payload.temperature = currentPromptConfig.temperature;
        if (tempReasoningEffort.value && tempReasoningEffort.value !== 'default') {
          payload.reasoning_effort = tempReasoningEffort.value;
        }

        let activeTools = [...openaiFormattedTools.value];

        if (sessionSkillIds.value.length > 0 && currentConfig.value.skillPath) {
          try {
            const skillToolDef = await window.api.getSkillToolDefinition(
              currentConfig.value.skillPath,
              sessionSkillIds.value,
            );
            if (skillToolDef) {
              activeTools.push(skillToolDef);
            }
          } catch (e) {
            console.error('Failed to generate skill tool definition:', e);
          }
        }

        if (activeTools.length > 0) {
          payload.tools = activeTools;
          payload.tool_choice = 'auto';
        }

        if (isVoiceReply) {
          payload.stream = false;
          useStream = false;
          payload.modalities = ['text', 'audio'];
          payload.audio = { voice: selectedVoice.value.split('-')[0].trim(), format: 'wav' };
        }

        if (!currentAssistantMessageId) {
          const currentModelKey = model.value;
          const currentModelLabel = modelMap.value[model.value] || model.value;
          const assistantMessage = messageStore.startAssistantTurn({
            content: [],
            metrics: null,
            reasoning_content: '',
            reasoningStartedAt: null,
            reasoningFinishedAt: null,
            status: '',
            aiName: currentModelLabel,
            modelKey: currentModelKey,
            modelLabel: currentModelLabel,
            voiceName: selectedVoice.value,
            tool_calls: [],
            pending: true,
          });
          currentAssistantMessageId = assistantMessage.id;
        }

        if (isAtBottom.value) scrollToBottom('auto');

        let responseMessage;
        let finalUsageMetrics: any = null;
        const requestStartTimestamp = performance.now();
        const requestStartDateIso = nowIsoString();
        let firstTokenTimestamp: number | null = null;
        let requestCompletionTimestamp: number | null = null;
        let requestCompletionDateIso: string | null = null;

        const markFirstTokenTimestamp = () => {
          if (firstTokenTimestamp === null) {
            firstTokenTimestamp = performance.now();
          }
        };

        const buildTimingMetricsSnapshot = () => {
          const completionBase =
            requestCompletionTimestamp !== null ? requestCompletionTimestamp : performance.now();
          return {
            time_first_token_millsec:
              firstTokenTimestamp !== null
                ? Math.max(0, firstTokenTimestamp - requestStartTimestamp)
                : undefined,
            time_completion_millsec: Math.max(0, completionBase - requestStartTimestamp),
          };
        };

        if (useStream) {
          const stream = await openai.chat.completions.create(payload, {
            signal: signalController.value.signal,
          });

          let aggregatedReasoningContent = '';
          let aggregatedContent = '';
          const aggregatedMedia: any[] = [];
          const aggregatedToolCalls: any[] = [];
          let aggregatedExtraContent: any = null;
          let lastUpdateTime = Date.now();

          for await (const part of stream) {
            finalUsageMetrics = mergeUsageMetrics(
              finalUsageMetrics,
              normalizeUsageMetrics(part.usage),
            );
            const delta = part.choices?.[0]?.delta;

            if (!delta) continue;

            if (delta.extra_content) {
              aggregatedExtraContent = { ...aggregatedExtraContent, ...delta.extra_content };
            }
            if (delta.thought_signature) {
              aggregatedExtraContent = aggregatedExtraContent || {};
              aggregatedExtraContent.google = aggregatedExtraContent.google || {};
              aggregatedExtraContent.google.thought_signature = delta.thought_signature;
            }

            if (delta.reasoning_content) {
              markFirstTokenTimestamp();
              aggregatedReasoningContent += delta.reasoning_content;
              const currentBubble = messageStore.getVisibleMessageById(currentAssistantMessageId);
              if (currentBubble) {
                ensureReasoningStartedAt(currentBubble);
                if (currentBubble.status !== 'thinking') {
                  currentBubble.status = 'thinking';
                }
              }

              if (currentBubble && Date.now() - lastUpdateTime > 100) {
                currentBubble.reasoning_content = aggregatedReasoningContent;
                lastUpdateTime = Date.now();
              }
            }

            if (delta.content) {
              markFirstTokenTimestamp();
              if (typeof delta.content === 'string') {
                aggregatedContent += delta.content;
              } else if (Array.isArray(delta.content)) {
                delta.content.forEach((item: any) => {
                  if (item.type === 'text') {
                    aggregatedContent += item.text || '';
                  } else if (item.type === 'image_url') {
                    aggregatedMedia.push(item);
                  }
                });
              }

              const currentBubble = messageStore.getVisibleMessageById(currentAssistantMessageId);
              if (currentBubble?.status == 'thinking') {
                currentBubble.status = 'end';
                if (aggregatedReasoningContent) {
                  ensureReasoningFinishedAt(currentBubble, { startFallback: requestStartDateIso });
                }
              }

              if (currentBubble && Date.now() - lastUpdateTime > 100) {
                const currentDisplayContent = [];
                if (aggregatedContent) {
                  currentDisplayContent.push({ type: 'text', text: aggregatedContent });
                }
                if (aggregatedMedia.length > 0) {
                  currentDisplayContent.push(...aggregatedMedia);
                }

                currentBubble.content = currentDisplayContent;
                updateAssistantBubbleMetrics(
                  currentAssistantMessageId,
                  currentDisplayContent,
                  finalUsageMetrics,
                  buildTimingMetricsSnapshot(),
                  estimatedPromptTokens,
                );
                lastUpdateTime = Date.now();
              }
            }

            if (delta.tool_calls) {
              markFirstTokenTimestamp();
              for (const toolCallChunk of delta.tool_calls) {
                const index = toolCallChunk.index ?? aggregatedToolCalls.length;
                if (!aggregatedToolCalls[index]) {
                  aggregatedToolCalls[index] = {
                    id: '',
                    type: 'function',
                    function: { name: '', arguments: '' },
                  };
                }
                const currentTool = aggregatedToolCalls[index];
                if (toolCallChunk.id) currentTool.id = toolCallChunk.id;
                if (toolCallChunk.function?.name)
                  currentTool.function.name = toolCallChunk.function.name;
                if (toolCallChunk.function?.arguments) {
                  currentTool.function.arguments += toolCallChunk.function.arguments;
                }

                if (toolCallChunk.extra_content) {
                  currentTool.extra_content = {
                    ...currentTool.extra_content,
                    ...toolCallChunk.extra_content,
                  };
                }
              }
            }
          }
          requestCompletionTimestamp = performance.now();
          requestCompletionDateIso = nowIsoString();
          if (
            firstTokenTimestamp === null &&
            (aggregatedReasoningContent ||
              aggregatedContent ||
              aggregatedMedia.length > 0 ||
              aggregatedToolCalls.length > 0)
          ) {
            firstTokenTimestamp = requestCompletionTimestamp;
          }

          let finalContentForHistory: any = null;
          if (aggregatedMedia.length > 0) {
            finalContentForHistory = [];
            if (aggregatedContent) {
              finalContentForHistory.push({ type: 'text', text: aggregatedContent });
            }
            finalContentForHistory.push(...aggregatedMedia);
          } else {
            finalContentForHistory = aggregatedContent || null;
          }

          updateAssistantBubbleMetrics(
            currentAssistantMessageId,
            finalContentForHistory,
            finalUsageMetrics,
            buildTimingMetricsSnapshot(),
            estimatedPromptTokens,
          );

          responseMessage = {
            role: 'assistant',
            content: finalContentForHistory,
            reasoning_content: aggregatedReasoningContent || null,
            extra_content: aggregatedExtraContent,
          };

          if (aggregatedToolCalls.length > 0) {
            responseMessage.tool_calls = aggregatedToolCalls.filter(
              (tc: any) => tc.id && tc.function.name,
            );
          }
        } else {
          const response = await openai.chat.completions.create(payload, {
            signal: signalController.value.signal,
          });
          requestCompletionTimestamp = performance.now();
          requestCompletionDateIso = nowIsoString();
          markFirstTokenTimestamp();
          finalUsageMetrics = normalizeUsageMetrics(response.usage);
          responseMessage = response.choices[0].message;
        }

        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          responseMessage.tool_calls.forEach((tc: any) => {
            if (tc.function && tc.function.arguments) {
              tc.function.arguments = sanitizeToolArgs(tc.function.arguments);
            }
          });
        }

        messageStore.finalizeAssistant(currentAssistantMessageId, {
          responseMessage,
        });

        const currentBubble = messageStore.getVisibleMessageById(currentAssistantMessageId);
        if (!currentBubble) {
          throw new Error('Assistant message missing in conversation timeline.');
        }
        if (responseMessage.reasoning_content) {
          ensureReasoningStartedAt(currentBubble, requestStartDateIso);
          ensureReasoningFinishedAt(currentBubble, {
            startFallback: requestStartDateIso,
            finishFallback: requestCompletionDateIso || undefined,
          });
          currentBubble.status = 'end';
        }
        updateAssistantBubbleMetrics(
          currentAssistantMessageId,
          currentBubble.content,
          finalUsageMetrics,
          buildTimingMetricsSnapshot(),
          estimatedPromptTokens,
        );

        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          messageStore.attachToolCalls(currentAssistantMessageId, responseMessage.tool_calls, {
            autoApprove: isAutoApproveTools.value,
          });

          await nextTick();

          const toolMessages = await Promise.all(
            responseMessage.tool_calls.map(async (toolCall: any) => {
              const getUiToolCall = () => {
                const assistant = messageStore.getVisibleMessageById(currentAssistantMessageId);
                return assistant?.tool_calls?.find((t: any) => t.id === toolCall.id) || null;
              };
              let toolContent;

              if (!isAutoApproveTools.value) {
                try {
                  const isApproved = await new Promise((resolve) => {
                    pendingToolApprovals.value.set(toolCall.id, resolve);
                  });

                  if (!isApproved) {
                    messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                      approvalStatus: 'rejected',
                      result: '用户已取消执行',
                    });
                    return {
                      tool_call_id: toolCall.id,
                      role: 'tool',
                      name: toolCall.function.name,
                      content: 'User denied this tool execution.',
                    };
                  }
                } catch (e) {}
              }

              messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                approvalStatus: 'executing',
                result: '执行中...',
              });
              const controller = new AbortController();
              toolCallControllers.value.set(toolCall.id, controller);

              try {
                const toolArgs = JSON.parse(toolCall.function.arguments);

                if (toolCall.function.name === 'Skill') {
                  messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                    result: `Activating skill: ${toolArgs.skill}...`,
                  });

                  const currentApiKey = effectiveApiKey;
                  const currentBaseUrl = effectiveBaseUrl;
                  const currentModelName = model.value.split('|')[1] || model.value;

                  const onUpdateCallback = (logContent: string) => {
                    messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                      result: `${logContent}\n\n[Skill (Sub-Agent) Running...]`,
                    });
                  };

                  const executionContext = {
                    apiKey: currentApiKey,
                    baseUrl: currentBaseUrl,
                    model: currentModelName,
                    tools: activeTools.filter((t: any) => t.function.name !== 'sub_agent'),
                    mcpSystemPrompt: mcpSystemPromptStr,
                    onUpdate: onUpdateCallback,
                  };

                  toolContent = await window.api.resolveSkillInvocation(
                    currentConfig.value.skillPath,
                    toolArgs.skill,
                    toolArgs,
                    executionContext,
                    toolCallControllers.value.get(toolCall.id)?.signal ||
                      signalController.value.signal,
                  );

                  const uiToolCall = getUiToolCall();
                  if (uiToolCall) {
                    if (toolContent.includes('[Sub-Agent]')) {
                      const currentLog = uiToolCall.result
                        ? uiToolCall.result.replace('\n\n[Skill (Sub-Agent) Running...]', '')
                        : '';
                      if (!currentLog.includes(toolContent)) {
                        messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                          result: `${currentLog}\n\n=== Skill Execution Result ===\n${toolContent}`,
                        });
                      } else {
                        messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                          result: currentLog,
                        });
                      }
                    } else {
                      messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                        result: `[Skill Instructions Loaded]\n${toolContent}`,
                      });
                    }
                  }
                } else {
                  let executionContext: any = null;

                  if (toolCall.function.name === 'sub_agent') {
                    const currentApiKey = effectiveApiKey;
                    const currentBaseUrl = effectiveBaseUrl;
                    const currentModelName = model.value.split('|')[1] || model.value;

                    const toolsContext = activeTools.filter(
                      (t: any) => t.function.name !== 'sub_agent',
                    );

                    const onUpdateCallback = (logContent: string) => {
                      messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                        result: `${logContent}\n\n[Sub-Agent 执行中...]`,
                      });
                    };

                    executionContext = {
                      apiKey: currentApiKey,
                      baseUrl: currentBaseUrl,
                      model: currentModelName,
                      tools: toolsContext,
                      mcpSystemPrompt: mcpSystemPromptStr,
                      onUpdate: onUpdateCallback,
                    };
                  }

                  const result = await window.api.invokeMcpTool(
                    toolCall.function.name,
                    toolArgs,
                    toolCallControllers.value.get(toolCall.id)?.signal ||
                      signalController.value.signal,
                    executionContext,
                  );

                  toolContent = Array.isArray(result)
                    ? result
                        .filter(
                          (item: any) => item?.type === 'text' && typeof item.text === 'string',
                        )
                        .map((item: any) => item.text)
                        .join('\n\n')
                    : String(result);

                  const uiToolCall = getUiToolCall();
                  if (uiToolCall) {
                    if (toolCall.function.name === 'sub_agent') {
                      const currentLog = uiToolCall.result
                        ? uiToolCall.result.replace('\n\n[Sub-Agent 执行中...]', '')
                        : '';
                      if (!currentLog.includes(toolContent)) {
                        messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                          result: `${currentLog}\n\n=== 最终结果 ===\n${toolContent}`,
                        });
                      } else {
                        messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                          result: currentLog,
                        });
                      }
                    } else {
                      messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                        result: toolContent,
                      });
                    }
                  }
                }

                messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                  approvalStatus: 'finished',
                });
              } catch (e: any) {
                if (e.name === 'AbortError') {
                  toolContent = 'Error: Tool call was canceled by the user.';
                  messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                    approvalStatus: 'rejected',
                  });
                } else {
                  toolContent = `{'result':'工具执行或参数解析错误: ${e.message}'}`;
                  messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                    approvalStatus: 'finished',
                  });
                }
                messageStore.updateToolCallState(currentAssistantMessageId, toolCall.id, {
                  result: toolContent,
                });
              } finally {
                toolCallControllers.value.delete(toolCall.id);
              }
              return {
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.function.name,
                content: toolContent,
              };
            }),
          );

          toolMessages.forEach((toolMessage: any) => {
            messageStore.appendToolResult(currentAssistantMessageId, toolMessage);
          });
        } else {
          if (isVoiceReply && responseMessage.audio) {
            currentBubble.content = currentBubble.content || [];

            if (responseMessage.audio.transcript) {
              const rawTranscript = responseMessage.audio.transcript;
              currentBubble.content.push({
                type: 'text',
                text: `\n\n${rawTranscript}`,
                isTranscript: true,
              });
            }

            currentBubble.content.push({
              type: 'input_audio',
              input_audio: {
                data: responseMessage.audio.data,
                format: 'wav',
              },
            });
            updateAssistantBubbleMetrics(
              currentAssistantMessageId,
              currentBubble.content,
              finalUsageMetrics,
              buildTimingMetricsSnapshot(),
              estimatedPromptTokens,
            );
          }
          break;
        }
      }
    } catch (error: any) {
      let errorDisplay = `发生错误: ${error.message || '未知错误'}`;
      if (error.name === 'AbortError') errorDisplay = '请求已取消';

      if (!currentAssistantMessageId) {
        const currentModelKey = model.value;
        const currentModelLabel = modelMap.value[model.value] || model.value;
        const assistantMessage = messageStore.startAssistantTurn({
          content: [],
          reasoningStartedAt: null,
          reasoningFinishedAt: null,
          aiName: currentModelLabel,
          modelKey: currentModelKey,
          modelLabel: currentModelLabel,
          voiceName: selectedVoice.value,
          pending: false,
        });
        currentAssistantMessageId = assistantMessage.id;
      }
      const currentBubble = messageStore.getVisibleMessageById(currentAssistantMessageId);
      if (!currentBubble) {
        showDismissibleMessage.error(errorDisplay);
        return;
      }
      if (currentBubble.reasoning_content && currentBubble.status === 'thinking') {
        currentBubble.status = 'error';
        ensureReasoningFinishedAt(currentBubble);
      }

      let existingText = '';
      if (currentBubble.content && Array.isArray(currentBubble.content)) {
        existingText = currentBubble.content
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text)
          .join('');
      } else if (typeof currentBubble.content === 'string') {
        existingText = currentBubble.content;
      }

      if (existingText && existingText.trim().length > 0) {
        const combinedText = `${existingText}\n\n> **Error**: ${errorDisplay}`;
        currentBubble.content = [{ type: 'text', text: combinedText }];
        messageStore.appendAssistantApiSegment(currentAssistantMessageId, {
          role: 'assistant',
          content: combinedText,
          reasoning_content: currentBubble.reasoning_content || null,
        });
      } else {
        currentBubble.content = [{ type: 'text', text: `${errorDisplay}` }];
        messageStore.appendAssistantApiSegment(currentAssistantMessageId, {
          role: 'assistant',
          content: `${errorDisplay}`,
          reasoning_content: currentBubble.reasoning_content || null,
        });
      }
    } finally {
      loading.value = false;
      signalController.value = null;
      if (currentAssistantMessageId !== null && currentAssistantMessageId !== undefined) {
        messageStore.mergeAssistantDelta(currentAssistantMessageId, {
          completedTimestamp: new Date().toLocaleString('sv-SE'),
        });
      }
      await nextTick();
      chatInputRef.value?.focus({ cursor: 'end' });
      markSessionDirty();
      scheduleAutoSave({ immediate: true });
    }
  };

  return {
    askAI,
  };
}
