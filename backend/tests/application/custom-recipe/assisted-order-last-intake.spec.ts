import { NotFoundException } from '@nestjs/common';
import { AssistedOrderService } from '../../../src/application/custom-recipe/assisted-order.service';

/**
 * 代客下单 · 带入这只狗上一次的定制需求（2026-11-16）
 *
 * ## 为什么要有这个接口
 *
 * 同一只狗回头的次数远多于新狗：体重方向、过敏、现在喂什么、肠胃情况
 * 多数情况下跟上一单一样。此前后台每单都要从头问一遍、填一遍，
 * 员工嫌麻烦就会瞎填，营养师拿到的资料反而更差。
 *
 * 数据本来就在 `custom_recipe_order` 上（每单一份快照，按 dogId 可查），
 * 所以这里只做**只读回放**：不新开"狗狗需求档案"表，也不回写历史单。
 *
 * ## 锁住的口径
 *
 *   ① 只回放**这只狗**自己的单：不是这位顾客的其它狗，也不是别的顾客；
 *   ② 已关单（CANCELLED）不算模板 —— 作废单里的答案不该被当成"上次填的"；
 *   ③ 取最近一单（createdAt 倒序）；
 *   ④ 没有历史就明确返回 intake=null，页面据此不显示提示条；
 *   ⑤ 狗不存在要报错，不能静默返回空（否则页面会以为"没填过"）。
 */
function buildService(prisma: any): AssistedOrderService {
  return new AssistedOrderService(
    prisma,
    null as any,
    null as any,
    null as any,
  );
}

describe('代客下单 · 上次定制需求', () => {
  function createPrisma(overrides: Record<string, any> = {}) {
    return {
      dog: {
        findUnique: jest.fn().mockResolvedValue({ id: 'dog-1' }),
      },
      customRecipeOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      ...overrides,
    } as any;
  }

  it('★ 狗不存在时报错，不能静默当成"没填过"', async () => {
    const prisma = createPrisma({
      dog: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const service = buildService(prisma);

    await expect(service.getLastIntake('dog-missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('★ 没有历史单时返回 null', async () => {
    const prisma = createPrisma();
    const service = buildService(prisma);

    await expect(service.getLastIntake('dog-1')).resolves.toEqual({
      intake: null,
    });
    expect(prisma.customRecipeOrder.findFirst).toHaveBeenCalledTimes(1);
  });

  it('★ 只查这只狗、排除已关单、取最近一单', async () => {
    const prisma = createPrisma();
    const service = buildService(prisma);

    await service.getLastIntake('dog-1');

    const args = prisma.customRecipeOrder.findFirst.mock.calls[0][0];
    expect(args.where.dogId).toBe('dog-1');
    expect(args.where.status).toEqual({ not: 'CANCELLED' });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('★ 原样回放问卷答案，不做二次加工', async () => {
    const createdAt = new Date('2026-11-02T03:04:05.000Z');
    const prisma = createPrisma({
      customRecipeOrder: {
        findFirst: jest.fn().mockResolvedValue({
          orderId: 'CR20261102001',
          createdAt,
          targetGoal: 'MAINTAIN',
          recipeQuantity: 2,
          requestedProteinCodes: ['CHICKEN', 'DUCK'],
          allergyStatus: 'HAS_ALLERGY',
          allergyText: '鸡肉、牛肉',
          currentFoodMain: 'COMMERCIAL_DRY',
          currentFoodOther: null,
          changeReasons: ['HEALTHIER'],
          stomachConditions: ['SOFT_STOOL'],
          additionalNotes: '不吃硬的',
        }),
      },
    });
    const service = buildService(prisma);

    const result = await service.getLastIntake('dog-1');

    expect(result.intake).toEqual({
      orderId: 'CR20261102001',
      orderCreatedAt: createdAt.toISOString(),
      targetGoal: 'MAINTAIN',
      recipeQuantity: 2,
      requestedProteinCodes: ['CHICKEN', 'DUCK'],
      allergyStatus: 'HAS_ALLERGY',
      allergyText: '鸡肉、牛肉',
      currentFoodMain: 'COMMERCIAL_DRY',
      currentFoodOther: null,
      changeReasons: ['HEALTHIER'],
      stomachConditions: ['SOFT_STOOL'],
      additionalNotes: '不吃硬的',
    });
  });

  it('★ 空 dogId 直接拒绝，不去查库', async () => {
    const prisma = createPrisma();
    const service = buildService(prisma);

    await expect(service.getLastIntake('  ')).rejects.toThrow('请选择狗狗');
    expect(prisma.customRecipeOrder.findFirst).not.toHaveBeenCalled();
  });
});
