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
        ingredient: { id: 'ing-1', type: 'FOOD' },
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
    preparationNote: null,
    preparationSource: 'AUTO',
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
        preparationNote: null,
      };
      expect(result).toEqual(expected);
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
    it('调用 service.updateItem 并标记 MANUAL，备注缺省写 null', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      service.updateItem.mockResolvedValue(
        writtenItem({ preparationMethod: '蒸', preparationSource: 'MANUAL' }),
      );
      const adapter = createAdapter(service, prisma);

      const result = await adapter.setPreparation('item-1', { method: '蒸' });

      expect(service.updateItem).toHaveBeenCalledWith(
        'item-1',
        {
          preparationMethod: '蒸',
          preparationNote: null,
          preparationSource: 'MANUAL',
        },
        ACCESS,
      );
      expect(result.preparationMethod).toBe('蒸');
    });

    it('备注显式传 null 时原样传 null', async () => {
      const service = serviceMock();
      const prisma = prismaMock();
      const adapter = createAdapter(service, prisma);

      await adapter.setPreparation('item-1', { method: '蒸', note: null });

      expect(service.updateItem).toHaveBeenCalledWith(
        'item-1',
        {
          preparationMethod: '蒸',
          preparationNote: null,
          preparationSource: 'MANUAL',
        },
        ACCESS,
      );
    });
  });
});
