import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import type { IngredientNameAliasService } from '../../../src/application/ingredient-creation/ingredient-name-alias.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

function createAliasMock() {
  return {
    findAliases: jest.fn(async (_terms: readonly string[]) => [] as any[]),
    markAliasesHit: jest.fn(async (_ids: readonly string[]) => undefined),
    translateToForeignTerms: jest.fn(async (_term: string) => null),
    recordAiTranslation: jest.fn(async (_input: any) => undefined),
  };
}

const RECORDS = [
  {
    id: 'beef-ground',
    sourceType: 'USDA_FDC',
    foodName: 'Beef, ground, raw',
    foodNameEn: 'Beef, ground, raw',
  },
  {
    id: 'beef-chuck',
    sourceType: 'USDA_FDC',
    foodName: 'Beef, chuck, cooked',
    foodNameEn: 'Beef, chuck, cooked',
  },
  {
    id: 'yam',
    sourceType: 'CFCT',
    foodName: 'Yam, raw',
    foodNameEn: 'Yam, raw',
  },
];

function createService(records = RECORDS) {
  const prisma = {
    nutritionSourceRecord: {
      findMany: jest.fn(async (_args: any) => records),
    },
  };
  const alias = createAliasMock();
  const service = new IngredientCreationCandidateService(
    prisma as unknown as PrismaService,
    alias as unknown as IngredientNameAliasService,
  );
  return { service, prisma, alias };
}

describe('IngredientCreationCandidateService · listNutritionNames', () => {
  it('中文关键词先查词典展开成外文词，只返回 id / name / sourceType 与真实总数', async () => {
    const { service, alias } = createService();
    alias.findAliases.mockResolvedValue([
      {
        id: 'alias-1',
        zhTerm: '牛肉',
        foreignTerm: 'beef',
        language: 'en',
        source: 'MANUAL_SEED',
      },
    ]);

    const result = await service.listNutritionNames({
      keyword: '牛肉',
      limit: 300,
    });

    expect(alias.findAliases).toHaveBeenCalledWith(['牛肉']);
    expect(alias.markAliasesHit).toHaveBeenCalledWith(['alias-1']);
    expect(result.total).toBe(2);
    expect(result.names).toEqual([
      { id: 'beef-chuck', name: 'Beef, chuck, cooked', sourceType: 'USDA_FDC' },
      { id: 'beef-ground', name: 'Beef, ground, raw', sourceType: 'USDA_FDC' },
    ]);
    // 不返回营养值 / 覆盖率 / 匹配分：这个工具只摆事实。
    expect(Object.keys(result.names[0]!).sort()).toEqual([
      'id',
      'name',
      'sourceType',
    ]);
  });

  it('词典没有时让模型翻译；翻译词命中才沉淀回词典，并记第一条命中的来源', async () => {
    const { service, alias } = createService();
    alias.translateToForeignTerms.mockResolvedValue({
      model: 'deepseek-test',
      translations: [{ term: 'beef', language: 'en' }],
    });

    const result = await service.listNutritionNames({ keyword: '牛肉' });

    expect(alias.translateToForeignTerms).toHaveBeenCalledWith('牛肉');
    expect(result.total).toBe(2);
    expect(alias.recordAiTranslation).toHaveBeenCalledWith({
      zhTerm: '牛肉',
      translations: [
        {
          term: 'beef',
          language: 'en',
          sourceRecordId: expect.any(String),
        },
      ],
    });
  });

  it('total 是截断前的真实命中数；limit 只影响返回条数并封顶 300', async () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      id: `beef-${index}`,
      sourceType: 'USDA_FDC',
      foodName: `Beef item ${index}`,
      foodNameEn: `Beef item ${index}`,
    }));
    const { service, alias } = createService(many);
    alias.findAliases.mockResolvedValue([
      {
        id: 'alias-1',
        zhTerm: '牛肉',
        foreignTerm: 'beef',
        language: 'en',
        source: 'MANUAL_SEED',
      },
    ]);

    const one = await service.listNutritionNames({ keyword: '牛肉', limit: 1 });
    expect(one.total).toBe(5);
    expect(one.names).toHaveLength(1);

    const capped = await service.listNutritionNames({
      keyword: '牛肉',
      limit: 300,
    });
    expect(capped.names).toHaveLength(5);
  });
});
