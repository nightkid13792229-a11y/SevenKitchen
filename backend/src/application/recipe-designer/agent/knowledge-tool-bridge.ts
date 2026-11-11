import type {
  DeepSeekContentPart,
  DeepSeekToolsMessage,
} from '../deepseek-tools-chat';
import type { ToolOutcome } from './agent-types';
import type { KnowledgeToolResult } from '../../knowledge-v3/knowledge-v3.types';

/**
 * 知识库 v3 → Agent 的桥接（2026-11-12）。
 *
 * 知识库只回页文本、块结构、页图和锚点，不返回结论。这里只做四件运行时要用的杂事：
 * 1. 把结果压成一句给模型看的摘要（页数/页码），不总结临床结论；
 * 2. 把 `kb_read` 的 `imageBase64` 从工具结果里摘掉，单独收集成图片，
 *    避免同一张图既进工具消息又进图片消息；
 * 3. 把图片拼成一条 user 消息，直接塞进模型上下文；
 * 4. 模型不支持图片时，去掉图片、保留文本并留一句说明。
 *
 * 工具层（`tools.ts`）不做这些：它只负责把知识库结果原样包成 ToolOutcome。
 */

export interface KnowledgePageImage {
  mime: 'image/jpeg';
  base64: string;
  pageNo: number;
  anchor: string;
}

const IMAGE_MESSAGE_TEXT =
  '（系统注入）以下是刚打开的页图，用于核对上面的页文本。';
const IMAGE_OMITTED_TEXT = '（页图已省略，按页文本回答）';

export function summarizeKnowledgeOutcome(
  name: string,
  outcome: KnowledgeToolResult<unknown>,
): string {
  if (!outcome.ok) {
    return `知识库调用失败：${outcome.error.message}`;
  }

  if (name === 'kb_catalog') {
    const data = isRecord(outcome.data) ? outcome.data : {};
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const toc = Array.isArray(data.toc) ? data.toc : null;
    return toc
      ? `文档 ${sources.length} 份；目录 ${toc.length} 条`
      : `文档 ${sources.length} 份`;
  }

  if (name === 'kb_find') {
    const data = isRecord(outcome.data) ? outcome.data : {};
    const hits = Array.isArray(data.hits) ? data.hits : [];
    const pages = uniquePageNumbers(
      hits.map((hit) => (isRecord(hit) ? hit.pageNo : undefined)),
    );
    return `命中 ${pages.length} 页${formatPages(pages)}`;
  }

  if (name === 'kb_read') {
    const data = isRecord(outcome.data) ? outcome.data : {};
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const pageNumbers = uniquePageNumbers(
      pages.map((page) => (isRecord(page) ? page.pageNo : undefined)),
    );
    return `读到 ${pageNumbers.length} 页${formatPages(pageNumbers)}`;
  }

  return '知识库结果';
}

/**
 * 只处理 `kb_read`：从每页里摘掉 `imageBase64`（保留 `imagePath` / `imageMime`），
 * 把内联图收集成可单独发送的内容。返回新的 outcome，不改原对象。
 */
export function splitReadImages(
  name: string,
  outcome: ToolOutcome,
): { outcome: ToolOutcome; images: KnowledgePageImage[] } {
  if (name !== 'kb_read' || !outcome.ok || !isRecord(outcome.data)) {
    return { outcome, images: [] };
  }

  const pages = outcome.data.pages;
  if (!Array.isArray(pages)) {
    return { outcome, images: [] };
  }

  const images: KnowledgePageImage[] = [];
  const strippedPages = pages.map((page) => {
    if (!isRecord(page)) return page;

    const { imageBase64, ...rest } = page;
    if (typeof imageBase64 === 'string' && imageBase64.length > 0) {
      images.push({
        mime: 'image/jpeg',
        base64: imageBase64,
        pageNo: typeof page.pageNo === 'number' ? page.pageNo : 0,
        anchor: typeof page.anchor === 'string' ? page.anchor : '',
      });
    }
    return rest;
  });

  return {
    outcome: {
      ...outcome,
      data: { ...outcome.data, pages: strippedPages },
    },
    images,
  };
}

export function buildKnowledgeImageMessage(
  images: KnowledgePageImage[],
): DeepSeekToolsMessage {
  return {
    role: 'user',
    content: [
      { type: 'text', text: IMAGE_MESSAGE_TEXT },
      ...images.flatMap((image): DeepSeekContentPart[] => [
        {
          type: 'text',
          text: `第 p${image.pageNo} 页 ${image.anchor}`,
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${image.mime};base64,${image.base64}`,
          },
        },
      ]),
    ],
  };
}

export function hasImageContent(messages: DeepSeekToolsMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === 'image_url'),
  );
}

/**
 * 模型不支持图片时的回退：只去掉 image parts，保留 text parts，
 * 并在每条被改写的消息末尾补一句说明。未含图片的消息原样返回。
 */
export function stripImageContent(
  messages: DeepSeekToolsMessage[],
): DeepSeekToolsMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    if (!message.content.some((part) => part.type === 'image_url')) {
      return message;
    }

    const textParts = message.content.filter(
      (part): part is Extract<DeepSeekContentPart, { type: 'text' }> =>
        part.type === 'text',
    );
    return {
      ...message,
      content: [
        ...textParts,
        { type: 'text' as const, text: IMAGE_OMITTED_TEXT },
      ],
    };
  });
}

function uniquePageNumbers(values: unknown[]): number[] {
  const pages = values.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isInteger(value),
  );
  return [...new Set(pages)].sort((a, b) => a - b);
}

function formatPages(pages: number[]): string {
  return pages.length > 0
    ? ` ${pages.map((page) => `p${page}`).join('、')}`
    : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
