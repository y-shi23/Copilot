const getCompletionTextFromMessageContent = (content: any): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');
};

const safeStringifyForMetrics = (value: any): string => {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return '';
  }
};

export const estimateTextTokens = (text: string): number => {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const chars = Array.from(trimmed);
  const cjkCount = chars.filter((char) =>
    /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(char),
  ).length;
  const nonCjkCount = chars.length - cjkCount;

  const estimated = cjkCount / 2 + nonCjkCount / 4;
  return Math.max(1, Math.ceil(estimated));
};

const estimateContentTokens = (content: any): number => {
  if (!content) return 0;
  if (typeof content === 'string') return estimateTextTokens(content);

  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (!part) return sum;
      if (typeof part === 'string') return sum + estimateTextTokens(part);
      if (part.type === 'text' && typeof part.text === 'string') {
        return sum + estimateTextTokens(part.text);
      }
      if (part.type === 'image_url') return sum + 85;
      if (part.type === 'input_audio') return sum + 120;
      if (part.type === 'input_file' || part.type === 'file') return sum + 120;
      return sum + estimateTextTokens(safeStringifyForMetrics(part));
    }, 0);
  }

  if (typeof content === 'object') {
    if (typeof content.text === 'string') return estimateTextTokens(content.text);
    if (typeof content.content === 'string') return estimateTextTokens(content.content);
    return estimateTextTokens(safeStringifyForMetrics(content));
  }

  return 0;
};

export const estimatePromptTokensForMessages = (messages: any[]): number => {
  if (!Array.isArray(messages) || messages.length === 0) return 0;

  let total = 3;
  messages.forEach((message) => {
    total += 4;
    total += estimateContentTokens(message?.content);

    if (typeof message?.name === 'string') {
      total += estimateTextTokens(message.name);
    }

    if (Array.isArray(message?.tool_calls)) {
      message.tool_calls.forEach((toolCall) => {
        const fn = toolCall?.function;
        if (typeof fn?.name === 'string') total += estimateTextTokens(fn.name);
        if (typeof fn?.arguments === 'string') total += estimateTextTokens(fn.arguments);
      });
    }
  });

  return Math.max(0, Math.ceil(total));
};

export const normalizeUsageMetrics = (usage: any) => {
  if (!usage || typeof usage !== 'object') return null;

  const parseCount = (value: any) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : undefined;
  };

  const completion_tokens = parseCount(usage.completion_tokens ?? usage.output_tokens);
  const prompt_tokens = parseCount(usage.prompt_tokens ?? usage.input_tokens);
  const total_tokens = parseCount(usage.total_tokens ?? usage.totalTokens);

  if (
    completion_tokens === undefined &&
    prompt_tokens === undefined &&
    total_tokens === undefined
  ) {
    return null;
  }

  return {
    completion_tokens,
    prompt_tokens,
    total_tokens,
  };
};

export const mergeUsageMetrics = (currentUsage: any, incomingUsage: any) => {
  if (!incomingUsage) return currentUsage;
  return {
    completion_tokens: incomingUsage.completion_tokens ?? currentUsage?.completion_tokens,
    prompt_tokens: incomingUsage.prompt_tokens ?? currentUsage?.prompt_tokens,
    total_tokens: incomingUsage.total_tokens ?? currentUsage?.total_tokens,
  };
};

export const buildAssistantResponseMetrics = (
  content: any,
  usage: any,
  timingMetrics: any = null,
  fallbackPromptTokens = 0,
) => {
  const completionText = getCompletionTextFromMessageContent(content);
  const estimatedCompletion = estimateTextTokens(completionText);
  const normalizedUsage = normalizeUsageMetrics(usage);
  const normalizedFallbackPromptTokens = Number.isFinite(fallbackPromptTokens)
    ? Math.max(0, Math.round(fallbackPromptTokens))
    : 0;

  const completion_tokens = normalizedUsage?.completion_tokens ?? estimatedCompletion;
  const prompt_tokens = normalizedUsage?.prompt_tokens ?? normalizedFallbackPromptTokens;
  const total_tokens =
    normalizedUsage?.total_tokens ??
    (prompt_tokens !== undefined && completion_tokens !== undefined
      ? prompt_tokens + completion_tokens
      : undefined);

  const hasCompletionTokens = Number.isFinite(completion_tokens) && completion_tokens > 0;
  const hasTotalTokens = Number.isFinite(total_tokens) && Number(total_tokens) > 0;
  if (!hasCompletionTokens && !hasTotalTokens) {
    return null;
  }

  const time_first_token_millsec =
    timingMetrics &&
    Number.isFinite(timingMetrics.time_first_token_millsec) &&
    timingMetrics.time_first_token_millsec >= 0
      ? Math.round(timingMetrics.time_first_token_millsec)
      : undefined;

  const time_completion_millsec =
    timingMetrics &&
    Number.isFinite(timingMetrics.time_completion_millsec) &&
    timingMetrics.time_completion_millsec > 0
      ? Math.round(timingMetrics.time_completion_millsec)
      : undefined;

  const token_speed =
    time_completion_millsec && completion_tokens >= 0
      ? Number((completion_tokens / (time_completion_millsec / 1000)).toFixed(2))
      : undefined;

  return {
    completion_tokens,
    prompt_tokens,
    total_tokens,
    is_estimated:
      normalizedUsage?.completion_tokens === undefined ||
      normalizedUsage?.prompt_tokens === undefined,
    time_first_token_millsec,
    time_completion_millsec,
    token_speed,
  };
};
