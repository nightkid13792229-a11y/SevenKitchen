import { SupplementDosageService } from '../../../src/application/supplement-shop/supplement-dosage.service';
import { SupplementCandidateService } from '../../../src/application/supplement-shop/supplement-candidate.service';

function supplement(overrides: Record<string, any> = {}) {
  return {
    id: 'ing-caco3',
    name: '碳酸钙粉',
    type: 'SUPPLEMENT',
    brand: 'NOW FOODS',
    productModel: '600mg钙/1.7克',
    purchaseChannel: '天猫',
    physicalForm: 'POWDER',
    baseUnit: 'G',
    unitDisplayLabel: 'g',
    purchaseUnit: 'g',
    diyEnabled: true,
    supplementRetailEnabled: true,
    equivalencePriority: 0,
    properties: { purchase_link: { platform: 'TAOBAO', url: 'https://example.com' } },
    nutritionProfile: {
      meta: { rawBasisType: 'PER_1_G' },
      minerals: { calcium: 353 },
    },
    ...overrides,
  };
}

function group(members: any[], overrides: Record<string, any> = {}) {
  return {
    id: 'group-calcium',
    code: 'CALCIUM_MINERAL_SALT',
    name: '钙 · 矿物盐',
    status: 'APPROVED',
    isActive: true,
    nutrientKey: 'minerals.calcium',
    nutrientLabel: '钙',
    nutrientUnit: 'mg',
    ingredients: members,
    ...overrides,
  };
}

function recipeItem(overrides: Record<string, any> = {}) {
  return {
    id: 'item-1',
    preparationMethod: '随餐',
    sortOrder: 0,
    supplementTargets: [
      {
        fieldPath: 'minerals.calcium',
        label: '钙',
        unit: 'mg',
        targetValuePerKg: 2192,
      },
    ],
    ...overrides,
  };
}

describe('SupplementCandidateService', () => {
  const dosage = new SupplementDosageService();
  const service = new SupplementCandidateService({} as any, dosage);

  const citrate = supplement({
    id: 'ing-citrate',
    name: '柠檬酸钙粉',
    equivalencePriority: 1,
    productModel: '600mg钙/3克',
    nutritionProfile: {
      meta: { rawBasisType: 'PER_1_G' },
      minerals: { calcium: 210 },
    },
  });

  it('returns all approved group members and marks the source as default', () => {
    const item = service.resolveForRecipeItem({
      recipeItem: recipeItem(),
      ingredient: supplement(),
      group: group([supplement(), citrate]),
      totalWeightG: 3000,
      equivalenceEnabled: true,
      audience: 'CUSTOMER',
    });

    expect(item.source).toBe('EQUIVALENCE_GROUP');
    expect(item.candidates.map((candidate) => candidate.ingredientId)).toEqual([
      'ing-caco3',
      'ing-citrate',
    ]);
    expect(item.candidates[0].isDefault).toBe(true);
    expect(item.candidates[0].dosage.amount).toBeCloseTo(18.629, 3);
    expect(item.candidates[1].dosage.amount).toBeCloseTo(31.314, 3);
    expect(item.unavailableReason).toBeNull();
  });

  it('falls back to the default ingredient when the switch is off', () => {
    const item = service.resolveForRecipeItem({
      recipeItem: recipeItem(),
      ingredient: supplement(),
      group: group([supplement(), citrate]),
      totalWeightG: 3000,
      equivalenceEnabled: false,
      audience: 'CUSTOMER',
    });

    expect(item.source).toBe('DEFAULT_ONLY');
    expect(item.candidates).toHaveLength(1);
    expect(item.candidates[0].isDefault).toBe(true);
  });

  it('does not use an unapproved or singleton group', () => {
    const pending = service.resolveForRecipeItem({
      recipeItem: recipeItem(),
      ingredient: supplement(),
      group: group([supplement(), citrate], { status: 'PENDING_REVIEW' }),
      totalWeightG: 3000,
      equivalenceEnabled: true,
      audience: 'CUSTOMER',
    });
    expect(pending.source).toBe('DEFAULT_ONLY');

    const singleton = service.resolveForRecipeItem({
      recipeItem: recipeItem(),
      ingredient: supplement(),
      group: group([supplement()]),
      totalWeightG: 3000,
      equivalenceEnabled: true,
      audience: 'CUSTOMER',
    });
    expect(singleton.source).toBe('DEFAULT_ONLY');
  });

  it('excludes a production-only source but keeps sellable group members', () => {
    const source = supplement({ supplementRetailEnabled: false });
    const item = service.resolveForRecipeItem({
      recipeItem: recipeItem(),
      ingredient: source,
      group: group([source, citrate]),
      totalWeightG: 3000,
      equivalenceEnabled: true,
      audience: 'CUSTOMER',
    });

    expect(item.candidates.map((candidate) => candidate.ingredientId)).toEqual([
      'ing-citrate',
    ]);
    expect(item.candidates[0].isDefault).toBe(false);
    expect(item.defaultIngredient.selectable).toBe(false);
    expect(item.defaultIngredient.unavailableReason).toBe('未开启对外售卖');
    expect(item.unavailableReason).toBeNull();
  });

  it('excludes members with missing concentration, liquid form or a bad unit', () => {
    const missing = supplement({
      id: 'ing-missing',
      name: '缺浓度',
      nutritionProfile: { meta: { rawBasisType: 'PER_1_G' }, minerals: {} },
    });
    const liquid = supplement({
      id: 'ing-liquid',
      name: '液体钙',
      physicalForm: 'LIQUID',
    });
    const badUnit = supplement({
      id: 'ing-bad-unit',
      name: '片剂钙',
      baseUnit: 'G',
      unitDisplayLabel: '片',
    });

    const item = service.resolveForRecipeItem({
      recipeItem: recipeItem(),
      ingredient: supplement(),
      group: group([
        supplement(),
        citrate,
        missing,
        liquid,
        badUnit,
      ]),
      totalWeightG: 3000,
      equivalenceEnabled: true,
      audience: 'CUSTOMER',
    });

    expect(item.candidates.map((candidate) => candidate.ingredientId)).toEqual([
      'ing-caco3',
      'ing-citrate',
    ]);
  });

  it('shows the fallback copy when every member is unavailable', () => {
    const source = supplement({ supplementRetailEnabled: false });
    const other = supplement({
      id: 'ing-other',
      name: '另一条不可售钙',
      supplementRetailEnabled: false,
    });

    const item = service.resolveForRecipeItem({
      recipeItem: recipeItem(),
      ingredient: source,
      group: group([source, other]),
      totalWeightG: 3000,
      equivalenceEnabled: true,
      audience: 'CUSTOMER',
    });

    expect(item.candidates).toEqual([]);
    expect(item.unavailableReason).toBe('暂时买不到，找 Seven爸爸');
  });

  it('returns the ratio fallback when a supplement has no targets', () => {
    const item = service.resolveForRecipeItem({
      recipeItem: recipeItem({
        supplementTargets: [],
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        ratioPercent: 1,
      }),
      ingredient: supplement(),
      group: null,
      totalWeightG: 3000,
      equivalenceEnabled: true,
      audience: 'CUSTOMER',
    });

    expect(item.fallbackAmount).toBeCloseTo(30, 6);
    expect(item.defaultIngredient.dosage.status).toBe('NO_TARGETS');
    expect(item.candidates).toEqual([]);
  });

  it('never crosses groups', () => {
    const boneMeal = supplement({
      id: 'ing-bone',
      name: '骨粉',
      nutritionProfile: {
        meta: { rawBasisType: 'PER_1_G' },
        minerals: { calcium: 217, phosphorus: 73 },
      },
    });

    const item = service.resolveForRecipeItem({
      recipeItem: recipeItem({
        supplementTargets: [
          {
            fieldPath: 'minerals.calcium',
            label: '钙',
            unit: 'mg',
            targetValuePerKg: 2192,
          },
          {
            fieldPath: 'minerals.phosphorus',
            label: '磷',
            unit: 'mg',
            targetValuePerKg: 1000,
          },
        ],
      }),
      ingredient: supplement(),
      group: group([supplement(), citrate]),
      totalWeightG: 3000,
      equivalenceEnabled: true,
      audience: 'CUSTOMER',
    });

    expect(item.candidates.map((candidate) => candidate.name)).not.toContain(
      boneMeal.name,
    );
  });

  it('supports custom nutrient groups', () => {
    const glucosamine = supplement({
      id: 'ing-glucosamine',
      name: '氨糖胶囊',
      baseUnit: 'PCS',
      unitDisplayLabel: '粒',
      nutritionProfile: {
        meta: { rawBasisType: 'PER_SERVING' },
        customItems: [
          { name: '氨糖', value: 500, unit: 'mg', rawBasisType: 'PER_SERVING' },
        ],
      },
    });

    const item = service.resolveForRecipeItem({
      recipeItem: recipeItem({
        supplementTargets: [
          {
            fieldPath: 'custom:氨糖',
            label: '氨糖',
            unit: 'mg',
            targetValuePerKg: 1000,
          },
        ],
      }),
      ingredient: glucosamine,
      group: group([glucosamine], {
        id: 'group-joint',
        code: 'JOINT_GLUCOSAMINE',
        nutrientKey: 'custom:氨糖',
        nutrientLabel: '氨糖',
        nutrientUnit: 'mg',
      }),
      totalWeightG: 1000,
      equivalenceEnabled: true,
      audience: 'CUSTOMER',
    });

    // 单成员组 → DEFAULT_ONLY，但仍能算出 2 粒
    expect(item.source).toBe('DEFAULT_ONLY');
    expect(item.candidates[0].dosage.amount).toBeCloseTo(2, 6);
  });

  it('returns one item per recipe row even when the ingredient repeats', async () => {
    const prisma = {
      recipe: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'recipe-1',
          items: [
            {
              ...recipeItem(),
              id: 'item-1',
              ingredient: supplement({ equivalenceGroupId: 'group-calcium' }),
            },
            {
              ...recipeItem(),
              id: 'item-2',
              ingredient: supplement({ equivalenceGroupId: 'group-calcium' }),
              sortOrder: 1,
            },
          ],
        }),
      },
      supplementEquivalenceGroup: {
        findMany: jest.fn().mockResolvedValue([group([supplement(), citrate])]),
      },
      supplementShopConfig: {
        findUnique: jest.fn().mockResolvedValue({ equivalenceEnabled: true }),
      },
    };
    const serviceWithPrisma = new SupplementCandidateService(
      prisma as any,
      dosage,
    );

    const result = await serviceWithPrisma.resolveForRecipe({
      recipeBusinessId: 'recipe-1',
      recipeVersion: 1,
      totalWeightG: 3000,
      weightSource: 'QUERY',
      audience: 'CUSTOMER',
    });

    expect(result.items.map((item) => item.recipeItemId)).toEqual([
      'item-1',
      'item-2',
    ]);
    expect(result.items[0].candidates).toHaveLength(2);
    expect(result.items[1].candidates).toHaveLength(2);
  });
});
