/**
 * 撤销审核时价格回退（2026-11-07 复审 P0）
 *
 * 锁住三件以前没覆盖的事：
 * 1. 原料当前价退回变更前；
 * 2. 采购商品（SKU）价也退回本单应用前的值，不能只退原料价；
 * 3. 变更回到 PENDING，并把「新价」恢复成来源单价（否则表格里新价/涨跌会自相矛盾）。
 *
 * 这几条以前是盲区：service 测试把 pricing 全 mock 掉了，问题永远发现不了。
 */

import { IngredientPricingService } from '../../../src/application/ingredient/ingredient-pricing.service';

const decimal = (value: number) => ({ toNumber: () => value });

const buildChange = (overrides: Record<string, any> = {}) => ({
  id: 'change-1',
  ingredientId: 'ingredient-1',
  reimbursementId: 'reimbursement-1',
  purchaseRecordId: 'record-1',
  ingredientName: '黑猪瘦肉',
  sourceQuantity: decimal(0.8),
  sourcePricePerPurchaseUnit: decimal(33.74),
  previousCurrentPricePerPurchaseUnit: decimal(12.38),
  previousEffectivePrice: decimal(12.38),
  proposedEffectivePrice: decimal(33.74),
  appliedCurrentPricePerPurchaseUnit: decimal(33.74),
  appliedEffectivePricePerPurchaseUnit: decimal(33.74),
  deltaRate: decimal(1.726),
  status: 'APPROVED',
  gateAction: null,
  gateReason: null,
  reviewComment: null,
  reviewedById: 'admin-1',
  reviewedAt: new Date('2026-11-07T12:00:00.000Z'),
  createdAt: new Date('2026-11-07T11:00:00.000Z'),
  ...overrides,
});

function buildService(options: { changes: any[]; skuHistory?: any[] }) {
  const prisma = {
    ingredientPriceChange: {
      findMany: jest.fn().mockResolvedValue(options.changes),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    procurementSkuPriceHistory: {
      findMany: jest.fn().mockResolvedValue(options.skuHistory ?? []),
    },
    ingredient: {
      findUnique: jest.fn().mockResolvedValue({
        currentPricePerPurchaseUnit: 12.38,
      }),
    },
    procurementSku: {
      findUnique: jest.fn().mockResolvedValue({
        currentPurchasePrice: 31.5,
      }),
    },
  };

  const ingredientRepository = {
    update: jest.fn().mockResolvedValue(undefined),
    findByIds: jest.fn().mockResolvedValue([]),
  };

  const procurementSkuService = {
    applyCurrentPurchasePrice: jest.fn().mockResolvedValue({}),
  };

  const costHistory = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  const service = new IngredientPricingService(
    prisma as any,
    ingredientRepository as any,
    {} as any, // purchaseRecordRepository
    {} as any, // globalConfigService
    procurementSkuService as any,
    {} as any, // priceAnchorService
    costHistory as any,
  );

  return { service, prisma, ingredientRepository, procurementSkuService, costHistory };
}

describe('IngredientPricingService 撤销审核的价格回退', () => {
  it('把原料价退回变更前，并补一条成本流水', async () => {
    const { service, ingredientRepository, costHistory } = buildService({
      changes: [buildChange()],
    });

    await service.revertApprovedChangesForReimbursement(
      'reimbursement-1',
      'admin-1',
    );

    expect(ingredientRepository.update).toHaveBeenCalledWith('ingredient-1', {
      currentPricePerPurchaseUnit: 12.38,
    });

    expect(costHistory.record).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientId: 'ingredient-1',
        oldCost: 33.74,
        newCost: 12.38,
        reimbursementId: 'reimbursement-1',
      }),
    );
  });

  it('采购商品价也退回本单应用前的值（不是只退原料价）', async () => {
    const { service, procurementSkuService } = buildService({
      changes: [buildChange()],
      skuHistory: [
        {
          id: 'history-1',
          procurementSkuId: 'sku-1',
          oldPrice: decimal(27.3),
          newPrice: decimal(31.5),
        },
        {
          id: 'history-2',
          procurementSkuId: 'sku-1',
          oldPrice: decimal(29.9),
          newPrice: decimal(31.5),
        },
      ],
    });

    await service.revertApprovedChangesForReimbursement(
      'reimbursement-1',
      'admin-1',
    );

    // 同一个 SKU 多条历史时，用最早那条的旧价（28 是中间值，不能被选中）
    expect(procurementSkuService.applyCurrentPurchasePrice).toHaveBeenCalledTimes(1);
    expect(procurementSkuService.applyCurrentPurchasePrice).toHaveBeenCalledWith(
      'sku-1',
      27.3,
      expect.objectContaining({ source: 'ROLLBACK', reimbursementId: 'reimbursement-1' }),
    );
  });

  it('同一 SKU 被后面的单改过价时，不覆盖别人的价', async () => {
    const { service, procurementSkuService, prisma } = buildService({
      changes: [buildChange()],
      skuHistory: [
        {
          id: 'history-1',
          procurementSkuId: 'sku-1',
          oldPrice: decimal(27.3),
          newPrice: decimal(31.5),
        },
      ],
    });
    // 本单应用价是 31.5，但现在 SKU 已经是 35（另一张单后来改的）
    prisma.procurementSku.findUnique.mockResolvedValue({
      currentPurchasePrice: 35,
    });

    await service.revertApprovedChangesForReimbursement(
      'reimbursement-1',
      'admin-1',
    );

    expect(procurementSkuService.applyCurrentPurchasePrice).not.toHaveBeenCalled();
  });

  it('首次定价（没有旧价）时不回退 SKU 价', async () => {
    const { service, procurementSkuService } = buildService({
      changes: [buildChange()],
      skuHistory: [
        {
          id: 'history-1',
          procurementSkuId: 'sku-1',
          oldPrice: null,
          newPrice: decimal(31.5),
        },
      ],
    });

    await service.revertApprovedChangesForReimbursement(
      'reimbursement-1',
      'admin-1',
    );

    expect(procurementSkuService.applyCurrentPurchasePrice).not.toHaveBeenCalled();
  });

  it('变更回到待确认，并把「新价」恢复成来源单价', async () => {
    const { service, prisma } = buildService({ changes: [buildChange()] });

    await service.revertApprovedChangesForReimbursement(
      'reimbursement-1',
      'admin-1',
    );

    expect(prisma.ingredientPriceChange.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'change-1' },
        data: expect.objectContaining({
          status: 'PENDING',
          proposedEffectivePrice: expect.objectContaining({
            toNumber: expect.any(Function),
          }),
          appliedCurrentPricePerPurchaseUnit: null,
          gateAction: null,
        }),
      }),
    );
  });

  it('没有已生效的变更时什么都不做', async () => {
    const { service, prisma, procurementSkuService, costHistory } = buildService({
      changes: [],
    });

    await service.revertApprovedChangesForReimbursement('reimbursement-1');

    expect(prisma.ingredientPriceChange.update).not.toHaveBeenCalled();
    expect(procurementSkuService.applyCurrentPurchasePrice).not.toHaveBeenCalled();
    expect(costHistory.record).not.toHaveBeenCalled();
  });
});
