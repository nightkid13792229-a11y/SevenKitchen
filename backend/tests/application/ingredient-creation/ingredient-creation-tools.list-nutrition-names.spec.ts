import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import type { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import type { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type { IngredientNameClassifierService } from '../../../src/application/ingredient-creation/ingredient-name-classifier.service';
import { buildKeywordNameSummary } from '../../../src/application/ingredient-creation/ingredient-name-summary';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

function createTools() {
  const names = Array.from({ length: 3000 }, (_, index) => ({
    id: `rec-${index}`,
    name: `Beef item ${index}`,
    sourceType: index % 2 === 0 ? 'USDA_FDC' : 'CFCT',
  }));
  const listNutritionNames = jest.fn(async (_input: any) => ({
    total: 4210,
    names,
    keywords: ['牛肉', 'beef'],
  }));
  const candidateService = {
    findCandidates: jest.fn(),
    listNutritionNames,
  };
  const draftService = {
    get: jest.fn(async () => ({
      id: DRAFT_ID,
      name: '牛肉',
      type: 'FOOD',
      step: 'INTAKE',
      payload: { intake: { name: '牛肉' } },
      createdBy: 'admin-1',
      createdAt: new Date('2026-10-25T00:00:00.000Z'),
      updatedAt: new Date('2026-10-25T00:00:00.000Z'),
    })),
    patch: jest.fn(async () => ({})),
  };
  const summarizeNames = jest.fn(async (input: any) => ({
    ...buildKeywordNameSummary(input.items),
    degraded: false,
    notice: null,
  }));
  const classifier = { summarizeNames };

  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
    {} as unknown as PrismaService,
    classifier as unknown as IngredientNameClassifierService,
  );

  return {
    tools,
    candidateService,
    classifier,
    listNutritionNames,
    draftService,
    summarizeNames,
  };
}

async function executeTool(
  tools: IngredientCreationToolsService,
  name: string,
  args: Record<string, unknown>,
) {
  const execution = await tools.execute({
    runId: RUN_ID,
    draftId: DRAFT_ID,
    name,
    args,
  });
  return {
    ...execution,
    body: JSON.parse(execution.content) as any,
  };
}

describe('IngredientCreationToolsService · searchNames', () => {
  it('返回 total 与最多 3000 条词条名，只带 id / name / sourceType，不返回营养值', async () => {
    const { tools, listNutritionNames } = createTools();

    const result = await executeTool(tools, 'searchNames', {
      keyword: '牛肉',
    });

    expect(result.ok).toBe(true);
    expect(listNutritionNames).toHaveBeenCalledWith({
      keyword: '牛肉',
      limit: 3000,
    });
    expect(result.body.total).toBe(4210);
    expect(result.body.names).toHaveLength(3000);
    expect(result.body.names[0]).toEqual({
      id: 'rec-0',
      name: 'Beef item 0',
      sourceType: 'USDA_FDC',
    });
    // 只有 id / name / sourceType：任何营养字段 / 分类 / 复核都不能出现。
    expect(Object.keys(result.body.names[0]).sort()).toEqual([
      'id',
      'name',
      'sourceType',
    ]);
    expect(result.body).not.toHaveProperty('candidates');
    expect(result.body).not.toHaveProperty('coveragePercent');
    expect(result.body).not.toHaveProperty('normalizedNutrition');
    expect(result.body).not.toHaveProperty('narrowing');
    expect(result.body).not.toHaveProperty('reviewSummary');
    expect(result.body.names[0]).not.toHaveProperty('classification');
  });

  it('limit 上限 3000；传更大也只按 3000 取，传非法值回落 3000', async () => {
    const { tools, listNutritionNames } = createTools();

    await executeTool(tools, 'searchNames', {
      keyword: '牛肉',
      limit: 6000,
    });
    expect(listNutritionNames).toHaveBeenLastCalledWith({
      keyword: '牛肉',
      limit: 3000,
    });

    await executeTool(tools, 'searchNames', {
      keyword: '牛肉',
      limit: 'abc',
    });
    expect(listNutritionNames).toHaveBeenLastCalledWith({
      keyword: '牛肉',
      limit: 3000,
    });
  });

  it('零命中：ok=true 但 found=false、names 为空，不写草稿', async () => {
    const { tools, listNutritionNames, draftService } = createTools();
    listNutritionNames.mockResolvedValueOnce({
      total: 0,
      names: [],
      keywords: ['西洋菜'],
    });

    const result = await executeTool(tools, 'searchNames', {
      keyword: '西洋菜',
    });

    expect(result.ok).toBe(true);
    expect(result.body.found).toBe(false);
    expect(result.body.names).toEqual([]);
    expect(result.body.total).toBe(0);
    expect(draftService.patch).not.toHaveBeenCalled();
  });

  it('工具定义把 limit 上限暴露为 3000，keyword 必填，描述里不承诺分类 / 收窄', () => {
    const { tools } = createTools();
    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'searchNames');

    expect(definition).toBeDefined();
    expect(definition?.function.parameters).toMatchObject({
      type: 'object',
      required: ['keyword'],
      properties: {
        keyword: { type: 'string' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 3000,
        },
      },
    });
    expect(definition?.function.description).toContain('不判断生熟');
    expect(definition?.function.description).toContain('不做收窄');
  });
});

describe('IngredientCreationToolsService · summarizeNames', () => {
  it('把 searchNames 的 names 原样交给汇总：targetName 默认用草稿名', async () => {
    const { tools, summarizeNames } = createTools();

    const result = await executeTool(tools, 'summarizeNames', {
      names: [
        { id: 'rec-1', name: 'Beef, ground, raw' },
        { id: 'rec-2', name: 'Beef, chuck, cooked' },
      ],
    });

    expect(result.ok).toBe(true);
    expect(summarizeNames).toHaveBeenCalledWith({
      targetName: '牛肉',
      items: [
        { id: 'rec-1', name: 'Beef, ground, raw' },
        { id: 'rec-2', name: 'Beef, chuck, cooked' },
      ],
    });
    expect(result.body.total).toBe(2);
    expect(result.body.byState).toBeDefined();
    expect(result.body.byMethod).toBeDefined();
    expect(result.body.byCutGroup).toBeDefined();
    expect(result.body.examples).toBeDefined();
    expect(result.body.degraded).toBe(false);
  });

  it('也接受字符串数组，并允许传 keyword 覆盖 targetName', async () => {
    const { tools, summarizeNames } = createTools();

    const result = await executeTool(tools, 'summarizeNames', {
      names: ['Beef, ground, raw', 'Beef, chuck, cooked'],
      keyword: '牛肉馅',
    });

    expect(result.ok).toBe(true);
    expect(summarizeNames).toHaveBeenCalledWith({
      targetName: '牛肉馅',
      items: [{ name: 'Beef, ground, raw' }, { name: 'Beef, chuck, cooked' }],
    });
  });

  it('names 为空 / 非数组 / 项非法都返回错误文本，不调用汇总', async () => {
    const { tools, summarizeNames } = createTools();

    for (const names of [[], '牛肉', [{ id: 'rec-1' }]] as unknown[]) {
      const result = await executeTool(tools, 'summarizeNames', { names });
      expect(result.ok).toBe(false);
      expect(result.body.ok).toBe(false);
    }
    expect(summarizeNames).not.toHaveBeenCalled();
  });

  it('汇总失败时降级为关键词粗略计数，degraded=true 并带 notice', async () => {
    const { tools, summarizeNames } = createTools();
    summarizeNames.mockRejectedValueOnce(new Error('model down'));

    const result = await executeTool(tools, 'summarizeNames', {
      names: ['Beef, ground, raw', 'Beef, chuck, cooked'],
    });

    expect(result.ok).toBe(true);
    expect(result.body.degraded).toBe(true);
    expect(result.body.notice).toContain('关键词');
    expect(result.body.total).toBe(2);
  });

  it('工具定义：names 必填、最多 3000 条', () => {
    const { tools } = createTools();
    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'summarizeNames');

    expect(definition).toBeDefined();
    expect(definition?.function.parameters).toMatchObject({
      type: 'object',
      required: ['names'],
      properties: {
        names: {
          type: 'array',
          minItems: 1,
          maxItems: 3000,
        },
      },
    });
  });
});
