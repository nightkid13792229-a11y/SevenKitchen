import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';
import { SupplementTargetService } from '../../../src/application/recipe-designer/supplement-target.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 产品线发布 / 更新（2026-10-26 新口径）。
 *
 * 覆盖：
 *  · 系列发布就绪度：EMPTY / DRAFT / READY / PUBLIC 逐阶段状态、actionable、canRelease；
 *  · 封面角标带进 readiness；封面标题不再阻断；角标缺失只提醒；
 *  · 发布设置 PATCH：patch semantics、门面长度、applyToLive 同步、已上线禁止清空；
 *  · 首次发布：忽略前端 stageCodes，发布当前全部 READY（1 个就绪也能发）；
 *  · 更新：只发布选中阶段的最新 DRAFT，未选中的待更新阶段保持 DRAFT；
 *  · 门面资料写入「选中的目标 + 所有其余 PUBLIC 行」；
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
      count: jest.fn(),
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
    recipeSeriesCoverBadge: {
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
    prisma.recipeSeries.findUnique.mockResolvedValue(seriesRecord());
    // 模拟真实 Prisma：update 返回「已存值 + 本次 patch」的完整行，
    // 这样门面同步规则能读到没被本次 patch 覆盖的旧字段。
    prisma.recipeSeries.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        const current = await prisma.recipeSeries.findUnique();
        return {
          ...(current ?? seriesRecord()),
          ...data,
          updatedAt: new Date('2026-10-22T10:00:00.000Z'),
        };
      },
    );
    prisma.recipe.findMany.mockResolvedValue([]);
    prisma.designRecipe.findMany.mockResolvedValue([]);
    // mockResolvedValueOnce 队列不会被 clearAllMocks 清掉，显式 reset 避免串用例。
    prisma.recipe.updateMany.mockReset();
    prisma.recipe.updateMany.mockResolvedValue({ count: 1 });
    // 已上线判定：默认认为系列里还有 PUBLIC 食谱行，具体用例可覆盖。
    prisma.recipe.count.mockResolvedValue(1);
    prisma.recipeSeriesCoverBadge.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
  });

  function stageOf(readiness: any, stageCode: string) {
    return readiness.stages.find((stage: any) => stage.stageCode === stageCode);
  }

  describe('getSeriesReleaseReadiness', () => {
    it('warns on missing cover badges and is not releasable without actionable stages', async () => {
      const readiness = await service.getSeriesReleaseReadiness(
        'series-1',
        ADMIN_ACCESS,
      );

      expect(readiness.ready).toBe(true);
      expect(readiness.canRelease).toBe(false);
      expect(readiness).toMatchObject({
        designMode: 'CATALOG',
        businessStatus: 'DRAFT',
        releaseState: 'UNPUBLISHED',
        hasPendingUpdates: false,
        blockers: [],
      });
      expect(readiness).not.toHaveProperty('requiredLifeStages');
      expect(stageOf(readiness, 'HIGH_ACTIVITY_ADULT')).toMatchObject({
        status: 'EMPTY',
        actionable: false,
        latestRecipeId: null,
        latestRecipeVersion: null,
        designDraftId: null,
      });
      expect(stageOf(readiness, 'REPRODUCTION')).toMatchObject({
        status: 'EMPTY',
        actionable: false,
      });
      expect(readiness.warnings).toEqual([
        expect.objectContaining({
          code: 'COVER_BADGE_MISSING',
          scope: 'PRESENTATION',
        }),
      ]);
      expect(readiness.summary).toMatchObject({
        totalStageCount: 5,
        publishableStageCount: 0,
        actionableStageCount: 0,
        designedStageCount: 0,
      });
      expect(prisma.recipeSeriesCoverBadge.findMany).toHaveBeenCalledWith({
        where: { seriesId: 'series-1' },
        select: { healthTag: { select: { name: true } } },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('includes cover badge names in readiness presentation', async () => {
      prisma.recipeSeriesCoverBadge.findMany.mockResolvedValue([
        { healthTag: { name: '低脂' } },
        { healthTag: { name: '易消化' } },
      ]);

      const readiness = await service.getSeriesReleaseReadiness(
        'series-1',
        ADMIN_ACCESS,
      );

      expect(readiness.presentation.coverBadges).toEqual(['低脂', '易消化']);
      expect(readiness.warnings).toEqual([]);
    });

    it('distinguishes designer-only DRAFT stages from READY warehouse recipes', async () => {
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

      expect(readiness.ready).toBe(true);
      expect(readiness.canRelease).toBe(true);
      expect(stageOf(readiness, 'HIGH_ACTIVITY_ADULT')).toMatchObject({
        status: 'DRAFT',
        actionable: false,
        designDraftId: 'draft-adult',
        latestRecipeId: null,
      });
      expect(stageOf(readiness, 'LOW_ACTIVITY_ADULT_OR_SENIOR')).toMatchObject({
        status: 'READY',
        actionable: true,
        latestRecipeId: 'recipe-senior',
        latestRecipeVersion: 3,
      });
      expect(readiness.summary).toMatchObject({
        publishableStageCount: 1,
        actionableStageCount: 1,
        designedStageCount: 2,
        pendingStageCount: 0,
      });
    });

    it('is ready and releasable when the series has READY and PUBLIC stages', async () => {
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
      expect(readiness.canRelease).toBe(true);
      expect(readiness.blockers).toEqual([]);
      expect(stageOf(readiness, 'HIGH_ACTIVITY_ADULT')).toMatchObject({
        status: 'READY',
        actionable: true,
        latestRecipeId: 'recipe-adult',
        latestRecipeVersion: 2,
      });
      expect(stageOf(readiness, 'LOW_ACTIVITY_ADULT_OR_SENIOR')).toMatchObject({
        status: 'PUBLIC',
        actionable: false,
        publishedRecipeVersion: 1,
        hasPendingUpdate: false,
      });
      expect(readiness.releaseState).toBe('UNPUBLISHED');
    });

    it('detects a newer DRAFT version behind the published stage (pending update)', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
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
        actionable: true,
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
        canRelease: true,
      });
      expect(readiness.summary.pendingStageCount).toBe(1);
      expect(readiness.blockers).toEqual([]);
    });

    it('reports PUBLISHED when the series and every stage are fully released', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
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

    it('blocks missing cover image and selling point without requiring a cover title', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
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
      expect(readiness.blockers.map((blocker) => blocker.code)).toEqual([
        'COVER_IMAGE_REQUIRED',
        'SELLING_POINT_REQUIRED',
      ]);
      // 目标健康标签不再是发布提醒；只提醒未设置封面角标。
      expect(readiness.warnings).toEqual([
        expect.objectContaining({
          code: 'COVER_BADGE_MISSING',
          scope: 'PRESENTATION',
        }),
      ]);
      expect(readiness.presentation).toEqual(
        expect.objectContaining({
          coverImageUrl: null,
          coverTitle: null,
          sellingPoint: null,
          targetHealthTags: [],
          coverBadges: [],
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
    it('patches only supplied facade fields and ignores legacy required life stages', async () => {
      const result = await (service as any).updateSeriesReleaseSettings(
        'series-1',
        {
          requiredLifeStages: [
            'LOW_ACTIVITY_ADULT_OR_SENIOR',
            'HIGH_ACTIVITY_ADULT',
            'HIGH_ACTIVITY_ADULT',
          ],
          coverTitle: '  鲜肉双阶段  ',
          sellingPoint: '  新卖点  ',
          targetHealthTags: ['JOINT', 'JOINT', 'SKIN'],
        },
        STAFF_ACCESS,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.recipeSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: {
          coverTitle: '鲜肉双阶段',
          sellingPoint: '新卖点',
          targetHealthTags: ['JOINT', 'SKIN'],
        },
      });
      // 默认 applyToLive=false：只保存系列设置，不同步线上食谱行。
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        seriesId: 'series-1',
        coverTitle: '鲜肉双阶段',
        sellingPoint: '新卖点',
        targetHealthTags: ['JOINT', 'SKIN'],
      });
    });

    it('returns the current settings without writing on an empty patch', async () => {
      const result = await service.updateSeriesReleaseSettings(
        'series-1',
        {},
        STAFF_ACCESS,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        seriesId: 'series-1',
        coverImageUrl: 'https://img.example.com/series-cover.jpg',
        sellingPoint: '两种能量一套配方',
      });
    });

    it('rejects over-long presentation text', async () => {
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
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('applies facade fields to live recipes only when applyToLive is true', async () => {
      await service.updateSeriesReleaseSettings(
        'series-1',
        { sellingPoint: '线上新卖点' },
        STAFF_ACCESS,
        { applyToLive: true },
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.recipe.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
        where: { seriesId: 'series-1', status: 'PUBLIC' },
        data: {
          coverImageUrl: 'https://img.example.com/series-cover.jpg',
          sellingPoint: '线上新卖点',
          coverTitle: '鸡肉双阶段',
          targetHealthTags: ['JOINT'],
        },
      });

      prisma.recipe.updateMany.mockClear();
      // AI set_copy 直连服务、不传 applyToLive：不能顺带改线上行。
      await service.updateSeriesReleaseSettings(
        'series-1',
        { sellingPoint: 'AI 改的文案' },
        STAFF_ACCESS,
      );
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
    });

    it('omits empty cover title and health tags when syncing live recipes', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'PUBLIC',
          coverTitle: '   ',
          targetHealthTags: [],
        }),
      );

      await service.updateSeriesReleaseSettings(
        'series-1',
        { sellingPoint: '新卖点' },
        STAFF_ACCESS,
        { applyToLive: true },
      );

      const data = prisma.recipe.updateMany.mock.calls[0][0].data;
      expect(data).toEqual({
        coverImageUrl: 'https://img.example.com/series-cover.jpg',
        sellingPoint: '新卖点',
      });
      expect(data).not.toHaveProperty('coverTitle');
      expect(data).not.toHaveProperty('targetHealthTags');
    });

    it('rejects clearing cover or selling point on a live series', async () => {
      // 系列本身仍是 DRAFT，但已有 PUBLIC 食谱行（例如曾经发布过）。
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'DRAFT' }),
      );
      prisma.recipe.count.mockResolvedValue(1);

      await expect(
        service.updateSeriesReleaseSettings(
          'series-1',
          { coverImageUrl: null },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow('已上线系列不能清空封面图');

      await expect(
        service.updateSeriesReleaseSettings(
          'series-1',
          { sellingPoint: '' },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow('已上线系列不能清空一句话卖点');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
    });

    it('treats a PUBLIC business status as live without counting recipes', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
      );
      prisma.recipe.count.mockResolvedValue(0);

      await expect(
        service.updateSeriesReleaseSettings(
          'series-1',
          { coverImageUrl: null },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow('已上线系列不能清空封面图');
      expect(prisma.recipe.count).not.toHaveBeenCalled();
    });

    it('allows clearing facade fields before the series goes live', async () => {
      prisma.recipe.count.mockResolvedValue(0);

      const result = await service.updateSeriesReleaseSettings(
        'series-1',
        { coverImageUrl: null, sellingPoint: '   ' },
        STAFF_ACCESS,
      );

      expect(prisma.recipeSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { coverImageUrl: null, sellingPoint: null },
      });
      expect(result).toMatchObject({
        coverImageUrl: null,
        sellingPoint: null,
      });
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
    function mockFirstReleaseSeries() {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'DRAFT' }),
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
          applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        }),
      ]);
    }

    it('releases every READY stage on first release and ignores caller stageCodes', async () => {
      mockFirstReleaseSeries();
      prisma.recipe.updateMany
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS, {
        stageCodes: ['HIGH_ACTIVITY_ADULT'],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.recipe.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: ['recipe-row-adult', 'recipe-row-senior'] },
          seriesId: 'series-1',
          status: 'DRAFT',
        },
        data: {
          status: 'PUBLIC',
          coverImageUrl: 'https://img.example.com/series-cover.jpg',
          coverTitle: '鸡肉双阶段',
          sellingPoint: '两种能量一套配方',
          targetHealthTags: ['JOINT'],
        },
      });
      // 其余 PUBLIC 行只刷新门面资料，不再改状态。
      expect(prisma.recipe.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          seriesId: 'series-1',
          status: 'PUBLIC',
          id: { notIn: ['recipe-row-adult', 'recipe-row-senior'] },
        },
        data: {
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
      expect(result).toMatchObject({
        seriesId: 'series-1',
        businessStatus: 'PUBLIC',
        releasedStageCodes: [
          'HIGH_ACTIVITY_ADULT',
          'LOW_ACTIVITY_ADULT_OR_SENIOR',
        ],
        publishedRecipeCount: 2,
        updatedRecipeCount: 2,
      });
      expect(result).not.toHaveProperty('requiredLifeStages');
    });

    it('releases a single READY stage when it is the only ready one', async () => {
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult',
          recipeId: 'recipe-adult',
          version: 1,
          status: 'DRAFT',
        }),
      ]);
      prisma.recipe.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS);

      expect(prisma.recipe.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: ['recipe-row-adult'] },
          seriesId: 'series-1',
          status: 'DRAFT',
        },
        data: expect.objectContaining({ status: 'PUBLIC' }),
      });
      expect(result).toMatchObject({
        businessStatus: 'PUBLIC',
        releasedStageCodes: ['HIGH_ACTIVITY_ADULT'],
        publishedRecipeCount: 1,
        updatedRecipeCount: 1,
      });
    });

    it('re-releases only the latest DRAFT and leaves the old PUBLIC version untouched', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
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
      prisma.recipe.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS);

      expect(prisma.recipe.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: ['recipe-row-adult-v2'] },
          seriesId: 'series-1',
          status: 'DRAFT',
        },
        data: expect.objectContaining({ status: 'PUBLIC' }),
      });
      const targetedIds = prisma.recipe.updateMany.mock.calls[0][0].where.id.in;
      expect(targetedIds).not.toContain('recipe-row-adult-v1');
      // 旧 PUBLIC 只刷新门面，不被当成「新发布」。
      const secondCall = prisma.recipe.updateMany.mock.calls[1][0];
      expect(secondCall.where).toEqual({
        seriesId: 'series-1',
        status: 'PUBLIC',
        id: { notIn: ['recipe-row-adult-v2'] },
      });
      expect(secondCall.data).not.toHaveProperty('status');
      expect(result).toMatchObject({
        businessStatus: 'PUBLIC',
        releasedStageCodes: ['HIGH_ACTIVITY_ADULT'],
        publishedRecipeCount: 1,
        updatedRecipeCount: 2,
      });
    });

    it('releases only the selected pending stages and leaves the others DRAFT', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
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
        recipeRecord({
          id: 'recipe-row-senior-v1',
          recipeId: 'recipe-senior',
          version: 1,
          status: 'PUBLIC',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        }),
        recipeRecord({
          id: 'recipe-row-senior-v2',
          recipeId: 'recipe-senior',
          version: 2,
          status: 'DRAFT',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        }),
      ]);
      prisma.recipe.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 2 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS, {
        stageCodes: ['HIGH_ACTIVITY_ADULT'],
      });

      const firstCall = prisma.recipe.updateMany.mock.calls[0][0];
      expect(firstCall.where).toEqual({
        id: { in: ['recipe-row-adult-v2'] },
        seriesId: 'series-1',
        status: 'DRAFT',
      });
      // 未选中的 B 阶段新 DRAFT 不在本次发布目标里。
      expect(firstCall.where.id.in).not.toContain('recipe-row-senior-v2');
      const secondCall = prisma.recipe.updateMany.mock.calls[1][0];
      expect(secondCall.where).toEqual({
        seriesId: 'series-1',
        status: 'PUBLIC',
        id: { notIn: ['recipe-row-adult-v2'] },
      });
      expect(secondCall.data).not.toHaveProperty('status');
      expect(result).toMatchObject({
        businessStatus: 'PUBLIC',
        releasedStageCodes: ['HIGH_ACTIVITY_ADULT'],
        publishedRecipeCount: 1,
        updatedRecipeCount: 3,
      });
    });

    it('rejects an empty stageCodes array on an already published series', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
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

      await expect(
        service.releaseSeries('series-1', ADMIN_ACCESS, { stageCodes: [] }),
      ).rejects.toThrow('请至少选择一个要更新的阶段');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
    });

    it('rejects stage codes that are not actionable', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
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
        recipeRecord({
          id: 'recipe-row-senior-v1',
          recipeId: 'recipe-senior',
          version: 1,
          status: 'PUBLIC',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        }),
      ]);

      await expect(
        service.releaseSeries('series-1', ADMIN_ACCESS, {
          stageCodes: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        }),
      ).rejects.toThrow('以下阶段当前不可更新：LOW_ACTIVITY_ADULT_OR_SENIOR');
      await expect(
        service.releaseSeries('series-1', ADMIN_ACCESS, {
          stageCodes: ['NOT_A_LIFE_STAGE'],
        }),
      ).rejects.toThrow('以下阶段当前不可更新：NOT_A_LIFE_STAGE');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a first release when no stage is READY', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'DRAFT' }),
      );
      // 只有设计稿、还没有任何阶段写进系列仓库：0 个 READY。
      prisma.designRecipe.findMany.mockResolvedValue([
        designRecord({
          id: 'draft-adult',
          seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        }),
      ]);

      await expect(
        service.releaseSeries('series-1', ADMIN_ACCESS, {
          stageCodes: ['HIGH_ACTIVITY_ADULT'],
        }),
      ).rejects.toThrow('还没有可发布的阶段，请先完成阶段上线检查');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('rejects an update when every stage is already up to date', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
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

      await expect(
        service.releaseSeries('series-1', ADMIN_ACCESS),
      ).rejects.toThrow('当前没有可更新的阶段');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('keeps recipe health tags when the series has none', async () => {
      mockFirstReleaseSeries();
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ targetHealthTags: [] }),
      );
      prisma.recipe.updateMany
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 0 });

      await service.releaseSeries('series-1', ADMIN_ACCESS);

      const data = prisma.recipe.updateMany.mock.calls[0][0].data;
      expect(data.status).toBe('PUBLIC');
      expect(data).not.toHaveProperty('targetHealthTags');
    });

    it('refuses to release when the series facade is incomplete', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ coverImageUrl: null, sellingPoint: null }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({ status: 'DRAFT' }),
      ]);

      await expect(
        service.releaseSeries('series-1', ADMIN_ACCESS),
      ).rejects.toThrow(/封面|卖点/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('lets only admins release the series', async () => {
      mockFirstReleaseSeries();

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
