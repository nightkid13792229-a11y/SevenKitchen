/**
 * 补货记录服务（2026-11-10 改版）
 *
 * 与「日采清单」的区别：
 *  - 补货没有计划：下单后传截图，保存成一条记录；
 *  - 保存即完成（status = COMPLETED，供报销复用），但库存不算；
 *  - 到货是独立动作：只有确认到货才写入库存流水。
 */

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

const WEIGHT_UNIT_TO_BASE_RATIO: Record<string, number> = {
  斤: 500,
  两: 50,
  克: 1,
  g: 1,
  公斤: 1000,
  千克: 1000,
  kg: 1000,
};

export interface SaveReplenishmentRecordDto {
  /** 订单实付；不传则用识别结果 */
  paidAmount?: number;
  shippingFee?: number;
  packagingFee?: number;
  /** 预计到货；不传则用识别结果/渠道默认（后续任务） */
  expectedDeliveryAt?: string;
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
    list.expectedDeliveryAt = this.parseOptionalDate(dto.expectedDeliveryAt);
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
    list.updatedAt = new Date();
    await this.purchaseListRepository.save(list);

    return {
      createdCount: inbound.createdCount,
      skippedCount: inbound.skippedCount,
    };
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

    if (line.procurementSkuId) {
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

      return this.prisma.purchaseItem.create({
        data: {
          purchaseListId: listId,
          ingredientId: sku.ingredient.id,
          procurementSkuId: sku.id,
          procurementSkuName: sku.name,
          ingredientName: sku.ingredient.name,
          type: sku.ingredient.type,
          quantityNeeded: quantity,
          quantityUnit:
            unit || sku.purchaseUnit || sku.ingredient.baseUnit,
          estimatedCost: amount,
          purchaseChannel:
            channel ?? sku.purchaseChannel ?? sku.ingredient.purchaseChannel,
          productModel: line.spec ?? sku.productModel,
          displayUnit:
            unit ||
            sku.purchaseUnit ||
            sku.ingredient.unitDisplayLabel ||
            sku.ingredient.baseUnit,
        },
      });
    }

    const weightRatio = WEIGHT_UNIT_TO_BASE_RATIO[unit.toLowerCase()];
    if (weightRatio === undefined) {
      throw new BadRequestException(
        `「${line.rawName}」缺少采购商品，请先新建商品`,
      );
    }

    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: line.ingredientId },
      select: {
        id: true,
        name: true,
        type: true,
        baseUnit: true,
        unitDisplayLabel: true,
        purchaseChannel: true,
      },
    });
    if (!ingredient) {
      throw new BadRequestException(
        `「${line.rawName}」的原料不存在，请重新选择`,
      );
    }
    if (ingredient.baseUnit !== 'G') {
      throw new BadRequestException(
        `「${line.rawName}」按重量只支持基准单位为克的原料，请改用商品净含量`,
      );
    }

    return this.prisma.purchaseItem.create({
      data: {
        purchaseListId: listId,
        ingredientId: ingredient.id,
        procurementSkuId: null,
        procurementSkuName: null,
        ingredientName: ingredient.name,
        type: ingredient.type,
        quantityNeeded: quantity,
        quantityUnit: unit,
        estimatedCost: amount,
        purchaseChannel: channel ?? ingredient.purchaseChannel,
        productModel: line.spec ?? null,
        displayUnit: unit || ingredient.unitDisplayLabel || ingredient.baseUnit,
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
}
