import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import type { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import type { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import type { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type { IngredientCandidateReviewService } from '../../../src/application/ingredient-creation/ingredient-candidate-review.service';
import type { IngredientNameClassifierService } from '../../../src/application/ingredient-creation/ingredient-name-classifier.service';
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
  const classifier = {
    classifyNames: jest.fn(async (input: any) => ({
      results: input.items.map((item: { id: string; name: string }) => ({
        id: item.id,
        state: 'RAW',
        method: 'NONE',
        cutLabel: '牛绞肉',
        cutGroup: 'ground',
        evidence: 'beef',
        confidence: 0.9,
      })),
      counts: {
        byState: { RAW: input.items.length, COOKED: 0, UNKNOWN: 0 },
        byMethod: { BOILED: 0, STEAMED: 0, GRILLED: 0, FRIED: 0, OTHER: 0, NONE: input.items.length },
        byCutGroup: { ground: input.items.length },
      },
    })),
  };

  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
    {} as unknown as PrismaService,
    { reviewCandidates: jest.fn() } as unknown as IngredientCandidateReviewService,
    classifier as unknown as IngredientNameClassifierService,
  );

  return { tools, candidateService, classifier, listNutritionNames, draftService };
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

describe('IngredientCreationToolsService · listNutritionNames', () => {
  it('返回 total 与最多 3000 条词条名，只带 id / name / sourceType，不返回营养值', async () => {
    const { tools, listNutritionNames } = createTools();

    const result = await executeTool(tools, 'listNutritionNames', {
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
    // 只有 id / name / sourceType：任何营养字段都不能出现在工具结果里。
    expect(Object.keys(result.body.names[0]).sort()).toEqual([
      'id',
      'name',
      'sourceType',
    ]);
    expect(result.body).not.toHaveProperty('candidates');
    expect(result.body).not.toHaveProperty('coveragePercent');
    expect(result.body).not.toHaveProperty('normalizedNutrition');
    expect(result.body.names[0]).not.toHaveProperty('normalizedNutrition');
  });

  it('limit 上限 3000；传更大也只按 3000 取，传非法值回落 3000', async () => {
    const { tools, listNutritionNames } = createTools();

    await executeTool(tools, 'listNutritionNames', {
      keyword: '牛肉',
      limit: 6000,
    });
    expect(listNutritionNames).toHaveBeenLastCalledWith({
      keyword: '牛肉',
      limit: 3000,
    });

    await executeTool(tools, 'listNutritionNames', {
      keyword: '牛肉',
      limit: 'abc',
    });
    expect(listNutritionNames).toHaveBeenLastCalledWith({
      keyword: '牛肉',
      limit: 3000,
    });
  });

  it('工具定义把 limit 上限暴露为 3000，keyword 必填', () => {
    const { tools } = createTools();
    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'listNutritionNames');

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
  });
});
