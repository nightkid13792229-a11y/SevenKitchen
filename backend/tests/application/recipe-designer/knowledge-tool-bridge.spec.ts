import type {
  DeepSeekContentPart,
  DeepSeekToolsMessage,
} from '../../../src/application/recipe-designer/deepseek-tools-chat';
import type { ToolOutcome } from '../../../src/application/recipe-designer/agent/agent-types';
import {
  buildKnowledgeImageMessage,
  hasImageContent,
  splitReadImages,
  stripImageContent,
  summarizeKnowledgeOutcome,
} from '../../../src/application/recipe-designer/agent/knowledge-tool-bridge';

/**
 * 知识库页图桥：只做四件事。
 * - 给模型一句话摘要（页数/页码），不总结临床结论；
 * - 把 kb_read 的 base64 从工具结果里摘掉，单独收集成图片；
 * - 把图片拼成一条 user 消息，直接塞进模型上下文；
 * - 模型不支持图片时，把图片去掉、保留文本并留一句说明。
 */

describe('knowledge tool bridge', () => {
  describe('summarizeKnowledgeOutcome', () => {
    it('summarizes catalog documents and toc entries', () => {
      const outcome = {
        ok: true as const,
        data: {
          sources: [{ id: 'doc-1' }, { id: 'doc-2' }],
          toc: [{ id: 'toc-1' }, { id: 'toc-2' }, { id: 'toc-3' }],
        },
      };

      expect(summarizeKnowledgeOutcome('kb_catalog', outcome)).toBe(
        '文档 2 份；目录 3 条',
      );
    });

    it('summarizes catalog without a toc', () => {
      const outcome = {
        ok: true as const,
        data: { sources: [{ id: 'doc-1' }] },
      };

      expect(summarizeKnowledgeOutcome('kb_catalog', outcome)).toBe(
        '文档 1 份',
      );
    });

    it('summarizes find hits by unique page number', () => {
      const outcome = {
        ok: true as const,
        data: {
          hits: [{ pageNo: 17 }, { pageNo: 18 }, { pageNo: 18 }],
          searched: { documents: 1, pages: 21 },
        },
      };

      expect(summarizeKnowledgeOutcome('kb_find', outcome)).toBe(
        '命中 2 页 p17、p18',
      );
    });

    it('summarizes zero find hits without claiming the library has no answer', () => {
      const outcome = {
        ok: true as const,
        data: {
          hits: [],
          searched: { documents: 1, pages: 21 },
        },
      };

      expect(summarizeKnowledgeOutcome('kb_find', outcome)).toBe('命中 0 页');
    });

    it('summarizes read pages', () => {
      const outcome = {
        ok: true as const,
        data: { pages: [{ pageNo: 17 }, { pageNo: 18 }] },
      };

      expect(summarizeKnowledgeOutcome('kb_read', outcome)).toBe(
        '读到 2 页 p17、p18',
      );
    });

    it('summarizes a failed call with the error message', () => {
      const outcome = {
        ok: false as const,
        error: { code: 'INVALID_ARGUMENT', message: 'query 不能为空' },
      };

      expect(summarizeKnowledgeOutcome('kb_find', outcome)).toBe(
        '知识库调用失败：query 不能为空',
      );
    });
  });

  describe('splitReadImages', () => {
    it('removes base64 from kb_read pages but keeps imagePath and imageMime', () => {
      const outcome: ToolOutcome = {
        ok: true,
        data: {
          documentId: 'doc-1',
          pages: [
            {
              pageNo: 17,
              text: 'Phosphorus',
              blocks: [],
              imagePath: 'doc-1/p0017.jpg',
              imageMime: 'image/jpeg',
              imageBase64: '/9j/17',
              anchor: 'doc-1/p17',
            },
            {
              pageNo: 18,
              text: 'No inline image',
              blocks: [],
              imagePath: 'doc-1/p0018.jpg',
              imageMime: 'image/jpeg',
              imageBase64: null,
              anchor: 'doc-1/p18',
            },
          ],
          nextCursor: null,
          version: 'v1',
        },
      };

      const { outcome: stripped, images } = splitReadImages('kb_read', outcome);
      const data = stripped.data as {
        pages: Array<Record<string, unknown>>;
      };

      expect(data.pages).toHaveLength(2);
      expect(data.pages[0]).not.toHaveProperty('imageBase64');
      expect(data.pages[0]).toMatchObject({
        pageNo: 17,
        imagePath: 'doc-1/p0017.jpg',
        imageMime: 'image/jpeg',
      });
      expect(data.pages[1]).not.toHaveProperty('imageBase64');
      expect(data.pages[1]).toMatchObject({
        pageNo: 18,
        imagePath: 'doc-1/p0018.jpg',
      });
      expect(images).toEqual([
        {
          mime: 'image/jpeg',
          base64: '/9j/17',
          pageNo: 17,
          anchor: 'doc-1/p17',
        },
      ]);
      // 原始 outcome 不被改写，调用方仍能拿到完整结果。
      expect(
        (outcome.data as { pages: Array<Record<string, unknown>> }).pages[0]
          .imageBase64,
      ).toBe('/9j/17');
    });

    it('leaves non-read tools untouched', () => {
      const outcome: ToolOutcome = {
        ok: true,
        data: { hits: [], searched: { documents: 1, pages: 21 } },
      };

      const { outcome: stripped, images } = splitReadImages('kb_find', outcome);

      expect(stripped).toBe(outcome);
      expect(images).toEqual([]);
    });

    it('leaves failed read calls untouched', () => {
      const outcome: ToolOutcome = {
        ok: false,
        error: { code: 'PAGE_OUT_OF_RANGE', message: 'pageFrom 超出范围' },
      };

      const { outcome: stripped, images } = splitReadImages('kb_read', outcome);

      expect(stripped).toBe(outcome);
      expect(images).toEqual([]);
    });
  });

  describe('buildKnowledgeImageMessage', () => {
    it('builds a user message with a text part and image_url data URLs', () => {
      const message = buildKnowledgeImageMessage([
        {
          mime: 'image/jpeg',
          base64: '/9j/17',
          pageNo: 17,
          anchor: 'doc-1/p17',
        },
        {
          mime: 'image/jpeg',
          base64: '/9j/18',
          pageNo: 18,
          anchor: 'doc-1/p18',
        },
      ]);

      expect(message.role).toBe('user');
      const parts = message.content as DeepSeekContentPart[];
      expect(parts[0]).toEqual({
        type: 'text',
        text: '（系统注入）以下是刚打开的页图，用于核对上面的页文本。',
      });
      expect(parts).toHaveLength(5);
      expect(parts[1]).toEqual({
        type: 'text',
        text: '第 p17 页 doc-1/p17',
      });
      expect(parts[2]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,/9j/17' },
      });
      expect(parts[3]).toEqual({
        type: 'text',
        text: '第 p18 页 doc-1/p18',
      });
      expect(parts[4]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,/9j/18' },
      });
    });
  });

  describe('image capability fallback', () => {
    it('detects image content in messages', () => {
      const messages: DeepSeekToolsMessage[] = [
        { role: 'system', content: 'sys' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '页文本' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,/9j/17' },
            },
          ],
        },
      ];

      expect(hasImageContent(messages)).toBe(true);
      expect(hasImageContent([{ role: 'user', content: '纯文本' }])).toBe(
        false,
      );
    });

    it('strips image parts, keeps text parts and adds a fallback note', () => {
      const messages: DeepSeekToolsMessage[] = [
        { role: 'system', content: 'sys' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '页文本' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,/9j/17' },
            },
          ],
        },
      ];

      const stripped = stripImageContent(messages);

      expect(hasImageContent(stripped)).toBe(false);
      const parts = stripped[1].content as DeepSeekContentPart[];
      expect(parts[0]).toEqual({ type: 'text', text: '页文本' });
      expect(
        parts.some(
          (part) =>
            part.type === 'text' &&
            part.text.includes('（页图已省略，按页文本回答）'),
        ),
      ).toBe(true);
      expect(stripped[0]).toEqual({ role: 'system', content: 'sys' });
      // 原消息不被改写。
      expect(messages[1].content).toHaveLength(2);
    });
  });
});
