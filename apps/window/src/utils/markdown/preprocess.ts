const PROTECT_BLOCK_PATTERNS = [/```[\s\S]*?```/g, /`[^`\n]+`/g, /\[[^\]]*?\]\([^)]+\)/g];

const protectMarkdownSegments = (input: string) => {
  const protectedMap = new Map<string, string>();
  let index = 0;
  let output = input;

  const protect = (segment: string) => {
    const key = `__MARKDOWN_PROTECTED_${index}__`;
    index += 1;
    protectedMap.set(key, segment);
    return key;
  };

  for (const pattern of PROTECT_BLOCK_PATTERNS) {
    output = output.replace(pattern, (segment) => protect(segment));
  }

  return { output, protectedMap };
};

const restoreMarkdownSegments = (input: string, protectedMap: Map<string, string>) =>
  input.replace(/__MARKDOWN_PROTECTED_\d+__/g, (key) => protectedMap.get(key) ?? key);

const normalizeLatexSyntax = (input: string) => {
  let text = input;

  text = text.replace(/\u2013/g, '-').replace(/\u2014/g, '-');
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$');

  text = text.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}');
  text = text.replace(/\\end\{align\*?\}/g, '\\end{aligned}');
  text = text.replace(/\\begin\{equation\*?\}/g, '\\begin{aligned}');
  text = text.replace(/\\end\{equation\*?\}/g, '\\end{aligned}');
  text = text.replace(/(?<!\\)\\tag\s*\{([^{}]+)\}/g, '\\qquad \\text{($1)}');

  return text;
};

export const preprocessMarkdownText = (value: string, enableLatex = true) => {
  const source = String(value ?? '');
  if (!enableLatex || !source) return source;

  const { output, protectedMap } = protectMarkdownSegments(source);
  const normalized = normalizeLatexSyntax(output);
  return restoreMarkdownSegments(normalized, protectedMap);
};

export const isLikelyLocalPath = (value: string) => {
  const source = String(value ?? '').trim();
  if (!source || source.includes('\n')) return false;

  const cleanPath = source.replace(/[.,;:)\]。，；：]+$/, '');
  if (cleanPath.length < 2) return false;

  const isWindowsPath = /^[a-zA-Z]:\\/.test(cleanPath);
  const isUnixPath = /^(\/|~)/.test(cleanPath);
  return isWindowsPath || isUnixPath;
};

export const normalizeLocalPath = (value: string) =>
  String(value ?? '')
    .trim()
    .replace(/[.,;:)\]。，；：]+$/, '');
