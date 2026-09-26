/**
 * 试吃装成品库存
 *
 * 系统原先**只有原料库存**（按克记），没有任何"做好的成品"概念。
 * 试吃装是现货：提前做好一批放库存里，顾客下单只扣库存，不排产。
 * 所以这里要从零建一套成品库存，并且必须满足四条硬要求：
 *
 *   1. **不超卖**：下单占用走条件更新（`quantityRemaining >= n`），
 *      并发抢最后一套时只有一个人能成功，由数据库保证，不靠应用层判断。
 *   2. **可释放**：顾客下单即扣，30 分钟不付款要能原样还回去。
 *   3. **先到期先出**：快过期的先卖，减少报废。
 *   4. **可对账**：每笔变动都写流水，带业务来源与订单号。
 *
 * 成本口径：入库时把当套成本**锁进批次**，现货售价按库存加权平均成本算，
 * 不随之后原料价波动 —— 卖的是早先做好的货。
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TastingPackConfigService } from './tasting-pack-config.service';

/** 临期预警：剩余保质期少于这个天数就在后台提示尽快卖 */
export const EXPIRING_SOON_DAYS = 30;

/**
 * 加月份并处理月末溢出。
 *
 * 「1 月 31 日 + 1 个月」在 JS 里会滚到 3 月 3 日，
 * 而食品保质期不能这么算 —— 必须停在 2 月的最后一天（2 月 28/29 日）。
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getMonth() + months;
  const result = new Date(date.getTime());
  result.setDate(1);
  result.setMonth(targetMonth);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
  return result;
}

/** YYYY-MM-DD（本地时区，用于批次号与提示文案） */
export function formatLocalDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type TastingPackStockReasonCode =
  | 'STOCK_IN'
  | 'ORDER_RESERVE'
  | 'ORDER_RELEASE'
  | 'MANUAL_ADJUST'
  | 'EXPIRE';

export interface StockBatchDto {
  id: string;
  batchNo: string;
  tastingPackId: string;
  producedAt: string;
  expiresAt: string;
  quantityTotal: number;
  quantityRemaining: number;
  unitCost: number | null;
  status: string;
  note: string | null;
  productionPlanId: string | null;
  createdAt: string;
  /** 距离到期还有几天（负数表示已过期） */
  daysToExpiry: number;
}

export interface TastingPackStockOverview {
  tastingPackId: string;
  tastingPackName: string;
  /** 可售套数（不含过期批次） */
  availableSets: number;
  /** 30 天内到期、要赶紧卖的套数 */
  expiringSoonSets: number;
  /** 已过期但尚未清理的套数 */
  expiredSets: number;
  /** 库存加权平均单套成本；没有库存或批次没记成本时为 null */
  weightedUnitCost: number | null;
  lowStockThreshold: number;
  /** 已上架且可售套数低于阈值 —— 后台要标红提醒补货 */
  needsRestock: boolean;
  batches: StockBatchDto[];
}

/** 一次下单占用的分配结果 */
export interface StockReservation {
  packId: string;
  sets: number;
  /** 按批次拆分：从哪几批各扣了多少 */
  allocations: Array<{ batchId: string; batchNo: string; sets: number }>;
  /** 被占用批次的加权平均单套成本 */
  weightedUnitCost: number | null;
}

@Injectable()
export class TastingPackStockService {
  private readonly logger = new Logger(TastingPackStockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: TastingPackConfigService,
  ) {}

  // ==========================================================
  // 读
  // ==========================================================

  /** 单个商品的库存总览 */
  async getOverview(tastingPackId: string): Promise<TastingPackStockOverview> {
    const pack = await this.prisma.tastingPack.findUnique({
      where: { id: tastingPackId },
      select: { id: true, name: true, status: true },
    });
    if (!pack) {
      throw new NotFoundException(`试吃装不存在: ${tastingPackId}`);
    }

    const config = await this.configService.getConfig();
    const batches = await this.prisma.tastingPackStockBatch.findMany({
      where: { tastingPackId },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });

    return this.buildOverview(
      { id: pack.id, name: pack.name, status: pack.status },
      batches,
      config.lowStockThreshold,
    );
  }

  /** 全部商品的库存总览（后台列表用，一次查完避免 N+1） */
  async listOverviews(): Promise<TastingPackStockOverview[]> {
    const config = await this.configService.getConfig();
    const packs = await this.prisma.tastingPack.findMany({
      select: { id: true, name: true, status: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    if (packs.length === 0) return [];

    const batches = await this.prisma.tastingPackStockBatch.findMany({
      where: { tastingPackId: { in: packs.map((pack) => pack.id) } },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });

    const byPack = new Map<string, typeof batches>();
    for (const batch of batches) {
      const list = byPack.get(batch.tastingPackId) ?? [];
      list.push(batch);
      byPack.set(batch.tastingPackId, list);
    }

    return packs.map((pack) =>
      this.buildOverview(pack, byPack.get(pack.id) ?? [], config.lowStockThreshold),
    );
  }

  /** 可售套数（顾客端与下单校验用，不含过期批次） */
  async getAvailableSets(tastingPackId: string): Promise<number> {
    const result = await this.prisma.tastingPackStockBatch.aggregate({
      where: {
        tastingPackId,
        status: 'AVAILABLE',
        quantityRemaining: { gt: 0 },
        expiresAt: { gt: new Date() },
      },
      _sum: { quantityRemaining: true },
    });
    return result._sum.quantityRemaining ?? 0;
  }

  /**
   * 库存加权平均单套成本。
   *
   * 现货按这个成本定价（而不是今天的原料价），
   * 只有记了成本的批次参与加权；全都没记成本时返回 null，由调用方回退到实时成本。
   */
  async getWeightedUnitCost(tastingPackId: string): Promise<number | null> {
    const batches = await this.prisma.tastingPackStockBatch.findMany({
      where: {
        tastingPackId,
        status: 'AVAILABLE',
        quantityRemaining: { gt: 0 },
        expiresAt: { gt: new Date() },
        unitCost: { not: null },
      },
      select: { quantityRemaining: true, unitCost: true },
    });

    const totalSets = batches.reduce(
      (sum, batch) => sum + batch.quantityRemaining,
      0,
    );
    if (totalSets <= 0) return null;

    const totalCost = batches.reduce(
      (sum, batch) =>
        sum + batch.quantityRemaining * Number(batch.unitCost ?? 0),
      0,
    );
    return Math.round((totalCost / totalSets) * 10000) / 10000;
  }

  /** 库存流水 */
  async listLedger(params: {
    tastingPackId?: string;
    reason?: TastingPackStockReasonCode;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: Array<{
      id: string;
      tastingPackId: string;
      batchId: string | null;
      delta: number;
      reason: string;
      orderId: string | null;
      note: string | null;
      operatorId: string | null;
      createdAt: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(params.pageSize ?? 50)));

    const where: Record<string, unknown> = {};
    if (params.tastingPackId) where.tastingPackId = params.tastingPackId;
    if (params.reason) where.reason = params.reason;

    const [rows, total] = await Promise.all([
      this.prisma.tastingPackStockLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tastingPackStockLedger.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        tastingPackId: row.tastingPackId,
        batchId: row.batchId,
        delta: row.delta,
        reason: row.reason,
        orderId: row.orderId,
        note: row.note,
        operatorId: row.operatorId,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  // ==========================================================
  // 写
  // ==========================================================

  /**
   * 备货入库。
   *
   * 到期日 = 生产日期 + 保质期月数；保质期取「试吃装设置」的当前值，
   * 一旦落库就不再随配置变化（老批次的有效期不能被后来的配置改动）。
   */
  async stockIn(params: {
    tastingPackId: string;
    sets: number;
    producedAt: string | Date;
    /** 不传则按设置的保质期自动算 */
    expiresAt?: string | Date | null;
    unitCost?: number | null;
    note?: string | null;
    operatorId?: string | null;
    productionPlanId?: string | null;
  }): Promise<StockBatchDto> {
    const pack = await this.prisma.tastingPack.findUnique({
      where: { id: params.tastingPackId },
      select: { id: true },
    });
    if (!pack) {
      throw new NotFoundException(`试吃装不存在: ${params.tastingPackId}`);
    }

    const sets = this.assertPositiveInt(params.sets, '入库套数');
    const producedAt = this.parseDate(params.producedAt, '生产日期');

    const config = await this.configService.getConfig();
    const expiresAt = params.expiresAt
      ? this.parseDate(params.expiresAt, '到期日')
      : addMonthsClamped(producedAt, config.shelfLifeMonths);

    if (expiresAt <= producedAt) {
      throw new BadRequestException('到期日必须晚于生产日期');
    }

    const unitCost =
      params.unitCost === undefined || params.unitCost === null
        ? null
        : this.assertNonNegativeNumber(params.unitCost, '单套成本');

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tastingPackStockBatch.create({
        data: {
          batchNo: await this.nextBatchNo(tx),
          tastingPackId: params.tastingPackId,
          producedAt,
          expiresAt,
          quantityTotal: sets,
          quantityRemaining: sets,
          unitCost: unitCost === null ? null : unitCost.toFixed(2),
          status: 'AVAILABLE',
          note: params.note?.trim() || null,
          productionPlanId: params.productionPlanId ?? null,
          createdById: params.operatorId ?? null,
        },
      });

      await tx.tastingPackStockLedger.create({
        data: {
          tastingPackId: params.tastingPackId,
          batchId: created.id,
          delta: sets,
          reason: 'STOCK_IN',
          note:
            params.note?.trim() ||
            `备货入库 ${sets} 套（生产日期 ${formatLocalDate(producedAt)}）`,
          operatorId: params.operatorId ?? null,
        },
      });

      return created;
    });

    this.logger.log(
      `[TastingPackStock] 入库 ${sets} 套 pack=${params.tastingPackId} batch=${batch.batchNo}`,
    );
    return this.toBatchDto(batch);
  }

  /**
   * 人工调整（报损、盘盈盘亏）。
   *
   * `delta` 为负表示减少。只调批次剩余量，不允许调到负数，
   * 也不允许超过入库量（防止误操作把历史数据改花）。
   */
  async adjust(params: {
    batchId: string;
    delta: number;
    note: string;
    operatorId?: string | null;
  }): Promise<StockBatchDto> {
    if (!Number.isInteger(params.delta) || params.delta === 0) {
      throw new BadRequestException('调整数量必须是非 0 整数');
    }
    if (!params.note || !params.note.trim()) {
      throw new BadRequestException('人工调整必须填写原因');
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tastingPackStockBatch.findUnique({
        where: { id: params.batchId },
      });
      if (!existing) {
        throw new NotFoundException(`库存批次不存在: ${params.batchId}`);
      }
      if (existing.status === 'VOID') {
        throw new BadRequestException('该批次已作废，不能再调整');
      }

      const next = existing.quantityRemaining + params.delta;
      if (next < 0) {
        throw new BadRequestException(
          `调整后剩余套数不能为负（当前 ${existing.quantityRemaining}，调整 ${params.delta}）`,
        );
      }
      if (next > existing.quantityTotal) {
        throw new BadRequestException(
          `调整后剩余套数不能超过入库套数（入库 ${existing.quantityTotal}）`,
        );
      }

      const updated = await tx.tastingPackStockBatch.update({
        where: { id: params.batchId },
        data: {
          quantityRemaining: next,
          status: next === 0 ? 'DEPLETED' : 'AVAILABLE',
        },
      });

      await tx.tastingPackStockLedger.create({
        data: {
          tastingPackId: existing.tastingPackId,
          batchId: existing.id,
          delta: params.delta,
          reason: 'MANUAL_ADJUST',
          note: params.note.trim(),
          operatorId: params.operatorId ?? null,
        },
      });

      return updated;
    });

    this.logger.warn(
      `[TastingPackStock] 人工调整 batch=${batch.batchNo} delta=${params.delta} 原因=${params.note}`,
    );
    return this.toBatchDto(batch);
  }

  /** 作废批次（整批报废）：剩余量一次性清零并写流水 */
  async voidBatch(params: {
    batchId: string;
    note: string;
    operatorId?: string | null;
    reason?: 'MANUAL_ADJUST' | 'EXPIRE';
  }): Promise<StockBatchDto> {
    if (!params.note || !params.note.trim()) {
      throw new BadRequestException('作废批次必须填写原因');
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tastingPackStockBatch.findUnique({
        where: { id: params.batchId },
      });
      if (!existing) {
        throw new NotFoundException(`库存批次不存在: ${params.batchId}`);
      }
      if (existing.status === 'VOID') {
        throw new BadRequestException('该批次已作废');
      }

      const remaining = existing.quantityRemaining;
      const updated = await tx.tastingPackStockBatch.update({
        where: { id: existing.id },
        data: { quantityRemaining: 0, status: 'VOID' },
      });

      if (remaining > 0) {
        await tx.tastingPackStockLedger.create({
          data: {
            tastingPackId: existing.tastingPackId,
            batchId: existing.id,
            delta: -remaining,
            reason: params.reason ?? 'MANUAL_ADJUST',
            note: params.note.trim(),
            operatorId: params.operatorId ?? null,
          },
        });
      }

      return updated;
    });

    return this.toBatchDto(batch);
  }

  /**
   * 清理过期批次：把已过期且还有剩余的批次标为 EXPIRED 并写流水。
   *
   * 可售量在查询时本来就会过滤掉过期批次，所以这一步**不影响能不能卖**，
   * 只是把账做实，避免"过期了还挂在可用库存里"造成盘点失真。
   */
  async runExpirySweep(operatorId?: string | null): Promise<{ expired: number }> {
    const now = new Date();
    const overdue = await this.prisma.tastingPackStockBatch.findMany({
      where: {
        status: 'AVAILABLE',
        expiresAt: { lte: now },
        quantityRemaining: { gt: 0 },
      },
    });

    for (const batch of overdue) {
      await this.voidBatch({
        batchId: batch.id,
        note: `已过保质期，自动下账（到期日 ${formatLocalDate(batch.expiresAt)}）`,
        operatorId,
        reason: 'EXPIRE',
      });
    }

    if (overdue.length > 0) {
      this.logger.warn(`[TastingPackStock] 过期下账 ${overdue.length} 个批次`);
    }
    return { expired: overdue.length };
  }

  // ==========================================================
  // 下单占用 / 释放（第 3 批的下单链路会调用）
  // ==========================================================

  /**
   * 为订单占用库存（下单即扣，先到期先出）。
   *
   * **不超卖的关键**：真正扣减用的是一条带条件的 UPDATE
   * （`quantityRemaining >= 本次要从该批拿的数量`），
   * 由数据库保证同一条批次不会被两个请求同时扣穿。
   * 读到的数据可能已经过期，所以失败就重读重试，而不是先查再算。
   */
  async reserveForOrder(params: {
    tastingPackId: string;
    sets: number;
    orderId: string;
    operatorId?: string | null;
  }): Promise<StockReservation> {
    const sets = this.assertPositiveInt(params.sets, '购买套数');
    if (!params.orderId) {
      throw new BadRequestException('占用库存必须带订单号，否则事后无法对账');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const allocations: StockReservation['allocations'] = [];
      let need = sets;
      let attempt = 0;

      while (need > 0 && attempt < 5) {
        attempt += 1;

        const batches = await tx.tastingPackStockBatch.findMany({
          where: {
            tastingPackId: params.tastingPackId,
            status: 'AVAILABLE',
            quantityRemaining: { gt: 0 },
            expiresAt: { gt: new Date() },
          },
          orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, batchNo: true, quantityRemaining: true },
        });

        if (batches.length === 0) break;

        let progressed = false;
        for (const batch of batches) {
          if (need <= 0) break;
          const take = Math.min(batch.quantityRemaining, need);

          const updated = await tx.tastingPackStockBatch.updateMany({
            where: {
              id: batch.id,
              status: 'AVAILABLE',
              quantityRemaining: { gte: take },
            },
            data: { quantityRemaining: { decrement: take } },
          });

          if (updated.count !== 1) {
            // 这批刚被别人抢先扣走了，重读重试
            continue;
          }

          allocations.push({
            batchId: batch.id,
            batchNo: batch.batchNo,
            sets: take,
          });
          need -= take;
          progressed = true;
        }

        if (!progressed) break;
      }

      if (need > 0) {
        throw new ConflictException(
          `试吃装库存不足，还差 ${need} 套。请先备货再卖`,
        );
      }

      // 扣空的批次标为售罄，并在流水里记下本次占用
      for (const allocation of allocations) {
        const after = await tx.tastingPackStockBatch.findUnique({
          where: { id: allocation.batchId },
          select: { quantityRemaining: true, tastingPackId: true },
        });
        if (after && after.quantityRemaining === 0) {
          await tx.tastingPackStockBatch.update({
            where: { id: allocation.batchId },
            data: { status: 'DEPLETED' },
          });
        }

        await tx.tastingPackStockLedger.create({
          data: {
            tastingPackId: params.tastingPackId,
            batchId: allocation.batchId,
            delta: -allocation.sets,
            reason: 'ORDER_RESERVE',
            orderId: params.orderId,
            note: `下单占用 ${allocation.sets} 套`,
            operatorId: params.operatorId ?? null,
          },
        });
      }

      // 占用批次的加权平均成本 = 这一单真实的成本口径
      const used = await tx.tastingPackStockBatch.findMany({
        where: { id: { in: allocations.map((a) => a.batchId) } },
        select: { id: true, unitCost: true },
      });
      const costById = new Map(
        used.map((batch) => [batch.id, batch.unitCost]),
      );
      let costSum = 0;
      let costSets = 0;
      for (const allocation of allocations) {
        const unitCost = costById.get(allocation.batchId);
        if (unitCost === null || unitCost === undefined) continue;
        costSum += Number(unitCost) * allocation.sets;
        costSets += allocation.sets;
      }

      return {
        packId: params.tastingPackId,
        sets,
        allocations,
        weightedUnitCost:
          costSets > 0 ? Math.round((costSum / costSets) * 10000) / 10000 : null,
      };
    });

    this.logger.log(
      `[TastingPackStock] 订单 ${params.orderId} 占用 ${sets} 套，涉及 ${result.allocations.length} 个批次`,
    );
    return result;
  }

  /**
   * 释放订单占用的库存（取消 / 支付超时）。
   *
   * 按流水回放：找出这一单所有 ORDER_RESERVE 记录，
   * 扣掉已经释放过的，把差额还回原批次 —— 这样重复调用也不会多还。
   * 已经发货的单不该释放，由调用方保证（只对未履约订单调用）。
   */
  async releaseForOrder(params: {
    orderId: string;
    note?: string | null;
    operatorId?: string | null;
  }): Promise<{ released: number }> {
    if (!params.orderId) {
      throw new BadRequestException('释放库存必须带订单号');
    }

    const released = await this.prisma.$transaction(async (tx) => {
      const entries = await tx.tastingPackStockLedger.findMany({
        where: { orderId: params.orderId },
        orderBy: { createdAt: 'asc' },
      });

      const reserved = entries.filter((e) => e.reason === 'ORDER_RESERVE');
      if (reserved.length === 0) return 0;

      const alreadyReleased = entries
        .filter((e) => e.reason === 'ORDER_RELEASE')
        .reduce((sum, e) => sum + Math.abs(e.delta), 0);
      const reservedTotal = reserved.reduce(
        (sum, e) => sum + Math.abs(e.delta),
        0,
      );
      let outstanding = reservedTotal - alreadyReleased;
      if (outstanding <= 0) return 0;

      let releasedCount = 0;
      for (const entry of reserved) {
        if (outstanding <= 0) break;
        const batchId = entry.batchId;
        if (!batchId) continue;

        const batch = await tx.tastingPackStockBatch.findUnique({
          where: { id: batchId },
          select: { id: true, quantityRemaining: true, quantityTotal: true },
        });
        if (!batch) continue;

        const give = Math.min(Math.abs(entry.delta), outstanding);
        const next = Math.min(
          batch.quantityRemaining + give,
          batch.quantityTotal,
        );
        const actualGive = next - batch.quantityRemaining;
        if (actualGive <= 0) continue;

        await tx.tastingPackStockBatch.update({
          where: { id: batchId },
          data: { quantityRemaining: next, status: 'AVAILABLE' },
        });

        await tx.tastingPackStockLedger.create({
          data: {
            tastingPackId: entry.tastingPackId,
            batchId,
            delta: actualGive,
            reason: 'ORDER_RELEASE',
            orderId: params.orderId,
            note: params.note?.trim() || '订单取消/超时，库存退回',
            operatorId: params.operatorId ?? null,
          },
        });

        outstanding -= actualGive;
        releasedCount += actualGive;
      }

      return releasedCount;
    });

    if (released > 0) {
      this.logger.log(
        `[TastingPackStock] 订单 ${params.orderId} 释放 ${released} 套`,
      );
    }
    return { released };
  }

  // ==========================================================
  // 内部工具
  // ==========================================================

  private buildOverview(
    pack: { id: string; name: string; status: string },
    batches: Array<{
      id: string;
      batchNo: string;
      tastingPackId: string;
      producedAt: Date;
      expiresAt: Date;
      quantityTotal: number;
      quantityRemaining: number;
      unitCost: unknown;
      status: string;
      note: string | null;
      productionPlanId: string | null;
      createdAt: Date;
    }>,
    lowStockThreshold: number,
  ): TastingPackStockOverview {
    const now = Date.now();
    const soonCutoff = now + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;

    let availableSets = 0;
    let expiringSoonSets = 0;
    let expiredSets = 0;
    let costSum = 0;
    let costSets = 0;

    for (const batch of batches) {
      const remaining = batch.quantityRemaining;
      if (remaining <= 0) continue;
      const expiresMs = batch.expiresAt.getTime();

      if (expiresMs <= now) {
        if (batch.status !== 'VOID') expiredSets += remaining;
        continue;
      }
      if (batch.status !== 'AVAILABLE') continue;

      availableSets += remaining;
      if (expiresMs <= soonCutoff) expiringSoonSets += remaining;

      if (batch.unitCost !== null && batch.unitCost !== undefined) {
        costSum += Number(batch.unitCost) * remaining;
        costSets += remaining;
      }
    }

    return {
      tastingPackId: pack.id,
      tastingPackName: pack.name,
      availableSets,
      expiringSoonSets,
      expiredSets,
      weightedUnitCost:
        costSets > 0 ? Math.round((costSum / costSets) * 100) / 100 : null,
      lowStockThreshold,
      needsRestock: pack.status === 'ACTIVE' && availableSets < lowStockThreshold,
      batches: batches.map((batch) => this.toBatchDto(batch)),
    };
  }

  private toBatchDto(batch: {
    id: string;
    batchNo: string;
    tastingPackId: string;
    producedAt: Date;
    expiresAt: Date;
    quantityTotal: number;
    quantityRemaining: number;
    unitCost: unknown;
    status: string;
    note: string | null;
    productionPlanId: string | null;
    createdAt: Date;
  }): StockBatchDto {
    return {
      id: batch.id,
      batchNo: batch.batchNo,
      tastingPackId: batch.tastingPackId,
      producedAt: batch.producedAt.toISOString(),
      expiresAt: batch.expiresAt.toISOString(),
      quantityTotal: batch.quantityTotal,
      quantityRemaining: batch.quantityRemaining,
      unitCost:
        batch.unitCost === null || batch.unitCost === undefined
          ? null
          : Number(batch.unitCost),
      status: batch.status,
      note: batch.note,
      productionPlanId: batch.productionPlanId,
      createdAt: batch.createdAt.toISOString(),
      daysToExpiry: Math.ceil(
        (batch.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      ),
    };
  }

  private async nextBatchNo(tx: {
    tastingPackStockBatch: { findFirst: Function };
  }): Promise<string> {
    const today = formatLocalDate(new Date()).replace(/-/g, '');
    const prefix = `TP-${today}-`;

    const latest = await tx.tastingPackStockBatch.findFirst({
      where: { batchNo: { startsWith: prefix } },
      orderBy: { batchNo: 'desc' },
      select: { batchNo: true },
    });

    const lastSeq = latest
      ? Number(String(latest.batchNo).slice(prefix.length)) || 0
      : 0;
    const nextSeq = lastSeq + 1;
    if (nextSeq > 999) {
      throw new ConflictException(
        `今天（${today}）的入库批次号已用满 999 个，请明日再入库`,
      );
    }

    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  }

  private assertPositiveInt(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${label}必须是大于 0 的整数`);
    }
    return parsed;
  }

  private assertNonNegativeNumber(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`${label}不能为负数`);
    }
    return parsed;
  }

  private parseDate(value: string | Date, label: string): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
      throw new BadRequestException(`${label}格式无效: ${String(value)}`);
    }
    return date;
  }

}
