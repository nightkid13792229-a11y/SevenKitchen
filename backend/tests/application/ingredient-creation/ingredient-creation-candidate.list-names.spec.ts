import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

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
    id: 'beef-ground-2',
    sourceType: 'CNF',
    foodName: 'Beef, ground, raw',
    foodNameEn: 'Beef, ground, raw',
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
  const service = new IngredientCreationCandidateService(
    prisma as unknown as PrismaService,
  );
  return { service, prisma };
}

/**
 * 只按名字摆事实：不查词典、不做 AI 翻译、不合并同名。
 *
 * 词怎么扩，是模型在调用检索工具前自己决定的事；这里只负责“拿这几个词去库里对”。
 */
describe('IngredientCreationCandidateService · listNutritionNames', () => {
  it('按名字命中，只返回 id / name / sourceType 与真实总数', async () => {
    const { service } = createService();

    const result = await service.listNutritionNames({ keyword: 'Beef' });

    expect(result.total).toBe(3);
    expect(result.names.map((name) => name.id)).toEqual(
      expect.arrayContaining(['beef-ground', 'beef-chuck', 'beef-ground-2']),
    );
    expect(result.names[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        sourceType: expect.any(String),
      }),
    );
  });

  it('同名多条不合并：两个库的同一名字都返回', async () => {
    const { service } = createService();

    const result = await service.listNutritionNames({ keyword: 'Beef' });
    const ground = result.names.filter(
      (name) => name.name === 'Beef, ground, raw',
    );

    expect(ground).toHaveLength(2);
    expect(ground.map((name) => name.sourceType).sort()).toEqual([
      'CNF',
      'USDA_FDC',
    ]);
  });

  it('limit 只影响返回条数，total 仍是真实命中数', async () => {
    const { service } = createService();

    const result = await service.listNutritionNames({
      keyword: 'Beef',
      limit: 1,
    });

    expect(result.total).toBe(3);
    expect(result.names).toHaveLength(1);
  });

  it('没有命中 → 空清单，不报错', async () => {
    const { service } = createService();

    const result = await service.listNutritionNames({ keyword: '不存在的名字' });

    expect(result.total).toBe(0);
    expect(result.names).toEqual([]);
    expect(result.notice).toBeNull();
  });
});
