import { BadRequestException } from '@nestjs/common';
import { CustomRecipeAftersaleService } from '../../../src/application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PlatformOptionsService } from '../../../src/application/platform-options/platform-options.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { CustomRecipeDeliveryService } from '../../../src/application/custom-recipe/custom-recipe-delivery.service';

/**
 * 售后改稿 · 一键重新交付（2026-11-24）
 *
 * ## 这组测试守着什么
 *
 * 老板在「上线检查」里点一次「重新交付给顾客」，背后要同时做对三件事：
 *
 *   ① **交的是新版本**：槽位必须已入仓（READY），否则 `redeliverBatchItems`
 *      会取到旧食谱行 —— 顾客看到的还是老配方，而且没有任何报错；
 *   ② **槽位要标回已交付**：否则工作台永远显示「已就绪 1/1」，
 *      还给出一个点了就报错的「最终提交并交付」；
 *   ③ **售后要结单**：交付成功但结单失败时，不能把整次操作报成失败，
 *      否则处理人会重试并撞上「找不到改稿槽位」。
 */

function buildAftersale(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aftersale-1',
    orderId: 'order-pk-1',
    type: 'ADJUST_RECIPE',
    status: 'ACCEPTED',
    source: 'STAFF',
    description: '把兔里脊换成鸭胸，蛋白比例上调',
    deliveryItemIds: ['item-1'],
    handleNote: null,
    ...overrides,
  };
}

function buildSlot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'slot-1',
    status: 'READY',
    recipeId: 'recipe-new',
    stagedContentRevision: 5,
    designDraft: { contentRevision: 5 },
    ...overrides,
  };
}

function buildDeliveryResult() {
  return {
    orderId: 'CR202611240001',
    batchId: 'batch-2',
    version: 2,
    recipeCount: 1,
    selectedItemIds: ['item-1'],
    selectedRecipes: [
      {
        deliveryItemId: 'item-1',
        recipeId: 'CR202611240001-1',
        recipeName: '鸡肉南瓜',
        itemCodes: ['a'],
      },
    ],
    legacyRecipeId: 'recipe-new',
  };
}

function createService(options: {
  aftersale?: unknown;
  slot?: unknown;
  deliveryResult?: unknown;
  resolveFails?: boolean;
} = {}) {
  const aftersale = options.aftersale ?? buildAftersale();

  const prisma = {
    customRecipeAftersale: {
      findUnique: jest.fn().mockResolvedValue(aftersale),
      update: options.resolveFails
        ? jest.fn().mockRejectedValue(new Error('数据库抖动'))
        : jest.fn().mockResolvedValue({}),
    },
    customRecipeOrder: {
      findUnique: jest.fn().mockResolvedValue({
        customerId: 'customer-1',
        orderId: 'CR202611240001',
        customer: { wechatOpenid: null },
      }),
    },
    orderRecipeDesign: {
      findFirst: jest.fn().mockResolvedValue(
        'slot' in options ? options.slot : buildSlot(),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const deliveryService = {
    redeliverBatchItems: jest
      .fn()
      .mockResolvedValue(options.deliveryResult ?? buildDeliveryResult()),
  };

  const service = new CustomRecipeAftersaleService(
    prisma as unknown as PrismaService,
    { getConfig: jest.fn() } as unknown as CustomRecipeConfigService,
    { listSet: jest.fn() } as unknown as PlatformOptionsService,
    undefined,
    undefined,
    deliveryService as unknown as CustomRecipeDeliveryService,
  );

  return { service, prisma, deliveryService };
}

describe('CustomRecipeAftersaleService · 售后改稿一键重新交付', () => {
  it('★ 正常：交的是入仓那一版，槽位标已交付，售后用默认说明结单', async () => {
    const { service, prisma, deliveryService } = createService();

    const result = await service.redeliverAftersaleRevision({
      aftersaleId: 'aftersale-1',
      handlerId: 'admin-1',
      now: new Date('2026-11-24T20:00:00+08:00'),
    });

    expect(deliveryService.redeliverBatchItems).toHaveBeenCalledWith(
      expect.objectContaining({
        orderIdOrId: 'order-pk-1',
        deliveryItemIds: ['item-1'],
        deliveredBy: 'admin-1',
      }),
    );
    expect(prisma.orderRecipeDesign.update).toHaveBeenCalledWith({
      where: { id: 'slot-1' },
      data: { status: 'DELIVERED', revisionDeliveryItemId: null },
    });
    expect(prisma.customRecipeAftersale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'aftersale-1' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          linkedDeliveryId: 'batch-2',
          handleNote:
            '已按这次调整重新交付了一版食谱：把兔里脊换成鸭胸，蛋白比例上调。请在小程序里查看最新版本。',
        }),
      }),
    );
    expect(result.version).toBe(2);
    expect(result.resolved).toBe(true);
  });

  it('★ 还没加入待提交：直接拒绝，绝不拿旧版本去交付', async () => {
    const { service, deliveryService } = createService({
      slot: buildSlot({ status: 'EDITING', recipeId: 'recipe-old' }),
    });

    await expect(
      service.redeliverAftersaleRevision({
        aftersaleId: 'aftersale-1',
        handlerId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(deliveryService.redeliverBatchItems).not.toHaveBeenCalled();
  });

  it('★ 加入待提交后又改过：提示重新入仓，而不是默默交旧版', async () => {
    const { service, deliveryService } = createService({
      slot: buildSlot({
        stagedContentRevision: 4,
        designDraft: { contentRevision: 5 },
      }),
    });

    await expect(
      service.redeliverAftersaleRevision({
        aftersaleId: 'aftersale-1',
        handlerId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(deliveryService.redeliverBatchItems).not.toHaveBeenCalled();
  });

  it('售后已经处理完（或还没受理）：不能再交付', async () => {
    const { service } = createService({
      aftersale: buildAftersale({ status: 'RESOLVED' }),
    });

    await expect(
      service.redeliverAftersaleRevision({
        aftersaleId: 'aftersale-1',
        handlerId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('交付成功但结单失败：返回 resolved=false，不把交付报成失败', async () => {
    const { service } = createService({ resolveFails: true });

    const result = await service.redeliverAftersaleRevision({
      aftersaleId: 'aftersale-1',
      handlerId: 'admin-1',
    });

    expect(result.resolved).toBe(false);
    expect(result.resolveError).toContain('数据库抖动');
    // 交付结果仍然带回去，处理人知道顾客已经拿到新版
    expect(result.batchId).toBe('batch-2');
  });
});
