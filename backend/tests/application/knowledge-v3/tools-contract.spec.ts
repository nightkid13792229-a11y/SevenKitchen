import { KnowledgeGatewayService } from '../../../src/application/knowledge-v3/knowledge-gateway.service';
import {
  KNOWLEDGE_TOOL_DEFINITIONS,
  executeKnowledgeTool,
} from '../../../src/application/knowledge-v3/knowledge-v3.tools';

/**
 * 3 个工具的对外契约（设计 §6）。
 *
 * 这里只锁定义本身：名字恰好 3 个、参数形状存在、描述只写能力；
 * 不锁具体文案，也不依赖任何模型 SDK 的类型。
 */

/** 描述里允许出现的能力词之外，禁止出现结论/临床判断词。 */
const FORBIDDEN_OUTPUTS = /返回结论|生成摘要|证据分级|分诊建议|药物剂量/;
/** 描述只描述能力，不指挥调用顺序。 */
const FORBIDDEN_ORDERING = /必须先|必须首先|先调用.*再/;

function parametersOf(name: string): Record<string, unknown> {
  const tool = KNOWLEDGE_TOOL_DEFINITIONS.find(
    (candidate) => candidate.function.name === name,
  );
  expect(tool).toBeDefined();
  return tool?.function.parameters ?? {};
}

function propertiesOf(name: string): Record<string, unknown> {
  return (parametersOf(name).properties ?? {}) as Record<string, unknown>;
}

describe('knowledge v3 tools contract', () => {
  it('exposes exactly kb_catalog, kb_find and kb_read', () => {
    expect(KNOWLEDGE_TOOL_DEFINITIONS.map((tool) => tool.function.name)).toEqual([
      'kb_catalog',
      'kb_find',
      'kb_read',
    ]);
  });

  it('gives every tool a capability-only description', () => {
    for (const tool of KNOWLEDGE_TOOL_DEFINITIONS) {
      expect(tool.type).toBe('function');
      expect(typeof tool.function.description).toBe('string');
      expect(tool.function.description.length).toBeGreaterThan(0);
      expect(tool.function.description).not.toMatch(FORBIDDEN_OUTPUTS);
      expect(tool.function.description).not.toMatch(FORBIDDEN_ORDERING);
    }
  });

  it('declares object parameters for every tool', () => {
    for (const tool of KNOWLEDGE_TOOL_DEFINITIONS) {
      expect(tool.function.parameters).toMatchObject({ type: 'object' });
      expect(propertiesOf(tool.function.name)).toBeTruthy();
    }
  });

  it('declares catalog filters', () => {
    expect(Object.keys(propertiesOf('kb_catalog'))).toEqual(
      expect.arrayContaining(['collection', 'documentId']),
    );
  });

  it('declares find query, scope and limit', () => {
    const parameters = parametersOf('kb_find');
    expect(parameters.required).toEqual(['query']);
    expect(Object.keys(propertiesOf('kb_find'))).toEqual(
      expect.arrayContaining(['query', 'collections', 'documentIds', 'limit']),
    );
    const limit = propertiesOf('kb_find').limit as Record<string, unknown>;
    expect(limit).toMatchObject({ type: 'integer', minimum: 1, maximum: 30 });
  });

  it('declares read range, images, budget and cursor', () => {
    const parameters = parametersOf('kb_read');
    expect(parameters.required).toEqual(['documentId']);
    expect(Object.keys(propertiesOf('kb_read'))).toEqual(
      expect.arrayContaining([
        'documentId',
        'pageFrom',
        'pageTo',
        'tocId',
        'includeImages',
        'budgetTokens',
        'cursor',
      ]),
    );
    const budget = propertiesOf('kb_read').budgetTokens as Record<
      string,
      unknown
    >;
    expect(budget).toMatchObject({ type: 'integer', minimum: 1, maximum: 200000 });
  });

  it('delegates executeKnowledgeTool to the gateway', async () => {
    const execute = jest.fn().mockResolvedValue({ ok: true, data: {} });
    const gateway = {
      execute,
    } as unknown as KnowledgeGatewayService;

    const result = await executeKnowledgeTool(gateway, 'kb_catalog', {
      collection: 'SACN5',
    });

    expect(result).toEqual({ ok: true, data: {} });
    expect(execute).toHaveBeenCalledWith('kb_catalog', { collection: 'SACN5' });
  });
});
