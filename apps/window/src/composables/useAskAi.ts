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

export function useAskAi(options: any) {
  const {
    refs,
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
    history,
    chat_show,
    messageIdCounter,
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
    assistantIndex: number,
    content: any,
    usage: any,
    timingMetrics: any = null,
    fallbackPromptTokens = 0,
  ) => {
    if (assistantIndex < 0 || assistantIndex >= chat_show.value.length) return;
    chat_show.value[assistantIndex].metrics = buildAssistantResponseMetrics(
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
          history.value.push({ role: 'user', content: contentForHistory });
          chat_show.value.push({
            id: messageIdCounter.value++,
            role: 'user',
            content: userContentList,
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
    let currentAssistantChatShowIndex = -1;

    try {
      const { OpenAI } = await import('openai');

      const openai = new OpenAI({
        apiKey: () => window.api.getRandomItem(api_key.value),
        baseURL: base_url.value,
        dangerouslyAllowBrowser: true,
        maxRetries: 3,
      });

      while (!signalController.value.signal.aborted) {
        chatInputRef.value?.focus({ cursor: 'end' });

        let messagesForThisRequest = JSON.parse(JSON.stringify(history.value));

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

        const assistantMessageId = messageIdCounter.value++;
        const currentModelKey = model.value;
        const currentModelLabel = modelMap.value[model.value] || model.value;
        chat_show.value.push({
          id: assistantMessageId,
          role: 'assistant',
          content: [],
          metrics: null,
          reasoning_content: '',
          status: '',
          aiName: currentModelLabel,
          modelKey: currentModelKey,
          modelLabel: currentModelLabel,
          voiceName: selectedVoice.value,
          tool_calls: [],
        });
        currentAssistantChatShowIndex = chat_show.value.length - 1;

        if (isAtBottom.value) scrollToBottom('auto');

        let responseMessage;
        let finalUsageMetrics: any = null;
        const requestStartTimestamp = performance.now();
        let firstTokenTimestamp: number | null = null;
        let requestCompletionTimestamp: number | null = null;

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
              if (chat_show.value[currentAssistantChatShowIndex].status !== 'thinking') {
                chat_show.value[currentAssistantChatShowIndex].status = 'thinking';
              }

              if (Date.now() - lastUpdateTime > 100) {
                chat_show.value[currentAssistantChatShowIndex].reasoning_content =
                  aggregatedReasoningContent;
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

              if (chat_show.value[currentAssistantChatShowIndex].status == 'thinking') {
                chat_show.value[currentAssistantChatShowIndex].status = 'end';
              }

              if (Date.now() - lastUpdateTime > 100) {
                const currentDisplayContent = [];
                if (aggregatedContent) {
                  currentDisplayContent.push({ type: 'text', text: aggregatedContent });
                }
                if (aggregatedMedia.length > 0) {
                  currentDisplayContent.push(...aggregatedMedia);
                }

                chat_show.value[currentAssistantChatShowIndex].content = currentDisplayContent;
                updateAssistantBubbleMetrics(
                  currentAssistantChatShowIndex,
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
            currentAssistantChatShowIndex,
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

        history.value.push(responseMessage);

        const currentBubble = chat_show.value[currentAssistantChatShowIndex];
        if (responseMessage.content) {
          if (typeof responseMessage.content === 'string') {
            currentBubble.content = [{ type: 'text', text: responseMessage.content }];
          } else if (Array.isArray(responseMessage.content)) {
            currentBubble.content = responseMessage.content;
          }
        }

        if (responseMessage.reasoning_content) {
          currentBubble.reasoning_content = responseMessage.reasoning_content;
          currentBubble.status = 'end';
        }
        updateAssistantBubbleMetrics(
          currentAssistantChatShowIndex,
          currentBubble.content,
          finalUsageMetrics,
          buildTimingMetricsSnapshot(),
          estimatedPromptTokens,
        );

        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          currentBubble.tool_calls = responseMessage.tool_calls.map((tc: any) => ({
            id: tc.id,
            name: tc.function.name,
            args: tc.function.arguments,
            result: '等待批准...',
            approvalStatus: isAutoApproveTools.value ? 'approved' : 'waiting',
          }));

          await nextTick();

          const toolMessages = await Promise.all(
            responseMessage.tool_calls.map(async (toolCall: any) => {
              const uiToolCall = currentBubble.tool_calls.find((t: any) => t.id === toolCall.id);
              let toolContent;

              if (!isAutoApproveTools.value) {
                try {
                  const isApproved = await new Promise((resolve) => {
                    pendingToolApprovals.value.set(toolCall.id, resolve);
                  });

                  if (!isApproved) {
                    if (uiToolCall) {
                      uiToolCall.approvalStatus = 'rejected';
                      uiToolCall.result = '用户已取消执行';
                    }
                    return {
                      tool_call_id: toolCall.id,
                      role: 'tool',
                      name: toolCall.function.name,
                      content: 'User denied this tool execution.',
                    };
                  }
                } catch (e) {}
              }

              if (uiToolCall) {
                uiToolCall.approvalStatus = 'executing';
                uiToolCall.result = '执行中...';
              }
              const controller = new AbortController();
              toolCallControllers.value.set(toolCall.id, controller);

              try {
                const toolArgs = JSON.parse(toolCall.function.arguments);

                if (toolCall.function.name === 'Skill') {
                  if (uiToolCall) uiToolCall.result = `Activating skill: ${toolArgs.skill}...`;

                  const currentApiKey = api_key.value;
                  const currentBaseUrl = base_url.value;
                  const currentModelName = model.value.split('|')[1] || model.value;

                  const onUpdateCallback = (logContent: string) => {
                    if (uiToolCall) {
                      uiToolCall.result = `${logContent}\n\n[Skill (Sub-Agent) Running...]`;
                    }
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

                  if (uiToolCall) {
                    if (toolContent.includes('[Sub-Agent]')) {
                      const currentLog = uiToolCall.result
                        ? uiToolCall.result.replace('\n\n[Skill (Sub-Agent) Running...]', '')
                        : '';
                      if (!currentLog.includes(toolContent)) {
                        uiToolCall.result = `${currentLog}\n\n=== Skill Execution Result ===\n${toolContent}`;
                      } else {
                        uiToolCall.result = currentLog;
                      }
                    } else {
                      uiToolCall.result = `[Skill Instructions Loaded]\n${toolContent}`;
                    }
                  }
                } else {
                  let executionContext: any = null;

                  if (toolCall.function.name === 'sub_agent') {
                    const currentApiKey = api_key.value;
                    const currentBaseUrl = base_url.value;
                    const currentModelName = model.value.split('|')[1] || model.value;

                    const toolsContext = activeTools.filter(
                      (t: any) => t.function.name !== 'sub_agent',
                    );

                    const onUpdateCallback = (logContent: string) => {
                      if (uiToolCall) {
                        uiToolCall.result = `${logContent}\n\n[Sub-Agent 执行中...]`;
                      }
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

                  if (uiToolCall) {
                    if (toolCall.function.name === 'sub_agent') {
                      const currentLog = uiToolCall.result
                        ? uiToolCall.result.replace('\n\n[Sub-Agent 执行中...]', '')
                        : '';
                      if (!currentLog.includes(toolContent)) {
                        uiToolCall.result = `${currentLog}\n\n=== 最终结果 ===\n${toolContent}`;
                      } else {
                        uiToolCall.result = currentLog;
                      }
                    } else {
                      uiToolCall.result = toolContent;
                    }
                  }
                }

                if (uiToolCall) uiToolCall.approvalStatus = 'finished';
              } catch (e: any) {
                if (e.name === 'AbortError') {
                  toolContent = 'Error: Tool call was canceled by the user.';
                  if (uiToolCall) uiToolCall.approvalStatus = 'rejected';
                } else {
                  toolContent = `{'result':'工具执行或参数解析错误: ${e.message}'}`;
                  if (uiToolCall) uiToolCall.approvalStatus = 'finished';
                }
                if (uiToolCall) uiToolCall.result = toolContent;
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

          history.value.push(...toolMessages);
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
              currentAssistantChatShowIndex,
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

      const errorBubbleIndex =
        currentAssistantChatShowIndex > -1 ? currentAssistantChatShowIndex : chat_show.value.length;
      if (currentAssistantChatShowIndex === -1) {
        const currentModelKey = model.value;
        const currentModelLabel = modelMap.value[model.value] || model.value;
        chat_show.value.push({
          id: messageIdCounter.value++,
          role: 'assistant',
          content: [],
          aiName: currentModelLabel,
          modelKey: currentModelKey,
          modelLabel: currentModelLabel,
          voiceName: selectedVoice.value,
        });
      }
      const currentBubble = chat_show.value[errorBubbleIndex];
      if (
        chat_show.value[errorBubbleIndex].reasoning_content &&
        currentBubble.status === 'thinking'
      ) {
        chat_show.value[errorBubbleIndex].status = 'error';
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
        history.value.push({
          role: 'assistant',
          content: combinedText,
          reasoning_content: currentBubble.reasoning_content || null,
        });
      } else {
        currentBubble.content = [{ type: 'text', text: `${errorDisplay}` }];
        history.value.push({
          role: 'assistant',
          content: `${errorDisplay}`,
          reasoning_content: currentBubble.reasoning_content || null,
        });
      }
    } finally {
      loading.value = false;
      signalController.value = null;
      if (currentAssistantChatShowIndex > -1) {
        chat_show.value[currentAssistantChatShowIndex].completedTimestamp =
          new Date().toLocaleString('sv-SE');
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
