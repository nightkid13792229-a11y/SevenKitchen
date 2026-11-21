import { ConflictException, NotFoundException } from '@nestjs/common';
import { SupplementVerificationService } from '../../../src/application/ingredient-creation/supplement-verification.service';
import type {
  SupplementDraftService,
  SupplementDraftView,
} from '../../../src/application/ingredient-creation/supplement-draft.service';
import type { SupplementCatalogService } from '../../../src/application/supplement-shop/supplement-catalog.service';
import type { SupplementDosageService } from '../../../src/application/supplement-shop/supplement-dosage.service';
import {
  emptySupplementDraftPayload,
  type SupplementDraftBasic,
  type SupplementDraftDiy,
  type SupplementDraftEquivalence,
  type SupplementDraftNutrition,
  type SupplementDraftPayload,
  type SupplementDraftProcurement,
  type SupplementDraftRetail,
} from '../../../src/application/ingredient-creation/supplement-draft.types';
import type {
  VerificationFeature,
  VerificationFeatureCode,
  VerificationField,
  SupplementWriteVerification,
} from '../../../src/application/ingredient-creation/supplement-verification';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/* ------------------------------------------------------------------ */
/* 草稿载荷 / 回读行                                                    */
/* ------------------------------------------------------------------ */

interface PayloadPatch {
  basic?: Partial<SupplementDraftBasic>;
  nutrition?: Partial<SupplementDraftNutrition>;
  retail?: Partial<SupplementDraftRetail>;
  diy?: Partial<SupplementDraftDiy>;
  procurement?: Partial<SupplementDraftProcurement>;
  equivalence?: Partial<SupplementDraftEquivalence>;
}

function payload(patch: PayloadPatch = {}): SupplementDraftPayload {
  const empty = emptySupplementDraftPayload();
  return {
    ...empty,
    basic: {
      ...empty.basic,
      name: '鱼油',
      brand: '',
      productModel: '',
      purchaseChannel: '',
      baseUnit: 'PCS',
      unitDisplayLabel: '粒',
      physicalForm: 'CAPSULE',
      servingUnitsPerDose: 2,
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 120,
      currentPricePerPurchaseUnit: 398,
      productionLossRate: 1.05,
      addTiming: 'BEFORE_MIXING',
      ...patch.basic,
    },
    nutrition: {
      ...empty.nutrition,
      servingNutrients: { 'fattyAcids.epa': 650 },
      defaultTargetFields: ['fattyAcids.epa'],
      ...patch.nutrition,
    },
    retail: {
      ...empty.retail,
      enabled: true,
      shelfLifeMonths: 24,
      storageCondition: '避光、密封、阴凉干燥处保存',
      ...patch.retail,
    },
    diy: { ...empty.diy, enabled: false, ...patch.diy },
    procurement: { ...empty.procurement, enabled: true, ...patch.procurement },
    equivalence: {
      ...empty.equivalence,
      groupId: 'group-1',
      priority: null,
      reapproveGroup: true,
      ...patch.equivalence,
    },
  };
}

const COMPLETENESS = { totalRequired: 1, filledRequired: 1, missing: [] };

function draftView(
  overrides: Partial<SupplementDraftView> = {},
): SupplementDraftView {
  return {
    id: 'draft-1',
    createdBy: 'user-1',
    status: 'FINALIZED',
    schemaVersion: 1,
    name: '鱼油',
    payload: payload(),
    aiSnapshot: null,
    manualFields: [],
    verification: null,
    finalizedIngredientId: 'ing-1',
    finalizedNutritionFoodId: 'nf-1',
    finalizedEvidenceId: 'ev-1',
    finalizedAt: new Date('2026-11-21T10:00:00.000Z'),
    createdAt: new Date('2026-11-21T10:00:00.000Z'),
    updatedAt: new Date('2026-11-21T10:00:00.000Z'),
    completeness: COMPLETENESS,
    ...overrides,
  };
}

function ingredientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ing-1',
    name: '鱼油',
    brand: null,
    productModel: null,
    physicalForm: 'CAPSULE',
    diyEnabled: false,
    procurementEnabled: true,
    purchaseUnit: '瓶',
    purchaseToBaseRatio: 120,
    currentPricePerPurchaseUnit: 398,
    equivalenceGroupId: 'group-1',
    equivalencePriority: 0,
    properties: { purchase_link: null },
    nutritionProfile: {
      meta: { rawBasisType: 'PER_SERVING', servingUnitLabel: '粒' },
      fattyAcids: { epa: 325 },
    },
    ...overrides,
  };
}

function catalogItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ing-1',
    name: '鱼油',
    supplementRetailEnabled: true,
    issues: [] as Array<{ code: string; level: string; message: string }>,
    readyToSell: true,
    ...overrides,
  };
}

function okField(
  overrides: Partial<VerificationField> = {},
): VerificationField {
  return {
    key: 'ingredient.name',
    label: '原料名称',
    target: 'ingredient.name',
    expected: '鱼油',
    actual: '鱼油',
    ok: true,
    ...overrides,
  };
}

function storedReport(
  fields: VerificationField[] = [okField()],
): SupplementWriteVerification {
  return {
    ok: fields.every((field) => field.ok),
    checkedAt: '2026-11-21T09:00:00.000Z',
    fields,
    features: [],
  };
}

/* ------------------------------------------------------------------ */
/* mocks                                                               */
/* ------------------------------------------------------------------ */

type PrismaMock = {
  ingredient: { findUnique: jest.Mock; findMany: jest.Mock };
  nutritionFoodMapping: { findFirst: jest.Mock };
  supplementEquivalenceGroup: { findUnique: jest.Mock };
  supplementPackagingRule: { findFirst: jest.Mock };
};

type CatalogMock = { listCatalog: jest.Mock };
type DosageMock = { resolveConcentration: jest.Mock };
type DraftServiceMock = { get: jest.Mock; saveVerification: jest.Mock };

const ids = {
  ingredientId: 'ing-1',
  nutritionFoodId: 'nf-1',
  evidenceId: 'ev-1',
};

async function captureError(run: () => Promise<unknown>): Promise<any> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('预期抛错，但调用成功了');
}

function featureOf(
  features: VerificationFeature[],
  code: VerificationFeatureCode,
): VerificationFeature {
  const found = features.find((feature) => feature.code === code);
  if (!found) {
    throw new Error(`缺少功能核验项 ${code}`);
  }
  return found;
}

describe('SupplementVerificationService', () => {
  let prismaMock: PrismaMock;
  let catalogMock: CatalogMock;
  let dosageMock: DosageMock;
  let draftServiceMock: DraftServiceMock;
  let service: SupplementVerificationService;

  beforeEach(() => {
    prismaMock = {
      ingredient: {
        findUnique: jest.fn().mockResolvedValue(ingredientRow()),
        findMany: jest.fn().mockResolvedValue([{ id: 'ing-1' }]),
      },
      nutritionFoodMapping: {
        findFirst: jest.fn().mockResolvedValue({
          isPrimary: true,
          nutritionFood: {
            status: 'VERIFIED',
            defaultSupplementTargets: [{ fieldPath: 'fattyAcids.epa' }],
          },
        }),
      },
      supplementEquivalenceGroup: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'APPROVED',
          isActive: true,
          _count: { ingredients: 2 },
        }),
      },
      supplementPackagingRule: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pack-1' }),
      },
    };
    catalogMock = {
      listCatalog: jest.fn().mockResolvedValue({
        summary: {},
        items: [catalogItem()],
      }),
    };
    dosageMock = {
      resolveConcentration: jest
        .fn()
        .mockReturnValue({ status: 'OK', value: 325, unit: 'mg' }),
    };
    draftServiceMock = {
      get: jest.fn().mockResolvedValue(draftView()),
      saveVerification: jest.fn().mockResolvedValue(undefined),
    };

    service = new SupplementVerificationService(
      prismaMock as unknown as PrismaService,
      catalogMock as unknown as SupplementCatalogService,
      dosageMock as unknown as SupplementDosageService,
      draftServiceMock as unknown as SupplementDraftService,
    );
  });

  /* ---------------------------------------------------------------- */
  /* RETAIL                                                           */
  /* ---------------------------------------------------------------- */

  describe('RETAIL（商城上架）', () => {
    it('上架清单能查到、开关一致、无 ERROR → 通过', async () => {
      const features = await service.verifyFeatures(draftView(), ids);
      const retail = featureOf(features, 'RETAIL');

      expect(retail.ok).toBe(true);
      expect(retail.severity).toBe('INFO');
      expect(catalogMock.listCatalog).toHaveBeenCalledTimes(1);
    });

    it('上架清单里查不到这条原料 → 失败', async () => {
      catalogMock.listCatalog.mockResolvedValue({ summary: {}, items: [] });

      const retail = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'RETAIL',
      );

      expect(retail.ok).toBe(false);
      expect(retail.severity).toBe('ERROR');
      expect(retail.detail).toContain('查不到');
    });

    it('上架开关与草稿不一致 → 失败', async () => {
      catalogMock.listCatalog.mockResolvedValue({
        summary: {},
        items: [catalogItem({ supplementRetailEnabled: false })],
      });

      const retail = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'RETAIL',
      );

      expect(retail.ok).toBe(false);
      expect(retail.severity).toBe('ERROR');
      expect(retail.detail).toContain('开关');
    });

    it('上架清单有 ERROR 体检项 → 失败', async () => {
      catalogMock.listCatalog.mockResolvedValue({
        summary: {},
        items: [
          catalogItem({
            readyToSell: false,
            issues: [
              { code: 'NO_PRICE', level: 'ERROR', message: '缺少进货价' },
            ],
          }),
        ],
      });

      const retail = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'RETAIL',
      );

      expect(retail.ok).toBe(false);
      expect(retail.severity).toBe('ERROR');
      expect(retail.detail).toContain('缺少进货价');
    });

    it('上架=关时不受体检项影响，只核对开关', async () => {
      catalogMock.listCatalog.mockResolvedValue({
        summary: {},
        items: [
          catalogItem({
            supplementRetailEnabled: false,
            readyToSell: false,
            issues: [
              { code: 'NO_PRICE', level: 'ERROR', message: '缺少进货价' },
            ],
          }),
        ],
      });

      const retail = featureOf(
        await service.verifyFeatures(
          draftView({ payload: payload({ retail: { enabled: false } }) }),
          ids,
        ),
        'RETAIL',
      );

      expect(retail.ok).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /* RECIPE                                                           */
  /* ---------------------------------------------------------------- */

  describe('RECIPE（配方可选）', () => {
    it('主映射 + 营养档案 VERIFIED + 默认目标非空 → 通过', async () => {
      const recipe = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'RECIPE',
      );

      expect(recipe.ok).toBe(true);
      expect(recipe.severity).toBe('INFO');
      expect(prismaMock.nutritionFoodMapping.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            nutritionFoodId: 'nf-1',
            ingredientId: 'ing-1',
            isPrimary: true,
            nutritionFood: { status: 'VERIFIED' },
          },
        }),
      );
    });

    it('没有主映射或营养档案未 VERIFIED → 失败', async () => {
      prismaMock.nutritionFoodMapping.findFirst.mockResolvedValue(null);

      const recipe = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'RECIPE',
      );

      expect(recipe.ok).toBe(false);
      expect(recipe.severity).toBe('ERROR');
      expect(recipe.detail).toContain('主映射');
    });

    it('默认目标营养素为空 → 失败', async () => {
      prismaMock.nutritionFoodMapping.findFirst.mockResolvedValue({
        isPrimary: true,
        nutritionFood: { status: 'VERIFIED', defaultSupplementTargets: [] },
      });

      const recipe = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'RECIPE',
      );

      expect(recipe.ok).toBe(false);
      expect(recipe.severity).toBe('ERROR');
      expect(recipe.detail).toContain('默认目标');
    });
  });

  /* ---------------------------------------------------------------- */
  /* DIY                                                              */
  /* ---------------------------------------------------------------- */

  describe('DIY（推荐）', () => {
    it('开关一致且未开启 → 通过', async () => {
      const diy = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'DIY',
      );

      expect(diy.ok).toBe(true);
      expect(diy.severity).toBe('INFO');
    });

    it('开启且有购买链接 → 通过', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({
          diyEnabled: true,
          properties: {
            purchase_link: {
              platform: 'iHerb',
              url: 'https://example.com/oil',
            },
          },
        }),
      );

      const diy = featureOf(
        await service.verifyFeatures(
          draftView({ payload: payload({ diy: { enabled: true } }) }),
          ids,
        ),
        'DIY',
      );

      expect(diy.ok).toBe(true);
    });

    it('开启但购买链接缺失 → 失败', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({
          diyEnabled: true,
          properties: { purchase_link: { platform: 'iHerb', url: null } },
        }),
      );

      const diy = featureOf(
        await service.verifyFeatures(
          draftView({ payload: payload({ diy: { enabled: true } }) }),
          ids,
        ),
        'DIY',
      );

      expect(diy.ok).toBe(false);
      expect(diy.severity).toBe('ERROR');
      expect(diy.detail).toContain('购买链接');
    });

    it('DIY 开关与草稿不一致 → 失败', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({ diyEnabled: true }),
      );

      const diy = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'DIY',
      );

      expect(diy.ok).toBe(false);
      expect(diy.severity).toBe('ERROR');
      expect(diy.detail).toContain('开关');
    });
  });

  /* ---------------------------------------------------------------- */
  /* PROCUREMENT                                                      */
  /* ---------------------------------------------------------------- */

  describe('PROCUREMENT（生产采购）', () => {
    it('开关一致且采购单位/倍数/价格可用 → 通过', async () => {
      const procurement = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'PROCUREMENT',
      );

      expect(procurement.ok).toBe(true);
      expect(procurement.severity).toBe('INFO');
    });

    it('开启但换算倍数为 0 → 失败', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({ purchaseToBaseRatio: 0 }),
      );

      const procurement = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'PROCUREMENT',
      );

      expect(procurement.ok).toBe(false);
      expect(procurement.severity).toBe('ERROR');
      expect(procurement.detail).toContain('换算倍数');
    });

    it('开启但采购价为 0 → 失败', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({ currentPricePerPurchaseUnit: 0 }),
      );

      const procurement = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'PROCUREMENT',
      );

      expect(procurement.ok).toBe(false);
      expect(procurement.severity).toBe('ERROR');
      expect(procurement.detail).toContain('采购价');
    });

    it('采购开关与草稿不一致 → 失败', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({ procurementEnabled: false }),
      );

      const procurement = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'PROCUREMENT',
      );

      expect(procurement.ok).toBe(false);
      expect(procurement.severity).toBe('ERROR');
    });
  });

  /* ---------------------------------------------------------------- */
  /* EQUIVALENCE                                                      */
  /* ---------------------------------------------------------------- */

  describe('EQUIVALENCE（等价替换）', () => {
    it('组/优先级一致、组 APPROVED、成员 ≥2、浓度可解析 → 通过', async () => {
      const equivalence = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'EQUIVALENCE',
      );

      expect(equivalence.ok).toBe(true);
      expect(equivalence.severity).toBe('INFO');
      expect(dosageMock.resolveConcentration).toHaveBeenCalled();
    });

    it('组未审核通过 → 提醒（WARN），不算整体失败', async () => {
      prismaMock.supplementEquivalenceGroup.findUnique.mockResolvedValue({
        status: 'DRAFT',
        isActive: true,
        _count: { ingredients: 2 },
      });

      const equivalence = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'EQUIVALENCE',
      );

      expect(equivalence.ok).toBe(false);
      expect(equivalence.severity).toBe('WARN');
      expect(equivalence.detail).toContain('暂不参与');
    });

    it('组内只有 1 个成员 → 提醒（WARN）', async () => {
      prismaMock.supplementEquivalenceGroup.findUnique.mockResolvedValue({
        status: 'APPROVED',
        isActive: true,
        _count: { ingredients: 1 },
      });

      const equivalence = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'EQUIVALENCE',
      );

      expect(equivalence.ok).toBe(false);
      expect(equivalence.severity).toBe('WARN');
      expect(equivalence.detail).toContain('成员');
    });

    it('浓度解析 UNIT_MISMATCH → 提醒（WARN）', async () => {
      dosageMock.resolveConcentration.mockReturnValue({
        status: 'UNIT_MISMATCH',
        actualUnit: 'g',
        reason: 'UNIT_LABEL',
      });

      const equivalence = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'EQUIVALENCE',
      );

      expect(equivalence.ok).toBe(false);
      expect(equivalence.severity).toBe('WARN');
      expect(equivalence.detail).toContain('浓度');
    });

    it('组不存在 → 失败（ERROR）', async () => {
      prismaMock.supplementEquivalenceGroup.findUnique.mockResolvedValue(null);

      const equivalence = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'EQUIVALENCE',
      );

      expect(equivalence.ok).toBe(false);
      expect(equivalence.severity).toBe('ERROR');
      expect(equivalence.detail).toContain('不存在');
    });

    it('档案里的等价组与草稿不一致 → 失败（ERROR）', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({ equivalenceGroupId: 'group-2' }),
      );

      const equivalence = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'EQUIVALENCE',
      );

      expect(equivalence.ok).toBe(false);
      expect(equivalence.severity).toBe('ERROR');
      expect(equivalence.detail).toContain('等价组');
    });

    it('草稿指定了组内排序但档案不一致 → 失败（ERROR）', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({ equivalencePriority: 1 }),
      );

      const equivalence = featureOf(
        await service.verifyFeatures(
          draftView({ payload: payload({ equivalence: { priority: 3 } }) }),
          ids,
        ),
        'EQUIVALENCE',
      );

      expect(equivalence.ok).toBe(false);
      expect(equivalence.severity).toBe('ERROR');
      expect(equivalence.detail).toContain('排序');
    });

    it('明确选「暂不归组」且档案没归组 → 通过，不查组', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({ equivalenceGroupId: null, equivalencePriority: 0 }),
      );

      const equivalence = featureOf(
        await service.verifyFeatures(
          draftView({
            payload: payload({ equivalence: { groupId: '__SKIP__' } }),
          }),
          ids,
        ),
        'EQUIVALENCE',
      );

      expect(equivalence.ok).toBe(true);
      expect(
        prismaMock.supplementEquivalenceGroup.findUnique,
      ).not.toHaveBeenCalled();
      expect(dosageMock.resolveConcentration).not.toHaveBeenCalled();
    });

    it('草稿选「暂不归组」但档案已归组 → 失败（ERROR）', async () => {
      const equivalence = featureOf(
        await service.verifyFeatures(
          draftView({
            payload: payload({ equivalence: { groupId: '__SKIP__' } }),
          }),
          ids,
        ),
        'EQUIVALENCE',
      );

      expect(equivalence.ok).toBe(false);
      expect(equivalence.severity).toBe('ERROR');
    });
  });

  /* ---------------------------------------------------------------- */
  /* DUPLICATE                                                        */
  /* ---------------------------------------------------------------- */

  describe('DUPLICATE（无重复）', () => {
    it('同名同品牌同规格只有一条 → 通过', async () => {
      const duplicate = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'DUPLICATE',
      );

      expect(duplicate.ok).toBe(true);
      expect(duplicate.severity).toBe('INFO');
      expect(prismaMock.ingredient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: 'SUPPLEMENT',
            name: '鱼油',
            brand: null,
            productModel: null,
          },
        }),
      );
    });

    it('出现第二条同名同品牌同规格 → 失败（ERROR）', async () => {
      prismaMock.ingredient.findMany.mockResolvedValue([
        { id: 'ing-1' },
        { id: 'ing-2' },
      ]);

      const duplicate = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'DUPLICATE',
      );

      expect(duplicate.ok).toBe(false);
      expect(duplicate.severity).toBe('ERROR');
      expect(duplicate.detail).toContain('2');
    });
  });

  /* ---------------------------------------------------------------- */
  /* PACKAGING                                                        */
  /* ---------------------------------------------------------------- */

  describe('PACKAGING（分装包材）', () => {
    it('能匹配到启用的 POUCH 规则 → 通过', async () => {
      const packaging = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'PACKAGING',
      );

      expect(packaging.ok).toBe(true);
      expect(packaging.severity).toBe('INFO');
      expect(prismaMock.supplementPackagingRule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: 'POUCH',
            enabled: true,
            OR: [{ physicalForm: null }, { physicalForm: 'CAPSULE' }],
          }),
        }),
      );
    });

    it('没有匹配的袋型规则 → WARN + 包材页入口，且不拖垮整体核验', async () => {
      prismaMock.supplementPackagingRule.findFirst.mockResolvedValue(null);
      draftServiceMock.get.mockResolvedValue(
        draftView({
          verification:
            storedReport() as unknown as SupplementDraftView['verification'],
        }),
      );

      const verification = await service.reverify('user-1', 'draft-1');

      const packaging = featureOf(verification.features, 'PACKAGING');
      expect(packaging.ok).toBe(false);
      expect(packaging.severity).toBe('WARN');
      expect(packaging.action).toEqual({
        label: expect.any(String),
        path: '/supplement-shop/packaging',
      });
      expect(verification.ok).toBe(true);
    });

    it('原料没填物理形态时按「任意形态」匹配（physicalForm=null 规则）', async () => {
      prismaMock.ingredient.findUnique.mockResolvedValue(
        ingredientRow({ physicalForm: null }),
      );

      const packaging = featureOf(
        await service.verifyFeatures(draftView(), ids),
        'PACKAGING',
      );

      expect(packaging.ok).toBe(true);
      expect(prismaMock.supplementPackagingRule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: 'POUCH',
            enabled: true,
            OR: [{ physicalForm: null }],
          }),
        }),
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /* 整体 ok 口径 + getVerification + reverify                         */
  /* ---------------------------------------------------------------- */

  describe('整体核验报告', () => {
    it('只有 WARN 失败时 verification.ok 仍为 true', async () => {
      // 默认其它功能全部通过；包材规则缺失只算提醒。
      prismaMock.supplementPackagingRule.findFirst.mockResolvedValue(null);
      draftServiceMock.get.mockResolvedValue(
        draftView({
          verification:
            storedReport() as unknown as SupplementDraftView['verification'],
        }),
      );

      const verification = await service.reverify('user-1', 'draft-1');

      expect(verification.ok).toBe(true);
      expect(verification.features.some((feature) => !feature.ok)).toBe(true);
    });

    it('任一 ERROR 功能失败时 verification.ok 为 false', async () => {
      catalogMock.listCatalog.mockResolvedValue({ summary: {}, items: [] });
      draftServiceMock.get.mockResolvedValue(
        draftView({
          verification:
            storedReport() as unknown as SupplementDraftView['verification'],
        }),
      );

      const verification = await service.reverify('user-1', 'draft-1');

      expect(verification.ok).toBe(false);
      expect(featureOf(verification.features, 'RETAIL').severity).toBe('ERROR');
      expect(draftServiceMock.saveVerification).toHaveBeenCalledWith(
        'draft-1',
        'user-1',
        verification,
      );
    });

    it('直接字段有一项不通过时 verification.ok 为 false', async () => {
      draftServiceMock.get.mockResolvedValue(
        draftView({
          verification: storedReport([
            okField({ ok: false, actual: '鱼油（旧）' }),
          ]) as unknown as SupplementDraftView['verification'],
        }),
      );

      const verification = await service.reverify('user-1', 'draft-1');

      expect(verification.ok).toBe(false);
      expect(verification.fields).toHaveLength(1);
    });

    it('getVerification 返回已存的核验报告', async () => {
      const stored = storedReport();
      draftServiceMock.get.mockResolvedValue(
        draftView({
          verification:
            stored as unknown as SupplementDraftView['verification'],
        }),
      );

      await expect(
        service.getVerification('user-1', 'draft-1'),
      ).resolves.toEqual(stored);
      expect(draftServiceMock.get).toHaveBeenCalledWith('draft-1', 'user-1');
    });

    it('草稿还没写入时 getVerification 返回 null（没有报告）', async () => {
      draftServiceMock.get.mockResolvedValue(
        draftView({ status: 'DRAFT', verification: null }),
      );

      await expect(
        service.getVerification('user-1', 'draft-1'),
      ).resolves.toBeNull();
    });

    it('已写入但报告缺失时 getVerification 返回 null，不伪造成功', async () => {
      draftServiceMock.get.mockResolvedValue(
        draftView({ status: 'FINALIZED', verification: null }),
      );

      await expect(
        service.getVerification('user-1', 'draft-1'),
      ).resolves.toBeNull();
    });

    it('reverify 只重跑功能核验：合并已存直接字段、保存并返回新报告', async () => {
      const stored = storedReport();
      draftServiceMock.get.mockResolvedValue(
        draftView({
          verification:
            stored as unknown as SupplementDraftView['verification'],
        }),
      );

      const verification = await service.reverify('user-1', 'draft-1');

      expect(verification.fields).toEqual(stored.fields);
      expect(verification.checkedAt).not.toBe(stored.checkedAt);
      expect(verification.features).toHaveLength(7);
      expect(draftServiceMock.saveVerification).toHaveBeenCalledWith(
        'draft-1',
        'user-1',
        verification,
      );
    });

    it('reverify 对还没写入的草稿返回 409', async () => {
      draftServiceMock.get.mockResolvedValue(
        draftView({ status: 'DRAFT', verification: null }),
      );

      const error = await captureError(() =>
        service.reverify('user-1', 'draft-1'),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(prismaMock.ingredient.findUnique).not.toHaveBeenCalled();
      expect(draftServiceMock.saveVerification).not.toHaveBeenCalled();
    });

    it('reverify 对不存在/不属于本人的草稿返回 404', async () => {
      draftServiceMock.get.mockRejectedValue(
        new NotFoundException('草稿不存在'),
      );

      const error = await captureError(() =>
        service.reverify('user-1', 'draft-1'),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(draftServiceMock.saveVerification).not.toHaveBeenCalled();
    });
  });
});
