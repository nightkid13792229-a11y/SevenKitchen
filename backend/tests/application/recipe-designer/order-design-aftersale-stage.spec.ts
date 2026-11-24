import { BadRequestException } from '@nestjs/common';
import { CustomRecipeStatus } from '@prisma/client';
import { OrderRecipeDesignService } from '../../../src/application/recipe-designer/order-recipe-design.service';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { OrderRecipeTemplateService } from '../../../src/application/recipe-designer/order-recipe-template.service';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 售后改稿 · 重新加入待提交（2026-11-24）
 *
 * ## 这组测试守着什么
 *
 * 老板的报错原话：「订单已交付，不能再设计食谱。」
 *
 * 售后改稿的槽位在加入过一次待提交后是 READY，而订单本身是 DELIVERED。
 * 旧规则只要槽位不是 EDITING 就按正常设计单校验订单状态，
 * 于是改稿**改完再也进不了待提交**，重新交付只能交旧版本。
 *
 * 口径：槽位带 `revisionDeliveryItemId` = 售后打开的改稿，允许重新入仓；
 * 其余槽位（正常设计单）仍按原规则拦。
 */

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-pk-1',
    orderId: 'CR202611240001',
    customerId: 'customer-1',
    dogId: 'dog-1',
    status: CustomRecipeStatus.DELIVERED,
    recipeQuantity: 1,
    dog: { id: 'dog-1', name: '波比' },
    ...overrides,
  };
}

function buildSlot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'slot-1',
    orderId: 'order-pk-1',
    status: 'READY',
    recipeId: 'recipe-old',
    revisionDeliveryItemId: 'item-1',
    designDraftId: 'draft-1',
    stagedContentRevision: 4,
    updatedAt: new Date('2026-11-24T10:00:00+08:00'),
    designDraft: { updatedAt: new Date('2026-11-24T11:00:00+08:00') },
    ...overrides,
  };
}

function createService(options: { order?: unknown; slot?: unknown } = {}) {
  const prisma = {
    customRecipeOrder: {
      findUnique: jest.fn().mockResolvedValue(options.order ?? buildOrder()),
    },
    orderRecipeDesign: {
      findUnique: jest.fn().mockResolvedValue(options.slot ?? buildSlot()),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const recipeDesignerService = {
    publishOrderDesignSlot: jest.fn().mockResolvedValue({
      recipeRowId: 'recipe-new',
      contentRevision: 5,
    }),
  };

  const service = new OrderRecipeDesignService(
    prisma as unknown as PrismaService,
    {
      resolveOrderRef: jest.fn().mockResolvedValue({ id: 'order-pk-1' }),
    } as unknown as CustomRecipeService,
    recipeDesignerService as unknown as RecipeDesignerService,
    {} as unknown as OrderRecipeTemplateService,
  );

  return { service, prisma, recipeDesignerService };
}

describe('OrderRecipeDesignService · 售后改稿重新加入待提交', () => {
  it('★ 已交付订单 + 改稿槽位已改过：允许重新入仓并生成新版本', async () => {
    const { service, prisma, recipeDesignerService } = createService();

    const result = await service.stageDraft(
      'CR202611240001',
      'slot-1',
      'admin-1',
    );

    expect(recipeDesignerService.publishOrderDesignSlot).toHaveBeenCalled();
    expect(prisma.orderRecipeDesign.update).toHaveBeenCalledWith({
      where: { id: 'slot-1' },
      data: expect.objectContaining({
        status: 'READY',
        recipeId: 'recipe-new',
        stagedContentRevision: 5,
      }),
    });
    expect(result.recipeId).toBe('recipe-new');
  });

  it('★ 已交付订单 + 改稿槽位没改过：幂等返回，不重复生成版本', async () => {
    const { service, recipeDesignerService } = createService({
      slot: buildSlot({
        updatedAt: new Date('2026-11-24T12:00:00+08:00'),
        designDraft: { updatedAt: new Date('2026-11-24T11:00:00+08:00') },
      }),
    });

    const result = await service.stageDraft(
      'CR202611240001',
      'slot-1',
      'admin-1',
    );

    expect(recipeDesignerService.publishOrderDesignSlot).not.toHaveBeenCalled();
    expect(result.recipeId).toBe('recipe-old');
  });

  it('已交付订单 + 普通设计槽位（不是改稿）：仍按原规则拦下', async () => {
    const { service, recipeDesignerService } = createService({
      slot: buildSlot({ revisionDeliveryItemId: null }),
    });

    await expect(
      service.stageDraft('CR202611240001', 'slot-1', 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(recipeDesignerService.publishOrderDesignSlot).not.toHaveBeenCalled();
  });
});
