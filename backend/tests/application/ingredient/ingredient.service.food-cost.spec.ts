import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  IngredientService,
  INGREDIENT_REPOSITORY,
} from '../../../src/application/ingredient/ingredient.service';
import { IngredientCostHistoryService } from '../../../src/application/ingredient/ingredient-cost-history.service';
import { Ingredient } from '../../../src/domain/ingredient/ingredient.entity';
import { BaseUnit, IngredientType } from '../../../src/domain/ingredient/enums';

/**
 * 手工改价与食材换算不变量（2026-11-07 成本口径归位 · Task 5）。
 *
 * 两件事：
 *  1. 库存页「改成本」也要留痕，否则历史会漏掉人工改动；
 *  2. 食材的 `purchase_to_base_ratio` 必须恒为 1 —— 它一旦被写成 500，
 *     成本会瞬间变成原来的 1/500，而界面上看不出来。
 */
describe('IngredientService · 食材成本', () => {
  let service: IngredientService;

  const findById = jest.fn();
  const updatePrice = jest.fn();
  const record = jest.fn();

  const buildIngredient = (type: IngredientType = IngredientType.FOOD) =>
    new Ingredient(
      'i1',
      '糙米',
      type,
      'DAILY_PURCHASE' as any,
      false,
      false,
      null,
      null,
      null,
      null,
      BaseUnit.G,
      'g',
      'g',
      1,
      0.0798,
      0.0798,
      null,
      null,
      null,
      null,
      null,
      {} as any,
      null,
      false,
      null,
    );

  beforeEach(async () => {
    jest.resetAllMocks();
    record.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientService,
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: { findById, updatePrice },
        },
        { provide: IngredientCostHistoryService, useValue: { record } },
      ],
    }).compile();

    service = module.get(IngredientService);
  });

  it('手工改价写一条 MANUAL 流水，带操作人', async () => {
    findById.mockResolvedValue(buildIngredient());
    updatePrice.mockResolvedValue(buildIngredient());

    await service.updateIngredientPrice(
      'i1',
      { currentPricePerPurchaseUnit: 0.09 } as any,
      'u1',
    );

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientId: 'i1',
        oldCost: 0.0798,
        newCost: 0.09,
        source: 'MANUAL',
        operatorId: 'u1',
      }),
    );
  });

  it('食材的换算被改成 500 时拒绝保存', async () => {
    findById.mockResolvedValue(buildIngredient());

    await expect(
      service.updateIngredient('i1', { purchaseToBaseRatio: 500 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('手工把成本改成 500 倍会被拒（食材成本是元/克，39.9 这种多半是填成了一件的价）', async () => {
    findById.mockResolvedValue(buildIngredient());

    await expect(
      service.updateIngredientPrice(
        'i1',
        { currentPricePerPurchaseUnit: 39.9 } as any,
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('建档时食材带非 1 的换算会被拒（否则成本会被静默除以 500）', async () => {
    await expect(
      service.createIngredient({
        name: '糙米',
        type: IngredientType.FOOD,
        baseUnit: 'G',
        purchaseToBaseRatio: 500,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('补剂改成别的换算不受这条约束（它们的采购口径本来就挂在原料上）', () => {
    expect(() =>
      (service as any).assertFoodPurchaseRatioInvariant(
        IngredientType.SUPPLEMENT,
        12,
      ),
    ).not.toThrow();
  });
});
