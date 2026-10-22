import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { SupplementTargetService } from '../../../src/application/recipe-designer/supplement-target.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 产品展示保存与门槛接入（2026-10-22）
 *
 * 覆盖：
 *  · PATCH 只改传入字段（patch semantics），并统一 contentRevision +1；
 *  · null 能清空可空字段，detailImages 落库为 SQL NULL；
 *  · 权限与草稿详情一致（顾客不能改别人的草稿）；
 *  · 展示字段保存后，已持久化营养报告立即变过期；
 *  · 上线门槛从草稿 / 系列读取展示与订单分支上下文。
 */

const STAFF_ACCESS = { userId: 'staff-1', role: 'STAFF' as const };
const ADMIN_ACCESS = { userId: 'admin-1', role: 'ADMIN' as const };
const CUSTOMER_ACCESS = { userId: 'customer-1', role: 'CUSTOMER' as const };

function draftRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    name: '鸡肉成犬配方',
    version: 1,
    contentRevision: 4,
    status: 'DRAFT',
    fediafDogScenario: 'ADULT_MER_110',
    nutritionStandard: 'FEDIAF_2025',
    energyDensityKcalPerKg: 955,
    totalWeightG: 100,
    targetHealthTags: ['JOINT'],
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
    notes: null,
    coverImageUrl: 'https://img.example.com/cover.jpg',
    coverTitle: '鸡肉成犬',
    description: '鲜鸡肉为主料，适合成犬日常维持。',
    sellingPoint: '鲜肉低敏，日常维持',
    detailImages: ['https://img.example.com/detail.jpg'],
    videoUrl: null,
    productionStepsJson: [{ sortOrder: 1, instruction: '食材称重后混合' }],
    nutritionReportJson: { ingredientRows: [] },
    nutritionReportRevision: 4,
    nutritionReportGeneratedAt: new Date('2026-10-22T09:00:00.000Z'),
    createdBy: 'staff-1',
    isCompliant: true,
    reviewStatus: 'NONE',
    reviewNote: null,
    calculatedNutrition: {},
    complianceStatus: {},
    assessmentSummary: {},
    missingDataReport: [],
    publishedAt: null,
    publishedRecipeId: null,
    publishedRecipeVersion: null,
    revisionOfDesignRecipeId: null,
    revisionBaseRecipeId: null,
    customerDogId: 'dog-1',
    seriesId: null,
    seriesLifeStage: null,
    series: {
      id: 'series-1',
      name: '鸡肉成犬配方',
      referenceDogId: 'dog-1',
      designMode: 'CATALOG',
      orderId: null,
      orderQuantity: null,
    },
    items: [],
    ...overrides,
  };
}

function presentationSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    contentRevision: 5,
    coverImageUrl: 'https://img.example.com/cover.jpg',
    coverTitle: '鸡肉成犬',
    description: '鲜鸡肉为主料，适合成犬日常维持。',
    sellingPoint: '鲜肉低敏，日常维持',
    detailImages: ['https://img.example.com/detail.jpg'],
    videoUrl: null,
    ...overrides,
  };
}

describe('RecipeDesignerService · draft presentation', () => {
  let service: RecipeDesignerService;

  const prisma = {
    user: { findMany: jest.fn() },
    designRecipe: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    designRecipeItem: {
      aggregate: jest.fn(),
    },
    preparationMethod: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const targetProvider = { getTargets: jest.fn() };
  const supplementTargetService = new SupplementTargetService(
    prisma as PrismaService,
  );

  beforeEach(() => {
    service = new RecipeDesignerService(
      prisma as PrismaService,
      targetProvider as any,
      { expandQuery: jest.fn(), recordSearchEvent: jest.fn() } as any,
      { isAvailable: jest.fn(), generate: jest.fn() } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      supplementTargetService,
    );
    jest.clearAllMocks();

    prisma.user.findMany.mockResolvedValue([{ id: 'staff-1' }]);
    prisma.preparationMethod.findMany.mockResolvedValue([]);
    prisma.designRecipe.findUnique.mockResolvedValue(draftRecord());
    prisma.designRecipe.update.mockResolvedValue(presentationSnapshot());
    targetProvider.getTargets.mockResolvedValue([]);
  });

  it('patches only the supplied presentation fields and bumps contentRevision', async () => {
    const result = await (service as any).updateDraftPresentation(
      'draft-1',
      { coverTitle: '新封面标题', videoUrl: 'https://video.example.com/a.mp4' },
      STAFF_ACCESS,
    );

    expect(prisma.designRecipe.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft-1' },
        data: {
          coverTitle: '新封面标题',
          videoUrl: 'https://video.example.com/a.mp4',
          contentRevision: { increment: 1 },
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        draftId: 'draft-1',
        contentRevision: 5,
        coverTitle: '鸡肉成犬',
      }),
    );
  });

  it('rejects over-long presentation text and non-string detail images at the service boundary', async () => {
    await expect(
      (service as any).updateDraftPresentation(
        'draft-1',
        { coverTitle: '鸡'.repeat(21) },
        STAFF_ACCESS,
      ),
    ).rejects.toThrow('封面标题不能超过20个字符');

    await expect(
      (service as any).updateDraftPresentation(
        'draft-1',
        { sellingPoint: '卖'.repeat(201) },
        STAFF_ACCESS,
      ),
    ).rejects.toThrow('一句话卖点不能超过200个字符');

    await expect(
      (service as any).updateDraftPresentation(
        'draft-1',
        { description: '详'.repeat(4001) },
        STAFF_ACCESS,
      ),
    ).rejects.toThrow('详情描述不能超过4000个字符');

    await expect(
      (service as any).updateDraftPresentation(
        'draft-1',
        { detailImages: ['ok', 123] },
        STAFF_ACCESS,
      ),
    ).rejects.toThrow('详情图必须是字符串数组');

    await expect(
      (service as any).updateDraftPresentation(
        'draft-1',
        { coverImageUrl: 123 },
        STAFF_ACCESS,
      ),
    ).rejects.toThrow('封面图地址必须是字符串');

    await expect(
      (service as any).updateDraftPresentation(
        'draft-1',
        { videoUrl: 123 },
        STAFF_ACCESS,
      ),
    ).rejects.toThrow('视频地址必须是字符串');

    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });

  it('supports clearing nullable presentation fields with null', async () => {
    prisma.designRecipe.update.mockResolvedValue(
      presentationSnapshot({
        description: null,
        detailImages: null,
        videoUrl: null,
      }),
    );

    await (service as any).updateDraftPresentation(
      'draft-1',
      { description: null, detailImages: null, videoUrl: null },
      STAFF_ACCESS,
    );

    expect(prisma.designRecipe.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          description: null,
          detailImages: Prisma.DbNull,
          videoUrl: null,
          contentRevision: { increment: 1 },
        },
      }),
    );
  });

  it('does not bump contentRevision for an empty patch', async () => {
    const result = await (service as any).updateDraftPresentation(
      'draft-1',
      {},
      STAFF_ACCESS,
    );

    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        draftId: 'draft-1',
        contentRevision: 4,
        coverTitle: '鸡肉成犬',
      }),
    );
  });

  it('uses the same access rule as draft detail (customer cannot patch another author draft)', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draftRecord({ createdBy: 'staff-2' }),
    );

    await expect(
      (service as any).updateDraftPresentation(
        'draft-1',
        { coverTitle: '越权修改' },
        CUSTOMER_ACCESS,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.designRecipe.update).not.toHaveBeenCalled();
  });

  it('makes a persisted nutrition report stale immediately after presentation patch', async () => {
    prisma.designRecipe.findUnique
      .mockResolvedValueOnce(draftRecord())
      .mockResolvedValueOnce(
        draftRecord({
          contentRevision: 5,
          coverTitle: '新封面标题',
          nutritionReportRevision: 4,
        }),
      );

    await (service as any).updateDraftPresentation(
      'draft-1',
      { coverTitle: '新封面标题' },
      STAFF_ACCESS,
    );
    const report = await service.getDraftNutritionReport(
      'draft-1',
      STAFF_ACCESS,
    );

    expect(report).toEqual(
      expect.objectContaining({
        revision: 4,
        stale: true,
      }),
    );
  });

  it('feeds stored presentation and order context into launch readiness', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draftRecord({
        coverImageUrl: null,
        coverTitle: '   ',
        description: null,
        sellingPoint: null,
        applicableLifeStages: [],
        targetHealthTags: [],
        series: {
          id: 'series-1',
          name: '订单鸡肉配方',
          referenceDogId: 'dog-1',
          designMode: 'ORDER',
          orderId: null,
          orderQuantity: 0,
        },
        customerDogId: null,
      }),
    );

    const readiness = await service.getDraftLaunchReadiness(
      'draft-1',
      ADMIN_ACCESS,
    );

    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'COVER_IMAGE_REQUIRED',
          scope: 'PRESENTATION',
        }),
        expect.objectContaining({
          code: 'COVER_TITLE_REQUIRED',
          scope: 'PRESENTATION',
        }),
        expect.objectContaining({
          code: 'ORDER_ID_REQUIRED',
          scope: 'ORDER',
        }),
        expect.objectContaining({
          code: 'ORDER_QUANTITY_INVALID',
          scope: 'ORDER',
        }),
        expect.objectContaining({
          code: 'CUSTOMER_DOG_REQUIRED',
          scope: 'ORDER',
        }),
      ]),
    );

    const include = prisma.designRecipe.findUnique.mock.calls[0][0].include;
    expect(include.series.select).toEqual(
      expect.objectContaining({
        orderId: true,
        orderQuantity: true,
      }),
    );
  });
});
