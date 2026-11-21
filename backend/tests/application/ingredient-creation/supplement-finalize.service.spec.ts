import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { findNutritionField } from '../../../src/domain/ingredient/nutrition-field-catalog';
import { SupplementFinalizeService } from '../../../src/application/ingredient-creation/supplement-finalize.service';
import type { SupplementDraftReviewService } from '../../../src/application/ingredient-creation/supplement-draft-review.service';
import type {
  SupplementDraftService,
  SupplementDraftView,
} from '../../../src/application/ingredient-creation/supplement-draft.service';
import type { SupplementIngredientService } from '../../../src/application/ingredient-creation/supplement-ingredient.service';
import type { SupplementEquivalenceService } from '../../../src/application/supplement-shop/supplement-equivalence.service';
import {
  emptySupplementDraftPayload,
  type SupplementDraftBasic,
  type SupplementDraftEquivalence,
  type SupplementDraftLabel,
  type SupplementDraftNutrition,
  type SupplementDraftPayload,
  type SupplementDraftRetail,
  type SupplementDraftReview,
} from '../../../src/application/ingredient-creation/supplement-draft.types';
import type { SupplementDraftIssue } from '../../../src/application/ingredient-creation/supplement-draft-validation';
import type { SupplementWriteVerification } from '../../../src/application/ingredient-creation/supplement-verification';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/* ------------------------------------------------------------------ */
/* 草稿载荷                                                            */
/* ------------------------------------------------------------------ */

interface DraftPatch {
  basic?: Partial<SupplementDraftBasic>;
  nutrition?: Partial<SupplementDraftNutrition>;
  label?: Partial<SupplementDraftLabel>;
  retail?: Partial<SupplementDraftRetail>;
  equivalence?: Partial<SupplementDraftEquivalence>;
  review?: Partial<SupplementDraftReview>;
}

function validPayload(patch: DraftPatch = {}): SupplementDraftPayload {
  const empty = emptySupplementDraftPayload();
  return {
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
      labelText: '',
      ...patch.nutrition,
    },
    label: {
      ...empty.label,
      labelCategory: 'FEED_ADDITIVE',
      labelNames: ['鱼油'],
      tagNames: ['油脂类'],
      labelNameSource: '',
      ...patch.label,
    },
    retail: {
      ...empty.retail,
      enabled: true,
      shelfLifeMonths: 24,
      openedShelfLifeDays: null,
      storageCondition: '避光、密封、阴凉干燥处保存',
      isOilBased: false,
      noSaleReason: null,
      ...patch.retail,
    },
    diy: {
      ...empty.diy,
      enabled: false,
      platform: '',
      linkUrl: '',
      imageUrl: '',
    },
    procurement: { enabled: true },
    equivalence: {
      ...empty.equivalence,
      groupId: 'group-1',
      priority: null,
      reapproveGroup: true,
      ...patch.equivalence,
    },
    evidence: {
      ...empty.evidence,
      frontImageUrl: 'https://example.com/front.jpg',
      labelImageUrl: 'https://example.com/label.jpg',
      productUrl: '',
      selectionNote: '',
    },
    review: { acknowledgedWarnings: [], ...patch.review },
  };
}

const COMPLETENESS = { totalRequired: 10, filledRequired: 10, missing: [] };

function draftView(
  overrides: Partial<SupplementDraftView> = {},
): SupplementDraftView {
  return {
    id: 'draft-1',
    createdBy: 'user-1',
    status: 'DRAFT',
    schemaVersion: 1,
    name: '鱼油',
    payload: validPayload(),
    aiSnapshot: { summary: 'AI 原始提案' },
    manualFields: ['basic.name'],
    verification: null,
    finalizedIngredientId: null,
    finalizedNutritionFoodId: null,
    finalizedEvidenceId: null,
    finalizedAt: null,
    createdAt: new Date('2026-11-21T10:00:00.000Z'),
    updatedAt: new Date('2026-11-21T10:00:00.000Z'),
    completeness: COMPLETENESS,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* 事务 mock                                                           */
/* ------------------------------------------------------------------ */

const EPA_FIELD = findNutritionField('fattyAcids.epa');

function profile() {
  return {
    meta: { rawBasisType: 'PER_SERVING', servingUnitLabel: '粒' },
    fattyAcids: { epa: 325 },
  };
}

function conversionSnapshot() {
  return {
    servingUnitsPerDose: 2,
    servingNutrients: { 'fattyAcids.epa': 650 },
    perUnitNutrients: { 'fattyAcids.epa': 325 },
    unitDisplayLabel: '粒',
  };
}

function ingredientRow() {
  return {
    name: '鱼油',
    brand: null,
    productModel: null,
    purchaseChannel: null,
    baseUnit: 'PCS',
    unitDisplayLabel: '粒',
    physicalForm: 'CAPSULE',
    purchaseUnit: '瓶',
    purchaseToBaseRatio: 120,
    currentPricePerPurchaseUnit: 398,
    diyEnabled: false,
    procurementEnabled: true,
    shelfLifeMonths: 24,
    openedShelfLifeDays: null,
    storageCondition: '避光、密封、阴凉干燥处保存',
    isOilBased: false,
    supplementRetailEnabled: true,
    equivalenceGroupId: 'group-1',
    equivalencePriority: 1,
    properties: {
      category_type: 'OTHER',
      display_unit: '粒',
      serving_unit_label: '粒',
      serving_units_per_dose: 2,
      add_timing: 'BEFORE_MIXING',
      production_loss_rate: 1.05,
      label_category: 'FEED_ADDITIVE',
      label_names: ['鱼油'],
      label_name_source: null,
      tags: ['油脂类'],
    },
    nutritionProfile: profile(),
  };
}

function nutritionFoodRow() {
  return {
    status: 'VERIFIED',
    category: 'SUPPLEMENT',
    nutritionData: profile(),
    defaultSupplementTargets: [
      {
        fieldPath: 'fattyAcids.epa',
        label: EPA_FIELD?.label ?? null,
        unit: EPA_FIELD?.unit ?? null,
      },
    ],
  };
}

function evidenceRow() {
  return {
    productUrl: null,
    frontImageUrl: 'https://example.com/front.jpg',
    labelImageUrl: 'https://example.com/label.jpg',
    labelText: null,
    servingUnitsPerDose: 2,
    conversionSnapshot: conversionSnapshot(),
  };
}

type Tx = {
  ingredient: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  nutritionFood: { findUnique: jest.Mock };
  nutritionFoodMapping: { findFirst: jest.Mock };
  supplementLabelEvidence: { findUnique: jest.Mock };
  ingredientTagAssignment: { findMany: jest.Mock };
  supplementEquivalenceGroup: { findUnique: jest.Mock };
  supplementCreationDraft: { findUnique: jest.Mock };
  ingredientCreationAudit: { create: jest.Mock };
};

function createTx(): Tx {
  return {
    ingredient: {
      findUnique: jest.fn().mockResolvedValue(ingredientRow()),
      // 组内现有成员：最大优先级 0 → 新成员排到 1。
      findMany: jest.fn().mockResolvedValue([{ equivalencePriority: 0 }]),
      update: jest.fn().mockResolvedValue({}),
    },
    nutritionFood: {
      findUnique: jest.fn().mockResolvedValue(nutritionFoodRow()),
    },
    nutritionFoodMapping: {
      findFirst: jest.fn().mockResolvedValue({ isPrimary: true, yieldRate: 1 }),
    },
    supplementLabelEvidence: {
      findUnique: jest.fn().mockResolvedValue(evidenceRow()),
    },
    ingredientTagAssignment: {
      findMany: jest.fn().mockResolvedValue([{ tag: { name: '油脂类' } }]),
    },
    supplementEquivalenceGroup: {
      // 第一次：归组前状态（DRAFT）；第二次：回读状态（一并审核通过 → APPROVED）。
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ status: 'DRAFT' })
        .mockResolvedValueOnce({ status: 'APPROVED' }),
    },
    supplementCreationDraft: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'FINALIZED',
        finalizedIngredientId: 'ing-1',
        finalizedNutritionFoodId: 'nf-1',
        finalizedEvidenceId: 'ev-1',
      }),
    },
    ingredientCreationAudit: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
}

type PrismaMock = {
  $transaction: jest.Mock;
  ingredient: { findFirst: jest.Mock };
};

type DraftServiceMock = {
  get: jest.Mock;
  markFinalized: jest.Mock;
  saveVerification: jest.Mock;
};

type ReviewServiceMock = { validate: jest.Mock };
type IngredientServiceMock = { createInTransaction: jest.Mock };
type EquivalenceMock = { assignInTransaction: jest.Mock };

async function captureError(run: () => Promise<unknown>): Promise<any> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('预期抛错，但调用成功了');
}

const user = { id: 'user-1', name: '管理员' };

describe('SupplementFinalizeService.finalize', () => {
  let tx: Tx;
  let prisma: PrismaService;
  let prismaMock: PrismaMock;
  let draftServiceMock: DraftServiceMock;
  let reviewServiceMock: ReviewServiceMock;
  let ingredientServiceMock: IngredientServiceMock;
  let equivalenceMock: EquivalenceMock;
  let service: SupplementFinalizeService;

  /** 让 get / validate 都看到同一份草稿（真实链路里 validate 会重新读一次）。 */
  function useDraft(draft: SupplementDraftView): void {
    draftServiceMock.get.mockResolvedValue(draft);
    reviewServiceMock.validate.mockResolvedValue({
      draft,
      blockers: [],
      warnings: [],
      completeness: draft.completeness,
    });
  }

  beforeEach(() => {
    tx = createTx();
    prismaMock = {
      $transaction: jest.fn(async (fn: (client: Tx) => Promise<unknown>) =>
        fn(tx),
      ),
      ingredient: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma = prismaMock as unknown as PrismaService;

    draftServiceMock = {
      get: jest.fn().mockResolvedValue(draftView()),
      markFinalized: jest.fn().mockResolvedValue(undefined),
      saveVerification: jest.fn().mockResolvedValue(undefined),
    };
    reviewServiceMock = {
      validate: jest.fn().mockResolvedValue({
        draft: draftView(),
        blockers: [],
        warnings: [],
        completeness: COMPLETENESS,
      }),
    };
    ingredientServiceMock = {
      createInTransaction: jest.fn().mockResolvedValue({
        ingredientId: 'ing-1',
        nutritionFoodId: 'nf-1',
        nutritionFoodStatus: 'VERIFIED',
        evidenceId: 'ev-1',
      }),
    };
    equivalenceMock = {
      assignInTransaction: jest
        .fn()
        .mockResolvedValue({ moved: 1, skipped: 0 }),
    };

    service = new SupplementFinalizeService(
      prisma,
      draftServiceMock as unknown as SupplementDraftService,
      reviewServiceMock as unknown as SupplementDraftReviewService,
      ingredientServiceMock as unknown as SupplementIngredientService,
      equivalenceMock as unknown as SupplementEquivalenceService,
    );
  });

  it('有阻断项时返回 400，且一个事务都不开', async () => {
    const blocker: SupplementDraftIssue = {
      code: 'NAME_REQUIRED',
      level: 'BLOCKER',
      message: '请填写原料名称',
    };
    reviewServiceMock.validate.mockResolvedValue({
      draft: draftView(),
      blockers: [blocker],
      warnings: [],
      completeness: COMPLETENESS,
    });

    const error = await captureError(() => service.finalize(user, 'draft-1'));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      blockers: [blocker],
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(ingredientServiceMock.createInTransaction).not.toHaveBeenCalled();
  });

  it('提醒项没确认时返回 400，确认过才继续', async () => {
    const warning: SupplementDraftIssue = {
      code: 'EVIDENCE_MISSING',
      level: 'WARNING',
      message: '建议补一张商品正面图',
      ackKey: 'EVIDENCE_MISSING:front',
    };

    // ① 没确认 → 400
    reviewServiceMock.validate.mockResolvedValue({
      draft: draftView(),
      blockers: [],
      warnings: [warning],
      completeness: COMPLETENESS,
    });
    const error = await captureError(() => service.finalize(user, 'draft-1'));
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      warnings: [warning],
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();

    // ② 按 ackKey 确认过 → 正常写入
    const acknowledgedDraft = draftView({
      payload: validPayload({
        review: {
          acknowledgedWarnings: [
            { code: 'EVIDENCE_MISSING', paramsHash: 'front' },
          ],
        },
      }),
    });
    useDraft(acknowledgedDraft);
    reviewServiceMock.validate.mockResolvedValue({
      draft: acknowledgedDraft,
      blockers: [],
      warnings: [warning],
      completeness: COMPLETENESS,
    });

    const result = await service.finalize(user, 'draft-1');
    expect(result.verification.ok).toBe(true);
  });

  it('AI 自己造的 warnings 不参与门禁', async () => {
    useDraft(
      draftView({
        aiSnapshot: {
          warnings: [{ code: 'AI_INVENTED', message: 'AI 自己加的提醒' }],
        },
      }),
    );

    const result = await service.finalize(user, 'draft-1');

    expect(result.verification.ok).toBe(true);
    expect(reviewServiceMock.validate).toHaveBeenCalledTimes(1);
  });

  it('成功时：一次事务内建档、归组、置最终态、写审计、回读核验，提交后存报告', async () => {
    const result = await service.finalize(user, 'draft-1');

    // ① 建档只调一次，入参里没有客户端/草稿折算的每粒值。
    expect(ingredientServiceMock.createInTransaction).toHaveBeenCalledTimes(1);
    const [txArg, input] =
      ingredientServiceMock.createInTransaction.mock.calls[0];
    expect(txArg).toBe(tx);
    expect(input).not.toHaveProperty('perUnitNutrients');
    expect(input).toMatchObject({
      name: '鱼油',
      brand: null,
      productModel: null,
      purchaseChannel: null,
      baseUnit: 'PCS',
      unitDisplayLabel: '粒',
      physicalForm: 'CAPSULE',
      servingUnitsPerDose: 2,
      servingNutrients: { 'fattyAcids.epa': 650 },
      defaultTargetFields: ['fattyAcids.epa'],
      procurementEnabled: true,
      diyEnabled: false,
      supplementRetailEnabled: true,
      shelfLifeMonths: 24,
      storageCondition: '避光、密封、阴凉干燥处保存',
      noSaleReason: null,
      purchaseLink: null,
      imageUrl: null,
      createdBy: 'user-1',
    });

    // ② 归组走事务版，并默认「一并通过审核」。
    expect(equivalenceMock.assignInTransaction).toHaveBeenCalledWith(
      tx,
      ['ing-1'],
      'group-1',
      { id: 'user-1', name: '管理员' },
      { reapprove: true },
    );

    // ③ 草稿置最终态 + 写入审计（AI 提案 + 人改字段的值）。
    expect(draftServiceMock.markFinalized).toHaveBeenCalledWith(tx, 'draft-1', {
      ingredientId: 'ing-1',
      nutritionFoodId: 'nf-1',
      evidenceId: 'ev-1',
    });
    const audit = tx.ingredientCreationAudit.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      draftId: 'draft-1',
      ingredientId: 'ing-1',
      nutritionFoodIds: ['nf-1'],
      proposals: { summary: 'AI 原始提案' },
      changes: {
        manualFields: ['basic.name'],
        values: { 'basic.name': '鱼油' },
      },
      committedBy: 'user-1',
    });

    // ④ 事务内回读直接字段（原料/营养/证据/标签/组/草稿都查了）。
    expect(tx.ingredient.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.nutritionFood.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.nutritionFoodMapping.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.supplementLabelEvidence.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.ingredientTagAssignment.findMany).toHaveBeenCalledTimes(1);
    expect(tx.supplementEquivalenceGroup.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.supplementCreationDraft.findUnique).toHaveBeenCalledTimes(1);

    // ⑤ 提交后写报告并返回。
    expect(result).toMatchObject({
      ingredientId: 'ing-1',
      nutritionFoodId: 'nf-1',
      evidenceId: 'ev-1',
    });
    expect(result.verification.ok).toBe(true);
    expect(result.verification.features).toEqual([]);
    expect(result.verification.fields.length).toBeGreaterThan(40);
    expect(draftServiceMock.saveVerification).toHaveBeenCalledWith(
      'draft-1',
      'user-1',
      result.verification,
    );
  });

  it('properties 里没有 no_sale_reason 时按 null 核验（上架=开）', async () => {
    const result = await service.finalize(user, 'draft-1');

    const field = result.verification.fields.find(
      (item) => item.key === 'properties.no_sale_reason',
    );
    expect(field).toMatchObject({
      expected: null,
      actual: null,
      ok: true,
      target: 'ingredient.properties.no_sale_reason',
    });
  });

  it('库里多写了不上架原因时判为回读不一致', async () => {
    tx.ingredient.findUnique.mockResolvedValue({
      ...ingredientRow(),
      properties: {
        ...ingredientRow().properties,
        no_sale_reason: 'CUSTOMER_REQUEST',
      },
    });

    const error = await captureError(() => service.finalize(user, 'draft-1'));

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(String(error.message)).toContain('回读');
    expect(draftServiceMock.saveVerification).not.toHaveBeenCalled();
  });

  it('选「暂不归组」时不碰等价组', async () => {
    useDraft(
      draftView({
        payload: validPayload({ equivalence: { groupId: '__SKIP__' } }),
      }),
    );
    tx.ingredient.findUnique.mockResolvedValue({
      ...ingredientRow(),
      equivalenceGroupId: null,
      equivalencePriority: 0,
    });

    const result = await service.finalize(user, 'draft-1');

    expect(equivalenceMock.assignInTransaction).not.toHaveBeenCalled();
    expect(tx.supplementEquivalenceGroup.findUnique).not.toHaveBeenCalled();
    expect(result.verification.ok).toBe(true);
  });

  it('审核屏取消「一并通过」时把决定传给归组，组留在 DRAFT', async () => {
    useDraft(
      draftView({
        payload: validPayload({
          equivalence: { groupId: 'group-1', reapproveGroup: false },
        }),
      }),
    );
    // 归组前已审核 → 加成员后被打回 DRAFT；回读也是 DRAFT。
    tx.supplementEquivalenceGroup.findUnique.mockReset();
    tx.supplementEquivalenceGroup.findUnique
      .mockResolvedValueOnce({ status: 'APPROVED' })
      .mockResolvedValueOnce({ status: 'DRAFT' });

    const result = await service.finalize(user, 'draft-1');

    expect(equivalenceMock.assignInTransaction).toHaveBeenCalledWith(
      tx,
      ['ing-1'],
      'group-1',
      { id: 'user-1', name: '管理员' },
      { reapprove: false },
    );
    expect(result.verification.ok).toBe(true);
  });

  it('草稿指定了组内排序时按草稿写入', async () => {
    useDraft(
      draftView({
        payload: validPayload({
          equivalence: { groupId: 'group-1', priority: 3 },
        }),
      }),
    );
    tx.ingredient.findUnique.mockResolvedValue({
      ...ingredientRow(),
      equivalencePriority: 3,
    });

    const result = await service.finalize(user, 'draft-1');

    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ing-1' },
      data: { equivalencePriority: 3 },
    });
    expect(result.verification.ok).toBe(true);
  });

  it('重复建档预检命中时返回 409，不开始事务', async () => {
    prismaMock.ingredient.findFirst.mockResolvedValue({
      id: 'ing-existing',
      name: '鱼油',
      brand: null,
      productModel: null,
    });

    const error = await captureError(() => service.finalize(user, 'draft-1'));

    expect(error).toBeInstanceOf(ConflictException);
    expect(String(error.message)).toContain('已经有同名同规格的补剂');
    expect(String(error.message)).toContain('鱼油');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('事务里撞唯一键（P2002）时返回 409 并带上已有记录', async () => {
    ingredientServiceMock.createInTransaction.mockRejectedValue({
      code: 'P2002',
      message: 'Unique constraint failed',
    });
    prismaMock.ingredient.findFirst.mockResolvedValue({
      id: 'ing-existing',
      name: '鱼油',
      brand: 'NOW FOODS',
      productModel: '120 粒/瓶',
    });

    const error = await captureError(() => service.finalize(user, 'draft-1'));

    expect(error).toBeInstanceOf(ConflictException);
    expect(String(error.message)).toContain('鱼油');
    expect(String(error.message)).toContain('NOW FOODS');
    expect(draftServiceMock.saveVerification).not.toHaveBeenCalled();
  });

  it('事务内回读不一致时抛错回滚，不写核验报告', async () => {
    tx.ingredient.findUnique.mockResolvedValue({
      ...ingredientRow(),
      shelfLifeMonths: 12,
    });

    const error = await captureError(() => service.finalize(user, 'draft-1'));

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(String(error.message)).toContain('回读');
    expect(String(error.message)).toContain('原厂保质期');
    expect(draftServiceMock.saveVerification).not.toHaveBeenCalled();
    // 事务体已经跑到置最终态/写审计；真实 Prisma 会把它们一起回滚。
    expect(draftServiceMock.markFinalized).toHaveBeenCalled();
  });

  it('已写入的草稿重复调用是幂等的：直接返回已有 id 与已存报告', async () => {
    const stored: SupplementWriteVerification = {
      ok: true,
      checkedAt: '2026-11-21T10:00:00.000Z',
      fields: [],
      features: [],
    };
    draftServiceMock.get.mockResolvedValue(
      draftView({
        status: 'FINALIZED',
        finalizedIngredientId: 'ing-1',
        finalizedNutritionFoodId: 'nf-1',
        finalizedEvidenceId: 'ev-1',
        finalizedAt: new Date('2026-11-21T10:00:00.000Z'),
        verification: stored as unknown as SupplementDraftView['verification'],
      }),
    );

    const result = await service.finalize(user, 'draft-1');

    expect(result).toEqual({
      ingredientId: 'ing-1',
      nutritionFoodId: 'nf-1',
      evidenceId: 'ev-1',
      verification: stored,
    });
    expect(reviewServiceMock.validate).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(draftServiceMock.saveVerification).not.toHaveBeenCalled();
  });

  it('已写入但报告缺失时不伪造成功', async () => {
    draftServiceMock.get.mockResolvedValue(
      draftView({
        status: 'FINALIZED',
        finalizedIngredientId: 'ing-1',
        finalizedNutritionFoodId: 'nf-1',
        finalizedEvidenceId: 'ev-1',
        verification: null,
      }),
    );

    const result = await service.finalize(user, 'draft-1');

    expect(result.verification.ok).toBe(false);
    expect(result.verification.fields).toEqual([]);
  });

  it('已放弃的草稿拒绝写入', async () => {
    draftServiceMock.get.mockResolvedValue(draftView({ status: 'DISCARDED' }));

    const error = await captureError(() => service.finalize(user, 'draft-1'));

    expect(error).toBeInstanceOf(ConflictException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('草稿被别人改过（乐观锁）时返回 409', async () => {
    const error = await captureError(() =>
      service.finalize(user, 'draft-1', {
        expectedUpdatedAt: '2026-11-21T09:00:00.000Z',
      }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
