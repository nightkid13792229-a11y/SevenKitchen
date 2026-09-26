/**
 * 试吃装成品库存 · 单元测试
 *
 * 这里覆盖的是**纯逻辑与校验**：保质期算法、参数校验、库存总览口径、调整护栏。
 *
 * 「不超卖」那条最关键的保证**不在**这里测 —— 它依赖数据库的条件更新，
 * 用 mock 测等于自问自答。它由真实并发脚本验证：
 *   backend/scripts/verify-tasting-pack-stock.ts
 * （同时抢最后一套，只能有一个人成功）
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  TastingPackStockService,
  addMonthsClamped,
  EXPIRING_SOON_DAYS,
} from '../../../src/application/tasting-pack/tasting-pack-stock.service';

function buildPrismaMock() {
  return {
    tastingPack: { findUnique: jest.fn() },
    tastingPackStockBatch: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    tastingPackStockLedger: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(),
  };
}

function buildConfigServiceMock(overrides: Record<string, any> = {}) {
  return {
    getConfig: jest.fn().mockResolvedValue({
      enabled: true,
      tastingMultiplier: 1.25,
      priceRoundingMode: 'CEIL_TO_1',
      maxSetsPerOrder: 5,
      lowStockThreshold: 10,
      defaultRestockSets: 20,
      shelfLifeMonths: 6,
      defaultBagsPerRecipe: 2,
      defaultPackSpecG: 80,
      allowForceSchedule: true,
      updatedAt: null,
      ...overrides,
    }),
  };
}

function buildBatch(overrides: Record<string, any> = {}) {
  return {
    id: 'batch-1',
    batchNo: 'TP-20260926-001',
    tastingPackId: 'pack-1',
    producedAt: new Date('2026-09-01T00:00:00.000Z'),
    expiresAt: new Date('2027-03-01T00:00:00.000Z'),
    quantityTotal: 20,
    quantityRemaining: 20,
    unitCost: '56.00',
    status: 'AVAILABLE',
    note: null,
    productionPlanId: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('试吃装库存 · 保质期算法', () => {
  it('月末不溢出：1 月 31 日 + 1 个月 = 2 月最后一天，而不是 3 月 3 日', () => {
    const result = addMonthsClamped(new Date(2026, 0, 31, 10, 0, 0), 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1); // 2 月
    expect(result.getDate()).toBe(28);
  });

  it('闰年 2 月按 29 天算', () => {
    const result = addMonthsClamped(new Date(2028, 0, 31, 10, 0, 0), 1);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(29);
  });

  it('普通日期按同日顺延', () => {
    const result = addMonthsClamped(new Date(2026, 8, 26, 12, 0, 0), 6);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(2); // 3 月
    expect(result.getDate()).toBe(26);
  });
});

describe('试吃装库存 · 总览口径', () => {
  it('可售量排除过期批次，并把快到期的单独计数', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findUnique.mockResolvedValue({
      id: 'pack-1',
      name: '五种口味尝鲜装',
      status: 'ACTIVE',
    });

    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

    prisma.tastingPackStockBatch.findMany.mockResolvedValue([
      buildBatch({ id: 'b1', quantityRemaining: 5, expiresAt: soon, unitCost: '50.00' }),
      buildBatch({ id: 'b2', quantityRemaining: 10, expiresAt: later, unitCost: '60.00' }),
      buildBatch({ id: 'b3', quantityRemaining: 3, expiresAt: past }),
    ]);

    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock({ lowStockThreshold: 20 }) as any,
    );

    const overview = await service.getOverview('pack-1');

    // 可售 = 5 + 10（过期的 3 套不算）
    expect(overview.availableSets).toBe(15);
    expect(overview.expiringSoonSets).toBe(5);
    expect(overview.expiredSets).toBe(3);
    // 加权成本 = (5×50 + 10×60) / 15 = 56.67
    expect(overview.weightedUnitCost).toBeCloseTo(56.67, 2);
    // 已上架且低于阈值 → 要提醒补货
    expect(overview.needsRestock).toBe(true);
    expect(EXPIRING_SOON_DAYS).toBe(30);
  });

  it('已下架的商品不触发补货提醒（不卖了就不用补）', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findUnique.mockResolvedValue({
      id: 'pack-1',
      name: '已下架尝鲜装',
      status: 'INACTIVE',
    });
    prisma.tastingPackStockBatch.findMany.mockResolvedValue([]);

    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock() as any,
    );

    const overview = await service.getOverview('pack-1');
    expect(overview.availableSets).toBe(0);
    expect(overview.needsRestock).toBe(false);
    expect(overview.weightedUnitCost).toBeNull();
  });
});

describe('试吃装库存 · 入库校验', () => {
  it('保质期按设置自动推算到期日', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findUnique.mockResolvedValue({ id: 'pack-1' });
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        tastingPackStockBatch: {
          create: jest.fn().mockImplementation(({ data }: any) => ({
            ...buildBatch(),
            ...data,
            id: 'new-batch',
          })),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        tastingPackStockLedger: { create: jest.fn() },
      }),
    );

    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock({ shelfLifeMonths: 6 }) as any,
    );

    const batch = await service.stockIn({
      tastingPackId: 'pack-1',
      sets: 20,
      producedAt: '2026-09-26T00:00:00.000Z',
      unitCost: 56,
    });

    expect(batch.quantityTotal).toBe(20);
    expect(new Date(batch.expiresAt).getUTCMonth()).toBe(2); // 2027-03
    expect(batch.batchNo).toContain('TP-');
  });

  it('到期日不晚于生产日期必须报错', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findUnique.mockResolvedValue({ id: 'pack-1' });

    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock() as any,
    );

    await expect(
      service.stockIn({
        tastingPackId: 'pack-1',
        sets: 5,
        producedAt: '2026-09-26T00:00:00.000Z',
        expiresAt: '2026-09-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('到期日必须晚于生产日期');
  });

  it('入库套数必须为正整数，商品必须存在', async () => {
    const prisma = buildPrismaMock();
    prisma.tastingPack.findUnique.mockResolvedValue({ id: 'pack-1' });
    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock() as any,
    );

    await expect(
      service.stockIn({
        tastingPackId: 'pack-1',
        sets: 0,
        producedAt: new Date(),
      }),
    ).rejects.toThrow('入库套数必须是大于 0 的整数');

    await expect(
      service.stockIn({
        tastingPackId: 'pack-1',
        sets: 2.5,
        producedAt: new Date(),
      }),
    ).rejects.toThrow('入库套数必须是大于 0 的整数');

    prisma.tastingPack.findUnique.mockResolvedValue(null);
    await expect(
      service.stockIn({
        tastingPackId: 'missing',
        sets: 1,
        producedAt: new Date(),
      }),
    ).rejects.toThrow('试吃装不存在');
  });
});

describe('试吃装库存 · 人工调整护栏', () => {
  it('必须填原因、必须是非 0 整数', async () => {
    const prisma = buildPrismaMock();
    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock() as any,
    );

    await expect(
      service.adjust({ batchId: 'b1', delta: 1, note: '' }),
    ).rejects.toThrow('必须填写原因');

    await expect(
      service.adjust({ batchId: 'b1', delta: 0, note: '盘点' }),
    ).rejects.toThrow('调整数量必须是非 0 整数');
  });

  it('不允许把剩余量调成负数或超过入库量', async () => {
    const prisma = buildPrismaMock();
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        tastingPackStockBatch: {
          findUnique: jest.fn().mockResolvedValue(
            buildBatch({ quantityTotal: 20, quantityRemaining: 3 }),
          ),
          update: jest.fn(),
        },
        tastingPackStockLedger: { create: jest.fn() },
      }),
    );

    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock() as any,
    );

    await expect(
      service.adjust({ batchId: 'b1', delta: -5, note: '报损' }),
    ).rejects.toThrow('不能为负');

    await expect(
      service.adjust({ batchId: 'b1', delta: 30, note: '盘盈' }),
    ).rejects.toThrow('不能超过入库套数');
  });

  it('已作废的批次不能再调整', async () => {
    const prisma = buildPrismaMock();
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        tastingPackStockBatch: {
          findUnique: jest
            .fn()
            .mockResolvedValue(buildBatch({ status: 'VOID' })),
          update: jest.fn(),
        },
        tastingPackStockLedger: { create: jest.fn() },
      }),
    );

    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock() as any,
    );

    await expect(
      service.adjust({ batchId: 'b1', delta: 1, note: '盘点' }),
    ).rejects.toThrow('已作废');
  });
});

describe('试吃装库存 · 下单占用参数校验', () => {
  it('占用必须带订单号（否则事后无法对账）', async () => {
    const prisma = buildPrismaMock();
    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock() as any,
    );

    await expect(
      service.reserveForOrder({ tastingPackId: 'pack-1', sets: 1, orderId: '' }),
    ).rejects.toThrow('必须带订单号');
  });

  it('库存不足时报错，且错误信息说清还差几套', async () => {
    const prisma = buildPrismaMock();
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        tastingPackStockBatch: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        tastingPackStockLedger: { create: jest.fn() },
      }),
    );

    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock() as any,
    );

    await expect(
      service.reserveForOrder({
        tastingPackId: 'pack-1',
        sets: 3,
        orderId: 'order-1',
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.reserveForOrder({
        tastingPackId: 'pack-1',
        sets: 3,
        orderId: 'order-1',
      }),
    ).rejects.toThrow('还差 3 套');
  });

  it('没有占用记录时释放是空操作（重复调用安全）', async () => {
    const prisma = buildPrismaMock();
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        tastingPackStockLedger: { findMany: jest.fn().mockResolvedValue([]) },
        tastingPackStockBatch: { findUnique: jest.fn(), update: jest.fn() },
      }),
    );

    const service = new TastingPackStockService(
      prisma as any,
      buildConfigServiceMock() as any,
    );

    await expect(
      service.releaseForOrder({ orderId: 'order-without-reserve' }),
    ).resolves.toEqual({ released: 0 });

    await expect(
      service.releaseForOrder({ orderId: '' }),
    ).rejects.toThrow(BadRequestException);
  });
});
