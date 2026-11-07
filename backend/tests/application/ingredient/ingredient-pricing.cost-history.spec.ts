import { Test, TestingModule } from '@nestjs/testing';
import { GlobalConfigService } from '../../../src/application/config/global-config.service';
import { IngredientPricingService } from '../../../src/application/ingredient/ingredient-pricing.service';
import { IngredientCostHistoryService } from '../../../src/application/ingredient/ingredient-cost-history.service';
import { INGREDIENT_REPOSITORY } from '../../../src/application/ingredient/ingredient.service';
import { ProcurementSkuService } from '../../../src/application/ingredient/procurement-sku.service';
import { IngredientPriceAnchorService } from '../../../src/application/ingredient/ingredient-price-anchor.service';
import { PURCHASE_RECORD_REPOSITORY } from '../../../src/application/purchasing/purchasing.service.tokens';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 报销写价必须留痕（2026-11-07 成本口径归位 · Task 4）。
 *
 * 采购报销是「成本」唯一会自动变化的入口。它写价的同时必须落一条
 * REIMBURSEMENT 流水 —— 否则半年后没人能解释「这个价是哪一笔采购定的」。
 */
describe('IngredientPricingService · 报销写价留痕', () => {
  let service: IngredientPricingService;

  const update = jest.fn();
  const record = jest.fn();

  const mockIngredientRepository = {
    findByIds: jest.fn(),
    update,
    updateEffectivePrice: jest.fn(),
  } as any;

  beforeEach(async () => {
    jest.resetAllMocks();
    update.mockResolvedValue(undefined);
    record.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientPricingService,
        { provide: PrismaService, useValue: {} as any },
        { provide: INGREDIENT_REPOSITORY, useValue: mockIngredientRepository },
        {
          provide: PURCHASE_RECORD_REPOSITORY,
          useValue: {
            findByIngredientId: jest.fn(),
            findById: jest.fn(),
            findByPurchaseListId: jest.fn(),
          },
        },
        { provide: GlobalConfigService, useValue: { getGlobalConfig: jest.fn() } },
        {
          provide: ProcurementSkuService,
          useValue: { applyCurrentPurchasePrice: jest.fn() },
        },
        {
          provide: IngredientPriceAnchorService,
          useValue: { resolveAnchors: jest.fn().mockResolvedValue(new Map()) },
        },
        { provide: IngredientCostHistoryService, useValue: { record } },
      ],
    }).compile();

    service = module.get(IngredientPricingService);
  });

  it('写成本与写流水是同一次调用：老价、新价、报销单号都带过去', async () => {
    await (service as any).applyIngredientCost({
      ingredientId: 'i1',
      previousCost: 0.08,
      nextCost: 0.0798,
      reimbursementId: 'r1',
      purchaseRecordId: 'p1',
      note: '报销凭证确认后自动更新',
    });

    expect(update).toHaveBeenCalledWith('i1', {
      currentPricePerPurchaseUnit: 0.0798,
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientId: 'i1',
        oldCost: 0.08,
        newCost: 0.0798,
        source: 'REIMBURSEMENT',
        reimbursementId: 'r1',
        purchaseRecordId: 'p1',
      }),
    );
  });

  it('老记录没有实际克数、且食材换算是 1 时，不猜——返回 0 让这条不参与调价', () => {
    const base = (service as any).resolveActualBaseQuantity(
      { actualQuantity: 2 },
      { purchaseToBaseRatio: 1, type: 'FOOD' },
    );
    expect(base).toBe(0);
  });

  it('补剂/包材（换算不是 1）仍可退回「数量 × 换算」', () => {
    const base = (service as any).resolveActualBaseQuantity(
      { actualQuantity: 2 },
      { purchaseToBaseRatio: 60, type: 'SUPPLEMENT' },
    );
    expect(base).toBe(120);
  });

  it('先写价再写流水：价写失败时不该留下一条假流水', async () => {
    update.mockRejectedValueOnce(new Error('db down'));

    await expect(
      (service as any).applyIngredientCost({
        ingredientId: 'i1',
        previousCost: 0.08,
        nextCost: 0.0798,
        reimbursementId: 'r1',
        purchaseRecordId: null,
        note: null,
      }),
    ).rejects.toThrow('db down');

    expect(record).not.toHaveBeenCalled();
  });
});
