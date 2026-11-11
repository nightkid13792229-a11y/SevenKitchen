import { KnowledgeGatewayService } from '../../../src/application/knowledge-v3/knowledge-gateway.service';
import {
  AGENT_TOOLS,
  executeTool,
  type ToolExecutionContext,
} from '../../../src/application/recipe-designer/agent/tools';
import type { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';
import type { RecipeCatalogPort } from '../../../src/application/recipe-designer/agent/catalog-port';

/**
 * 知识库 v3 接入 Agent 工具表：
 * - AGENT_TOOLS 从 7 个扩到 10 个，追加 kb_catalog / kb_find / kb_read；
 * - executeTool 把 3 个 kb 工具转给网关，成功映射成 ok(data, summary)，失败映射成 fail(code, message)；
 * - 工具层不二次加工页数据（页图剥离在运行时 runTool 做）。
 */

describe('agent tools: knowledge v3', () => {
  const execute = jest.fn();
  let context: ToolExecutionContext;

  beforeEach(() => {
    execute.mockReset();
    context = {
      port: {} as RecipeDraftPort,
      catalog: {} as RecipeCatalogPort,
      knowledge: { execute } as unknown as KnowledgeGatewayService,
      onAsk: jest.fn(),
    };
  });

  it('appends exactly the 3 knowledge tools to the 7 recipe tools', () => {
    expect(AGENT_TOOLS).toHaveLength(10);
    expect(AGENT_TOOLS.map((tool) => tool.function.name)).toEqual([
      'read_draft',
      'read_taxonomy',
      'find_food',
      'edit_recipe',
      'assess',
      'write_copy',
      'ask',
      'kb_catalog',
      'kb_find',
      'kb_read',
    ]);
  });

  it('maps a successful kb_find to ok(data, summary)', async () => {
    const data = {
      hits: [
        {
          documentId: 'doc-1',
          pageNo: 18,
          chapter: null,
          blockId: null,
          kind: 'page',
          snippet: 'phosphorus …',
          score: 0.5,
          anchor: 'doc-1/p18',
        },
      ],
      searched: { documents: 1, pages: 21 },
    };
    execute.mockResolvedValue({ ok: true, data });

    const result = await executeTool(
      'kb_find',
      { query: 'phosphorus' },
      context,
    );

    expect(execute).toHaveBeenCalledWith('kb_find', { query: 'phosphorus' });
    expect(result).toEqual({
      ok: true,
      data,
      summary: '命中 1 页 p18',
    });
  });

  it('maps a failed kb_find to fail(code, message)', async () => {
    execute.mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_ARGUMENT', message: 'query 不能为空' },
    });

    const result = await executeTool('kb_find', { query: '   ' }, context);

    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_ARGUMENT', message: 'query 不能为空' },
    });
    expect(result).not.toHaveProperty('summary');
  });

  it('returns kb_read data unchanged at the tool layer', async () => {
    const data = {
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
      ],
      nextCursor: null,
      version: 'v1',
    };
    execute.mockResolvedValue({ ok: true, data });

    const result = await executeTool(
      'kb_read',
      { documentId: 'doc-1', pageFrom: 17, pageTo: 17 },
      context,
    );

    expect(execute).toHaveBeenCalledWith('kb_read', {
      documentId: 'doc-1',
      pageFrom: 17,
      pageTo: 17,
    });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(data);
    expect(result.summary).toBe('读到 1 页 p17');
  });
});
