import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
    // 2026-11-07：整系列发布前要查一次食材成本
    recipeItem: { findMany: jest.fn().mockResolvedValue([]) },
    designRecipe: {
      findMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { version: null } }),
    },
    recipe: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    recipeSeries: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    // 2026-10-27 发布门禁「已归类」：这些用例都假设系列已可发布，
    // 默认给一条归属，避免被新门禁打成阻断。
    recipeSeriesTaxonomy: {
      count: jest.fn().mockResolvedValue(1),
      // 2026-11-08 草稿：生成「生效值」时要读一次线上归类
      findMany: jest
        .fn()
        .mockResolvedValue([{ kindId: 'kind-1', nodeId: 'node-1' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    recipeSeriesCoverBadge: {
      findMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    recipeHealthTag: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    recipeTaxonomyNode: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
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
    prisma.recipeSeries.updateMany.mockResolvedValue({ count: 1 });
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
        select: { healthTagId: true, healthTag: { select: { name: true } } },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('includes cover badge names in readiness presentation', async () => {
      prisma.recipeSeriesCoverBadge.findMany.mockResolvedValue([
        { healthTagId: 'tag-1', healthTag: { name: '低脂' } },
        { healthTagId: 'tag-2', healthTag: { name: '含鸭胸' } },
        { healthTagId: 'tag-3', healthTag: { name: '易消化' } },
        { healthTagId: 'tag-4', healthTag: { name: '鲜肉现制' } },
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

  describe('saveSeriesReleaseDraft', () => {
    function mockEditableSeries(overrides: Record<string, unknown> = {}) {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'DRAFT', ...overrides }),
      );
      // 未上线：可以清空封面 / 卖点
      prisma.recipe.count.mockResolvedValue(0);
    }

    it('员工保存名称进草稿，只写 releaseDraft、不碰线上名', async () => {
      mockEditableSeries();
      const result = await service.saveSeriesReleaseDraft(
        'series-1',
        { name: '均衡营养｜三文鱼南瓜' },
        STAFF_ACCESS,
      );

      expect(result.changedFields).toEqual(['name']);
      expect(result.name).toBe('均衡营养｜三文鱼南瓜');
      expect(result.updatedAt).toBeTruthy();
      const data = prisma.recipeSeries.update.mock.calls.at(-1)?.[0].data;
      expect(data.releaseDraft.name).toBe('均衡营养｜三文鱼南瓜');
      expect(data.releaseDraft.touched).toContain('name');
      // 线上系列名不动，发布时才改
      expect(data.name).toBeUndefined();
    });

    it('顾客不能维护发布草稿', async () => {
      mockEditableSeries();
      await expect(
        service.saveSeriesReleaseDraft('series-1', { name: '新名字' }, CUSTOMER_ACCESS),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('空名与超长名直接 400', async () => {
      mockEditableSeries();
      await expect(
        service.saveSeriesReleaseDraft('series-1', { name: '   ' }, STAFF_ACCESS),
      ).rejects.toThrow('食谱名称不能为空');
      await expect(
        service.saveSeriesReleaseDraft(
          'series-1',
          { name: '这个系列名称明显超过十二个字' },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow('食谱名称最多 12 个字');
    });

    it('显式 null 可以清空卖点（未上线）', async () => {
      mockEditableSeries();
      const result = await service.saveSeriesReleaseDraft(
        'series-1',
        { sellingPoint: null },
        STAFF_ACCESS,
      );
      expect(result.changedFields).toContain('sellingPoint');
      const data = prisma.recipeSeries.update.mock.calls.at(-1)?.[0].data;
      expect(data.releaseDraft.sellingPoint).toBeNull();
    });

    it('改回和线上一致时删掉草稿，不留 stale 标记', async () => {
      mockEditableSeries({
        name: '鸡肉双阶段',
        releaseDraft: {
          name: '鸡肉双阶段',
          coverImageUrl: 'https://img.example.com/series-cover.jpg',
          coverTitle: '鸡肉双阶段',
          sellingPoint: '两种能量一套配方',
          targetHealthTags: ['JOINT'],
          badgeHealthTagIds: [],
          taxonomy: [{ kindId: 'kind-1', nodeId: 'node-1' }],
          touched: ['name'],
        },
        releaseDraftUpdatedAt: new Date('2026-11-08T03:52:00.000Z'),
      });

      const result = await service.saveSeriesReleaseDraft(
        'series-1',
        {},
        STAFF_ACCESS,
      );

      expect(result.changedFields).toEqual([]);
      const data = prisma.recipeSeries.update.mock.calls.at(-1)?.[0].data;
      expect(data.releaseDraftUpdatedAt).toBeNull();
      expect(data.releaseDraftUpdatedBy).toBeNull();
    });

    it('角标复用白名单校验：白名单外的词、不存在的 id 都拒绝', async () => {
      mockEditableSeries();
      prisma.recipeHealthTag.findMany.mockResolvedValue([
        { id: 'tag-chicken', name: '含鸡胸' },
      ]);
      await expect(
        service.saveSeriesReleaseDraft(
          'series-1',
          { badgeHealthTagIds: ['tag-chicken'] },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(/不能作为封面角标/);

      prisma.recipeHealthTag.findMany.mockResolvedValue([]);
      await expect(
        service.saveSeriesReleaseDraft(
          'series-1',
          { badgeHealthTagIds: ['tag-gone'] },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(/合规词表/);
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('归类复用四条校验：停用 / 父节点 / 同分类重复都拒绝', async () => {
      mockEditableSeries();
      prisma.recipeTaxonomyNode.findMany.mockResolvedValue([
        { id: 'node-1', kindId: 'kind-1', name: '软便', status: 'DISABLED' },
      ]);
      await expect(
        service.saveSeriesReleaseDraft(
          'series-1',
          { taxonomy: [{ kindId: 'kind-1', nodeId: 'node-1' }] },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(/停用/);

      prisma.recipeTaxonomyNode.findMany.mockResolvedValue([
        { id: 'node-1', kindId: 'kind-1', name: '软便', status: 'ACTIVE' },
      ]);
      prisma.recipeTaxonomyNode.count.mockResolvedValue(1);
      await expect(
        service.saveSeriesReleaseDraft(
          'series-1',
          { taxonomy: [{ kindId: 'kind-1', nodeId: 'node-1' }] },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(/叶子/);

      prisma.recipeTaxonomyNode.count.mockResolvedValue(0);
      prisma.recipeTaxonomyNode.findMany.mockResolvedValue([
        { id: 'node-1', kindId: 'kind-1', name: '三文鱼', status: 'ACTIVE' },
        { id: 'node-2', kindId: 'kind-1', name: '鸡', status: 'ACTIVE' },
      ]);
      await expect(
        service.saveSeriesReleaseDraft(
          'series-1',
          {
            taxonomy: [
              { kindId: 'kind-1', nodeId: 'node-1' },
              { kindId: 'kind-1', nodeId: 'node-2' },
            ],
          },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow(/同一分类只能选一个节点/);
    });

    it('并发保存：expectedUpdatedAt 对不上直接 409', async () => {
      mockEditableSeries({
        releaseDraftUpdatedAt: new Date('2026-11-08T03:52:00.000Z'),
      });
      await expect(
        service.saveSeriesReleaseDraft(
          'series-1',
          {
            sellingPoint: '新卖点',
            expectedUpdatedAt: '2026-11-08T03:51:00.000Z',
          },
          STAFF_ACCESS,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('expectedUpdatedAt 一致时用条件更新写入（原子乐观锁）', async () => {
      const at = new Date('2026-11-08T03:52:00.000Z');
      mockEditableSeries({ releaseDraftUpdatedAt: at });

      const result = await service.saveSeriesReleaseDraft(
        'series-1',
        { sellingPoint: '新卖点', expectedUpdatedAt: at.toISOString() },
        STAFF_ACCESS,
      );

      expect(result.changedFields).toEqual(['sellingPoint']);
      expect(prisma.recipeSeries.updateMany).toHaveBeenCalledWith({
        where: { id: 'series-1', releaseDraftUpdatedAt: at },
        data: expect.objectContaining({
          releaseDraft: expect.objectContaining({ sellingPoint: '新卖点' }),
        }),
      });
      // 不再用无条件 update：检查和写入必须是同一条 SQL
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
    });

    it('已上线系列不能通过草稿清空封面图', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
      );
      prisma.recipe.count.mockResolvedValue(1);
      await expect(
        service.saveSeriesReleaseDraft(
          'series-1',
          { coverImageUrl: null },
          STAFF_ACCESS,
        ),
      ).rejects.toThrow('已上线系列不能清空封面图');
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
        data: expect.objectContaining({
          businessStatus: 'PUBLIC',
          coverImageUrl: 'https://img.example.com/series-cover.jpg',
          sellingPoint: '两种能量一套配方',
        }),
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

    it('发布时用条件更新锁住草稿（expected 一致）', async () => {
      mockFirstReleaseSeries();
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'DRAFT', releaseDraftUpdatedAt: null }),
      );
      prisma.recipe.updateMany
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 0 });

      await service.releaseSeries('series-1', ADMIN_ACCESS, {
        expectedDraftUpdatedAt: null,
      });

      expect(prisma.recipeSeries.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'series-1', releaseDraftUpdatedAt: null },
          data: expect.objectContaining({
            businessStatus: 'PUBLIC',
            releaseDraftUpdatedAt: null,
          }),
        }),
      );
      // 条件更新成功后再读回系列（返回值用）
      expect(prisma.recipeSeries.findUnique).toHaveBeenCalledTimes(2);
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

    it('applies the release draft without touching any stage recipe', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'PUBLIC',
          releaseDraft: {
            coverImageUrl: 'https://img.example.com/series-cover-v2.jpg',
            coverTitle: '鸡肉双阶段',
            sellingPoint: '两种能量，一套配方',
            targetHealthTags: ['JOINT'],
            badgeHealthTagIds: ['tag-1'],
            taxonomy: [{ kindId: 'kind-1', nodeId: 'node-2' }],
          },
          releaseDraftUpdatedAt: new Date('2026-11-08T03:52:00.000Z'),
        }),
      );
      // 阶段已经全是最新：没有 DRAFT 行可发，只有资料草稿。
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult-v4',
          recipeId: 'recipe-adult',
          version: 4,
          status: 'PUBLIC',
        }),
      ]);
      prisma.recipe.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS);

      expect(result.releasedStageCodes).toEqual([]);
      expect(result.appliedDraftFields).toEqual([
        'coverImageUrl',
        'sellingPoint',
        'coverBadges',
        'taxonomy',
      ]);
      // 门面用草稿值刷新所有已上线食谱
      expect(prisma.recipe.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLIC' }),
          data: expect.objectContaining({
            coverImageUrl: 'https://img.example.com/series-cover-v2.jpg',
            sellingPoint: '两种能量，一套配方',
          }),
        }),
      );
      // 草稿落到系列上并清空
      expect(prisma.recipeSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            coverImageUrl: 'https://img.example.com/series-cover-v2.jpg',
            releaseDraft: expect.anything(),
            releaseDraftUpdatedAt: null,
          }),
        }),
      );
      // 角标 / 归类整体覆盖成草稿
      expect(prisma.recipeSeriesCoverBadge.deleteMany).toHaveBeenCalledWith({
        where: { seriesId: 'series-1' },
      });
      expect(prisma.recipeSeriesCoverBadge.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [{ seriesId: 'series-1', healthTagId: 'tag-1', sortOrder: 0 }],
        }),
      );
      expect(prisma.recipeSeriesTaxonomy.deleteMany).toHaveBeenCalledWith({
        where: { seriesId: 'series-1' },
      });
      expect(prisma.recipeSeriesTaxonomy.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [{ seriesId: 'series-1', kindId: 'kind-1', nodeId: 'node-2' }],
        }),
      );
    });

    it('releases every actionable stage in one go for a public series', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({ businessStatus: 'PUBLIC' }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'adult-v1',
          recipeId: 'recipe-adult',
          version: 1,
          status: 'PUBLIC',
        }),
        recipeRecord({
          id: 'adult-v2',
          recipeId: 'recipe-adult',
          version: 2,
          status: 'DRAFT',
        }),
        recipeRecord({
          id: 'senior-v1',
          recipeId: 'recipe-senior',
          version: 1,
          status: 'PUBLIC',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        }),
        recipeRecord({
          id: 'senior-v2',
          recipeId: 'recipe-senior',
          version: 2,
          status: 'DRAFT',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          applicableLifeStages: ['LOW_ACTIVITY_ADULT_OR_SENIOR'],
        }),
      ]);
      prisma.recipe.updateMany
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS);

      // 不再让前端挑阶段：两个待更新阶段一次全发
      expect(result.releasedStageCodes).toEqual([
        'HIGH_ACTIVITY_ADULT',
        'LOW_ACTIVITY_ADULT_OR_SENIOR',
      ]);
      expect(prisma.recipe.updateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['adult-v2', 'senior-v2'] },
            status: 'DRAFT',
          }),
        }),
      );
    });

    it('syncs the name to published recipes when the draft renames the series', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'PUBLIC',
          name: '旧名字',
          releaseDraft: {
            name: '新名字',
            coverImageUrl: 'https://img.example.com/series-cover.jpg',
            coverTitle: '鸡肉双阶段',
            sellingPoint: '两种能量一套配方',
            targetHealthTags: ['JOINT'],
            badgeHealthTagIds: [],
            taxonomy: [{ kindId: 'kind-1', nodeId: 'node-1' }],
            touched: ['name'],
          },
          releaseDraftUpdatedAt: new Date('2026-11-08T03:52:00.000Z'),
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult',
          recipeId: 'recipe-adult',
          version: 1,
          status: 'PUBLIC',
        }),
      ]);
      prisma.designRecipe.findMany.mockResolvedValue([
        {
          id: 'design-1',
          seriesLifeStage: null,
          status: 'DRAFT',
          publishedRecipeId: null,
          publishedAt: null,
          updatedAt: new Date('2026-11-01T00:00:00.000Z'),
        },
      ]);
      prisma.designRecipe.aggregate.mockResolvedValue({
        _max: { version: 2 },
      });
      prisma.recipe.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS);

      expect(result.appliedDraftFields).toEqual(['name']);
      // 设计稿版本号顺延，名字跟着系列走
      expect(prisma.designRecipe.update).toHaveBeenCalledWith({
        where: { id: 'design-1' },
        data: { name: '新名字', version: 3 },
      });
      // 未交付的正式食谱行同步改名；已交付的历史不动
      expect(prisma.recipe.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            seriesId: 'series-1',
            name: { not: '新名字' },
            deliveryItems: { none: {} },
            deliveries: { none: {} },
          }),
          data: { name: '新名字' },
        }),
      );
    });

    it('only applies the fields the admin touched (selling point) and leaves badges / taxonomy alone', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'PUBLIC',
          releaseDraft: {
            name: '鸡肉双阶段',
            coverImageUrl: 'https://img.example.com/series-cover.jpg',
            coverTitle: '鸡肉双阶段',
            sellingPoint: '新卖点',
            targetHealthTags: ['JOINT'],
            badgeHealthTagIds: ['tag-stale'],
            taxonomy: [{ kindId: 'kind-1', nodeId: 'node-stale' }],
            touched: ['sellingPoint'],
          },
          releaseDraftUpdatedAt: new Date('2026-11-08T03:52:00.000Z'),
        }),
      );
      prisma.recipe.findMany.mockResolvedValue([
        recipeRecord({
          id: 'recipe-row-adult',
          recipeId: 'recipe-adult',
          version: 1,
          status: 'PUBLIC',
        }),
      ]);
      // 别人在草稿保存之后改了线上角标 / 归类
      prisma.recipeSeriesCoverBadge.findMany.mockResolvedValue([
        { healthTagId: 'tag-live', healthTag: { name: '低脂' } },
      ]);
      prisma.recipeSeriesTaxonomy.findMany.mockResolvedValue([
        { kindId: 'kind-1', nodeId: 'node-live' },
      ]);
      prisma.recipe.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.releaseSeries('series-1', ADMIN_ACCESS);

      expect(result.appliedDraftFields).toEqual(['sellingPoint']);
      // 没动过的角标 / 归类不允许被整组重建
      expect(prisma.recipeSeriesCoverBadge.deleteMany).not.toHaveBeenCalled();
      expect(prisma.recipeSeriesTaxonomy.deleteMany).not.toHaveBeenCalled();
      expect(prisma.recipeSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sellingPoint: '新卖点',
            coverImageUrl: 'https://img.example.com/series-cover.jpg',
          }),
        }),
      );
    });

    it('rejects a release when the draft changed after the drawer loaded (409)', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'PUBLIC',
          releaseDraftUpdatedAt: new Date('2026-11-08T03:52:00.000Z'),
        }),
      );

      await expect(
        service.releaseSeries('series-1', ADMIN_ACCESS, {
          expectedDraftUpdatedAt: '2026-11-08T03:51:00.000Z',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a draft-only release when the series has never been public', async () => {
      prisma.recipeSeries.findUnique.mockResolvedValue(
        seriesRecord({
          businessStatus: 'DRAFT',
          releaseDraft: {
            name: '鸡肉双阶段',
            coverImageUrl: 'https://img.example.com/series-cover.jpg',
            sellingPoint: '两种能量一套配方',
            targetHealthTags: ['JOINT'],
            badgeHealthTagIds: [],
            taxonomy: [{ kindId: 'kind-1', nodeId: 'node-1' }],
          },
          releaseDraftUpdatedAt: new Date('2026-11-08T03:52:00.000Z'),
        }),
      );
      // 没有任何阶段写进系列仓库：0 个 READY。
      prisma.recipe.findMany.mockResolvedValue([]);
      prisma.designRecipe.findMany.mockResolvedValue([]);

      await expect(
        service.releaseSeries('series-1', ADMIN_ACCESS),
      ).rejects.toThrow(/还没有可发布的阶段/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
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
      ).rejects.toThrow('当前没有待发布的内容');

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
