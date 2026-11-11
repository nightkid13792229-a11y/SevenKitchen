/**
 * 补货记录服务（2026-11-10 改版）
 *
 * 与「日采清单」的区别：
 *  - 补货没有计划：下单后传截图，保存成一条记录；
 *  - 保存即完成（status = COMPLETED，供报销复用），但库存不算；
 *  - 到货是独立动作：只有确认到货才写入库存流水。
 */

import { randomUUID } from 'crypto';
import {
  checkQuantityUnitMatches,
  describeQuantityUnitMismatch,
} from '../../domain/purchasing/purchase-unit-guard';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import type { PurchaseRecordRepository } from '../../domain/purchasing/purchase-record.repository';
import { PurchaseList } from '../../domain/purchasing/purchase-list.entity';
import { PurchaseItem } from '../../domain/purchasing/purchase-item.entity';
import {
  PurchaseListKind,
  PurchaseListStatus,
} from '../../domain/purchasing/enums';
import { PrismaService } from '../../infrastructure/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  PURCHASE_LIST_REPOSITORY,
  PURCHASE_RECORD_REPOSITORY,
} from './purchasing.service.tokens';
import { PurchaseOrderImportService } from './purchase-order-import.service';
import { weightUnitToBaseRatio } from './purchase-order-weight-units';

export interface SaveReplenishmentRecordDto {
  /** 订单实付；不传则用识别结果 */
  paidAmount?: number;
  shippingFee?: number;
  packagingFee?: number;
  /** 预计到货；不传则用识别结果/渠道默认（后续任务） */
  expectedDeliveryAt?: string;
}

export interface UpdateReplenishmentRecordDto {
  items?: Array<{
    itemId: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
  }>;
  shippingFee?: number;
  packagingFee?: number;
  paidAmount?: number;
}

export interface ListReplenishmentRecordsParams {
  arrival?: 'IN_TRANSIT' | 'ARRIVED';
  claim?: 'UNSUBMITTED' | 'SUBMITTED' | 'REIMBURSED';
  page?: number;
  pageSize?: number;
  includeVoided?: boolean;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

@Injectable()
export class ReplenishmentService {
  private readonly logger = new Logger(ReplenishmentService.name);
  constructor(
    @Inject(PURCHASE_LIST_REPOSITORY)
    private readonly purchaseListRepository: PurchaseListRepository,
    @Inject(PURCHASE_RECORD_REPOSITORY)
    private readonly purchaseRecordRepository: PurchaseRecordRepository,
    private readonly prisma: PrismaService,
    private readonly purchaseOrderImportService: PurchaseOrderImportService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * 开始记一笔补货：建一条无明细的草稿。
   *
   * 草稿对用户不可见（列表过滤 isDraft），识别成功后保存时转正；
   * 识别失败/放弃时可直接删除。
   */
  async createDraft(createdById: string): Promise<PurchaseList> {
    const targetDate = new Date();
    targetDate.setHours(12, 0, 0, 0);

    const draft = new PurchaseList({
      targetDate,
      kind: PurchaseListKind.STOCK_REPLENISHMENT,
      status: PurchaseListStatus.PENDING,
      totalEstimatedCost: 0,
      itemCount: 0,
      createdById,
      sourceOrderIds: [],
      isDraft: true,
    });

    return this.purchaseListRepository.save(draft);
  }

  /**
   * 把核对完的识别结果保存成一条补货记录。
   *
   * 一张草稿只允许一笔订单；保存后：
   *  - status = COMPLETED（报销资格），isDraft = false；
   *  - 明细 + 采购记录已生成；
   *  - 库存不动（到货才入库）；
   *  - 本次报销金额 = 实付 − 个人商品。
   */
  async saveRecord(
    listId: string,
    dto: SaveReplenishmentRecordDto,
    userId: string,
  ): Promise<PurchaseList> {
    const list = await this.purchaseListRepository.findById(listId);
    if (!list) {
      throw new NotFoundException('补货记录不存在');
    }
    if (list.createdById !== userId) {
      throw new ForbiddenException('只能保存自己创建的补货记录');
    }
    if (!list.isDraft) {
      throw new BadRequestException('这条补货记录已经保存过了');
    }

    const imports = await this.prisma.purchaseOrderImport.findMany({
      where: {
        purchaseListId: listId,
        status: { in: ['DRAFT', 'CONFIRMED'] },
      },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    if (imports.length === 0) {
      throw new BadRequestException('没有待保存的识别结果');
    }
    if (imports.length > 1) {
      throw new BadRequestException('一条补货记录只能保存一笔订单');
    }
    const importRow = imports[0];

    if (importRow.lines.every((line) => line.isPersonal)) {
      throw new BadRequestException('整单都是个人商品，不需要记补货');
    }

    // 1) 先把非个人行落成采购明细；重量行不要求采购商品。
    for (const line of importRow.lines) {
      if (line.isPersonal || line.purchaseItemId) {
        continue;
      }
      const item = await this.createItemForLine(listId, line, importRow.channel);
      await this.prisma.purchaseOrderImportLine.update({
        where: { id: line.id },
        data: { purchaseItemId: item.id },
      });
    }

    // 2) 生成采购记录（复用现有 confirm；草稿不再要求 startedAt）。
    if (imports.some((row) => row.status === 'DRAFT')) {
      const draftIds = imports
        .filter((row) => row.status === 'DRAFT')
        .map((row) => row.id);
      await this.purchaseOrderImportService.confirm(draftIds, userId);
    }

    // 3) 把「订单级金额」和状态落到记录上。
    const itemRows = await this.prisma.purchaseItem.findMany({
      where: { purchaseListId: listId },
      orderBy: { createdAt: 'asc' },
    });
    list.items = itemRows.map((row) => PurchaseItem.fromPrisma(row));
    list.itemCount = list.items.length;
    if (list.itemCount === 0) {
      throw new BadRequestException('没有可保存的采购明细');
    }

    const personalAmount = round2(
      importRow.lines
        .filter((line) => line.isPersonal)
        .reduce((sum, line) => sum + (toNumberOrNull(line.lineTotal) ?? 0), 0),
    );
    const lineSubtotal = round2(
      importRow.lines.reduce(
        (sum, line) => sum + (toNumberOrNull(line.lineTotal) ?? 0),
        0,
      ),
    );
    const subtotalAmount =
      toNumberOrNull(importRow.subtotal) ?? lineSubtotal;
    const shippingFee =
      dto.shippingFee ?? toNumberOrNull(importRow.shippingFee) ?? 0;
    const packagingFee =
      dto.packagingFee ?? toNumberOrNull(importRow.packagingFee) ?? 0;
    const paidAmount = dto.paidAmount ?? toNumberOrNull(importRow.paid);

    if (paidAmount === null || paidAmount <= 0) {
      throw new BadRequestException('请填写订单实付金额');
    }
    if (shippingFee < 0 || packagingFee < 0) {
      throw new BadRequestException('运费/包装费不能为负数');
    }
    const reimbursementAmount = round2(paidAmount - personalAmount);
    if (reimbursementAmount < 0) {
      throw new BadRequestException('个人商品金额不能大于订单实付');
    }

    list.orderNo = importRow.orderNo ?? null;
    list.channel = importRow.channel ?? null;
    list.orderPlacedAt = importRow.orderTime ?? null;
    const deliveredAt = importRow.deliveredAt
      ? new Date(importRow.deliveredAt)
      : null;
    const validDeliveredAt =
      deliveredAt && !Number.isNaN(deliveredAt.getTime())
        ? deliveredAt
        : null;
    list.expectedDeliveryAt =
      this.parseOptionalDate(dto.expectedDeliveryAt) ??
      importRow.expectedDeliveryAt ??
      this.defaultExpectedDeliveryAt(list.channel, list.orderPlacedAt);
    list.subtotalAmount = round2(Number(subtotalAmount));
    list.shippingFee = round2(shippingFee);
    list.packagingFee = round2(packagingFee);
    list.paidAmount = round2(paidAmount);
    list.personalAmount = personalAmount;
    list.reimbursementAmount = reimbursementAmount;
    list.discountAmount = round2(
      Number(subtotalAmount) + shippingFee + packagingFee - paidAmount,
    );
    list.totalEstimatedCost = round2(
      list.items.reduce(
        (sum, item) => sum + Number(item.estimatedCost ?? 0),
        0,
      ),
    );
    list.status = PurchaseListStatus.COMPLETED;
    list.completedAt = new Date();
    list.isDraft = false;
    list.updatedAt = new Date();
    list.updatedById = userId;

    // 截图已经显示「已送达/已签收」：保存时直接算到货并入库，省掉一次点击。
    if (validDeliveredAt) {
      const records =
        await this.purchaseRecordRepository.findByPurchaseListId(listId);
      await this.inventoryService.inboundFromPurchaseRecords(records);
      list.arrivedAt = validDeliveredAt;
      list.arrivedById = userId;
      list.updatedById = userId;
    }

    return this.purchaseListRepository.save(list);
  }

  /**
   * 确认到货：整单入库。
   * 幂等：已经到货的记录再次调用直接返回 0，不会重复入库。
   */
  async confirmArrival(
    listId: string,
    userId: string,
    role: string,
  ): Promise<{ createdCount: number; skippedCount: number }> {
    const list = await this.purchaseListRepository.findById(listId);
    if (!list || list.isDraft) {
      throw new NotFoundException('补货记录不存在');
    }
    if (list.voidedAt) {
      throw new BadRequestException('补货记录已作废');
    }
    this.assertCanOperate(list, userId, role);

    if (list.arrivedAt) {
      return { createdCount: 0, skippedCount: 0 };
    }

    const records =
      await this.purchaseRecordRepository.findByPurchaseListId(listId);
    const inbound =
      await this.inventoryService.inboundFromPurchaseRecords(records);

    list.arrivedAt = new Date();
    list.arrivedById = userId;
    list.updatedById = userId;
    list.updatedAt = new Date();
    await this.purchaseListRepository.save(list);

    return {
      createdCount: inbound.createdCount,
      skippedCount: inbound.skippedCount,
    };
  }

  /**
   * 保存后改明细：只允许在途、未报销；改完重算订单级金额。
   * 已到货要先撤销到货；已关联报销单不能再改。
   */
  async updateRecord(
    listId: string,
    dto: UpdateReplenishmentRecordDto,
    userId: string,
    role: string,
  ): Promise<PurchaseList> {
    const list = await this.purchaseListRepository.findById(listId);
    if (!list || list.isDraft) {
      throw new NotFoundException('补货记录不存在');
    }
    if (list.voidedAt) {
      throw new BadRequestException('补货记录已作废');
    }
    this.assertCanOperate(list, userId, role);
    if (list.reimbursementId) {
      throw new BadRequestException('已关联报销单，不能修改');
    }
    if (list.arrivedAt) {
      throw new BadRequestException('已到货，请先撤销到货再修改');
    }

    const items = await this.prisma.purchaseItem.findMany({
      where: { purchaseListId: listId },
    });
    const records = await this.prisma.purchaseRecord.findMany({
      where: { purchaseListId: listId },
      orderBy: { createdAt: 'asc' },
    });

    for (const input of dto.items ?? []) {
      const item = items.find((row) => row.id === input.itemId);
      if (!item) {
        throw new BadRequestException('补货明细不存在，请刷新后重试');
      }
      const quantity = Number(input.quantity);
      const unitPrice = Number(input.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException(
          `「${item.ingredientName || item.ingredientId}」数量必须大于 0`,
        );
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(
          `「${item.ingredientName || item.ingredientId}」单价不能小于 0`,
        );
      }

      const record = records.find((row) => row.purchaseItemId === item.id);
      if (!record) {
        throw new BadRequestException(
          `「${item.ingredientName || item.ingredientId}」没有采购记录，不能修改`,
        );
      }

      const unit = String(input.unit || item.quantityUnit || '').trim();

      /**
       * 换算口径（2026-11-11）：
       *
       * 单位写了「克/公斤」这类计量单位 → 数量就是按它称的重量，直接用它的换算；
       * 单位是件数（袋/盒/箱…）→ 必须用**商品自己的倍数**。
       * 以前这里用 `record.actualPackageSize` 兜底，而那个字段在识别导入的记录里
       * 存的是整条链的倍数、在手工记录里存的是单件规格 —— 两套语义混用一个字段，
       * 把单位改成「箱」时会把"每件 500 克"当成"每箱 500 克"，静默差 N 倍。
       */
      const weightRatio = weightUnitToBaseRatio(unit);
      const sku = item.procurementSkuId
        ? await this.prisma.procurementSku.findUnique({
            where: { id: item.procurementSkuId },
            select: { purchaseUnit: true, purchaseToBaseRatio: true },
          })
        : null;

      /**
       * 挂了商品的行，一律按商品单位说话（2026-11-11 终审修）。
       *
       * 以前这里对「克/公斤」直接放行：一条按"箱"买的记录被改成"1 克"，
       * 就真的按 1 克入账 —— 三条入账路径里唯一不拦、静默错的一条。
       * 散称想按斤/克记，就挂一个按斤/克卖的商品，而不是在商品行上换口径。
       */
      if (sku?.purchaseUnit) {
        const unitCheck = checkQuantityUnitMatches({
          lineUnit: unit,
          skuPurchaseUnit: sku.purchaseUnit,
        });
        if (!unitCheck.ok) {
          throw new BadRequestException(
            describeQuantityUnitMismatch({
              lineName: item.ingredientName || item.ingredientId,
              lineUnit: unit,
              skuPurchaseUnit: sku.purchaseUnit,
            }),
          );
        }
      }

      const packageSize =
        weightRatio ??
        (sku?.purchaseToBaseRatio && Number(sku.purchaseToBaseRatio) > 0
          ? Number(sku.purchaseToBaseRatio)
          : Number(record.actualPackageSize ?? 1) || 1);
      const baseQuantity = quantity * packageSize;
      const amount = round2(quantity * unitPrice);

      await this.prisma.purchaseItem.update({
        where: { id: item.id },
        data: {
          quantityNeeded: quantity,
          quantityUnit: unit,
          estimatedCost: amount,
        },
      });
      await this.prisma.purchaseRecord.update({
        where: { id: record.id },
        data: {
          actualQuantity: quantity,
          actualPackageCount: quantity,
          actualPackageSize: packageSize,
          actualPackageUnit: unit,
          actualBaseQuantity: baseQuantity,
          actualBaseUnit: record.actualBaseUnit || 'G',
          actualCost: amount,
        },
      });

      item.quantityNeeded = quantity;
      item.quantityUnit = unit;
      (item as any).estimatedCost = amount;
    }

    // repository.save 会按 list.items 重新 upsert 明细；
    // 必须用刚写进库的值刷新，否则会把旧数量/旧单价盖回去（2026-11-10 审核 C2）。
    const refreshedItems = await this.prisma.purchaseItem.findMany({
      where: { purchaseListId: listId },
      orderBy: { createdAt: 'asc' },
    });
    list.items = refreshedItems.map((row) => PurchaseItem.fromPrisma(row));
    list.itemCount = list.items.length;

    const itemTotal = round2(
      refreshedItems.reduce(
        (sum, item) => sum + Number(item.estimatedCost ?? 0),
        0,
      ),
    );
    const paidAmount = round2(
      dto.paidAmount ?? Number(list.paidAmount ?? 0),
    );
    const shippingFee = round2(
      dto.shippingFee ?? Number(list.shippingFee ?? 0),
    );
    const packagingFee = round2(
      dto.packagingFee ?? Number(list.packagingFee ?? 0),
    );
    if (paidAmount <= 0) {
      throw new BadRequestException('订单实付必须大于 0');
    }
    if (shippingFee < 0 || packagingFee < 0) {
      throw new BadRequestException('运费/包装费不能为负数');
    }
    const personalAmount = round2(Number(list.personalAmount ?? 0));
    const subtotalAmount = round2(itemTotal + personalAmount);
    const reimbursementAmount = round2(paidAmount - personalAmount);
    if (reimbursementAmount < 0) {
      throw new BadRequestException('个人商品金额不能大于订单实付');
    }

    list.subtotalAmount = subtotalAmount;
    list.shippingFee = shippingFee;
    list.packagingFee = packagingFee;
    list.paidAmount = paidAmount;
    list.discountAmount = round2(
      subtotalAmount + shippingFee + packagingFee - paidAmount,
    );
    list.reimbursementAmount = reimbursementAmount;
    list.totalEstimatedCost = itemTotal;
    list.updatedById = userId;
    list.updatedAt = new Date();

    return this.purchaseListRepository.save(list);
  }

  /**
   * 手填兜底：给草稿挂一条没有截图的识别记录，核对页就能手动加行。
   * AI 不可用/配额用完时走这里，不阻断记账。
   */
  async createManualImport(
    listId: string,
    userId: string,
    role: string,
  ): Promise<{ id: string }> {
    const list = await this.purchaseListRepository.findById(listId);
    if (!list || !list.isDraft) {
      throw new NotFoundException('补货草稿不存在');
    }
    this.assertCanOperate(list, userId, role);

    const existing = await this.prisma.purchaseOrderImport.count({
      where: {
        purchaseListId: listId,
        status: { not: 'DISCARDED' },
      },
    });
    if (existing > 0) {
      throw new BadRequestException('这笔草稿已经有识别记录，直接编辑即可');
    }

    const row = await this.prisma.purchaseOrderImport.create({
      data: {
        purchaseListId: listId,
        uploadedById: userId,
        channel: null,
        orderTime: new Date(),
        imageUrls: [],
        imageKeys: [],
        imageHash: `manual:${randomUUID()}`,
        status: 'DRAFT',
        pageType: 'unknown',
        rawResult: { manual: true },
        incomplete: false,
      },
    });
    return { id: row.id };
  }

  /**
   * 撤销到货：把已入账的补货记录退回在途。
   * 未报销、且这批货没有被下游用掉时才允许；用负数冲销流水，不删历史。
   */
  async revokeArrival(
    listId: string,
    userId: string,
    role: string,
  ): Promise<PurchaseList> {
    const list = await this.purchaseListRepository.findById(listId);
    if (!list || list.isDraft) {
      throw new NotFoundException('补货记录不存在');
    }
    if (list.voidedAt) {
      throw new BadRequestException('补货记录已作废');
    }
    this.assertCanOperate(list, userId, role);
    if (list.reimbursementId) {
      throw new BadRequestException('已关联报销单，不能撤销到货');
    }
    if (!list.arrivedAt) {
      return list;
    }

    const records =
      await this.purchaseRecordRepository.findByPurchaseListId(listId);
    const inboundByIngredient = new Map<string, number>();
    for (const record of records) {
      const quantity = Number(record.actualBaseQuantity ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }
      inboundByIngredient.set(
        record.ingredientId,
        (inboundByIngredient.get(record.ingredientId) ?? 0) + quantity,
      );
    }
    for (const [ingredientId, quantity] of inboundByIngredient) {
      const balance =
        await this.inventoryService.getBalanceByIngredient(ingredientId);
      if (balance < quantity) {
        throw new BadRequestException(
          '这批货已经用掉，不能撤销到货；如有差异请走盘点调整',
        );
      }
    }

    await this.inventoryService.reversePurchaseRecordInboundsForPurchaseList(
      records,
    );
    list.arrivedAt = null;
    list.arrivedById = null;
    list.updatedById = userId;
    list.updatedAt = new Date();
    return this.purchaseListRepository.save(list);
  }

  /**
   * 作废（下单后取消/退款）。
   * 只允许在途、未报销；已到货先撤销到货，再到货后的库存回滚交给后续能力。
   */
  async voidRecord(
    listId: string,
    userId: string,
    role: string,
  ): Promise<PurchaseList> {
    const list = await this.purchaseListRepository.findById(listId);
    if (!list || list.isDraft) {
      throw new NotFoundException('补货记录不存在');
    }
    this.assertCanOperate(list, userId, role);
    if (list.arrivedAt) {
      throw new BadRequestException('已到货，请先撤销到货再作废');
    }
    if (list.reimbursementId) {
      throw new BadRequestException('已关联报销单，不能作废');
    }
    if (list.voidedAt) {
      return list;
    }

    list.voidedAt = new Date();
    list.voidedById = userId;
    list.updatedById = userId;
    list.updatedAt = new Date();
    return this.purchaseListRepository.save(list);
  }

  /**
   * 补货记录列表（全局可读，便于所有人看到在途）。
   * 到货/报销是两个独立维度，筛选也分开。
   */
  async listRecords(
    params: ListReplenishmentRecordsParams,
    _userId: string,
    _role: string,
  ): Promise<{ list: any[]; total: number }> {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const where: any = {
      kind: 'STOCK_REPLENISHMENT',
      isDraft: false,
      // 老的计划式补货单没有实付金额；新记录一定有，用它把两代数据分开。
      paidAmount: { not: null },
    };
    if (!params.includeVoided) {
      where.voidedAt = null;
    }
    if (params.arrival === 'IN_TRANSIT') {
      where.arrivedAt = null;
    } else if (params.arrival === 'ARRIVED') {
      where.arrivedAt = { not: null };
    }
    if (params.claim === 'UNSUBMITTED') {
      where.reimbursementId = null;
    } else if (params.claim === 'SUBMITTED') {
      where.reimbursementId = { not: null };
    } else if (params.claim === 'REIMBURSED') {
      where.reimbursement = { is: { status: 'REIMBURSED' } };
    }

    const [rows, total] = await Promise.all([
      this.prisma.purchaseList.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          records: { select: { id: true, actualCost: true } },
          reimbursement: {
            select: { id: true, status: true, claimNumber: true },
          },
        },
      }),
      this.prisma.purchaseList.count({ where }),
    ]);

    return {
      list: rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        orderNo: row.orderNo,
        orderPlacedAt: row.orderPlacedAt,
        expectedDeliveryAt: row.expectedDeliveryAt,
        arrivedAt: row.arrivedAt,
        voidedAt: row.voidedAt,
        itemCount: row.itemCount,
        recordsCount: row.records.length,
        paidAmount: toNumberOrNull(row.paidAmount),
        personalAmount: toNumberOrNull(row.personalAmount),
        reimbursementAmount: toNumberOrNull(row.reimbursementAmount),
        reimbursementId: row.reimbursementId,
        reimbursementStatus: row.reimbursement?.status ?? null,
        claimNumber: row.reimbursement?.claimNumber ?? null,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  async getRecord(listId: string): Promise<any> {
    const list = await this.purchaseListRepository.findById(listId);
    if (!list || list.isDraft) {
      throw new NotFoundException('补货记录不存在');
    }

    const [records, imports, reimbursement] = await Promise.all([
      this.purchaseRecordRepository.findByPurchaseListId(listId),
      this.purchaseOrderImportService.listByPurchaseList(listId),
      list.reimbursementId
        ? this.prisma.reimbursement.findUnique({
            where: { id: list.reimbursementId },
            select: { id: true, claimNumber: true, status: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      ...list,
      records,
      imports,
      reimbursement,
    };
  }

  private assertCanOperate(
    list: PurchaseList,
    userId: string,
    role: string,
  ): void {
    if (role !== 'ADMIN' && list.createdById !== userId) {
      throw new ForbiddenException('只能操作自己创建的补货记录');
    }
  }

  private defaultExpectedDeliveryAt(
    channel: string | null,
    orderPlacedAt: Date | null,
  ): Date | null {
    if (!orderPlacedAt) {
      return null;
    }
    const text = String(channel ?? '');
    const days = /盒马|沃尔玛|山姆/.test(text)
      ? 1
      : /淘宝|天猫/.test(text)
        ? 3
        : /iherb|跨境/i.test(text)
          ? 14
          : 3;
    const date = new Date(orderPlacedAt);
    date.setDate(date.getDate() + days);
    return date;
  }

  private async createItemForLine(
    listId: string,
    line: any,
    channel: string | null,
  ): Promise<{ id: string }> {
    const quantity = toNumberOrNull(line.qty);
    const amount = toNumberOrNull(line.lineTotal);
    const unit = String(line.unit ?? '').trim();
    if (quantity === null || quantity <= 0) {
      throw new BadRequestException(
        `「${line.rawName}」缺少购买数量，不能保存`,
      );
    }
    if (amount === null) {
      throw new BadRequestException(`「${line.rawName}」没有金额，不能保存`);
    }

    if (!line.procurementSkuId) {
      throw new BadRequestException(
        `「${line.rawName}」缺少采购商品，请先新建商品`,
      );
    }

    const sku = await this.prisma.procurementSku.findUnique({
      where: { id: line.procurementSkuId },
      select: {
        id: true,
        name: true,
        productModel: true,
        purchaseChannel: true,
        purchaseUnit: true,
        ingredient: {
          select: {
            id: true,
            name: true,
            type: true,
            baseUnit: true,
            unitDisplayLabel: true,
            purchaseChannel: true,
          },
        },
      },
    });
    if (!sku) {
      throw new BadRequestException(
        `「${line.rawName}」的采购商品不存在，请重新选择`,
      );
    }

    /**
     * 单位门禁（2026-11-11，与生成采购记录、到货入库同一口径）。
     *
     * 散称商品可以按斤/克卖，但这行写的单位必须就是商品的单位：
     * 「3 斤」挂到「500g/袋」上，克数只能靠猜，宁可拦住让人改单位或换商品。
     */
    const unitCheck = checkQuantityUnitMatches({
      lineUnit: unit,
      skuPurchaseUnit: sku.purchaseUnit,
    });
    if (!unitCheck.ok) {
      throw new BadRequestException(
        describeQuantityUnitMismatch({
          lineName: line.rawName,
          lineUnit: unit,
          skuPurchaseUnit: String(sku.purchaseUnit),
        }),
      );
    }

    return this.prisma.purchaseItem.create({
      data: {
        purchaseListId: listId,
        ingredientId: sku.ingredient.id,
        procurementSkuId: sku.id,
        procurementSkuName: sku.name,
        ingredientName: sku.ingredient.name,
        type: sku.ingredient.type,
        quantityNeeded: quantity,
        /**
         * 数量单位（2026-11-11）：商品单位优先，**绝不退回基准单位**。
         *
         * 以前这里兜底成「克」：商品没填单位时，页面显示"回补 300 克"，
         * 而实际数量是按"件"写的 —— 员工照着克数下单，差几百倍。
         * 连「件」都比「克」安全：至少它还是个件数单位。
         */
        quantityUnit: unit || sku.purchaseUnit || '件',
        estimatedCost: amount,
        purchaseChannel:
          channel ?? sku.purchaseChannel ?? sku.ingredient.purchaseChannel,
        productModel: line.spec ?? sku.productModel,
        displayUnit:
          unit ||
          sku.purchaseUnit ||
          sku.ingredient.unitDisplayLabel ||
          '件',
      },
    });
  }

  private parseOptionalDate(value?: string): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('日期格式无效');
    }
    return date;
  }

  /**
   * 每天清理超过 48 小时没保存的识别草稿，避免废弃草稿、识别行和截图无限堆积。
   * 只删 isDraft 且仍 PENDING 的记录，不碰已保存的补货记录。
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupStaleDrafts(): Promise<number> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const drafts = await this.prisma.purchaseList.findMany({
      where: {
        isDraft: true,
        status: 'PENDING' as any,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });
    let deleted = 0;
    for (const draft of drafts) {
      try {
        await this.prisma.purchaseOrderImport.deleteMany({
          where: { purchaseListId: draft.id },
        });
        await this.prisma.purchaseList.delete({
          where: { id: draft.id },
        });
        deleted += 1;
      } catch (error) {
        this.logger.warn(
          `清理补货草稿 ${draft.id} 失败：${(error as Error)?.message ?? error}`,
        );
      }
    }
    if (deleted > 0) {
      this.logger.log(`已清理 ${deleted} 个过期补货草稿`);
    }
    return deleted;
  }

}
