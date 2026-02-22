export interface HeadingItem {
  id: string;
  level: number;
  text: string;
}

interface ExtractHeadingOptions {
  idPrefix?: string;
}

interface InjectHeadingIdOptions {
  idPrefix?: string;
}

interface Slugger {
  slug: (text: string) => string;
}

const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;
const PUNCTUATION_REGEX = /["'`(){}[\]:;!?.,]/g;
const NON_WORD_REGEX = /[^a-z0-9\u4e00-\u9fa5]+/g;
const MULTI_DASH_REGEX = /-{2,}/g;
const SURROUND_DASH_REGEX = /^-+|-+$/g;

const ESCAPED_HEADING_TRAILING_HASH = /[ \t]+#+[ \t]*$/;
const HEADING_TAG_REGEX = /<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
const FENCE_START_REGEX = /^(\s*)(`{3,}|~{3,})(.*)$/;

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decodeHtmlEntities = (input: string) =>
  String(input || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_full, token: string) => {
    if (!token) return '';

    const lower = String(token).toLowerCase();
    if (lower[0] === '#') {
      const isHex = lower.startsWith('#x');
      const numeric = isHex ? lower.slice(2) : lower.slice(1);
      const codePoint = Number.parseInt(numeric, isHex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0) return '';
      try {
        return String.fromCodePoint(codePoint);
      } catch (_error) {
        return '';
      }
    }

    return HTML_ENTITY_MAP[lower] || '';
  });

const stripHtmlTags = (input: string) => String(input || '').replace(/<[^>]*>/g, '');

const normalizeHeadingText = (text: string) => {
  const normalized = String(text || 'section')
    .toLowerCase()
    .trim()
    .replace(ZERO_WIDTH_REGEX, '')
    .replace(PUNCTUATION_REGEX, '')
    .replace(NON_WORD_REGEX, '-')
    .replace(MULTI_DASH_REGEX, '-')
    .replace(SURROUND_DASH_REGEX, '');

  return normalized || 'section';
};

const buildHeadingId = (prefix: string, slug: string) => {
  const normalizedPrefix = String(prefix || '').trim();
  return normalizedPrefix ? `${normalizedPrefix}--${slug}` : slug;
};

const hasIdAttribute = (attrs: string) => /\sid\s*=\s*(["'][^"']*["']|[^\s>]+)/i.test(attrs || '');

const cleanHeadingText = (rawText: string) => {
  const withoutTag = stripHtmlTags(rawText);
  const decoded = decodeHtmlEntities(withoutTag);
  return decoded.replace(/\s+/g, ' ').trim();
};

const pushHeading = (
  headings: HeadingItem[],
  level: number,
  rawText: string,
  slugger: Slugger,
  idPrefix: string,
) => {
  if (!Number.isFinite(level) || level < 1 || level > 6) return;
  const text = cleanHeadingText(rawText);
  if (!text) return;
  const slug = slugger.slug(text);
  headings.push({
    id: buildHeadingId(idPrefix, slug),
    level,
    text,
  });
};

export function createSlugger(): Slugger {
  const seen = new Map<string, number>();

  return {
    slug(text: string) {
      const base = normalizeHeadingText(text);
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}-${count}`;
    },
  };
}

export function extractMarkdownHeadings(
  markdown: string,
  options: ExtractHeadingOptions = {},
): HeadingItem[] {
  const source = String(markdown || '');
  if (!source.trim()) return [];

  const idPrefix = String(options.idPrefix || '').trim();
  const slugger = createSlugger();
  const headings: HeadingItem[] = [];

  const lines = source.split(/\r?\n/);
  let inFence = false;
  let fenceToken = '';

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_START_REGEX);
    if (fenceMatch) {
      const token = fenceMatch[2] || '';
      if (!inFence) {
        inFence = true;
        fenceToken = token[0] || '';
      } else if (token[0] === fenceToken) {
        inFence = false;
        fenceToken = '';
      }
      continue;
    }

    if (inFence) continue;

    const atxMatch = line.match(/^\s{0,3}(#{1,6})[ \t]+(.+?)\s*$/);
    if (atxMatch) {
      const level = atxMatch[1].length;
      const rawText = atxMatch[2].replace(ESCAPED_HEADING_TRAILING_HASH, '');
      pushHeading(headings, level, rawText, slugger, idPrefix);
    }

    const htmlMatches = line.matchAll(HEADING_TAG_REGEX);
    for (const htmlMatch of htmlMatches) {
      const level = Number.parseInt(htmlMatch[1], 10);
      pushHeading(headings, level, htmlMatch[3] || '', slugger, idPrefix);
    }
  }

  return headings;
}

export function injectHeadingIdsIntoHtml(
  html: string,
  options: InjectHeadingIdOptions = {},
): string {
  const source = String(html || '');
  if (!source.trim()) return source;

  const idPrefix = String(options.idPrefix || '').trim();
  const slugger = createSlugger();

  return source.replace(
    HEADING_TAG_REGEX,
    (fullMatch, levelToken: string, attrsRaw: string = '', innerHtml: string = '') => {
      const attrs = String(attrsRaw || '');
      if (hasIdAttribute(attrs)) {
        return fullMatch;
      }

      const level = Number.parseInt(levelToken, 10);
      if (!Number.isFinite(level) || level < 1 || level > 6) {
        return fullMatch;
      }

      const text = cleanHeadingText(innerHtml);
      const slug = slugger.slug(text || 'section');
      const id = buildHeadingId(idPrefix, slug);
      return `<h${level}${attrs} id="${id}">${innerHtml}</h${level}>`;
    },
  );
}
