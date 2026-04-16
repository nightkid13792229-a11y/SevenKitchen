import { PackagingService } from '../../../src/domain/packaging/packaging.service';
import { Ingredient } from '../../../src/domain/ingredient';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';
import type { IngredientRepository } from '../../../src/domain/ingredient';

describe('PackagingService package plan pricing', () => {
  const productLabelId = '22831322-3463-49c7-8346-f5cc14277943';
  const icePackId = '1e3d5990-e553-44fb-8bb9-6144593b6899';

  function packagingIngredient(params: {
    id: string;
    name: string;
    productModel: string;
    unitCost: number;
    weightG: number;
    maxCapacityG?: number | null;
  }): Ingredient {
    return new Ingredient(
      params.id,
      params.name,
      IngredientType.PACKAGING,
      IngredientProcurementStrategy.STOCK_REPLENISHMENT,
      false,
      true,
      null,
      params.productModel,
      null,
      null,
      BaseUnit.PCS,
      '个',
      '个',
      1,
      params.unitCost,
      null,
      params.weightG,
      params.maxCapacityG ?? null,
      null,
      null,
      null,
      { is_consumable: true },
      null,
    );
  }

  it('calculates multi-spec package plan bag counts and row aggregates from implementation logic', async () => {
    const vacuumBags = [
      packagingIngredient({
        id: 'bag-10x15',
        name: '食品真空袋',
        productModel: '10x15cm',
        unitCost: 0.05,
        weightG: 1,
      }),
      packagingIngredient({
        id: 'bag-12x17',
        name: '食品真空袋',
        productModel: '12x17cm',
        unitCost: 0.1,
        weightG: 2,
      }),
      packagingIngredient({
        id: 'bag-15x20',
        name: '食品真空袋',
        productModel: '15x20cm',
        unitCost: 0.15,
        weightG: 3,
      }),
      packagingIngredient({
        id: 'bag-20x25',
        name: '食品真空袋',
        productModel: '20x25cm',
        unitCost: 0.2,
        weightG: 4,
      }),
    ];
    const productLabel = packagingIngredient({
      id: productLabelId,
      name: '产品标签',
      productModel: '默认标签',
      unitCost: 0.03,
      weightG: 0.5,
    });
    const foamBox = packagingIngredient({
      id: 'foam-box-4',
      name: '泡沫箱',
      productModel: '4号箱',
      unitCost: 5,
      weightG: 100,
      maxCapacityG: 1000,
    });
    const thermalBag = packagingIngredient({
      id: 'thermal-bag-4',
      name: '铝箔保温袋',
      productModel: '适配4号箱',
      unitCost: 1,
      weightG: 10,
    });
    const icePack = packagingIngredient({
      id: icePackId,
      name: '冰袋',
      productModel: '默认冰袋',
      unitCost: 0.2,
      weightG: 100,
    });
    const ingredients = [
      ...vacuumBags,
      productLabel,
      foamBox,
      thermalBag,
      icePack,
    ];
    const ingredientRepo: Pick<
      IngredientRepository,
      'findById' | 'findByType'
    > = {
      findById: jest.fn(async (id: string) => {
        return ingredients.find((ingredient) => ingredient.id === id) ?? null;
      }),
      findByType: jest.fn(async (type: IngredientType) => {
        return ingredients.filter((ingredient) => ingredient.type === type);
      }),
    };
    const service = new PackagingService(
      ingredientRepo as IngredientRepository,
    );

    const result = await service.calculatePackagingCostForPlan(
      [
        { packageSpecG: 100, packageCount: 2 },
        { packageSpecG: 200, packageCount: 3 },
      ],
      800,
    );

    expect(result.breakdown.perPackConsumables.vacuumBagsCount).toBe(5);
    expect(result.breakdown.perPackConsumables.labelsCount).toBe(5);
    expect(result.breakdown.perPackConsumables.vacuumBagSpec).toContain(
      '100g×2袋',
    );
    expect(result.breakdown.perPackConsumables.vacuumBagSpec).toContain(
      '200g×3袋',
    );
    expect(result.breakdown.perPackConsumables.packageRows).toHaveLength(2);
    const row100 = result.breakdown.perPackConsumables.packageRows?.[0];
    const row200 = result.breakdown.perPackConsumables.packageRows?.[1];

    expect(row100).toMatchObject({
      packageSpecG: 100,
      packageCount: 2,
      vacuumBagSpec: '12x17cm',
      weightG: 5,
    });
    expect(row100?.vacuumBagTotalCost).toBeCloseTo(0.2, 6);
    expect(row100?.labelTotalCost).toBeCloseTo(0.06, 6);
    expect(row100?.totalCost).toBeCloseTo(0.26, 6);

    expect(row200).toMatchObject({
      packageSpecG: 200,
      packageCount: 3,
      vacuumBagSpec: '20x25cm',
      weightG: 13.5,
    });
    expect(row200?.vacuumBagTotalCost).toBeCloseTo(0.6, 6);
    expect(row200?.labelTotalCost).toBeCloseTo(0.09, 6);
    expect(row200?.totalCost).toBeCloseTo(0.69, 6);
    expect(result.breakdown.perPackConsumables.vacuumBagTotalCost).toBeCloseTo(
      0.8,
      6,
    );
    expect(result.breakdown.perPackConsumables.labelTotalCost).toBeCloseTo(
      0.15,
      6,
    );
    expect(result.breakdown.perPackConsumables.totalCost).toBeCloseTo(0.95, 6);
    expect(result.breakdown.perPackConsumables.weightPerPack).toBeCloseTo(
      3.7,
      6,
    );
    expect(result.cost).toBeCloseTo(7.55, 6);
    expect(result.weightG).toBeCloseTo(428.5, 6);
  });
});
