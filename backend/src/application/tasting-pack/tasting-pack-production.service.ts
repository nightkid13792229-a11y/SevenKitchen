/**
 * 采购能力的注入令牌。
 *
 * 这里刻意**不直接 import PurchasingService**：采购域依赖链会牵进只发 ESM 的 uuid 包，
 * 一旦在本模块顶层 import，单测（CJS 运行时）就会因为解析不了 ESM 而整个跑不起来。
 * 用令牌注入既保留了运行时的真实实现，也让这个服务对采购域只依赖一个窄接口。
 */
export const TASTING_PACK_PURCHASING_PORT = 'TastingPackPurchasingPort';

export interface TastingPackPurchasingPort {
  generatePurchaseListFromTastingPackPlan(params: {
    planId: string;
    ingredientDetails: Array<Record<string, any>>;
    targetDate: string;
    createdById: string;
  }): Promise<{ id: string }>;
}

/**
 * 试吃装备货生产
 *
 * 现货要提前做一批放库存里卖。系统原先**只有订单驱动的生产**：
 * 没有顾客订单 → 生成不了采购清单 → 生成不了生产批次。
 * 这个服务就是补上那条通路：
 *
 *   建备货单（算出用料）→ 生成采购清单 → 排产 → 车间生产分装 → 确认入库
 *
 * 三条设计原则：
 *  1. **用料在建单那一刻冻结**。事后改商品配方或原料价，不影响一张已经在执行的单。
 *  2. **复用既有链路**。采购走 PurchasingService、生产走 ProductionService，
 *     不另写一套算法 —— 两套算法早晚会算出两个数。
 *  3. **入库数量以实际产出为准**。车间有损耗，系统给建议值，人确认。
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { buildProductionRecipeSnapshot } from '../recipe/production-recipe-snapshot';
import { Inject } from '@nestjs/common';
import { ProductionService } from '../production/production.service';
import { TastingPackConfigService } from './tasting-pack-config.service';
import { TastingPackPricingService } from './tasting-pack-pricing.service';
import { TastingPackService } from './tasting-pack.service';
import { TastingPackStockService } from './tasting-pack-stock.service';

export type TastingPackPlanStatus =
  | 'PLANNED'
  | 'PURCHASING'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'STOCKED'
  | 'CANCELLED';

export interface TastingPackPlanView {
  id: string;
  planNo: string;
  tastingPackId: string;
  tastingPackName: string;
  tastingPackCode: string;
  sets: number;
  plannedDate: string;
  status: TastingPackPlanStatus;
  /** 每道菜要做多少 */
  dishes: Array<{
    recipeId: string;
    recipeName: string;
    netWeightG: number;
    packageCount: number;
    packageSpecG: number;
  }>;
  ingredientCount: number;
  estimatedIngredientCost: number;
  purchaseListId: string | null;
  purchaseListStatus: string | null;
  productionBatchId: string | null;
  /** 排产后：建议入库套数（按实际产出算） */
  suggestedStockInSets: number | null;
  stockedSets: number | null;
  stockedAt: string | null;
  note: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

@Injectable()
export class TastingPackProductionService {
  private readonly logger = new Logger(TastingPackProductionService.name);

  constructor(
    private readonly prisma: PrismaService,
    // 这里必须是**类**而不是接口：Nest 靠类型元数据解析依赖，接口在运行时不存在
    private readonly packService: TastingPackService,
    private readonly pricingService: TastingPackPricingService,
    private readonly stockService: TastingPackStockService,
    private readonly configService: TastingPackConfigService,
    private readonly productionService: ProductionService,
    @Inject(TASTING_PACK_PURCHASING_PORT)
    private readonly purchasingService: TastingPackPurchasingPort,
  ) {}

  // ==========================================================
  // 建单
  // ==========================================================

  /**
   * 建备货生产单：把"做几套"换算成"每道菜做多少、每样原料买多少"并冻结下来。
   */
  async createPlan(params: {
    tastingPackId: string;
    sets: number;
    plannedDate: string;
    note?: string | null;
    createdById?: string | null;
  }): Promise<TastingPackPlanView> {
    const sets = this.assertPositiveInt(params.sets, '备货套数');
    const plannedDate = this.parseDate(params.plannedDate, '计划生产日期');

    const pack = await this.packService.getForAdmin(params.tastingPackId);
    if (pack.items.length === 0) {
      throw new BadRequestException('这个试吃装还没有配菜，无法备货');
    }

    const specs = pack.items.map((item) => ({
      recipeId: item.recipeId,
      packageCount: pack.bagsPerRecipe,
      packageSpecG: pack.packSpecG,
    }));

    const requirement = await this.pricingService.buildStockRequirement({
      specs,
      sets,
    });

    const created = await this.prisma.tastingPackProductionPlan.create({
      data: {
        planNo: await this.nextPlanNo(),
        tastingPackId: params.tastingPackId,
        sets,
        plannedDate,
        status: 'PLANNED',
        ingredientRequirementSnapshot:
          requirement.ingredientDetails as any,
        dishPlanSnapshot: requirement.perRecipe as any,
        note: params.note?.trim() || null,
        createdById: params.createdById ?? null,
      },
      include: { tastingPack: { select: { name: true, code: true } } },
    });

    this.logger.log(
      `[TastingPackPlan] 建备货单 ${created.planNo}：${sets} 套，${requirement.ingredientDetails.length} 种原料`,
    );

    return this.toView(created);
  }

  // ==========================================================
  // 补货建议（"一键备货"的入口）
  // ==========================================================

  /**
   * 列出需要补货的试吃装。
   *
   * 只列**已上架且可售量低于预警线**的：没上架的商品不卖了就不用备货。
   * 建议套数取「试吃装设置」里的默认备货套数，至少补到两倍预警线 ——
   * 只补到刚好过线，下次卖两单又要再备一次，来回折腾。
   */
  async getRestockSuggestions(): Promise<{
    items: Array<{
      tastingPackId: string;
      name: string;
      code: string;
      availableSets: number;
      lowStockThreshold: number;
      suggestedSets: number;
      openPlanId: string | null;
    }>;
  }> {
    const config = await this.configService.getConfig();
    const overviews = await this.stockService.listOverviews();
    const targets = overviews.filter((item) => item.needsRestock);
    if (targets.length === 0) return { items: [] };

    const openPlans = await this.prisma.tastingPackProductionPlan.findMany({
      where: {
        tastingPackId: { in: targets.map((item) => item.tastingPackId) },
        status: { in: ['PLANNED', 'PURCHASING', 'SCHEDULED', 'COMPLETED'] },
      },
      select: { id: true, tastingPackId: true },
    });
    const openPlanByPack = new Map(
      openPlans.map((plan) => [plan.tastingPackId, plan.id]),
    );

    const packs = await this.prisma.tastingPack.findMany({
      where: { id: { in: targets.map((item) => item.tastingPackId) } },
      select: { id: true, name: true, code: true },
    });
    const packById = new Map(packs.map((pack) => [pack.id, pack]));

    return {
      items: targets.map((item) => {
        const pack = packById.get(item.tastingPackId);
        const toReachTwiceThreshold = Math.max(
          0,
          item.lowStockThreshold * 2 - item.availableSets,
        );
        return {
          tastingPackId: item.tastingPackId,
          name: pack?.name ?? item.tastingPackName,
          code: pack?.code ?? '',
          availableSets: item.availableSets,
          lowStockThreshold: item.lowStockThreshold,
          suggestedSets: Math.max(config.defaultRestockSets, toReachTwiceThreshold),
          openPlanId: openPlanByPack.get(item.tastingPackId) ?? null,
        };
      }),
    };
  }

  // ==========================================================
  // 查询
  // ==========================================================

  async listPlans(params?: {
    status?: TastingPackPlanStatus;
    tastingPackId?: string;
  }): Promise<{ items: TastingPackPlanView[]; pendingCount: number }> {
    const where: Record<string, unknown> = {};
    if (params?.status) where.status = params.status;
    if (params?.tastingPackId) where.tastingPackId = params.tastingPackId;

    const rows = await this.prisma.tastingPackProductionPlan.findMany({
      where,
      include: { tastingPack: { select: { name: true, code: true } } },
      orderBy: [{ plannedDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    const items: TastingPackPlanView[] = [];
    for (const row of rows) {
      items.push(await this.toViewWithProgress(row));
    }

    const pendingCount = items.filter((item) =>
      ['PLANNED', 'PURCHASING', 'SCHEDULED', 'COMPLETED'].includes(item.status),
    ).length;

    return { items, pendingCount };
  }

  async getPlan(id: string): Promise<TastingPackPlanView> {
    const row = await this.prisma.tastingPackProductionPlan.findUnique({
      where: { id },
      include: { tastingPack: { select: { name: true, code: true } } },
    });
    if (!row) {
      throw new NotFoundException(`备货生产单不存在: ${id}`);
    }
    return this.toViewWithProgress(row);
  }

  async cancelPlan(
    id: string,
    reason: string,
  ): Promise<TastingPackPlanView> {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('取消备货单必须填写原因');
    }
    const row = await this.prisma.tastingPackProductionPlan.findUnique({
      where: { id },
      include: { tastingPack: { select: { name: true, code: true } } },
    });
    if (!row) {
      throw new NotFoundException(`备货生产单不存在: ${id}`);
    }
    if (row.status === 'STOCKED') {
      throw new ConflictException('已入库的备货单不能取消');
    }
    if (row.productionBatchId) {
      throw new ConflictException(
        '已排产的备货单不能直接取消。请先删除对应生产批次',
      );
    }

    const updated = await this.prisma.tastingPackProductionPlan.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledReason: reason.trim() },
      include: { tastingPack: { select: { name: true, code: true } } },
    });
    return this.toView(updated);
  }

  // ==========================================================
  // 采购
  // ==========================================================

  async generatePurchaseList(
    planId: string,
    createdById: string,
  ): Promise<TastingPackPlanView> {
    // 采购单要记经手人（数据库有外键），拿不到人就没法对账
    if (!createdById) {
      throw new BadRequestException('无法识别当前操作人，不能生成采购清单');
    }
    const plan = await this.prisma.tastingPackProductionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) {
      throw new NotFoundException(`备货生产单不存在: ${planId}`);
    }
    if (plan.status === 'CANCELLED') {
      throw new ConflictException('备货单已取消，不能生成采购清单');
    }
    if (plan.purchaseListId) {
      throw new ConflictException('这张备货单已经生成过采购清单');
    }

    const purchaseList =
      await this.purchasingService.generatePurchaseListFromTastingPackPlan({
        planId: plan.id,
        ingredientDetails:
          (plan.ingredientRequirementSnapshot as any[]) ?? [],
        targetDate: this.formatDate(plan.plannedDate),
        createdById,
      });

    const updated = await this.prisma.tastingPackProductionPlan.update({
      where: { id: planId },
      data: { status: 'PURCHASING', purchaseListId: purchaseList.id },
      include: { tastingPack: { select: { name: true, code: true } } },
    });
    this.logger.log(
      `[TastingPackPlan] ${updated.planNo} 已生成采购清单 ${purchaseList.id}`,
    );
    return this.toView(updated);
  }

  // ==========================================================
  // 排产
  // ==========================================================

  /**
   * 排产：把备货单变成真正的生产批次。
   *
   * 默认要求采购清单已完成（原料到位才开工），
   * 原料本来就在库里时可以强制排产（后台开关控制），强制会记日志。
   */
  async schedule(
    planId: string,
    params: { productionDate?: string; force?: boolean; createdById?: string | null },
  ): Promise<TastingPackPlanView> {
    const plan = await this.prisma.tastingPackProductionPlan.findUnique({
      where: { id: planId },
      include: { tastingPack: { include: { items: true } } },
    });
    if (!plan) {
      throw new NotFoundException(`备货生产单不存在: ${planId}`);
    }
    if (plan.status === 'CANCELLED') {
      throw new ConflictException('备货单已取消，不能排产');
    }
    if (plan.productionBatchId) {
      throw new ConflictException('这张备货单已经排过产');
    }
    if (plan.status === 'PLANNED' && !plan.purchaseListId) {
      throw new ConflictException('请先生成采购清单，再去采购原料');
    }

    const force = params.force === true;
    if (force) {
      const config = await this.configService.getConfig();
      if (!config.allowForceSchedule) {
        throw new ConflictException(
          '当前设置不允许跳过采购检查。请先在「试吃装设置」里打开，或先完成采购',
        );
      }
      this.logger.warn(
        `[TastingPackPlan] ${plan.planNo} 被强制排产（跳过采购完成检查）`,
      );
    } else if (plan.purchaseListId) {
      const purchaseList = await this.prisma.purchaseList.findUnique({
        where: { id: plan.purchaseListId },
        select: { status: true },
      });
      if (!purchaseList || purchaseList.status !== 'COMPLETED') {
        throw new ConflictException(
          '采购清单还没完成。请先完成采购，或使用「强制排产」',
        );
      }
    }

    const productionDate = params.productionDate
      ? this.parseDate(params.productionDate, '生产日期')
      : plan.plannedDate;

    // 用建单时冻结的用料计划算产量，而不是用商品当前配置 ——
    // 商品可能在这期间被改过，但这一单已经按老配方买了料
    const dishPlan = (plan.dishPlanSnapshot as any[]) ?? [];
    if (dishPlan.length === 0) {
      throw new BadRequestException('备货单缺少用料计划，无法排产');
    }

    const specs = dishPlan.map((dish) => ({
      recipeId: dish.recipeId,
      packageCount: dish.packageCount,
      packageSpecG: dish.packageSpecG,
    }));
    const contexts = await this.pricingService.loadPackContext({ specs });

    const dishes = contexts.map((context, index) => ({
      recipeSnapshot: buildProductionRecipeSnapshot({
        recipe: context.recipe,
        ingredientMap: context.ingredientMap,
        prepMethodMap: context.prepMethodMap,
      }),
      netWeightG: Number(dishPlan[index].netWeightG),
      packageSpecG: context.spec.packageSpecG,
      packageCount: context.spec.packageCount,
    }));

    const batch = await this.productionService.createStockProductionBatch({
      planId: plan.id,
      productionDate,
      dishes,
      createdById: params.createdById ?? null,
    });

    const updated = await this.prisma.tastingPackProductionPlan.update({
      where: { id: planId },
      data: {
        status: 'SCHEDULED',
        productionBatchId: batch.id,
        plannedDate: productionDate,
      },
      include: { tastingPack: { select: { name: true, code: true } } },
    });
    this.logger.log(
      `[TastingPackPlan] ${updated.planNo} 已排产，批次 ${batch.id}（${batch.packagingUnits.length} 锅）`,
    );
    return this.toViewWithProgress(updated);
  }

  // ==========================================================
  // 完工入库
  // ==========================================================

  /**
   * 确认入库。
   *
   * 系统按"实际产出最小的那道菜"给出建议套数（配不齐就不算一套），
   * 但最终由人来确认 —— 车间可能因为损耗少做了几套，也可能多做了。
   */
  async stockIn(
    planId: string,
    params: {
      sets?: number;
      unitCost?: number | null;
      producedAt?: string;
      note?: string | null;
      operatorId?: string | null;
    },
  ): Promise<TastingPackPlanView> {
    const plan = await this.prisma.tastingPackProductionPlan.findUnique({
      where: { id: planId },
      include: { tastingPack: { select: { name: true, code: true } } },
    });
    if (!plan) {
      throw new NotFoundException(`备货生产单不存在: ${planId}`);
    }
    if (plan.status === 'STOCKED') {
      throw new ConflictException('这张备货单已经入库过了');
    }
    if (!plan.productionBatchId) {
      throw new ConflictException('还没排产，不能入库');
    }

    const batches = await this.productionService.listProductionBatchesByDate(
      this.formatDate(plan.plannedDate),
    );
    const batch = batches.find((item) => item.id === plan.productionBatchId);
    if (!batch) {
      throw new NotFoundException('找不到对应的生产批次');
    }

    const unfinished = batch.packagingUnits.filter(
      (unit) => unit.status !== 'COMPLETED',
    );
    if (unfinished.length > 0) {
      throw new ConflictException(
        `还有 ${unfinished.length} 锅没完工，请先在员工端完成生产再入库`,
      );
    }

    const suggested = this.suggestStockInSets(
      batch.packagingUnits,
      (plan.dishPlanSnapshot as any[]) ?? [],
      plan.sets,
    );

    const sets =
      params.sets === undefined || params.sets === null
        ? suggested
        : this.assertPositiveInt(params.sets, '入库套数');

    if (sets <= 0) {
      throw new ConflictException(
        '按实际产出算不出一套完整的试吃装（某道菜产量不足），请核对后手工填写入库套数',
      );
    }

    await this.stockService.stockIn({
      tastingPackId: plan.tastingPackId,
      sets,
      producedAt: params.producedAt ?? plan.plannedDate,
      unitCost: params.unitCost ?? null,
      note:
        params.note?.trim() ||
        `备货单 ${plan.planNo}（计划 ${plan.sets} 套）完工入库`,
      operatorId: params.operatorId ?? null,
      productionPlanId: plan.id,
    });

    const updated = await this.prisma.tastingPackProductionPlan.update({
      where: { id: planId },
      data: { status: 'STOCKED', stockedSets: sets, stockedAt: new Date() },
      include: { tastingPack: { select: { name: true, code: true } } },
    });
    this.logger.log(
      `[TastingPackPlan] ${updated.planNo} 入库 ${sets} 套（计划 ${plan.sets} 套）`,
    );
    return this.toViewWithProgress(updated);
  }

  /**
   * 建议入库套数：取"实际产出 ÷ 每套用量"里最小的那道菜。
   *
   * 少一道菜就配不成一套，所以取最小值而不是平均值。
   *
   * ⚠️ `dishPlan.netWeightG` 是**整张备货单**的用量（比如做 10 套就是 1600g），
   * 不是一套的用量。要除以计划套数才能还原"一套需要多少克" ——
   * 少除这一步会把 10 套算成 1 套（实测踩过）。
   */
  suggestStockInSets(
    units: Array<{ actualOutputG?: number | null; totalProductionG: number; recipeSnapshot: any }>,
    dishPlan: Array<{ recipeId: string; netWeightG: number; packageCount: number; packageSpecG: number }>,
    planSets: number,
  ): number {
    const perRecipe = new Map<
      string,
      { plan: (typeof dishPlan)[number]; actualG: number }
    >();

    for (const unit of units) {
      const recipeId = unit.recipeSnapshot?.id;
      if (!recipeId) continue;
      const planned = dishPlan.find((dish) => dish.recipeId === recipeId);
      if (!planned) continue;
      const actual = Number(unit.actualOutputG ?? unit.totalProductionG) || 0;
      const existing = perRecipe.get(recipeId);
      if (existing) {
        existing.actualG += actual;
      } else {
        perRecipe.set(recipeId, { plan: planned, actualG: actual });
      }
    }

    const safePlanSets = planSets > 0 ? planSets : 1;
    let suggested: number | null = null;
    for (const entry of perRecipe.values()) {
      const perSetG = Number(entry.plan.netWeightG) / safePlanSets;
      if (!Number.isFinite(perSetG) || perSetG <= 0) continue;
      const sets = Math.floor(entry.actualG / perSetG);
      suggested = suggested === null ? sets : Math.min(suggested, sets);
    }

    return suggested ?? 0;
  }

  // ==========================================================
  // 内部
  // ==========================================================

  private async toViewWithProgress(row: any): Promise<TastingPackPlanView> {
    const view = this.toView(row);

    if (row.productionBatchId && row.status !== 'STOCKED') {
      try {
        const batches =
          await this.productionService.listProductionBatchesByDate(
            this.formatDate(row.plannedDate),
          );
        const batch = batches.find((item) => item.id === row.productionBatchId);
        if (batch) {
          view.suggestedStockInSets = this.suggestStockInSets(
            batch.packagingUnits,
            (row.dishPlanSnapshot as any[]) ?? [],
            row.sets,
          );
          const allDone = batch.packagingUnits.every(
            (unit) => unit.status === 'COMPLETED',
          );
          if (allDone && row.status === 'SCHEDULED') {
            view.status = 'COMPLETED';
          }
        }
      } catch (error) {
        this.logger.warn(
          `[TastingPackPlan] 计算 ${row.planNo} 的建议入库量失败：${(error as Error).message}`,
        );
      }
    }

    if (row.purchaseListId) {
      const purchaseList = await this.prisma.purchaseList.findUnique({
        where: { id: row.purchaseListId },
        select: { status: true },
      });
      view.purchaseListStatus = purchaseList?.status ?? null;
    }

    return view;
  }

  private toView(row: any): TastingPackPlanView {
    const dishPlan = (row.dishPlanSnapshot as any[]) ?? [];
    const ingredientDetails = (row.ingredientRequirementSnapshot as any[]) ?? [];

    return {
      id: row.id,
      planNo: row.planNo,
      tastingPackId: row.tastingPackId,
      tastingPackName: row.tastingPack?.name ?? '未知商品',
      tastingPackCode: row.tastingPack?.code ?? '',
      sets: row.sets,
      plannedDate: this.formatDate(row.plannedDate),
      status: row.status,
      dishes: dishPlan.map((dish) => ({
        recipeId: dish.recipeId,
        recipeName: dish.recipeName,
        netWeightG: Number(dish.netWeightG) || 0,
        packageCount: Number(dish.packageCount) || 0,
        packageSpecG: Number(dish.packageSpecG) || 0,
      })),
      ingredientCount: ingredientDetails.length,
      estimatedIngredientCost:
        Math.round(
          ingredientDetails.reduce(
            (sum, detail) => sum + (Number(detail.cost) || 0),
            0,
          ) * 100,
        ) / 100,
      purchaseListId: row.purchaseListId ?? null,
      purchaseListStatus: null,
      productionBatchId: row.productionBatchId ?? null,
      suggestedStockInSets: null,
      stockedSets: row.stockedSets ?? null,
      stockedAt: row.stockedAt ? row.stockedAt.toISOString() : null,
      note: row.note ?? null,
      cancelledReason: row.cancelledReason ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertPositiveInt(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${label}必须是大于 0 的整数`);
    }
    return parsed;
  }

  private parseDate(value: string | Date, label: string): Date {
    const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
    if (isNaN(date.getTime())) {
      throw new BadRequestException(`${label}格式无效: ${String(value)}`);
    }
    return date;
  }

  private formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private async nextPlanNo(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const bytes = randomBytes(5);
      let suffix = '';
      for (let i = 0; i < 5; i += 1) {
        suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      }
      const planNo = `BP-${this.formatDate(new Date()).replace(/-/g, '')}-${suffix}`;
      const exists = await this.prisma.tastingPackProductionPlan.findUnique({
        where: { planNo },
        select: { id: true },
      });
      if (!exists) return planNo;
    }
    throw new ConflictException('生成备货单号失败，请重试');
  }
}

