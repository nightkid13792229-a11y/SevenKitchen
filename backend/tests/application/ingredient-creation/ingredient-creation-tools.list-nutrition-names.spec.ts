import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import type { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import type { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

function createTools() {
  const names: Array<{
    id: string;
    name: string;
    sourceType: string;
    alsoIn?: string[];
  }> = Array.from({ length: 3000 }, (_, index) => ({
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
  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
    {} as unknown as PrismaService,
  );

  return {
    tools,
    candidateService,
    listNutritionNames,
    draftService,
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
  it('返回 total 与最多 3000 条词条名，只带 id / name / sourceType / alsoIn，不返回营养值', async () => {
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
      alsoIn: [],
    });
    // 只有 id / name / sourceType / alsoIn：任何营养字段 / 分类 / 复核都不能出现。
    expect(Object.keys(result.body.names[0]).sort()).toEqual([
      'alsoIn',
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

  it('同名折叠的 alsoIn 原样带给模型（没有其它来源时是空数组）', async () => {
    const { tools, listNutritionNames } = createTools();
    listNutritionNames.mockResolvedValueOnce({
      total: 2,
      names: [
        {
          id: 'usda-beef',
          name: 'Beef, ground, raw',
          sourceType: 'USDA',
          alsoIn: ['CNF'],
        },
        {
          id: 'cfct-pork',
          name: 'Pork, raw',
          sourceType: 'CFCT',
        },
      ],
      keywords: ['牛肉', 'beef'],
    });

    const result = await executeTool(tools, 'searchNames', {
      keyword: '牛肉',
    });

    expect(result.body.total).toBe(2);
    expect(result.body.returnedCount).toBe(2);
    expect(result.body.names).toEqual([
      {
        id: 'usda-beef',
        name: 'Beef, ground, raw',
        sourceType: 'USDA',
        alsoIn: ['CNF'],
      },
      {
        id: 'cfct-pork',
        name: 'Pork, raw',
        sourceType: 'CFCT',
        alsoIn: [],
      },
    ]);
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
