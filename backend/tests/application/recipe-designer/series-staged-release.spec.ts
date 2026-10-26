import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { SupplementTargetService } from '../../../src/application/recipe-designer/supplement-target.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 产品线两阶段发布（2026-10-22）。
 *
 * 覆盖：
 *  · 系列发布就绪度：EMPTY / DRAFT / READY / PUBLIC 逐阶段状态；
 *  · 必填阶段缺失、展示资料缺失、目标健康标签只提醒；
 *  · 发布设置 PATCH：合法阶段代码、长度、patch semantics、权限；
 *  · 整系列发布：所有阶段 Recipe → PUBLIC、系列 → PUBLIC、展示资料复制；
 *  · 未就绪时拒绝发布；订单系列不适用；只有管理员能发布。
 */

const STAFF_ACCESS = { userId: 'staff-1', role: 'STAFF' as const };
const ADMIN_ACCESS = { userId: 'admin-1', role: 'ADMIN' as const };
const CUSTOMER_ACCESS = { userId: 'customer-1', role: 'CUSTOMER' as const };

function seriesRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'series-1',
    name: '鸡肉双阶段',
    status: 'ACTIVE',
    businessStatus: 'DRAFT',
    deletedAt: null,
    deletedBy: null,
    createdBy: 'staff-1',
    customerDogId: null,
    referenceDogId: 'dog-1',
    designMode: 'CATALOG',
    orderId: null,
    orderQuantity: null,
    requiredLifeStages: ['HIGH_ACTIVITY_ADULT'],
    coverImageUrl: 'https://img.example.com/series-cover.jpg',
    coverTitle: '鸡肉双阶段',
    sellingPoint: '两种能量一套配方',
    targetHealthTags: ['JOINT'],
    createdAt: new Date('2026-10-20T00:00:00.000Z'),
    updatedAt: new Date('2026-10-21T00:00:00.000Z'),
    ...overrides,
  };
}

function recipeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'recipe-row-adult',
    recipeId: 'recipe-adult',
    version: 1,
    status: 'DRAFT',
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
    createdAt: new Date('2026-10-20T00:00:00.000Z'),
    updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    ...overrides,
  };
}

function designRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-adult',
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    status: 'DRAFT',
    publishedRecipeId: null,
    publishedAt: null,
    updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    ...overrides,
  };
}

describe('RecipeDesignerService · staged series release', () => {
  let service: RecipeDesignerService;

  const prisma = {
    user: { findMany: jest.fn() },
    designRecipe: {
      findMany: jest.fn(),
    },
    recipe: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    recipeSeries: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    // 2026-10-27 发布门禁「已归类」：这些用例都假设系列已可发布，
    // 默认给一条归属，避免被新门禁打成阻断。
    recipeSeriesTaxonomy: {
      count: jest.fn().mockResolvedValue(1),
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
    prisma.recipeSeries.findUnique.mockResolvedValue(seriesRecord());
    prisma.recipeSeries.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        seriesRecord({
          ...data,
          updatedAt: new Date('2026-10-22T10:00:00.000Z'),
        }),
    );
    prisma.recipe.findMany.mockResolvedValue([]);
    prisma.designRecipe.findMany.mockResolvedValue([]);
    prisma.recipe.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
  });

  function stageOf(readiness: any, stageCode: string) {
    return readiness.stages.find((stage: any) => stage.stageCode === stageCode);
  }

  describe('getSeriesReleaseReadiness', () => {
    it('reports EMPTY stages and blocks when a required stage has nothing', async () => {
      const readiness = await service.getSeriesReleaseReadiness(
        'series-1',
        ADMIN_ACCESS,
      );

      expect(readiness.ready).toBe(false);
      expect(readiness.designMode).toBe('CATALOG');
      expect(readiness.businessStatus).toBe('DRAFT');
      expect(readiness.releaseState).toBe('UNPUBLISHED');
      expect(readiness.hasPendingUpdates).toBe(false);
      expect(readiness.requiredLifeStages).toEqual(['HIGH_ACTIVITY_ADULT']);
      expect(readiness.requiredStages).toEqual([
        expect.objectContaining({
          stageCode: 'HIGH_ACTIVITY_ADULT',
          label: '普通成年犬',
          status: 'EMPTY',
          latestRecipeId: null,
          latestRecipeVersion: null,
          designDraftId: null,
        }),
      ]);
      expect(stageOf(readiness, 'REPRODUCTION')).toMatchObject({
        status: 'EMPTY',
        required: false,
      });
      expect(readiness.blockers).toEqual([
        expect.objectContaining({
          code: 'REQUIRED_STAGE_NOT_READY',
          scope: 'STAGE',
          stageCode: 'HIGH_ACTIVITY_ADULT',
        }),
      ]);
      expect(readiness.warnings).toEqual([]);
    });

    it('distinguishes DRAFT (designer only) from READY (series warehouse recipe)', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          requiredLifeStages: [
            'HIGH_ACTIVITY_ADULT',
            'LOW_ACTIVITY_ADULT_OR_SENIOR',
          ],
        }),
      );
      prisma.designRecipe.findMany.mockResolvedValue([
        designRecord({
          id: 'draft-adult',
          seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        }),
      ]);
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-senior',
          recipeId: 'recipe-senior',
          version: 3,
          status: 'DRAFT',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        }),
      ]);

      const readiness = await service.getSeriesReleaseReadiness(
        'series-1',
        STAFF_ACCESS,
      );

      expect(readiness.ready).toBe(false);
      expect(readiness.requiredStages).toEqual([
        expect.objectContaining({
          stageCode: 'HIGH_ACTIVITY_ADULT',
          status: 'DRAFT',
          designDraftId: 'draft-adult',
          latestRecipeId: null,
        }),
        expect.objectContaining({
          stageCode: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          status: 'READY',
          latestRecipeId: 'recipe-senior',
          latestRecipeVersion: 3,
        }),
      ]);
      expect(readiness.summary).toMatchObject({
        requiredStageCount: 2,
        readyStageCount: 1,
        designedStageCount: 2,
        pendingStageCount: 0,
      });
      expect(readiness.blockers).toEqual([
        expect.objectContaining({
          code: 'REQUIRED_STAGE_NOT_READY',
          scope: 'STAGE',
          stageCode: 'HIGH_ACTIVITY_ADULT',
        }),
      ]);
    });

    it('is ready when all required stages are READY or PUBLIC', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          requiredLifeStages: [
            'HIGH_ACTIVITY_ADULT',
            'LOW_ACTIVITY_ADULT_OR_SENIOR',
          ],
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult',
          recipeId: 'recipe-adult',
          version: 2,
          status: 'DRAFT',
        }),
        recipeRecord({
          id: 'recipe-row-senior',
          recipeId: 'recipe-senior',
          version: 1,
          status: 'PUBLIC',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        }),
      ]);

      const readiness = await service.getSeriesReleaseReadiness(
        'series-1',
        ADMIN_ACCESS,
      );

      expect(readiness.ready).toBe(true);
      expect(readiness.blockers).toEqual([]);
      expect(stageOf(readiness, 'HIGH_ACTIVITY_ADULT')).toMatchObject({
        status: 'READY',
        latestRecipeId: 'recipe-adult',
        latestRecipeVersion: 2,
      });
      expect(stageOf(readiness, 'LOW_ACTIVITY_ADULT_OR_SENIOR')).toMatchObject({
        status: 'PUBLIC',
        publishedRecipeVersion: 1,
        hasPendingUpdate: false,
      });
      expect(readiness.releaseState).toBe('UNPUBLISHED');
    });

    it('detects a newer DRAFT version behind the published stage (pending update)', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'PUBLIC',
          requiredLifeStages: ['HIGH_ACTIVITY_ADULT'],
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult-v1',
          recipeId: 'recipe-adult',
          version: 1,
          status: 'PUBLIC',
        }),
        recipeRecord({
          id: 'recipe-row-adult-v2',
          recipeId: 'recipe-adult',
          version: 2,
          status: 'DRAFT',
        }),
      ]);

      const readiness = await service.getSeriesReleaseReadiness(
        'series-1',
        ADMIN_ACCESS,
      );

      // 旧 PUBLIC 还在，阶段状态仍是 PUBLIC；但已经有一版更新的 DRAFT。
      expect(stageOf(readiness, 'HIGH_ACTIVITY_ADULT')).toMatchObject({
        status: 'PUBLIC',
        latestRecipeId: 'recipe-adult',
        latestRecipeVersion: 2,
        publishedRecipeVersion: 1,
        hasPendingUpdate: true,
      });
      expect(readiness).toMatchObject({
        businessStatus: 'PUBLIC',
        releaseState: 'NEEDS_UPDATE',
        hasPendingUpdates: true,
        pendingStageCodes: ['HIGH_ACTIVITY_ADULT'],
        // 待更新不阻断重新发布
        ready: true,
      });
      expect(readiness.summary.pendingStageCount).toBe(1);
      expect(readiness.blockers).toEqual([]);
    });

    it('reports PUBLISHED when the series and every stage are fully released', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'PUBLIC',
          requiredLifeStages: ['HIGH_ACTIVITY_ADULT'],
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult-v2',
          recipeId: 'recipe-adult',
          version: 2,
          status: 'PUBLIC',
        }),
      ]);

      const readiness = await service.getSeriesReleaseReadiness(
        'series-1',
        ADMIN_ACCESS,
      );

      expect(readiness).toMatchObject({
        businessStatus: 'PUBLIC',
        releaseState: 'PUBLISHED',
        hasPendingUpdates: false,
        pendingStageCodes: [],
      });
      expect(stageOf(readiness, 'HIGH_ACTIVITY_ADULT')).toMatchObject({
        status: 'PUBLIC',
        latestRecipeVersion: 2,
        publishedRecipeVersion: 2,
        hasPendingUpdate: false,
      });
      expect(readiness.summary.pendingStageCount).toBe(0);
    });

    it('blocks missing presentation and warns on empty health tags', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          requiredLifeStages: ['HIGH_ACTIVITY_ADULT'],
          coverImageUrl: null,
          coverTitle: '   ',
          sellingPoint: null,
          targetHealthTags: [],
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({ status: 'DRAFT' }),
      ]);

      const readiness = await service.getSeriesReleaseReadiness(
        'series-1',
        ADMIN_ACCESS,
      );

      expect(readiness.ready).toBe(false);
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
            code: 'SELLING_POINT_REQUIRED',
            scope: 'PRESENTATION',
          }),
        ]),
      );
      expect(readiness.warnings).toEqual([
        expect.objectContaining({
          code: 'TARGET_HEALTH_TAGS_MISSING',
          scope: 'PRESENTATION',
        }),
      ]);
      expect(readiness.presentation).toEqual(
        expect.objectContaining({
          coverImageUrl: null,
          coverTitle: null,
          sellingPoint: null,
          targetHealthTags: [],
        }),
      );
    });

    it('rejects order-bound series with a clear message', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ designMode: 'ORDER', orderId: 'order-1' }),
      );

      await expect(
        service.getSeriesReleaseReadiness('series-1', ADMIN_ACCESS),
      ).rejects.toThrow(
        new BadRequestException(
          '订单定制系列不适用产品线分阶段发布，请从订单设计流程交付',
        ),
      );
    });

    it('hides series the current user cannot access', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ createdBy: 'someone-else' }),
      );

      await expect(
        service.getSeriesReleaseReadiness('series-1', CUSTOMER_ACCESS),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSeriesReleaseSettings', () => {
    it('patches only supplied fields and normalizes stage codes / text', async () => {
      const result = await (service as any).updateSeriesReleaseSettings(
        'series-1',
        {
          requiredLifeStages: [
            'LOW_ACTIVITY_ADULT_OR_SENIOR',
            'HIGH_ACTIVITY_ADULT',
            'HIGH_ACTIVITY_ADULT',
          ],
          coverTitle: '  鲜肉双阶段  ',
          sellingPoint: '   ',
          targetHealthTags: ['JOINT', 'JOINT', 'SKIN'],
        },
        STAFF_ACCESS,
      );

      expect(prisma.recipeSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: {
          requiredLifeStages: [
            'HIGH_ACTIVITY_ADULT',
            'LOW_ACTIVITY_ADULT_OR_SENIOR',
          ],
          coverTitle: '鲜肉双阶段',
          sellingPoint: null,
          targetHealthTags: ['JOINT', 'SKIN'],
        },
      });
      expect(result).toMatchObject({
        seriesId: 'series-1',
        requiredLifeStages: [
          'HIGH_ACTIVITY_ADULT',
          'LOW_ACTIVITY_ADULT_OR_SENIOR',
        ],
        coverTitle: '鲜肉双阶段',
        targetHealthTags: ['JOINT', 'SKIN'],
      });
    });

    it('returns the current settings without writing on an empty patch', async () => {
      const result = await service.updateSeriesReleaseSettings(
        'series-1',
        {},
        STAFF_ACCESS,
      );

      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        seriesId: 'series-1',
        requiredLifeStages: ['HIGH_ACTIVITY_ADULT'],
        coverImageUrl: 'https://img.example.com/series-cover.jpg',
        sellingPoint: '两种能量一套配方',
      });
    });

    it('rejects unknown life stage codes and over-long presentation text', async () => {
      await expect(
        service.updateSeriesReleaseSettings(
          'series-1',
          { requiredLifeStages: ['ADULT'] },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow('无效的生命阶段代码：ADULT');

      await expect(
        service.updateSeriesReleaseSettings(
          'series-1',
          { coverTitle: '鸡'.repeat(21) },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow('封面标题不能超过20个字符');

      await expect(
        service.updateSeriesReleaseSettings(
          'series-1',
          { sellingPoint: '卖'.repeat(201) },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow('一句话卖点不能超过200个字符');

      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('lets staff maintain settings but rejects customers and order series', async () => {
      await expect(
        service.updateSeriesReleaseSettings(
          'series-1',
          { coverTitle: '新标题' },
          CUSTOMER_ACCESS,
        ),
      ).rejects.toThrow('只有员工可以维护产品线发布设置');

      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ designMode: 'ORDER' }),
      );
      await expect(
        service.updateSeriesReleaseSettings(
          'series-1',
          { coverTitle: '新标题' },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('releaseSeries', () => {
    function mockReadySeries() {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          requiredLifeStages: [
            'HIGH_ACTIVITY_ADULT',
            'LOW_ACTIVITY_ADULT_OR_SENIOR',
          ],
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult',
          recipeId: 'recipe-adult',
          version: 2,
          status: 'DRAFT',
        }),
        recipeRecord({
          id: 'recipe-row-senior',
          recipeId: 'recipe-senior',
          version: 1,
          status: 'DRAFT',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        }),
        // 未勾选但已设计的阶段：也必须一起发布，避免留下隐藏草稿
        recipeRecord({
          id: 'recipe-row-repro',
          recipeId: 'recipe-repro',
          version: 1,
          status: 'DRAFT',
          seriesLifeStage: 'REPRODUCTION',
        }),
      ]);
      prisma.recipe.updateMany.mockResolvedValue({ count: 3 });
    }

    it('publishes every stage recipe, flips the series to PUBLIC and copies presentation', async () => {
      mockReadySeries();

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS);

      expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['recipe-row-adult', 'recipe-row-senior', 'recipe-row-repro'],
          },
          seriesId: 'series-1',
          status: { in: ['DRAFT', 'PUBLIC'] },
        },
        data: {
          status: 'PUBLIC',
          coverImageUrl: 'https://img.example.com/series-cover.jpg',
          coverTitle: '鸡肉双阶段',
          sellingPoint: '两种能量一套配方',
          targetHealthTags: ['JOINT'],
        },
      });
      expect(prisma.recipeSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { businessStatus: 'PUBLIC' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        seriesId: 'series-1',
        businessStatus: 'PUBLIC',
        requiredLifeStages: [
          'HIGH_ACTIVITY_ADULT',
          'LOW_ACTIVITY_ADULT_OR_SENIOR',
        ],
        releasedStageCodes: [
          'HIGH_ACTIVITY_ADULT',
          'LOW_ACTIVITY_ADULT_OR_SENIOR',
          'REPRODUCTION',
        ],
        publishedRecipeCount: 3,
        updatedRecipeCount: 3,
      });
    });

    it('re-releases only the latest DRAFT and leaves the old PUBLIC version untouched', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'PUBLIC',
          requiredLifeStages: ['HIGH_ACTIVITY_ADULT'],
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult-v1',
          recipeId: 'recipe-adult',
          version: 1,
          status: 'PUBLIC',
        }),
        recipeRecord({
          id: 'recipe-row-adult-v2',
          recipeId: 'recipe-adult',
          version: 2,
          status: 'DRAFT',
        }),
      ]);
      prisma.recipe.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS);

      expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['recipe-row-adult-v2'] },
          seriesId: 'series-1',
          status: { in: ['DRAFT', 'PUBLIC'] },
        },
        data: expect.objectContaining({ status: 'PUBLIC' }),
      });
      const targetedIds = prisma.recipe.updateMany.mock.calls[0][0].where.id.in;
      expect(targetedIds).not.toContain('recipe-row-adult-v1');
      expect(result).toMatchObject({
        businessStatus: 'PUBLIC',
        publishedRecipeCount: 1,
        updatedRecipeCount: 1,
      });
    });

    it('refreshes the latest version of an already published stage without republishing older rows', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'PUBLIC',
          requiredLifeStages: ['HIGH_ACTIVITY_ADULT'],
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult-v1',
          recipeId: 'recipe-adult',
          version: 1,
          status: 'PUBLIC',
        }),
        recipeRecord({
          id: 'recipe-row-adult-v2',
          recipeId: 'recipe-adult',
          version: 2,
          status: 'PUBLIC',
        }),
      ]);
      prisma.recipe.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS);

      expect(prisma.recipe.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['recipe-row-adult-v2'] },
          }),
        }),
      );
      expect(result).toMatchObject({
        publishedRecipeCount: 0,
        updatedRecipeCount: 1,
      });
    });

    it('keeps recipe health tags when the series has none', async () => {
      mockReadySeries();
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ targetHealthTags: [] }),
      );

      await service.releaseSeries('series-1', ADMIN_ACCESS);

      const data = prisma.recipe.updateMany.mock.calls[0][0].data;
      expect(data.status).toBe('PUBLIC');
      expect(data).not.toHaveProperty('targetHealthTags');
    });

    it('refuses to release when a required stage is not ready', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          requiredLifeStages: [
            'HIGH_ACTIVITY_ADULT',
            'LOW_ACTIVITY_ADULT_OR_SENIOR',
          ],
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({ status: 'DRAFT' }),
      ]);

      await expect(
        service.releaseSeries('series-1', ADMIN_ACCESS),
      ).rejects.toThrow(/普通成年犬|低能量成年犬/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('lets only admins release the series', async () => {
      mockReadySeries();

      await expect(
        service.releaseSeries('series-1', STAFF_ACCESS),
      ).rejects.toThrow('只有管理员可以发布产品线');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('unpublishSeries', () => {
    it('flips every PUBLIC recipe to DRAFT and returns counts/status', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
      );
      prisma.recipe.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.unpublishSeries('series-1', ADMIN_ACCESS);

      expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
        where: { seriesId: 'series-1', status: 'PUBLIC' },
        data: { status: 'DRAFT' },
      });
      expect(prisma.recipeSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { businessStatus: 'DRAFT' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        seriesId: 'series-1',
        businessStatus: 'DRAFT',
        releaseState: 'UNPUBLISHED',
        unpublishedRecipeCount: 2,
        remainingPublicRecipeCount: 0,
      });
      expect(result.unpublishedAt).toBeInstanceOf(Date);
      // 下架只改状态，不碰设计稿 / 历史。
      expect(prisma.designRecipe.findMany).not.toHaveBeenCalled();
    });

    it('is idempotent when the series already has no PUBLIC recipe', async () => {
      prisma.recipe.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.unpublishSeries('series-1', ADMIN_ACCESS);

      expect(result).toMatchObject({
        businessStatus: 'DRAFT',
        unpublishedRecipeCount: 0,
      });
    });

    it('lets only admins unpublish the series', async () => {
      await expect(
        service.unpublishSeries('series-1', STAFF_ACCESS),
      ).rejects.toThrow('只有管理员可以下架产品线');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
    });

    it('rejects order-bound series with a clear message', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ designMode: 'ORDER', orderId: 'order-1' }),
      );

      await expect(
        service.unpublishSeries('series-1', ADMIN_ACCESS),
      ).rejects.toThrow(
        new BadRequestException(
          '订单定制系列不适用产品线分阶段发布，请从订单设计流程交付',
        ),
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('hides series the current user cannot access', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ createdBy: 'someone-else' }),
      );

      await expect(
        service.unpublishSeries('series-1', ADMIN_ACCESS),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
