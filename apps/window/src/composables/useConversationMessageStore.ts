// @ts-nocheck
import { computed, ref } from 'vue';

const DEFAULT_ASSISTANT_NAME = 'AI';

const clonePlain = (value: any) => {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
};

const normalizeRole = (role: any) => {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'system') return 'system';
  if (normalized === 'assistant') return 'assistant';
  if (normalized === 'tool') return 'tool';
  return 'user';
};

const sanitizeToolCalls = (toolCalls: any) => {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .map((toolCall) => {
      if (!toolCall) return null;
      const functionName =
        String(toolCall?.function?.name || toolCall?.name || '').trim() || 'unknown_tool';
      const functionArgsRaw = toolCall?.function?.arguments ?? toolCall?.args ?? '{}';
      const functionArgs =
        typeof functionArgsRaw === 'string' ? functionArgsRaw : JSON.stringify(functionArgsRaw);
      const id = String(toolCall?.id || '').trim();
      if (!id) return null;
      return {
        id,
        type: 'function',
        function: {
          name: functionName,
          arguments: functionArgs,
        },
      };
    })
    .filter(Boolean);
};

const buildUiToolCalls = (toolCalls: any, options: any = {}) => {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
  const existingById = new Map();
  const existingList = Array.isArray(options?.existing) ? options.existing : [];
  for (const item of existingList) {
    if (item?.id) existingById.set(item.id, item);
  }
  const autoApprove = options.autoApprove === true;

  return toolCalls.map((toolCall) => {
    const id = String(toolCall?.id || '').trim();
    const existing = existingById.get(id) || {};
    const args = toolCall?.function?.arguments ?? toolCall?.args ?? '{}';
    return {
      id,
      name: String(toolCall?.function?.name || toolCall?.name || 'unknown_tool'),
      args: typeof args === 'string' ? args : JSON.stringify(args),
      result: existing.result || '等待批准...',
      approvalStatus:
        existing.approvalStatus ||
        (autoApprove ? 'approved' : options.pending ? 'waiting' : 'finished'),
    };
  });
};

const normalizeVisibleContent = (content: any) => {
  if (Array.isArray(content)) return clonePlain(content);
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (content === null || content === undefined) return [];
  return clonePlain(content);
};

const applyTextToContent = (currentContent: any, newText: string) => {
  if (
    typeof currentContent === 'string' ||
    currentContent === null ||
    currentContent === undefined
  ) {
    return newText;
  }
  if (!Array.isArray(currentContent)) {
    return newText;
  }

  const copied = clonePlain(currentContent);
  const textPart = copied.find(
    (part: any) =>
      part?.type === 'text' &&
      !(part?.text && String(part.text).toLowerCase().startsWith('file name:')),
  );
  if (textPart) {
    textPart.text = newText;
    return copied;
  }
  copied.push({ type: 'text', text: newText });
  return copied;
};

const toApiAssistantMessage = (message: any) => {
  const payload: any = {
    role: 'assistant',
    content: clonePlain(message?.content ?? null),
  };

  if (message?.reasoning_content) payload.reasoning_content = message.reasoning_content;
  if (message?.extra_content) payload.extra_content = clonePlain(message.extra_content);

  const rawToolCalls = sanitizeToolCalls(message?.rawToolCalls || message?.tool_calls);
  if (rawToolCalls.length > 0) payload.tool_calls = rawToolCalls;
  return payload;
};

const toApiToolMessage = (message: any) => ({
  role: 'tool',
  tool_call_id: String(message?.tool_call_id || ''),
  name: String(message?.name || ''),
  content: clonePlain(message?.content ?? ''),
});

const toApiUserOrSystemMessage = (message: any) => ({
  role: message.role,
  content: clonePlain(message?.meta?.apiContent ?? message?.content ?? ''),
});

export function useConversationMessageStore(options: any = {}) {
  const { historyRef, chatShowRef, messageIdCounter } = options;

  const timeline = ref<any[]>([]);
  let turnSeed = 0;

  const reserveMessageId = () => {
    const current = Number(messageIdCounter?.value ?? 0);
    const safeCurrent = Number.isFinite(current) && current >= 0 ? Math.floor(current) : 0;
    if (messageIdCounter) {
      messageIdCounter.value = safeCurrent + 1;
    }
    return safeCurrent;
  };

  const bumpCounterFromVisibleId = (id: any) => {
    const numeric = Number(id);
    if (!Number.isFinite(numeric)) return;
    if (!messageIdCounter) return;
    if (numeric >= Number(messageIdCounter.value || 0)) {
      messageIdCounter.value = Math.floor(numeric) + 1;
    }
  };

  const nextTurnId = () => {
    turnSeed += 1;
    return `turn-${Date.now()}-${turnSeed}`;
  };

  const buildApiHistorySnapshot = () => {
    const output: any[] = [];
    for (const message of timeline.value) {
      if (!message) continue;
      const role = normalizeRole(message.role);
      if (role === 'tool') {
        output.push(toApiToolMessage(message));
        continue;
      }
      if (role === 'assistant') {
        const apiSegments = Array.isArray(message?.meta?.apiMessages)
          ? message.meta.apiMessages
          : [];
        if (apiSegments.length > 0) {
          for (const segment of apiSegments) {
            output.push(toApiAssistantMessage(segment));
          }
          continue;
        }
        if (message?.meta?.pending) continue;
        output.push(toApiAssistantMessage(message));
        continue;
      }
      output.push(toApiUserOrSystemMessage(message));
    }
    return output;
  };

  const buildVisibleMessagesSnapshot = () => {
    return timeline.value.filter((message) => normalizeRole(message?.role) !== 'tool');
  };

  const syncLegacyRefs = () => {
    if (historyRef) {
      historyRef.value = buildApiHistorySnapshot();
    }
    if (chatShowRef) {
      chatShowRef.value = buildVisibleMessagesSnapshot();
    }
  };

  const commit = (mutator: () => any) => {
    const result = mutator();
    syncLegacyRefs();
    return result;
  };

  const findTimelineIndexByVisibleId = (messageId: any) =>
    timeline.value.findIndex(
      (item: any) => normalizeRole(item?.role) !== 'tool' && String(item?.id) === String(messageId),
    );

  const getVisibleMessageById = (messageId: any) => {
    const idx = findTimelineIndexByVisibleId(messageId);
    return idx === -1 ? null : timeline.value[idx];
  };

  const getVisibleMessageIndexById = (messageId: any) => {
    const visibleList = buildVisibleMessagesSnapshot();
    return visibleList.findIndex((message: any) => String(message?.id) === String(messageId));
  };

  const getLastUserTurnId = () => {
    for (let i = timeline.value.length - 1; i >= 0; i -= 1) {
      const message = timeline.value[i];
      if (normalizeRole(message?.role) === 'user') {
        return String(message.turnId || nextTurnId());
      }
    }
    return '';
  };

  const upsertSystemMessage = (prompt: string) =>
    commit(() => {
      const normalizedPrompt = String(prompt || '');
      const systemIndex = timeline.value.findIndex(
        (message) => normalizeRole(message?.role) === 'system',
      );
      if (!normalizedPrompt.trim()) {
        if (systemIndex !== -1) timeline.value.splice(systemIndex, 1);
        return null;
      }

      if (systemIndex !== -1) {
        const target = timeline.value[systemIndex];
        target.content = normalizedPrompt;
        target.meta = target.meta || {};
        target.meta.apiContent = normalizedPrompt;
        return target;
      }

      const systemMessage = {
        id: reserveMessageId(),
        turnId: 'system',
        role: 'system',
        content: normalizedPrompt,
        meta: {
          visible: true,
          apiContent: normalizedPrompt,
        },
      };
      timeline.value.unshift(systemMessage);
      return systemMessage;
    });

  const appendUser = (apiContent: any, options2: any = {}) =>
    commit(() => {
      const turnId = String(options2.turnId || getLastUserTurnId() || nextTurnId());
      const userMessage = {
        id: options2.id ?? reserveMessageId(),
        turnId,
        role: 'user',
        content: clonePlain(options2.visibleContent ?? normalizeVisibleContent(apiContent)),
        timestamp: options2.timestamp || new Date().toLocaleString('sv-SE'),
        meta: {
          visible: true,
          apiContent: clonePlain(apiContent),
        },
      };
      timeline.value.push(userMessage);
      bumpCounterFromVisibleId(userMessage.id);
      return userMessage;
    });

  const startAssistantTurn = (options2: any = {}) =>
    commit(() => {
      const turnId = String(options2.turnId || getLastUserTurnId() || nextTurnId());
      const modelLabel = String(options2.modelLabel || options2.aiName || DEFAULT_ASSISTANT_NAME);
      const assistantMessage = {
        id: options2.id ?? reserveMessageId(),
        turnId,
        role: 'assistant',
        content: clonePlain(options2.content ?? []),
        metrics: options2.metrics ?? null,
        reasoning_content: options2.reasoning_content || '',
        reasoningStartedAt: options2.reasoningStartedAt ?? null,
        reasoningFinishedAt: options2.reasoningFinishedAt ?? null,
        status: options2.status || '',
        aiName: modelLabel,
        modelKey: options2.modelKey || '',
        modelLabel,
        voiceName: options2.voiceName || '',
        tool_calls: clonePlain(options2.tool_calls || []),
        rawToolCalls: sanitizeToolCalls(options2.rawToolCalls || []),
        extra_content: clonePlain(options2.extra_content || null),
        completedTimestamp: options2.completedTimestamp || '',
        meta: {
          visible: true,
          pending: options2.pending !== false,
          apiMessages: [],
        },
      };
      timeline.value.push(assistantMessage);
      bumpCounterFromVisibleId(assistantMessage.id);
      return assistantMessage;
    });

  const mergeAssistantDelta = (assistantId: any, patch: any = {}) =>
    commit(() => {
      const message = getVisibleMessageById(assistantId);
      if (!message || normalizeRole(message.role) !== 'assistant') return null;

      if (patch.content !== undefined) message.content = clonePlain(patch.content);
      if (patch.metrics !== undefined) message.metrics = clonePlain(patch.metrics);
      if (patch.reasoning_content !== undefined)
        message.reasoning_content = patch.reasoning_content;
      if (patch.reasoningStartedAt !== undefined)
        message.reasoningStartedAt = patch.reasoningStartedAt;
      if (patch.reasoningFinishedAt !== undefined) {
        message.reasoningFinishedAt = patch.reasoningFinishedAt;
      }
      if (patch.status !== undefined) message.status = patch.status;
      if (patch.voiceName !== undefined) message.voiceName = patch.voiceName;
      if (patch.extra_content !== undefined)
        message.extra_content = clonePlain(patch.extra_content);
      if (patch.completedTimestamp !== undefined)
        message.completedTimestamp = patch.completedTimestamp;
      if (patch.aiName !== undefined) message.aiName = patch.aiName;
      if (patch.modelKey !== undefined) message.modelKey = patch.modelKey;
      if (patch.modelLabel !== undefined) message.modelLabel = patch.modelLabel;
      if (patch.markPending === false) {
        message.meta = message.meta || {};
        message.meta.pending = false;
      }
      return message;
    });

  const appendAssistantApiSegment = (assistantId: any, apiMessage: any) =>
    commit(() => {
      const message = getVisibleMessageById(assistantId);
      if (!message || normalizeRole(message.role) !== 'assistant') return null;
      message.meta = message.meta || {};
      if (!Array.isArray(message.meta.apiMessages)) {
        message.meta.apiMessages = [];
      }
      const normalizedSegment = {
        role: 'assistant',
        content: clonePlain(apiMessage?.content ?? null),
        reasoning_content: apiMessage?.reasoning_content ?? null,
        extra_content: clonePlain(apiMessage?.extra_content ?? null),
      };
      const rawToolCalls = sanitizeToolCalls(apiMessage?.tool_calls);
      if (rawToolCalls.length > 0) {
        normalizedSegment.tool_calls = rawToolCalls;
      }
      message.meta.apiMessages.push(normalizedSegment);
      message.meta.pending = false;
      if (rawToolCalls.length > 0) {
        const existingRaw = sanitizeToolCalls(message.rawToolCalls || []);
        const existingRawById = new Map(
          existingRaw.map((toolCall: any) => [String(toolCall?.id || ''), toolCall]),
        );
        rawToolCalls.forEach((toolCall: any) => {
          const id = String(toolCall?.id || '');
          if (!id) return;
          existingRawById.set(id, toolCall);
        });
        message.rawToolCalls = Array.from(existingRawById.values());
      }
      return normalizedSegment;
    });

  const attachToolCalls = (assistantId: any, toolCalls: any, options2: any = {}) =>
    commit(() => {
      const message = getVisibleMessageById(assistantId);
      if (!message || normalizeRole(message.role) !== 'assistant') return [];
      const normalizedToolCalls = sanitizeToolCalls(toolCalls);
      const existingRaw = sanitizeToolCalls(message.rawToolCalls || []);
      const rawById = new Map(
        existingRaw.map((toolCall: any) => [String(toolCall?.id || ''), toolCall]),
      );
      normalizedToolCalls.forEach((toolCall: any) => {
        const id = String(toolCall?.id || '');
        if (!id) return;
        rawById.set(id, toolCall);
      });
      message.rawToolCalls = Array.from(rawById.values());

      const existingUi = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      const nextIncomingUi = buildUiToolCalls(normalizedToolCalls, {
        existing: existingUi,
        autoApprove: options2.autoApprove,
        pending: true,
      });
      const existingIndexById = new Map<string, number>();
      const mergedUi = [...existingUi];
      mergedUi.forEach((toolCall: any, index: number) => {
        const id = String(toolCall?.id || '');
        if (!id) return;
        existingIndexById.set(id, index);
      });
      nextIncomingUi.forEach((toolCall: any) => {
        const id = String(toolCall?.id || '');
        if (!id) return;
        const existingIndex = existingIndexById.get(id);
        if (existingIndex === undefined) {
          mergedUi.push(toolCall);
          existingIndexById.set(id, mergedUi.length - 1);
          return;
        }
        mergedUi[existingIndex] = {
          ...mergedUi[existingIndex],
          ...toolCall,
        };
      });
      message.tool_calls = mergedUi;
      return message.tool_calls;
    });

  const updateToolCallState = (assistantId: any, toolCallId: string, patch: any = {}) =>
    commit(() => {
      const message = getVisibleMessageById(assistantId);
      if (!message || normalizeRole(message.role) !== 'assistant') return null;
      if (!Array.isArray(message.tool_calls)) return null;
      const target = message.tool_calls.find(
        (item: any) => String(item?.id) === String(toolCallId),
      );
      if (!target) return null;
      Object.assign(target, patch || {});
      return target;
    });

  const appendToolResult = (assistantId: any, toolMessage: any) =>
    commit(() => {
      const assistantMessage = getVisibleMessageById(assistantId);
      if (!assistantMessage || normalizeRole(assistantMessage.role) !== 'assistant') return null;
      const toolEntry = {
        id: `tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        turnId: assistantMessage.turnId || getLastUserTurnId() || nextTurnId(),
        role: 'tool',
        tool_call_id: String(toolMessage?.tool_call_id || ''),
        name: String(toolMessage?.name || ''),
        content: clonePlain(toolMessage?.content ?? ''),
        meta: {
          visible: false,
          assistantId: assistantMessage.id,
        },
      };
      timeline.value.push(toolEntry);

      if (toolEntry.tool_call_id) {
        const uiToolCall = Array.isArray(assistantMessage.tool_calls)
          ? assistantMessage.tool_calls.find(
              (toolCall: any) => String(toolCall?.id) === String(toolEntry.tool_call_id),
            )
          : null;
        if (uiToolCall) {
          uiToolCall.result = String(toolEntry.content || '');
          if (uiToolCall.approvalStatus !== 'rejected') {
            uiToolCall.approvalStatus = 'finished';
          }
        }
      }
      return toolEntry;
    });

  const finalizeAssistant = (assistantId: any, payload: any = {}) =>
    commit(() => {
      const assistantMessage = getVisibleMessageById(assistantId);
      if (!assistantMessage || normalizeRole(assistantMessage.role) !== 'assistant') return null;

      const responseMessage = payload.responseMessage;
      if (responseMessage) {
        appendAssistantApiSegment(assistantId, responseMessage);
      } else if (payload.appendApiMessage) {
        appendAssistantApiSegment(assistantId, payload.appendApiMessage);
      } else {
        assistantMessage.meta = assistantMessage.meta || {};
        assistantMessage.meta.pending = false;
      }

      if (payload.contentForDisplay !== undefined) {
        assistantMessage.content = clonePlain(payload.contentForDisplay);
      } else if (responseMessage && responseMessage.content !== undefined) {
        if (typeof responseMessage.content === 'string') {
          assistantMessage.content = [{ type: 'text', text: responseMessage.content }];
        } else if (Array.isArray(responseMessage.content)) {
          assistantMessage.content = clonePlain(responseMessage.content);
        } else if (responseMessage.content === null) {
          assistantMessage.content = [];
        }
      }
      if (payload.metrics !== undefined) assistantMessage.metrics = clonePlain(payload.metrics);
      if (payload.reasoningContent !== undefined) {
        assistantMessage.reasoning_content = payload.reasoningContent;
      } else if (responseMessage?.reasoning_content !== undefined) {
        assistantMessage.reasoning_content = responseMessage.reasoning_content || '';
      }
      if (payload.extraContent !== undefined) {
        assistantMessage.extra_content = clonePlain(payload.extraContent);
      } else if (responseMessage?.extra_content !== undefined) {
        assistantMessage.extra_content = clonePlain(responseMessage.extra_content);
      }
      if (payload.status !== undefined) assistantMessage.status = payload.status;
      if (payload.reasoningStartedAt !== undefined) {
        assistantMessage.reasoningStartedAt = payload.reasoningStartedAt;
      }
      if (payload.reasoningFinishedAt !== undefined) {
        assistantMessage.reasoningFinishedAt = payload.reasoningFinishedAt;
      }
      if (payload.completedTimestamp !== undefined) {
        assistantMessage.completedTimestamp = payload.completedTimestamp;
      }

      if (responseMessage?.tool_calls) {
        attachToolCalls(assistantId, responseMessage.tool_calls, payload.toolCallOptions || {});
      } else if (payload.toolCalls) {
        attachToolCalls(assistantId, payload.toolCalls, payload.toolCallOptions || {});
      }

      return assistantMessage;
    });

  const editVisibleById = (messageId: any, newContent: string) =>
    commit(() => {
      const target = getVisibleMessageById(messageId);
      if (!target) return false;

      target.content = applyTextToContent(target.content, newContent);

      const role = normalizeRole(target.role);
      if (role === 'system' || role === 'user') {
        target.meta = target.meta || {};
        target.meta.apiContent = applyTextToContent(
          target.meta.apiContent ?? target.content,
          newContent,
        );
      } else if (role === 'assistant') {
        const apiSegments = Array.isArray(target?.meta?.apiMessages) ? target.meta.apiMessages : [];
        if (apiSegments.length > 0) {
          const lastSegment = apiSegments[apiSegments.length - 1];
          lastSegment.content = applyTextToContent(lastSegment.content, newContent);
        }
      }
      return true;
    });

  const deleteVisibleById = (messageId: any) =>
    commit(() => {
      const visibleList = buildVisibleMessagesSnapshot();
      const visibleIndex = visibleList.findIndex(
        (message: any) => String(message?.id) === String(messageId),
      );
      if (visibleIndex === -1) return { ok: false };

      const target = visibleList[visibleIndex];
      const role = normalizeRole(target.role);
      if (role === 'system') {
        return { ok: false, reason: 'system' };
      }

      if (role === 'assistant') {
        timeline.value = timeline.value.filter((message: any) => {
          if (String(message?.id) === String(target.id)) return false;
          if (normalizeRole(message?.role) !== 'tool') return true;
          const sameAssistant = String(message?.meta?.assistantId || '') === String(target.id);
          const sameTurn = String(message?.turnId || '') === String(target.turnId || '');
          return !(sameAssistant || sameTurn);
        });
      } else {
        timeline.value = timeline.value.filter(
          (message: any) => String(message?.id) !== String(target.id),
        );
      }

      return {
        ok: true,
        role,
        removedVisibleIndex: visibleIndex,
        removedMessageId: target.id,
      };
    });

  const rollbackLastTurnForRegenerate = () =>
    commit(() => {
      const lastUserIndex = timeline.value.findLastIndex(
        (message: any) => normalizeRole(message?.role) === 'user',
      );
      if (lastUserIndex === -1) {
        return { ok: false, reason: 'no-user' };
      }

      const lastUser = timeline.value[lastUserIndex];
      if (!lastUser) return { ok: false, reason: 'no-user' };

      if (lastUserIndex < timeline.value.length - 1) {
        timeline.value.splice(lastUserIndex + 1);
      }

      return {
        ok: true,
        userMessageId: lastUser.id,
        turnId: lastUser.turnId,
      };
    });

  const clearToSystem = (options2: any = {}) =>
    commit(() => {
      const promptFromOptions = String(options2.systemPrompt || '');
      let systemPrompt = promptFromOptions;
      if (!systemPrompt) {
        const firstSystem = timeline.value.find(
          (message) => normalizeRole(message?.role) === 'system',
        );
        systemPrompt = String(firstSystem?.content || '');
      }

      if (systemPrompt.trim()) {
        timeline.value = [
          {
            id: reserveMessageId(),
            turnId: 'system',
            role: 'system',
            content: systemPrompt,
            meta: {
              visible: true,
              apiContent: systemPrompt,
            },
          },
        ];
      } else {
        timeline.value = [];
      }
      return timeline.value;
    });

  const loadFromSessionData = (sessionData: any, options2: any = {}) =>
    commit(() => {
      const input = sessionData || {};
      const rawTimeline = Array.isArray(input.timeline) ? clonePlain(input.timeline) : null;
      const history = Array.isArray(input.history) ? clonePlain(input.history) : [];
      const chatShow = Array.isArray(input.chat_show) ? clonePlain(input.chat_show) : [];
      const fallbackSystemPrompt = String(options2.fallbackSystemPrompt || '');
      const normalized: any[] = [];

      let visibleCursor = 0;
      let currentTurnId = '';
      let lastAssistantId = '';

      const pickVisibleCandidate = (expectedRole: string) => {
        if (visibleCursor >= chatShow.length) return null;

        let candidateIndex = -1;
        for (let i = visibleCursor; i < chatShow.length; i += 1) {
          const candidate = chatShow[i];
          if (!candidate || normalizeRole(candidate.role) === 'tool') continue;
          if (normalizeRole(candidate.role) === expectedRole) {
            candidateIndex = i;
            break;
          }
        }
        if (candidateIndex === -1) {
          for (let i = visibleCursor; i < chatShow.length; i += 1) {
            const candidate = chatShow[i];
            if (!candidate || normalizeRole(candidate.role) === 'tool') continue;
            candidateIndex = i;
            break;
          }
        }
        if (candidateIndex === -1) return null;
        visibleCursor = candidateIndex + 1;
        return chatShow[candidateIndex];
      };

      const pushFromHistory = (historyMessage: any) => {
        const role = normalizeRole(historyMessage?.role);
        if (role === 'tool') {
          const toolEntry = {
            id: `tool-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
            turnId: historyMessage?.turnId || currentTurnId || nextTurnId(),
            role: 'tool',
            tool_call_id: String(historyMessage?.tool_call_id || ''),
            name: String(historyMessage?.name || ''),
            content: clonePlain(historyMessage?.content ?? ''),
            meta: {
              visible: false,
              assistantId: lastAssistantId || undefined,
            },
          };
          normalized.push(toolEntry);
          return;
        }

        const visibleCandidate = pickVisibleCandidate(role);
        const visibleId = visibleCandidate?.id ?? reserveMessageId();
        const base: any = {
          id: visibleId,
          role,
          turnId:
            role === 'system'
              ? 'system'
              : historyMessage?.turnId ||
                currentTurnId ||
                (role === 'user' ? nextTurnId() : nextTurnId()),
          content: clonePlain(visibleCandidate?.content ?? historyMessage?.content ?? ''),
          meta: {
            visible: true,
            apiContent: clonePlain(historyMessage?.content ?? visibleCandidate?.content ?? ''),
          },
        };

        if (role === 'user') {
          currentTurnId = base.turnId;
          base.timestamp = visibleCandidate?.timestamp || '';
        }

        if (role === 'assistant') {
          base.turnId = historyMessage?.turnId || currentTurnId || nextTurnId();
          base.metrics = clonePlain(visibleCandidate?.metrics ?? null);
          base.reasoning_content =
            visibleCandidate?.reasoning_content ?? historyMessage?.reasoning_content ?? '';
          base.reasoningStartedAt = visibleCandidate?.reasoningStartedAt ?? null;
          base.reasoningFinishedAt = visibleCandidate?.reasoningFinishedAt ?? null;
          base.status = visibleCandidate?.status || '';
          base.aiName =
            visibleCandidate?.aiName || visibleCandidate?.modelLabel || DEFAULT_ASSISTANT_NAME;
          base.modelKey = visibleCandidate?.modelKey || '';
          base.modelLabel = visibleCandidate?.modelLabel || visibleCandidate?.aiName || base.aiName;
          base.voiceName = visibleCandidate?.voiceName || '';
          base.tool_calls = clonePlain(
            visibleCandidate?.tool_calls ||
              buildUiToolCalls(historyMessage?.tool_calls || [], { pending: false }),
          );
          base.rawToolCalls = sanitizeToolCalls(historyMessage?.tool_calls || []);
          base.extra_content = clonePlain(historyMessage?.extra_content ?? null);
          base.completedTimestamp = visibleCandidate?.completedTimestamp || '';
          base.meta = {
            visible: true,
            pending: false,
            apiMessages: [
              {
                role: 'assistant',
                content: clonePlain(historyMessage?.content ?? null),
                reasoning_content: historyMessage?.reasoning_content ?? null,
                extra_content: clonePlain(historyMessage?.extra_content ?? null),
                tool_calls: sanitizeToolCalls(historyMessage?.tool_calls || []),
              },
            ],
          };
          lastAssistantId = base.id;
        }

        normalized.push(base);
      };

      if (rawTimeline && rawTimeline.length > 0) {
        for (const rawMessage of rawTimeline) {
          if (!rawMessage) continue;
          const role = normalizeRole(rawMessage.role);
          const cloned = clonePlain(rawMessage);
          if (cloned.id === undefined && role !== 'tool') {
            cloned.id = reserveMessageId();
          }
          if (!cloned.turnId) {
            if (role === 'system') cloned.turnId = 'system';
            else if (role === 'user') cloned.turnId = nextTurnId();
            else cloned.turnId = currentTurnId || nextTurnId();
          }
          if (role === 'user') currentTurnId = cloned.turnId;
          if (role === 'assistant') lastAssistantId = cloned.id;
          if (role === 'tool') {
            cloned.meta = cloned.meta || {};
            cloned.meta.visible = false;
            if (!cloned.meta.assistantId && lastAssistantId) {
              cloned.meta.assistantId = lastAssistantId;
            }
          } else {
            cloned.meta = cloned.meta || { visible: true };
            cloned.meta.visible = true;
            if (role === 'assistant') {
              const toolCalls = sanitizeToolCalls(cloned.rawToolCalls || cloned.tool_calls || []);
              cloned.rawToolCalls = toolCalls;
              if (!Array.isArray(cloned.tool_calls)) {
                cloned.tool_calls = buildUiToolCalls(toolCalls, { pending: false });
              }
              if (!Array.isArray(cloned?.meta?.apiMessages)) {
                cloned.meta.apiMessages = [toApiAssistantMessage(cloned)];
              }
              cloned.meta.pending = false;
            } else if (role === 'system' || role === 'user') {
              cloned.meta.apiContent = clonePlain(cloned.meta.apiContent ?? cloned.content ?? '');
            }
          }
          normalized.push(cloned);
        }
      } else if (history.length > 0) {
        for (const historyMessage of history) {
          pushFromHistory(historyMessage);
        }
      } else {
        for (const visibleMessage of chatShow) {
          if (!visibleMessage) continue;
          const role = normalizeRole(visibleMessage.role);
          if (role === 'tool') continue;
          const id = visibleMessage.id ?? reserveMessageId();
          const turnId =
            role === 'system'
              ? 'system'
              : role === 'user'
                ? nextTurnId()
                : currentTurnId || nextTurnId();
          if (role === 'user') currentTurnId = turnId;
          const normalizedMessage: any = {
            id,
            role,
            turnId,
            content: clonePlain(visibleMessage.content ?? ''),
            meta: {
              visible: true,
            },
          };
          if (role === 'system' || role === 'user') {
            normalizedMessage.meta.apiContent = clonePlain(visibleMessage.content ?? '');
          }
          if (role === 'assistant') {
            const rawToolCalls = sanitizeToolCalls(
              visibleMessage.rawToolCalls || visibleMessage.tool_calls || [],
            );
            normalizedMessage.metrics = clonePlain(visibleMessage.metrics ?? null);
            normalizedMessage.reasoning_content = visibleMessage.reasoning_content || '';
            normalizedMessage.reasoningStartedAt = visibleMessage.reasoningStartedAt ?? null;
            normalizedMessage.reasoningFinishedAt = visibleMessage.reasoningFinishedAt ?? null;
            normalizedMessage.status = visibleMessage.status || '';
            normalizedMessage.aiName = visibleMessage.aiName || DEFAULT_ASSISTANT_NAME;
            normalizedMessage.modelKey = visibleMessage.modelKey || '';
            normalizedMessage.modelLabel =
              visibleMessage.modelLabel || visibleMessage.aiName || normalizedMessage.aiName;
            normalizedMessage.voiceName = visibleMessage.voiceName || '';
            normalizedMessage.tool_calls = clonePlain(
              visibleMessage.tool_calls || buildUiToolCalls(rawToolCalls, { pending: false }),
            );
            normalizedMessage.rawToolCalls = rawToolCalls;
            normalizedMessage.extra_content = clonePlain(visibleMessage.extra_content ?? null);
            normalizedMessage.completedTimestamp = visibleMessage.completedTimestamp || '';
            normalizedMessage.meta.pending = false;
            normalizedMessage.meta.apiMessages = [toApiAssistantMessage(normalizedMessage)];
            lastAssistantId = id;
          }
          normalized.push(normalizedMessage);
        }
      }

      const hasSystem = normalized.some((message) => normalizeRole(message?.role) === 'system');
      if (!hasSystem && fallbackSystemPrompt.trim()) {
        normalized.unshift({
          id: reserveMessageId(),
          turnId: 'system',
          role: 'system',
          content: fallbackSystemPrompt,
          meta: {
            visible: true,
            apiContent: fallbackSystemPrompt,
          },
        });
      }

      const numericVisibleIds = normalized
        .map((message) => (normalizeRole(message?.role) === 'tool' ? NaN : Number(message?.id)))
        .filter((value) => Number.isFinite(value));
      if (numericVisibleIds.length > 0) {
        const maxId = Math.max(...numericVisibleIds);
        if (messageIdCounter && maxId >= Number(messageIdCounter.value || 0)) {
          messageIdCounter.value = Math.floor(maxId) + 1;
        }
      }

      timeline.value = normalized;
      return normalized;
    });

  const visibleMessages = computed(() => buildVisibleMessagesSnapshot());
  const apiHistory = computed(() => buildApiHistorySnapshot());
  const sessionSnapshot = computed(() => ({
    history: clonePlain(buildApiHistorySnapshot()),
    chat_show: clonePlain(buildVisibleMessagesSnapshot()),
  }));

  const clearAll = () =>
    commit(() => {
      timeline.value = [];
      return timeline.value;
    });

  const getLastVisibleMessage = () => {
    const visible = buildVisibleMessagesSnapshot();
    return visible.length > 0 ? visible[visible.length - 1] : null;
  };

  syncLegacyRefs();

  return {
    timeline,
    visibleMessages,
    apiHistory,
    sessionSnapshot,
    appendUser,
    startAssistantTurn,
    mergeAssistantDelta,
    appendAssistantApiSegment,
    attachToolCalls,
    updateToolCallState,
    appendToolResult,
    finalizeAssistant,
    editVisibleById,
    deleteVisibleById,
    rollbackLastTurnForRegenerate,
    clearToSystem,
    loadFromSessionData,
    upsertSystemMessage,
    clearAll,
    getVisibleMessageById,
    getVisibleMessageIndexById,
    getLastVisibleMessage,
    syncLegacyRefs,
  };
}
