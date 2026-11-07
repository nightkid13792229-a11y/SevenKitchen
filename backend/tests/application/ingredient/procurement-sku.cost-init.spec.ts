import { Test, TestingModule } from '@nestjs/testing';
import { ProcurementSkuService } from '../../../src/application/ingredient/procurement-sku.service';
import { IngredientCostHistoryService } from '../../../src/application/ingredient/ingredient-cost-history.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 建档初始化（2026-11-07 成本口径归位 · Task 3）。
 *
 * 规则只有一条：**只补空，不覆盖**。
 * 成本为 0 的原料，用第一条带价的采购商品算出「元/基准单位」写进去；
 * 已经有成本的，一律不动 —— 否则一次建档操作会悄悄改掉已发布食谱的售价。
 */
describe('ProcurementSkuService · 建档初始化成本', () => {
  let service: ProcurementSkuService;
  const record = jest.fn();

  const updateMany = jest.fn();
  const tx = {
    ingredient: { updateMany },
  } as any;

  beforeEach(async () => {
    jest.resetAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    record.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementSkuService,
        { provide: PrismaService, useValue: {} as any },
        { provide: IngredientCostHistoryService, useValue: { record } },
      ],
    }).compile();

    service = module.get(ProcurementSkuService);
  });

  const run = (price: number | null, ratio: number | null) =>
    (service as any).initializeIngredientCostFromSku(tx, {
      ingredientId: 'i1',
      skuId: 'sku1',
      pricePerPurchaseUnit: price,
      purchaseToBaseRatio: ratio,
    });

  it('成本为 0 时，用「商品价 ÷ 净含量」初始化（39.9 元 / 500g = 0.0798 元/g）', async () => {
    await run(39.9, 500);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', currentPricePerPurchaseUnit: 0 },
      data: { currentPricePerPurchaseUnit: 0.0798, purchaseToBaseRatio: 1 },
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientId: 'i1',
        oldCost: 0,
        newCost: 0.0798,
        source: 'INIT_FROM_SKU',
        procurementSkuId: 'sku1',
      }),
    );
  });

  it('原料已有成本时一律不动（updateMany 命中 0 行就不写流水）', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await run(39.9, 500);

    expect(record).not.toHaveBeenCalled();
  });

  it('商品没填价、或换算不合法时跳过', async () => {
    await run(null, 500);
    await run(0, 500);
    await run(39.9, null);
    await run(39.9, 0);

    expect(updateMany).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('毫升类商品按基准单位折算：120 元 / 1000ml = 0.12 元/ml', async () => {
    await run(120, 1000);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ newCost: 0.12 }),
    );
  });
});
