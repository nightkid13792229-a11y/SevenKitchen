import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import {
  RecipeAgentPortError,
  type AgentDraftItem,
} from 'src/application/recipe-designer/agent/agent-types';
import { RecipeDesignerAgentAdapter } from 'src/application/recipe-designer/agent/recipe-designer-agent.adapter';

/**
 * 写适配器（P0b-2b Task 2）。
 *
 * 只验证适配器的前置校验与端口调用形状：真实/已验证/不重复/属于本草稿，
 * 以及写成功后把 service 返回的明细映射成 `AgentDraftItem`。
 */

const ACCESS = { userId: 'u1', role: 'STAFF', customerId: undefined };

function createAdapter(service: any, prisma: any) {
  return new RecipeDesignerAgentAdapter(
    service,
    prisma,
    {
      userId: 'u1',
      role: 'STAFF',
    },
    'draft-1',
  );
}

/** 一条营养档案（默认：已验证 + 有 primary 映射）。 */
function nutritionFoodRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'nf-1',
    status: 'VERIFIED',
    category: 'MEAT',
    mappings: [
      {
        ingredientId: 'ing-1',
        isPrimary: true,
        ingredient: {
          id: 'ing-1',
          type: 'FOOD',
          baseUnit: 'G',
          unitDisplayLabel: null,
        },
      },
    ],
    ...overrides,
  };
}

/** service 写方法返回的明细（形状同 `DESIGN_RECIPE_ITEM_CLIENT_SELECT`）。 */
function writtenItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    designRecipeId: 'draft-1',
    ingredientId: 'ing-1',
    nutritionFoodId: 'nf-1',
    weightG: 100,
    includeInAssessment: true,
    ratioPercent: 0,
    preparationMethod: null,
    nutrientTargetKey: null,
    nutrientTargetValue: null,
    sortOrder: 1,
    ingredient: {
      id: 'ing-1',
      name: '鸡胸肉',
      type: 'FOOD',
      properties: { cfct_class: '禽肉类及制品' },
    },
    nutritionFood: {
      id: 'nf-1',
      name: 'chicken_breast',
      displayNameZh: '鸡胸肉',
      category: 'MEAT',
      status: 'VERIFIED',
    },
    ...overrides,
  };
}

function serviceMock() {
  return {
    addItem: jest.fn().mockResolvedValue(writtenItem()),
    replaceItem: jest.fn().mockResolvedValue(writtenItem()),
    updateItem: jest.fn().mockResolvedValue(writtenItem()),
    removeItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
    getDraft: jest.fn().mockResolvedValue({ seriesId: 'series-1' }),
    renameSeries: jest.fn().mockResolvedValue({ id: 'series-1' }),
    updateSeriesReleaseSettings: jest.fn().mockResolvedValue({}),
    updateDraft: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    updateDraftPresentation: jest.fn().mockResolvedValue({}),
    updateDraftProductionSteps: jest
      .fn()
      .mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
    assessDraftForAgent: jest.fn(),
  };
}

function prismaMock() {
  return {
    nutritionFood: {
      findUnique: jest.fn().mockResolvedValue(nutritionFoodRow()),
    },
    designRecipeItem: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ designRecipeId: 'draft-1' }),
    },
    recipe: {
      count: jest.fn().mockResolvedValue(0),
    },
    preparationMethod: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

describe('RecipeDesignerAgentAdapter 写方法', () => {
  describe('addItem', () => {
    it('草稿 id 不是当前草稿时拒绝，不查库也不写', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.addItem('draft-2', { nutritionFoodId: 'nf-1', weightG: 100 }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
      });
      expect(prisma.nutritionFood.findUnique).not.toHaveBeenCalled();
      expect(service.addItem).not.toHaveBeenCalled();
    });

    it('营养档案不存在时返回 INGREDIENT_NOT_FOUND', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.nutritionFood.findUnique.mockResolvedValue(null);
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.addItem('draft-1', {
          nutritionFoodId: 'nf-missing',
          weightG: 100,
        }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INGREDIENT_NOT_FOUND',
      });
      expect(service.addItem).not.toHaveBeenCalled();
    });

    it('营养档案未验证时返回 INVALID_ARGUMENT，不调用 service', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.nutritionFood.findUnique.mockResolvedValue(
        nutritionFoodRow({ status: 'PENDING' }),
      );
      const adapter = createAdapter(service, prisma);
      const write = adapter.addItem('draft-1', {
        nutritionFoodId: 'nf-1',
        weightG: 100,
      });

      await expect(write).rejects.toBeInstanceOf(RecipeAgentPortError);
      await expect(write).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '原料档案未验证，不能加入配方',
      });
      expect(service.addItem).not.toHaveBeenCalled();
    });

    it('营养档案没有原料映射时返回 INVALID_ARGUMENT，不调用 service', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.nutritionFood.findUnique.mockResolvedValue(
        nutritionFoodRow({ mappings: [] }),
      );
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.addItem('draft-1', { nutritionFoodId: 'nf-1', weightG: 100 }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '原料没有可用的营养档案映射',
      });
      expect(service.addItem).not.toHaveBeenCalled();
    });

    it('同一草稿里重复原料时返回 INVALID_ARGUMENT，不调用 service', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.designRecipeItem.findFirst.mockResolvedValue({ id: 'item-9' });
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.addItem('draft-1', { nutritionFoodId: 'nf-1', weightG: 100 }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '这个原料已经在配方里',
      });
      expect(prisma.designRecipeItem.findFirst).toHaveBeenCalledWith({
        where: { designRecipeId: 'draft-1', nutritionFoodId: 'nf-1' },
      });
      expect(service.addItem).not.toHaveBeenCalled();
    });

    it('正常加入：传解析出的真实 ingredientId + weightG，并映射返回项', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      service.addItem.mockResolvedValue(
        writtenItem({ weightG: 120, preparationMethod: '生' }),
      );
      const adapter = createAdapter(service, prisma);

      const result = await adapter.addItem('draft-1', {
        nutritionFoodId: 'nf-1',
        weightG: 120,
        preparationMethod: '生',
      });

      expect(service.addItem).toHaveBeenCalledWith(
        'draft-1',
        {
          nutritionFoodId: 'nf-1',
          ingredientId: 'ing-1',
          weightG: 120,
          preparationMethod: '生',
        },
        ACCESS,
      );
      const expected: AgentDraftItem = {
        id: 'item-1',
        ingredientId: 'ing-1',
        nutritionFoodId: 'nf-1',
        name: '鸡胸肉',
        cfctClass: '禽肉类及制品',
        nutritionCategory: 'MEAT',
        category: 'PROTEIN',
        weightG: 120,
        ratioPercent: null,
        preparationMethod: '生',
        };
      expect(result).toEqual(expected);
    });

    it('模型传预处理字典 ID 时，解析成中文再落库', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.preparationMethod.findUnique.mockResolvedValue({ name: '生重' });
      service.addItem.mockResolvedValue(
        writtenItem({ preparationMethod: '生重' }),
      );
      const adapter = createAdapter(service, prisma);

      await adapter.addItem('draft-1', {
        nutritionFoodId: 'nf-1',
        weightG: 120,
        preparationMethod: '11111111-1111-4111-8111-111111111111',
      });

      expect(service.addItem).toHaveBeenCalledWith(
        'draft-1',
        expect.objectContaining({ preparationMethod: '生重' }),
        ACCESS,
      );
    });

    it('模型传字典 ID 片段时拒绝，不落库成乱码', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.addItem('draft-1', {
          nutritionFoodId: 'nf-1',
          weightG: 120,
          preparationMethod: '11111111-1111-4111-',
        }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
      });
      expect(service.addItem).not.toHaveBeenCalled();
    });
  });

    it('补剂基准单位与营养档案不一致时拒绝，不调用 service', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.nutritionFood.findUnique.mockResolvedValue(
        nutritionFoodRow({
          category: 'SUPPLEMENT',
          nutritionData: {
            meta: { rawBasisType: 'PER_100_G' },
            macros: { crudeProtein: 0 },
          },
          mappings: [
            {
              ingredientId: 'ing-1',
              isPrimary: true,
              ingredient: {
                id: 'ing-1',
                type: 'SUPPLEMENT',
                baseUnit: 'PCS',
                unitDisplayLabel: '粒',
              },
            },
          ],
        }),
      );
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.addItem('draft-1', { nutritionFoodId: 'nf-1', weightG: 1 }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
      });
      expect(service.addItem).not.toHaveBeenCalled();
    });

    it('补剂按粒记录且档案按每份时允许添加', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.nutritionFood.findUnique.mockResolvedValue(
        nutritionFoodRow({
          category: 'SUPPLEMENT',
          nutritionData: {
            meta: { rawBasisType: 'PER_SERVING' },
            minerals: { calcium: 50000 },
          },
          mappings: [
            {
              ingredientId: 'ing-1',
              isPrimary: true,
              ingredient: {
                id: 'ing-1',
                type: 'SUPPLEMENT',
                baseUnit: 'PCS',
                unitDisplayLabel: '粒',
              },
            },
          ],
        }),
      );
      const adapter = createAdapter(service, prisma);

      await adapter.addItem('draft-1', {
        nutritionFoodId: 'nf-1',
        weightG: 1,
      });

      expect(service.addItem).toHaveBeenCalledTimes(1);
    });

    it('补剂 PCS 允许 0.2 粒（0.1 粒度）', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.nutritionFood.findUnique.mockResolvedValue(
        nutritionFoodRow({
          category: 'SUPPLEMENT',
          nutritionData: {
            meta: { rawBasisType: 'PER_SERVING' },
            minerals: { zinc: 30000 },
          },
          mappings: [
            {
              ingredientId: 'ing-1',
              isPrimary: true,
              ingredient: {
                id: 'ing-1',
                type: 'SUPPLEMENT',
                baseUnit: 'PCS',
                unitDisplayLabel: '粒',
              },
            },
          ],
        }),
      );
      const adapter = createAdapter(service, prisma);

      await adapter.addItem('draft-1', {
        nutritionFoodId: 'nf-1',
        weightG: 0.2,
      });

      expect(service.addItem).toHaveBeenCalledWith(
        'draft-1',
        expect.objectContaining({ weightG: 0.2 }),
        ACCESS,
      );
    });

    it('补剂 0.25 片/粒因不是一位小数被拒绝', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.nutritionFood.findUnique.mockResolvedValue(
        nutritionFoodRow({
          category: 'SUPPLEMENT',
          nutritionData: {
            meta: { rawBasisType: 'PER_SERVING' },
            minerals: { zinc: 30000 },
          },
          mappings: [
            {
              ingredientId: 'ing-1',
              isPrimary: true,
              ingredient: {
                id: 'ing-1',
                type: 'SUPPLEMENT',
                baseUnit: 'PCS',
                unitDisplayLabel: '粒',
              },
            },
          ],
        }),
      );
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.addItem('draft-1', {
          nutritionFoodId: 'nf-1',
          weightG: 0.25,
        }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
      });
      expect(service.addItem).not.toHaveBeenCalled();
    });

    it('补剂 G 允许 0.5g（谷粉等粉剂）', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.nutritionFood.findUnique.mockResolvedValue(
        nutritionFoodRow({
          category: 'SUPPLEMENT',
          nutritionData: {
            meta: { rawBasisType: 'PER_1_G' },
            minerals: { calcium: 353 },
          },
          mappings: [
            {
              ingredientId: 'ing-1',
              isPrimary: true,
              ingredient: {
                id: 'ing-1',
                type: 'SUPPLEMENT',
                baseUnit: 'G',
                unitDisplayLabel: 'g',
              },
            },
          ],
        }),
      );
      const adapter = createAdapter(service, prisma);

      await adapter.addItem('draft-1', {
        nutritionFoodId: 'nf-1',
        weightG: 0.5,
      });

      expect(service.addItem).toHaveBeenCalledWith(
        'draft-1',
        expect.objectContaining({ weightG: 0.5 }),
        ACCESS,
      );
    });

    it('补剂 G 的 0.55g 因不是一位小数被拒绝', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.nutritionFood.findUnique.mockResolvedValue(
        nutritionFoodRow({
          category: 'SUPPLEMENT',
          nutritionData: {
            meta: { rawBasisType: 'PER_1_G' },
            minerals: { calcium: 353 },
          },
          mappings: [
            {
              ingredientId: 'ing-1',
              isPrimary: true,
              ingredient: {
                id: 'ing-1',
                type: 'SUPPLEMENT',
                baseUnit: 'G',
                unitDisplayLabel: 'g',
              },
            },
          ],
        }),
      );
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.addItem('draft-1', {
          nutritionFoodId: 'nf-1',
          weightG: 0.55,
        }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
      });
    });

    it('updateWeight 对补剂同样校验 0.1 粒度', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.designRecipeItem.findUnique.mockResolvedValue({
        designRecipeId: 'draft-1',
        ingredient: { type: 'SUPPLEMENT', baseUnit: 'PCS' },
      });
      const adapter = createAdapter(service, prisma);

      await adapter.updateWeight('item-1', 0.2);
      expect(service.updateItem).toHaveBeenCalledWith(
        'item-1',
        { weightG: 0.2 },
        ACCESS,
      );

      await expect(adapter.updateWeight('item-1', 0.25)).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
      });
    });

  describe('replaceItem', () => {
    it('正常替换：调用 service.replaceItem，重复校验排除自己', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      service.replaceItem.mockResolvedValue(
        writtenItem({ id: 'item-2', ingredientId: 'ing-2', weightG: 80 }),
      );
      const adapter = createAdapter(service, prisma);

      await adapter.replaceItem('item-2', {
        nutritionFoodId: 'nf-1',
        weightG: 80,
      });

      expect(prisma.designRecipeItem.findFirst).toHaveBeenCalledWith({
        where: {
          designRecipeId: 'draft-1',
          nutritionFoodId: 'nf-1',
          id: { not: 'item-2' },
        },
      });
      expect(service.replaceItem).toHaveBeenCalledWith(
        'item-2',
        { nutritionFoodId: 'nf-1', ingredientId: 'ing-1', weightG: 80 },
        ACCESS,
      );
    });

    it('原料属于其他草稿时返回 INVALID_ARGUMENT，不调用 service', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.designRecipeItem.findUnique.mockResolvedValue({
        designRecipeId: 'draft-2',
      });
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.replaceItem('item-9', {
          nutritionFoodId: 'nf-1',
          weightG: 80,
        }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '原料不在当前草稿里',
      });
      expect(service.replaceItem).not.toHaveBeenCalled();
    });
  });

  describe('updateWeight / removeItem', () => {
    it('原料属于其他草稿时两者都返回 INVALID_ARGUMENT，不调用 service', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.designRecipeItem.findUnique.mockResolvedValue({
        designRecipeId: 'draft-2',
      });
      const adapter = createAdapter(service, prisma);

      await expect(adapter.updateWeight('item-9', 50)).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '原料不在当前草稿里',
      });
      await expect(adapter.removeItem('item-9')).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '原料不在当前草稿里',
      });

      expect(service.updateItem).not.toHaveBeenCalled();
      expect(service.removeItem).not.toHaveBeenCalled();
    });

    it('正常改重：调用 service.updateItem 并映射返回项', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      service.updateItem.mockResolvedValue(writtenItem({ weightG: 55 }));
      const adapter = createAdapter(service, prisma);

      const result = await adapter.updateWeight('item-1', 55);

      expect(service.updateItem).toHaveBeenCalledWith(
        'item-1',
        { weightG: 55 },
        ACCESS,
      );
      expect(result.weightG).toBe(55);
      expect(result.ratioPercent).toBeNull();
    });

    it('正常删除：调用 service.removeItem，不返回已删除项', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      const result = await adapter.removeItem('item-1');

      expect(service.removeItem).toHaveBeenCalledWith('item-1', ACCESS);
      expect(result).toBeUndefined();
    });
  });

  describe('setPreparation', () => {
    it('调用 service.updateItem，只写部位 / 状态 / 预处理', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      service.updateItem.mockResolvedValue(
        writtenItem({ preparationMethod: '蒸' }),
      );
      const adapter = createAdapter(service, prisma);

      const result = await adapter.setPreparation('item-1', { method: '蒸' });

      expect(service.updateItem).toHaveBeenCalledWith(
        'item-1',
        { preparationMethod: '蒸' },
        ACCESS,
      );
      expect(result.preparationMethod).toBe('蒸');
    });

    it('模型传预处理字典 ID 时，解析成中文再落库', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.preparationMethod.findUnique.mockResolvedValue({ name: '熟重' });
      const adapter = createAdapter(service, prisma);

      await adapter.setPreparation('item-1', {
        method: '11111111-1111-4111-8111-111111111111',
      });

      expect(service.updateItem).toHaveBeenCalledWith(
        'item-1',
        { preparationMethod: '熟重' },
        ACCESS,
      );
    });

    it('字典 ID 查不到或只抄到片段时拒绝，不写裸 ID', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.setPreparation('item-1', {
          method: '11111111-1111-4111-8111-111111111111',
        }),
      ).rejects.toThrow('部位 / 状态 / 预处理不能用字典 ID');
    });
  });

  describe('setCopy', () => {
    it('有系列时改名走 renameSeries，不改草稿名', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await adapter.setCopy('draft-1', { name: '鸭肉南瓜新名' });

      expect(service.getDraft).toHaveBeenCalledWith('draft-1', ACCESS);
      expect(prisma.recipe.count).toHaveBeenCalledWith({
        where: { seriesId: 'series-1', status: 'PUBLIC' },
      });
      expect(service.renameSeries).toHaveBeenCalledWith(
        'series-1',
        { name: '鸭肉南瓜新名' },
        ACCESS,
      );
      expect(service.updateDraft).not.toHaveBeenCalled();
      expect(service.updateDraftPresentation).not.toHaveBeenCalled();
    });

    it('有系列时封面标题同时写系列发布设置与草稿展示字段', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await adapter.setCopy('draft-1', { coverTitle: '今日鲜鸭' });

      expect(service.updateSeriesReleaseSettings).toHaveBeenCalledWith(
        'series-1',
        { coverTitle: '今日鲜鸭' },
        ACCESS,
      );
      expect(service.updateDraftPresentation).toHaveBeenCalledWith(
        'draft-1',
        { coverTitle: '今日鲜鸭' },
        ACCESS,
      );
      expect(service.renameSeries).not.toHaveBeenCalled();
      expect(service.updateDraft).not.toHaveBeenCalled();
    });

    it('有系列时描述只写草稿展示字段', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await adapter.setCopy('draft-1', { description: '低温慢煮，保留肉汁。' });

      expect(service.updateDraftPresentation).toHaveBeenCalledWith(
        'draft-1',
        { description: '低温慢煮，保留肉汁。' },
        ACCESS,
      );
      expect(service.updateSeriesReleaseSettings).not.toHaveBeenCalled();
      expect(service.renameSeries).not.toHaveBeenCalled();
    });

    it('系列已有已发布食谱时拒绝改名，且不写其他字段', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      prisma.recipe.count.mockResolvedValue(2);
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.setCopy('draft-1', {
          name: '鸭肉南瓜新名',
          coverTitle: '今日鲜鸭',
        }),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '系列已有已发布食谱，改名需要人工确认',
      });

      expect(service.renameSeries).not.toHaveBeenCalled();
      expect(service.updateSeriesReleaseSettings).not.toHaveBeenCalled();
      expect(service.updateDraftPresentation).not.toHaveBeenCalled();
    });

    it('无系列时改名走 updateDraft', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      service.getDraft.mockResolvedValue({ seriesId: null });
      const adapter = createAdapter(service, prisma);

      await adapter.setCopy('draft-1', { name: '鸭肉南瓜新名' });

      expect(service.updateDraft).toHaveBeenCalledWith(
        'draft-1',
        { name: '鸭肉南瓜新名' },
        ACCESS,
      );
      expect(prisma.recipe.count).not.toHaveBeenCalled();
      expect(service.renameSeries).not.toHaveBeenCalled();
      expect(service.updateSeriesReleaseSettings).not.toHaveBeenCalled();
      expect(service.updateDraftPresentation).not.toHaveBeenCalled();
    });

    it('无系列时健康标签走 updateDraft', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      service.getDraft.mockResolvedValue({ seriesId: null });
      const adapter = createAdapter(service, prisma);

      await adapter.setCopy('draft-1', { targetHealthTags: ['低脂'] });

      expect(service.updateDraft).toHaveBeenCalledWith(
        'draft-1',
        { targetHealthTags: ['低脂'] },
        ACCESS,
      );
      expect(service.updateSeriesReleaseSettings).not.toHaveBeenCalled();
      expect(service.updateDraftPresentation).not.toHaveBeenCalled();
    });
  });

  describe('setProductionSteps', () => {
    it('把「5 分钟」「180℃」转成数字，sortOrder 从 1 连续递增', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await adapter.setProductionSteps('draft-1', [
        {
          sortOrder: 1,
          instruction: '烤箱预热',
          duration: '5 分钟',
          temperature: '180℃',
          equipment: '烤箱',
        },
        { sortOrder: 2, instruction: '放入鸭腿慢烤' },
      ]);

      expect(service.updateDraftProductionSteps).toHaveBeenCalledWith(
        'draft-1',
        {
          steps: [
            {
              sortOrder: 1,
              instruction: '烤箱预热',
              durationMinutes: 5,
              temperatureC: 180,
              equipment: '烤箱',
            },
            {
              sortOrder: 2,
              instruction: '放入鸭腿慢烤',
            },
          ],
        },
        ACCESS,
      );
    });

    it('时长格式不合法时返回 INVALID_ARGUMENT，不调用 service', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await expect(
        adapter.setProductionSteps('draft-1', [
          { sortOrder: 1, instruction: '切块', duration: 'abc' },
        ]),
      ).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '时长格式不正确',
      });
      expect(service.updateDraftProductionSteps).not.toHaveBeenCalled();
    });
  });

  describe('runAssessment', () => {
    /** 评估引擎的 grouped entry；映射时只取其中的营养字段。 */
    function groupedEntry(overrides: Record<string, unknown> = {}) {
      return {
        nutrientKey: 'crudeProtein',
        label: '粗蛋白',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 50,
        maxValue: 80,
        currentValue: 66,
        status: 'COMPLIANT',
        details: [],
        detailCount: 1,
        ...overrides,
      };
    }

    it('把 groupedEntries、计数和内容版本映射成 AgentAssessmentView', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      service.assessDraftForAgent.mockResolvedValue({
        contentRevision: 7,
        assessment: {
          totalEnergyKcal: 4000,
          energyDensityKcalPerKg: 2000,
          totalWeightG: 2000,
          groupedEntries: [
            groupedEntry(),
            groupedEntry({
              nutrientKey: 'calcium',
              label: '钙',
              status: 'DEFICIENT',
              currentValue: 1.2,
              minValue: 2,
              maxValue: null,
            }),
            groupedEntry({
              nutrientKey: 'phosphorus',
              label: '磷',
              status: 'EXCESS',
              currentValue: 9,
              minValue: null,
              maxValue: 5,
            }),
            groupedEntry({
              nutrientKey: 'zinc',
              label: '锌',
              status: 'MISSING_DATA',
              currentValue: null,
              minValue: 1,
              maxValue: 2,
            }),
            groupedEntry({
              nutrientKey: 'omega6Omega3Ratio',
              label: 'Omega-6:Omega-3',
              status: 'INFO',
              currentValue: 5,
              minValue: null,
              maxValue: null,
            }),
          ],
        },
      });
      const adapter = createAdapter(service, prisma);

      const view = await adapter.runAssessment('draft-1');

      expect(service.assessDraftForAgent).toHaveBeenCalledWith(
        'draft-1',
        ACCESS,
      );
      expect(view).toEqual({
        contentRevision: 7,
        compliant: 1,
        deficient: 1,
        excess: 1,
        missingData: 1,
        basis: 'PER_1000_KCAL',
        totalEnergyKcal: 4000,
        energyDensityKcalPerKg: 2000,
        totalWeightG: 2000,
        entries: [
          {
            key: 'crudeProtein',
            label: '粗蛋白',
            status: 'COMPLIANT',
            value: 66,
            min: 50,
            max: 80,
            marginPercent: null,
            unit: 'g',
            basis: 'PER_1000_KCAL_ME',
          },
          {
            key: 'calcium',
            label: '钙',
            status: 'DEFICIENT',
            value: 1.2,
            min: 2,
            max: null,
            marginPercent: null,
            unit: 'g',
            basis: 'PER_1000_KCAL_ME',
          },
          {
            key: 'phosphorus',
            label: '磷',
            status: 'EXCESS',
            value: 9,
            min: null,
            max: 5,
            marginPercent: null,
            unit: 'g',
            basis: 'PER_1000_KCAL_ME',
          },
          {
            key: 'zinc',
            label: '锌',
            status: 'MISSING_DATA',
            value: null,
            min: 1,
            max: 2,
            marginPercent: null,
            unit: 'g',
            basis: 'PER_1000_KCAL_ME',
          },
          {
            key: 'omega6Omega3Ratio',
            label: 'Omega-6:Omega-3',
            status: 'INFO',
            value: 5,
            min: null,
            max: null,
            marginPercent: null,
            unit: 'g',
            basis: 'PER_1000_KCAL_ME',
          },
        ],
      });
    });

    it('评估期间草稿被改（409 Conflict）时转成 ASSESSMENT_STALE', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      service.assessDraftForAgent.mockRejectedValue(
        new ConflictException('草稿在评估期间被修改，请重新评估'),
      );
      const adapter = createAdapter(service, prisma);

      await expect(adapter.runAssessment('draft-1')).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'ASSESSMENT_STALE',
        message: '草稿在评估期间被修改，请重新评估',
      });
    });

    it('BadRequest / NotFound（已发布、草稿不存在）转成 INVALID_ARGUMENT', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      service.assessDraftForAgent.mockRejectedValueOnce(
        new BadRequestException('已发布草稿不能由 Agent 重新评估'),
      );
      await expect(adapter.runAssessment('draft-1')).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '已发布草稿不能由 Agent 重新评估',
      });

      service.assessDraftForAgent.mockRejectedValueOnce(
        new NotFoundException('草稿不存在'),
      );
      await expect(adapter.runAssessment('draft-1')).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '草稿不存在',
      });
    });

    it('不是当前草稿时 INVALID_ARGUMENT，不调用 service', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await expect(adapter.runAssessment('draft-2')).rejects.toMatchObject({
        name: 'RecipeAgentPortError',
        code: 'INVALID_ARGUMENT',
        message: '只能修改当前这一份草稿',
      });
      expect(service.assessDraftForAgent).not.toHaveBeenCalled();
    });

    it('非 HTTP 异常原样抛出，不误判成业务校验失败', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const dbError = new Error('db down');
      service.assessDraftForAgent.mockRejectedValue(dbError);
      const adapter = createAdapter(service, prisma);

      await expect(adapter.runAssessment('draft-1')).rejects.toBe(dbError);
    });
  });
});
