import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { INGREDIENT_REPOSITORY } from './ingredient.service';
import { GlobalConfigService } from '../config/global-config.service';
import { ProcurementSkuService } from './procurement-sku.service';
import { IngredientPriceAnchorService } from './ingredient-price-anchor.service';
import {
  evaluatePriceGate,
  type PriceGateAction,
} from '../../domain/ingredient/price-gate';
import { PURCHASE_RECORD_REPOSITORY } from '../purchasing/purchasing.service.tokens';
import type { PurchaseRecordRepository } from '../../domain/purchasing/purchase-record.repository';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import type { Ingredient } from '../../domain/ingredient';
import { perBaseUnitCost } from '../../domain/ingredient/unit-price';
import { IngredientType } from '../../domain/ingredient/enums';
import { IngredientCostHistoryService } from './ingredient-cost-history.service';

export interface IngredientPriceChangeView {
  id: string;
  ingredientId: string;
  ingredientName: string;
  reimbursementId: string;
  purchaseRecordId: string;
  purchaseUnit: string | null;
  sourceQuantity: number;
  sourcePricePerPurchaseUnit: number;
  previousCurrentPricePerPurchaseUnit: number;
  previousEffectivePrice: number;
  proposedEffectivePrice: number;
  appliedCurrentPricePerPurchaseUnit: number | null;
  appliedEffectivePricePerPurchaseUnit: number | null;
  deltaRate: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvalMode: 'AUTO' | 'MANUAL' | 'MANUAL_REQUIRED';
  /** 写入闸结果（2026-11-06）：通过 / 挂起待确认 / 拒绝 */
  gateAction: PriceGateAction | null;
  /** 闸门不通过的原因，展示给后台 */
  gateReason: string | null;
  /**
   * 待确认项「通过后会不会自动生效」的预判（2026-11-07）。
   * 幅度超过阈值的项会被挂起（HOLD），通过后价格不会变，
   * 手机端据此把「会自动生效」和「需要人工放行」分开说，不能混着承诺。
   */
  autoApprovalEligible: boolean;
  /**
   * 写入闸预演（2026-11-08）：现在闸门基准就是档案价，和 deltaRate 同一把尺子，
   * 所以可以在审核前准确预告「这一项通过时会被挂起 / 被拒绝」。
   * 只在 status=PENDING 且有值时才有意义；已判定的以 gateAction 为准。
   */
  gatePreviewAction: 'APPLY' | 'HOLD' | 'REJECT' | null;
  gatePreviewReason: string | null;
  reviewReasons: string[];
  reviewComment: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface WeightedAccumulator {
  totalAmount: number;
  totalQuantity: number;
}

interface PurchaseRecordPricingBasis {
  baseQuantity: number;
  baseUnitCost: number;
  ingredientPurchaseQuantity: number;
  ingredientPricePerPurchaseUnit: number;
}

interface AutoApprovalEvaluation {
  eligible: boolean;
  reasons: string[];
}

interface DecimalLike {
  toNumber(): number;
}

/**
 * 事务客户端的最小形状（2026-11-07）。
 * Prisma 的 TransactionClient 与 PrismaService 在这几张表上的方法一致，
 * 这里只用来把「状态 + 价格」放进同一个事务，不做类型级联。
 */
type TransactionClientLike = any;

interface IngredientPriceChangeRecord {
  id: string;
  ingredientId: string;
  reimbursementId: string;
  purchaseRecordId: string;
  ingredientName: string;
  sourceQuantity: number | DecimalLike;
  sourcePricePerPurchaseUnit: DecimalLike;
  previousCurrentPricePerPurchaseUnit: DecimalLike;
  previousEffectivePrice: DecimalLike;
  proposedEffectivePrice: DecimalLike;
  appliedCurrentPricePerPurchaseUnit: DecimalLike | null;
  appliedEffectivePricePerPurchaseUnit: DecimalLike | null;
  deltaRate: DecimalLike | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewComment: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

interface IngredientPriceChangeApplyRecord {
  id: string;
  ingredientId: string;
  reimbursementId: string;
  purchaseRecordId: string;
  sourceQuantity: number | DecimalLike;
  sourcePricePerPurchaseUnit: DecimalLike;
  proposedEffectivePrice: DecimalLike;
}

@Injectable()
export class IngredientPricingService {
  private readonly logger = new Logger(IngredientPricingService.name);
  private readonly defaultAutoApproveThreshold = 0.1;
  private readonly quantityOutlierLowerRatio = 0.35;
  private readonly quantityOutlierUpperRatio = 2.8;
  private readonly quantityOutlierHistoryMinCount = 3;
  private readonly quantityOutlierSampleSize = 5;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INGREDIENT_REPOSITORY)
    private readonly ingredientRepository: IngredientRepository,
    @Inject(PURCHASE_RECORD_REPOSITORY)
    private readonly purchaseRecordRepository: PurchaseRecordRepository,
    private readonly globalConfigService: GlobalConfigService,
    private readonly procurementSkuService: ProcurementSkuService,
    private readonly priceAnchorService: IngredientPriceAnchorService,
    private readonly costHistory: IngredientCostHistoryService,
  ) {}

  async syncPendingChangesForReimbursement(
    reimbursementId: string,
    purchaseListIds: string[],
  ): Promise<IngredientPriceChangeView[]> {
    await this.prisma.ingredientPriceChange.deleteMany({
      where: {
        reimbursementId,
        status: {
          in: ['PENDING', 'REJECTED'],
        },
      },
    });

    const purchaseRecords = (
      await Promise.all(
        purchaseListIds.map((purchaseListId) =>
          this.purchaseRecordRepository.findByPurchaseListId(purchaseListId),
        ),
      )
    ).flat();

    if (purchaseRecords.length === 0) {
      return [];
    }

    const ingredientIds = Array.from(
      new Set(purchaseRecords.map((record) => record.ingredientId)),
    );
    const ingredients =
      await this.ingredientRepository.findByIds(ingredientIds);
    const ingredientMap = new Map<string, Ingredient>(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    const changeRows = purchaseRecords.flatMap((record) => {
      const ingredient = ingredientMap.get(record.ingredientId);

      if (!ingredient) {
        return [];
      }

      const pricingBasis = this.buildPurchaseRecordPricingBasis(
        record,
        ingredient,
      );

      if (!pricingBasis) {
        return [];
      }

      const sourcePricePerPurchaseUnit =
        pricingBasis.ingredientPricePerPurchaseUnit;
      const previousCurrentPricePerPurchaseUnit = this.roundPrice(
        ingredient.currentPricePerPurchaseUnit,
      );
      const previousEffectivePrice = this.roundPrice(
        ingredient.getEffectivePricePerPurchaseUnit(),
      );

      return [
        {
          ingredientId: ingredient.id,
          reimbursementId,
          purchaseRecordId: record.id,
          ingredientName: ingredient.name,
          sourceQuantity: pricingBasis.ingredientPurchaseQuantity,
          sourcePricePerPurchaseUnit,
          previousCurrentPricePerPurchaseUnit,
          previousEffectivePrice,
          proposedEffectivePrice: sourcePricePerPurchaseUnit,
          deltaRate:
            previousEffectivePrice > 0
              ? this.roundRatio(
                  (sourcePricePerPurchaseUnit - previousEffectivePrice) /
                    previousEffectivePrice,
                )
              : null,
          status: 'PENDING' as const,
        },
      ];
    });

    if (changeRows.length === 0) {
      return [];
    }

    await this.prisma.ingredientPriceChange.createMany({
      data: changeRows,
    });

    this.logger.log(
      `Created ${changeRows.length} pending ingredient price changes for reimbursement ${reimbursementId}`,
    );

    return this.getPriceChangesForReimbursement(reimbursementId);
  }

  async autoApproveEligibleChangesForReimbursement(
    reimbursementId: string,
  ): Promise<IngredientPriceChangeView[]> {
    const pendingChanges = (await this.prisma.ingredientPriceChange.findMany({
      where: {
        reimbursementId,
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'asc',
      },
    })) as IngredientPriceChangeRecord[];

    const evaluations = await this.evaluateAutoApproval(pendingChanges);
    const eligibleChanges = pendingChanges.filter(
      (change) => evaluations.get(change.id)?.eligible ?? false,
    );

    if (eligibleChanges.length === 0) {
      return this.getPriceChangesForReimbursement(reimbursementId);
    }

    await this.applyPriceChanges(
      eligibleChanges,
      null,
      await this.buildAutoApprovalComment(),
    );

    this.logger.log(
      `Auto-approved ${eligibleChanges.length} ingredient price changes for reimbursement ${reimbursementId}`,
    );

    return this.getPriceChangesForReimbursement(reimbursementId);
  }

  async applyApprovedChangesForReimbursement(
    reimbursementId: string,
    reviewerId?: string | null,
    reviewComment?: string,
    client?: TransactionClientLike,
  ): Promise<IngredientPriceChangeView[]> {
    const db = (client as PrismaService | undefined) ?? this.prisma;
    const pendingChanges = await db.ingredientPriceChange.findMany({
      where: {
        reimbursementId,
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (pendingChanges.length === 0) {
      return this.getPriceChangesForReimbursement(reimbursementId);
    }

    await this.applyPriceChanges(
      pendingChanges,
      reviewerId ?? null,
      reviewComment ?? null,
      new Set(),
      client,
    );

    this.logger.log(
      `Approved ${pendingChanges.length} ingredient price changes for reimbursement ${reimbursementId}`,
    );

    return this.getPriceChangesForReimbursement(reimbursementId);
  }

  /**
   * 人工放行一条被闸门挂起（HOLD）的价格变更（2026-11-06）。
   *
   * 只解除「波动超过阈值」这一道；0 元和 5 倍离谱仍然会被拒绝——
   * 那两条是防单位/数量录错的，不是给人拍板的。
   */
  async applyHeldChange(
    changeId: string,
    reviewerId?: string | null,
    reviewComment?: string,
  ): Promise<IngredientPriceChangeView[]> {
    const change = await this.prisma.ingredientPriceChange.findUnique({
      where: { id: changeId },
    });

    if (!change) {
      throw new NotFoundException(`价格变更不存在：${changeId}`);
    }

    if (change.status !== 'PENDING') {
      throw new BadRequestException('只有待确认的价格变更可以手动放行');
    }

    await this.applyPriceChanges(
      [change as unknown as IngredientPriceChangeApplyRecord],
      reviewerId ?? null,
      reviewComment ?? '人工确认后应用',
      new Set([changeId]),
    );

    return this.getPriceChangesForReimbursement(change.reimbursementId);
  }

  async rejectChangesForReimbursement(
    reimbursementId: string,
    reviewerId?: string | null,
    reviewComment?: string,
    client?: TransactionClientLike,
  ): Promise<void> {
    const db = (client as PrismaService | undefined) ?? this.prisma;

    const pendingOrApprovedChanges =
      await db.ingredientPriceChange.findMany({
        where: {
          reimbursementId,
          status: {
            in: ['PENDING', 'APPROVED'],
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    if (pendingOrApprovedChanges.length === 0) {
      return;
    }

    const approvedChanges = pendingOrApprovedChanges.filter(
      (change) => change.status === 'APPROVED',
    ) as IngredientPriceChangeRecord[];

    await db.ingredientPriceChange.updateMany({
      where: {
        reimbursementId,
        status: {
          in: ['PENDING', 'APPROVED'],
        },
      },
      data: {
        status: 'REJECTED',
        reviewedById: reviewerId ?? null,
        reviewedAt: new Date(),
        reviewComment: reviewComment ?? null,
      },
    });

    if (approvedChanges.length > 0) {
      await this.restorePricesAfterRejectedApproval(
        reimbursementId,
        approvedChanges,
        client,
      );
    }
  }

  /**
   * 撤销审核时回退价格变更（2026-11-07）
   *
   * 和 rejectChangesForReimbursement 的区别：
   * - 驳回是「这单不要了」，变更标 REJECTED，之后不会再被应用；
   * - 撤销审核是「我要再看一遍」，变更必须回到 PENDING，
   *   否则重新通过时 applyApprovedChangesForReimbursement 找不到待应用的条目，
   *   价格就永远不会再生效。
   */
  async revertApprovedChangesForReimbursement(
    reimbursementId: string,
    operatorId?: string | null,
    client?: TransactionClientLike,
  ): Promise<void> {
    const db = (client as PrismaService | undefined) ?? this.prisma;

    const approvedChanges = (await db.ingredientPriceChange.findMany({
      where: {
        reimbursementId,
        status: 'APPROVED',
      },
      orderBy: {
        createdAt: 'asc',
      },
    })) as IngredientPriceChangeRecord[];

    if (approvedChanges.length === 0) {
      return;
    }

    // 1. 原料当前价退回变更前的值
    await this.restorePricesAfterRejectedApproval(
      reimbursementId,
      approvedChanges,
      client,
    );

    // 2. 回退本身也是一次价格变化，必须补一条成本流水，
    //    否则「成本历史」会停在应用后的价，和当前价对不上（2026-11-07 复审 P0）
    await this.recordRevertCostHistory(
      reimbursementId,
      approvedChanges,
      client,
    );

    // 3. 采购商品（SKU）价退回本单应用前的值。
    //    当初通过时既写了原料价、也写了 SKU 价；只退原料价会让采购执行价停在新的。
    await this.rollbackProcurementSkuPrices(
      reimbursementId,
      operatorId,
      client,
    );

    // 4. 变更回到待确认，并把「新价」恢复成来源单价
    //    （通过时 proposed 被改写成加权应用价，不复位会让表格里「新价/涨跌」自相矛盾）
    for (const change of approvedChanges) {
      await db.ingredientPriceChange.update({
        where: { id: change.id },
        data: {
          status: 'PENDING',
          proposedEffectivePrice: change.sourcePricePerPurchaseUnit,
          reviewedById: null,
          reviewedAt: null,
          reviewComment: null,
          appliedCurrentPricePerPurchaseUnit: null,
          appliedEffectivePricePerPurchaseUnit: null,
          gateAction: null,
          gateReason: null,
        } as any,
      });
    }

    this.logger.log(
      `Reverted ${approvedChanges.length} approved price changes for reimbursement ${reimbursementId} by ${operatorId ?? 'unknown'}`,
    );
  }

  /** 撤销时补记原料成本流水（每个原料一条，记录「应用价 → 回退后的价」） */
  private async recordRevertCostHistory(
    reimbursementId: string,
    changes: IngredientPriceChangeRecord[],
    client?: TransactionClientLike,
  ): Promise<void> {
    const db = (client as PrismaService | undefined) ?? this.prisma;
    const byIngredient = new Map<string, IngredientPriceChangeRecord>();

    for (const change of changes) {
      byIngredient.set(change.ingredientId, change);
    }

    for (const [ingredientId, change] of byIngredient.entries()) {
      const ingredient = await db.ingredient.findUnique({
        where: { id: ingredientId },
        select: { currentPricePerPurchaseUnit: true },
      });

      if (!ingredient) {
        continue;
      }

      const appliedPrice = change.appliedCurrentPricePerPurchaseUnit;
      const oldCost =
        appliedPrice && typeof appliedPrice === 'object' && 'toNumber' in appliedPrice
          ? appliedPrice.toNumber()
          : (appliedPrice as number | null);

      const newCost = Number(ingredient.currentPricePerPurchaseUnit);

      if (
        oldCost === null ||
        oldCost === undefined ||
        !Number.isFinite(Number(oldCost)) ||
        !Number.isFinite(newCost) ||
        Math.abs(Number(oldCost) - newCost) < 1e-9
      ) {
        continue;
      }

      await this.costHistory.record({
        ingredientId,
        oldCost: Number(oldCost),
        newCost,
        source: 'REIMBURSEMENT',
        procurementSkuId: null,
        reimbursementId,
        purchaseRecordId: change.purchaseRecordId,
        note: '审核撤销，价格回退',
        tx: client,
      });
    }
  }

  /** 撤销时把本单写过的采购商品价退回应用前的值（首次定价没有旧值，跳过） */
  private async rollbackProcurementSkuPrices(
    reimbursementId: string,
    operatorId?: string | null,
    client?: TransactionClientLike,
  ): Promise<void> {
    const db = (client as PrismaService | undefined) ?? this.prisma;

    const historyRows = await db.procurementSkuPriceHistory.findMany({
      where: {
        reimbursementId,
        source: 'REIMBURSEMENT',
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        procurementSkuId: true,
        oldPrice: true,
        newPrice: true,
      },
    });

    const firstRowBySku = new Map<
      string,
      { id: string; oldPrice: unknown; newPrice: unknown }
    >();

    for (const row of historyRows) {
      if (!firstRowBySku.has(row.procurementSkuId)) {
        firstRowBySku.set(row.procurementSkuId, {
          id: row.id,
          oldPrice: row.oldPrice,
          newPrice: row.newPrice,
        });
      }
    }

    for (const [procurementSkuId, row] of firstRowBySku.entries()) {
      const rawOldPrice = row.oldPrice as any;
      const oldPrice =
        rawOldPrice === null || rawOldPrice === undefined
          ? null
          : typeof rawOldPrice === 'object' && 'toNumber' in rawOldPrice
            ? rawOldPrice.toNumber()
            : Number(rawOldPrice);

      if (oldPrice === null || !Number.isFinite(oldPrice) || oldPrice <= 0) {
        // 首次定价：应用前没有价格，没有可回退的值
        continue;
      }

      // 同一 SKU 可能被这之后的另一张单又改过价：只有当前价仍等于本单应用后的价，
      // 回退才不会盖掉别人的更新（2026-11-07 终验 P1-2）
      const appliedPrice = Number(
        (row.newPrice as any)?.toNumber?.() ?? row.newPrice,
      );
      const sku = await db.procurementSku.findUnique({
        where: { id: procurementSkuId },
        select: { currentPurchasePrice: true },
      });
      const currentPrice = Number(sku?.currentPurchasePrice);

      if (
        !Number.isFinite(appliedPrice) ||
        !Number.isFinite(currentPrice) ||
        Math.abs(currentPrice - appliedPrice) > 0.005
      ) {
        this.logger.warn(
          `Skip SKU price rollback for ${procurementSkuId}: current ${currentPrice} != applied ${appliedPrice}`,
        );
        continue;
      }

      await this.procurementSkuService.applyCurrentPurchasePrice(
        procurementSkuId,
        oldPrice,
        {
          source: 'ROLLBACK',
          reimbursementId,
          rollbackFromHistoryId: row.id,
          operatorId: operatorId ?? null,
          note: '审核撤销，价格回退',
          client,
        },
      );
    }
  }

  async getPriceChangesForReimbursement(
    reimbursementId: string,
  ): Promise<IngredientPriceChangeView[]> {
    const rows = (await this.prisma.ingredientPriceChange.findMany({
      where: { reimbursementId },
      include: {
        ingredient: {
          select: {
            purchaseUnit: true,
          },
        },
      },
      orderBy: [
        {
          ingredientName: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    })) as Array<
      IngredientPriceChangeRecord & {
        ingredient?: {
          purchaseUnit: string | null;
        } | null;
      }
    >;

    const evaluations = await this.evaluateAutoApproval(
      rows.filter(
        (row) => row.status === 'PENDING',
      ) as IngredientPriceChangeRecord[],
    );

    // 写入闸预演：和 applyPriceChanges 用同一个函数、同一个基准（档案价），
    // 所以「审核前说会被挂起」和「审核后真的被挂起」是一致的。
    const previewThreshold = await this.getAutoApproveThreshold();
    const previews = new Map<
      string,
      { action: 'APPLY' | 'HOLD' | 'REJECT'; reason: string | null }
    >();
    for (const row of rows) {
      if (row.status !== 'PENDING') {
        continue;
      }
      const preview = evaluatePriceGate({
        proposedPrice: row.sourcePricePerPurchaseUnit.toNumber(),
        anchorPrice: row.previousEffectivePrice.toNumber(),
        thresholdRate: previewThreshold,
      });
      previews.set(row.id, { action: preview.action, reason: preview.reason });
    }

    return rows.map((row) => ({
      id: row.id,
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      reimbursementId: row.reimbursementId,
      purchaseRecordId: row.purchaseRecordId,
      purchaseUnit: row.ingredient?.purchaseUnit ?? null,
      sourceQuantity: this.toNumericSourceQuantity(row.sourceQuantity),
      sourcePricePerPurchaseUnit: row.sourcePricePerPurchaseUnit.toNumber(),
      previousCurrentPricePerPurchaseUnit:
        row.previousCurrentPricePerPurchaseUnit.toNumber(),
      previousEffectivePrice: row.previousEffectivePrice.toNumber(),
      proposedEffectivePrice: row.proposedEffectivePrice.toNumber(),
      appliedCurrentPricePerPurchaseUnit:
        row.appliedCurrentPricePerPurchaseUnit?.toNumber() ?? null,
      appliedEffectivePricePerPurchaseUnit:
        row.appliedEffectivePricePerPurchaseUnit?.toNumber() ?? null,
      deltaRate: row.deltaRate ? row.deltaRate.toNumber() : null,
      status: row.status,
      approvalMode:
        row.status === 'PENDING'
          ? 'MANUAL_REQUIRED'
          : row.reviewedById
            ? 'MANUAL'
            : 'AUTO',
      gateAction: ((row as any).gateAction ?? null) as PriceGateAction | null,
      gateReason: (row as any).gateReason ?? null,
      autoApprovalEligible:
        row.status === 'PENDING'
          ? (evaluations.get(row.id)?.eligible ?? false)
          : true,
      gatePreviewAction:
        row.status === 'PENDING'
          ? (previews.get(row.id)?.action ?? null)
          : null,
      gatePreviewReason:
        row.status === 'PENDING'
          ? (previews.get(row.id)?.reason ?? null)
          : null,
      reviewReasons: this.buildReviewReasonsForView(
        row,
        evaluations.get(row.id),
      ),
      reviewComment: row.reviewComment,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async applyPriceChanges(
    changes: IngredientPriceChangeApplyRecord[],
    reviewerId: string | null,
    reviewComment: string | null,
    /**
     * 人工放行的条目：只解除「波动过大」这一道挂起，
     * **不解除**「必须为正」和「5 倍离谱」——那两条是防录错的，人不该拍脑袋放行。
     */
    forceApplyIds: Set<string> = new Set(),
    /** 传了事务客户端就全程走同一个事务：状态与价格必须一起成功或一起失败 */
    client?: TransactionClientLike,
  ): Promise<void> {
    if (changes.length === 0) {
      return;
    }

    const db = (client as PrismaService | undefined) ?? this.prisma;

    const ingredientCurrentAccumulator = new Map<string, WeightedAccumulator>();
    const procurementSkuCurrentAccumulator = new Map<
      string,
      WeightedAccumulator
    >();
    const procurementSkuContext = new Map<
      string,
      {
        reimbursementId: string;
        purchaseRecordIds: Set<string>;
      }
    >();
    const ingredients = await this.ingredientRepository.findByIds(
      Array.from(new Set(changes.map((change) => change.ingredientId))),
    );
    const ingredientMap = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );
    const purchaseRecordEntries = await Promise.all(
      changes.map(
        async (change) =>
          [
            change.purchaseRecordId,
            await this.purchaseRecordRepository.findById(
              change.purchaseRecordId,
            ),
          ] as const,
      ),
    );
    const purchaseRecordMap = new Map(
      purchaseRecordEntries.filter((entry) => entry[1] !== null),
    );
    const procurementSkuIds = Array.from(
      new Set(
        purchaseRecordEntries
          .map(([, purchaseRecord]) => purchaseRecord?.procurementSkuId)
          .filter((procurementSkuId): procurementSkuId is string =>
            Boolean(procurementSkuId),
          ),
      ),
    );
    const procurementSkus =
      procurementSkuIds.length > 0
        ? await db.procurementSku.findMany({
            where: {
              id: {
                in: procurementSkuIds,
              },
            },
            select: {
              id: true,
              purchaseToBaseRatio: true,
            },
          })
        : [];
    const procurementSkuRatioMap = new Map(
      procurementSkus.map((sku) => [
        sku.id,
        this.resolvePurchaseToBaseRatio(sku.purchaseToBaseRatio),
      ]),
    );

    // ── 写入闸（2026-11-06「单一来源」改造 · 阶段 A）─────────────────────
    // 三道闸：必须为正 → 不得离谱（5 倍）→ 波动可控（阈值）。
    // 只有 APPLY 的条目会真正写库；HOLD 保持待确认；REJECT 直接拒绝并留下原因。
    // 被挂起 / 拒绝的条目不参与加权累加，避免污染同一原料的其它有效变更。
    const gateThresholdRate = await this.getAutoApproveThreshold();
    const anchors = await this.priceAnchorService.resolveAnchors({
      ingredientIds: Array.from(
        new Set(changes.map((change) => change.ingredientId)),
      ),
      excludePurchaseRecordIds: changes.map(
        (change) => change.purchaseRecordId,
      ),
    });

    const gateResults = new Map<
      string,
      { action: PriceGateAction; reason: string | null; forced: boolean }
    >();
    const effectiveChanges: IngredientPriceChangeApplyRecord[] = [];

    for (const change of changes) {
      const sourceIngredient = ingredientMap.get(change.ingredientId);
      if (!sourceIngredient) {
        gateResults.set(change.id, {
          action: 'REJECT',
          reason: '原料不存在，无法校验价格',
          forced: false,
        });
        continue;
      }

      const purchaseRecord = purchaseRecordMap.get(change.purchaseRecordId);
      const pricingBasis = purchaseRecord
        ? this.buildPurchaseRecordPricingBasis(purchaseRecord, sourceIngredient)
        : null;
      const proposedPrice =
        pricingBasis?.ingredientPricePerPurchaseUnit ??
        change.sourcePricePerPurchaseUnit.toNumber();
      // 基准（2026-11-08 口径变更）：原料档案的当前生效价 —— 和页面上的「上次单价」同一把尺子，
      // 审核员看到的涨跌就是闸门判断的涨跌，不会再出现「页面 0%、闸门 -40%」。
      // 历史中位数只在档案价缺失（0）时兜底，防止拿 0 当基准把一切都放过去。
      const currentPrice = this.resolveCurrentPriceOf(sourceIngredient);
      const anchorPrice =
        currentPrice > 0
          ? currentPrice
          : (anchors.get(change.ingredientId) ?? 0);

      const gate = evaluatePriceGate({
        proposedPrice,
        anchorPrice,
        thresholdRate: gateThresholdRate,
      });

      const canForceApply =
        gate.action === 'HOLD' && forceApplyIds.has(change.id);
      const finalAction: PriceGateAction = canForceApply
        ? 'APPLY'
        : gate.action;

      gateResults.set(change.id, {
        action: finalAction,
        reason: gate.reason,
        forced: canForceApply,
      });

      if (finalAction === 'APPLY') {
        effectiveChanges.push(change);
      }
    }

    for (const change of effectiveChanges) {
      const sourceIngredient = ingredientMap.get(change.ingredientId);
      if (!sourceIngredient) {
        continue;
      }

      const purchaseRecord = purchaseRecordMap.get(change.purchaseRecordId);
      const pricingBasis = purchaseRecord
        ? this.buildPurchaseRecordPricingBasis(purchaseRecord, sourceIngredient)
        : null;
      const sourceIngredientRatio = this.resolvePurchaseToBaseRatio(
        sourceIngredient.purchaseToBaseRatio,
      );
      const ingredientPricePerPurchaseUnit =
        pricingBasis?.ingredientPricePerPurchaseUnit ??
        change.sourcePricePerPurchaseUnit.toNumber();
      const ingredientPurchaseQuantity =
        pricingBasis?.ingredientPurchaseQuantity ??
        this.toNumericSourceQuantity(change.sourceQuantity);
      const baseUnitCost =
        pricingBasis?.baseUnitCost ??
        perBaseUnitCost(ingredientPricePerPurchaseUnit, sourceIngredientRatio) ??
        0;
      const baseQuantity =
        pricingBasis?.baseQuantity ??
        ingredientPurchaseQuantity * sourceIngredientRatio;

      ingredientCurrentAccumulator.set(
        change.ingredientId,
        this.mergeWeightedAccumulator(
          ingredientCurrentAccumulator.get(change.ingredientId),
          ingredientPricePerPurchaseUnit,
          ingredientPurchaseQuantity,
        ),
      );

      if (purchaseRecord?.procurementSkuId) {
        const procurementSkuRatio =
          procurementSkuRatioMap.get(purchaseRecord.procurementSkuId) ??
          sourceIngredientRatio;
        const procurementSkuPricePerPurchaseUnit = pricingBasis
          ? this.roundCurrency(baseUnitCost * procurementSkuRatio)
          : change.sourcePricePerPurchaseUnit.toNumber();
        const procurementSkuPurchaseQuantity = pricingBasis
          ? baseQuantity / procurementSkuRatio
          : ingredientPurchaseQuantity;

        procurementSkuCurrentAccumulator.set(
          purchaseRecord.procurementSkuId,
          this.mergeWeightedAccumulator(
            procurementSkuCurrentAccumulator.get(
              purchaseRecord.procurementSkuId,
            ),
            procurementSkuPricePerPurchaseUnit,
            procurementSkuPurchaseQuantity,
          ),
        );

        const context = procurementSkuContext.get(
          purchaseRecord.procurementSkuId,
        ) ?? {
          reimbursementId: change.reimbursementId,
          purchaseRecordIds: new Set<string>(),
        };
        context.purchaseRecordIds.add(change.purchaseRecordId);
        procurementSkuContext.set(purchaseRecord.procurementSkuId, context);
      }
    }

    const appliedCurrentPriceByIngredient = new Map<string, number>();
    const changeByIngredient = new Map(
      effectiveChanges.map((change) => [change.ingredientId, change] as const),
    );
    for (const [
      ingredientId,
      accumulator,
    ] of ingredientCurrentAccumulator.entries()) {
      const currentPrice = this.toWeightedUnitCost(accumulator);
      appliedCurrentPriceByIngredient.set(ingredientId, currentPrice);
      const change = changeByIngredient.get(ingredientId);
      await this.applyIngredientCost({
        ingredientId,
        previousCost: Number(
          ingredientMap.get(ingredientId)?.currentPricePerPurchaseUnit ?? 0,
        ),
        nextCost: currentPrice,
        reimbursementId: change?.reimbursementId ?? null,
        purchaseRecordId: change?.purchaseRecordId ?? null,
        note: '报销凭证确认后自动更新',
        client,
      });
    }

    for (const [
      procurementSkuId,
      accumulator,
    ] of procurementSkuCurrentAccumulator.entries()) {
      const currentPrice = this.toWeightedPrice(accumulator);
      const context = procurementSkuContext.get(procurementSkuId);
      const purchaseRecordIds = Array.from(context?.purchaseRecordIds ?? []);
      await this.procurementSkuService.applyCurrentPurchasePrice(
        procurementSkuId,
        currentPrice,
        {
          source: 'REIMBURSEMENT',
          reimbursementId: context?.reimbursementId ?? null,
          purchaseRecordId:
            purchaseRecordIds.length === 1 ? purchaseRecordIds[0] : null,
          operatorId: reviewerId,
          note: reviewComment ?? '报销凭证确认后自动更新',
          client,
        },
      );
    }

    const reviewedAt = new Date();
    for (const change of changes) {
      const sourceIngredient = ingredientMap.get(change.ingredientId);
      if (!sourceIngredient) {
        continue;
      }

      const gateResult = gateResults.get(change.id);

      // 挂起：价格不写，状态保持待确认，只记下原因等人工放行
      if (gateResult?.action === 'HOLD') {
        await db.ingredientPriceChange.update({
          where: { id: change.id },
          data: {
            gateAction: 'HOLD',
            gateReason: gateResult.reason,
          } as any,
        });
        continue;
      }

      // 拒绝：标记拒绝并留下原因，绝不写库
      if (!gateResult || gateResult.action === 'REJECT') {
        await db.ingredientPriceChange.update({
          where: { id: change.id },
          data: {
            status: 'REJECTED',
            gateAction: 'REJECT',
            gateReason: gateResult?.reason ?? '缺少校验结果',
            reviewedById: reviewerId,
            reviewedAt,
            reviewComment,
          } as any,
        });
        continue;
      }

      const appliedCurrentPrice =
        appliedCurrentPriceByIngredient.get(change.ingredientId) ??
        change.sourcePricePerPurchaseUnit.toNumber();

      // 2026-11-06：生效价与当前价合并成一个字段，这里三个列写同一个值，
      // 只为兼容还没删掉的旧列（阶段 C 会一起删）。
      await db.ingredientPriceChange.update({
        where: { id: change.id },
        data: {
          proposedEffectivePrice: appliedCurrentPrice,
          appliedCurrentPricePerPurchaseUnit: appliedCurrentPrice,
          appliedEffectivePricePerPurchaseUnit: appliedCurrentPrice,
          status: 'APPROVED',
          gateAction: 'APPLY',
          gateReason: gateResult.forced
            ? `人工放行：${gateResult.reason ?? '价格变动超过阈值'}`
            : null,
          reviewedById: reviewerId,
          reviewedAt,
          reviewComment,
        } as any,
      });
    }
  }

  private async restorePricesAfterRejectedApproval(
    reimbursementId: string,
    approvedChanges: IngredientPriceChangeRecord[],
    client?: TransactionClientLike,
  ): Promise<void> {
    const db = (client as PrismaService | undefined) ?? this.prisma;
    const fallbackByIngredient = new Map<string, IngredientPriceChangeRecord>();

    for (const change of approvedChanges) {
      fallbackByIngredient.set(change.ingredientId, change);
    }

    for (const [ingredientId, fallbackChange] of fallbackByIngredient.entries()) {
      // 同一原料可能被别的单子之后又改过价：优先退到「最新一条别单的应用价」
      const latestApproved = (await db.ingredientPriceChange.findFirst({
        where: {
          ingredientId,
          status: 'APPROVED',
          reimbursementId: { not: reimbursementId },
        },
        orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
      })) as IngredientPriceChangeRecord | null;

      const restoredPrice =
        latestApproved?.appliedCurrentPricePerPurchaseUnit?.toNumber() ??
        fallbackChange.previousCurrentPricePerPurchaseUnit.toNumber();

      if (!Number.isFinite(restoredPrice) || restoredPrice <= 0) {
        continue;
      }

      if (client) {
        await (client as any).ingredient.update({
          where: { id: ingredientId },
          data: { currentPricePerPurchaseUnit: restoredPrice },
        });
      } else {
        await this.ingredientRepository.update(ingredientId, {
          currentPricePerPurchaseUnit: restoredPrice,
        });
      }
    }
  }

  private async getAutoApproveThreshold(): Promise<number> {
    const config = await this.globalConfigService.getGlobalConfig();
    return (
      config.ingredientPriceAutoApproveThreshold ??
      this.defaultAutoApproveThreshold
    );
  }

  private async evaluateAutoApproval(
    changes: IngredientPriceChangeRecord[],
  ): Promise<Map<string, AutoApprovalEvaluation>> {
    const evaluations = new Map<string, AutoApprovalEvaluation>();

    if (changes.length === 0) {
      return evaluations;
    }

    const threshold = await this.getAutoApproveThreshold();
    const ingredientIds = Array.from(
      new Set(changes.map((change) => change.ingredientId)),
    );

    const ingredients =
      await this.ingredientRepository.findByIds(ingredientIds);
    const ingredientMap = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    const approvedHistoryRows =
      await this.prisma.ingredientPriceChange.findMany({
        where: {
          status: 'APPROVED',
          ingredientId: { in: ingredientIds },
        },
        select: {
          ingredientId: true,
        },
      });
    const approvedHistoryKeys = new Set(
      approvedHistoryRows.map((row) =>
        this.buildEffectiveKey(row.ingredientId),
      ),
    );

    const historyEntries = await Promise.all(
      ingredientIds.map(
        async (ingredientId) =>
          [
            ingredientId,
            await this.purchaseRecordRepository.findByIngredientId(
              ingredientId,
            ),
          ] as const,
      ),
    );
    const purchaseHistoryMap = new Map(historyEntries);

    for (const change of changes) {
      const reasons: string[] = [];
      const deltaRate = change.deltaRate?.toNumber();
      const ingredient = ingredientMap.get(change.ingredientId);
      const effectiveKey = this.buildEffectiveKey(change.ingredientId);

      if (!approvedHistoryKeys.has(effectiveKey)) {
        reasons.push('首次动态采购调价，需人工确认');
      }

      if (
        change.previousEffectivePrice.toNumber() <= 0 ||
        deltaRate === null ||
        deltaRate === undefined
      ) {
        reasons.push('缺少有效基准价，不能自动审核');
      } else if (Math.abs(deltaRate) > threshold) {
        reasons.push(
          `价格波动 ${this.formatPercent(Math.abs(deltaRate))} 超过自动审核阈值 ${this.formatPercent(threshold)}`,
        );
      }

      // 「相差 5 倍」的防呆已整体挪到写入闸（domain/ingredient/price-gate.ts）：
      // 那儿用「历史采购价中位数」当基准，比原来的「创建价」更抗脏数据，
      // 而且对自动审核和人工放行两条路径都生效，不会出现绕过。

      if (ingredient) {
        const historicalBaseQuantities = (
          purchaseHistoryMap.get(change.ingredientId) ?? []
        )
          .filter((record) => record.id !== change.purchaseRecordId)
          .slice(0, this.quantityOutlierSampleSize)
          .map((record) => this.resolveActualBaseQuantity(record, ingredient));

        if (
          historicalBaseQuantities.length >= this.quantityOutlierHistoryMinCount
        ) {
          const medianBaseQuantity = this.calculateMedian(
            historicalBaseQuantities,
          );
          const currentBaseQuantity =
            this.toNumericSourceQuantity(change.sourceQuantity) *
            ingredient.purchaseToBaseRatio;

          if (
            currentBaseQuantity <
              medianBaseQuantity * this.quantityOutlierLowerRatio ||
            currentBaseQuantity >
              medianBaseQuantity * this.quantityOutlierUpperRatio
          ) {
            reasons.push(
              `采购数量偏离近${historicalBaseQuantities.length}次中位数，需人工确认`,
            );
          }
        }
      }

      evaluations.set(change.id, {
        eligible: reasons.length === 0,
        reasons,
      });
    }

    return evaluations;
  }

  private buildReviewReasonsForView(
    row: IngredientPriceChangeRecord,
    evaluation?: AutoApprovalEvaluation,
  ): string[] {
    if (row.status === 'PENDING') {
      return evaluation?.reasons ?? [];
    }

    if (row.reviewComment) {
      return [row.reviewComment];
    }

    if (row.status === 'APPROVED' && !row.reviewedById) {
      return ['系统自动审核通过'];
    }

    return [];
  }

  private async buildAutoApprovalComment(): Promise<string> {
    const threshold = await this.getAutoApproveThreshold();
    return `系统自动审核通过：价格波动在 ${this.formatPercent(threshold)} 阈值内`;
  }

  private buildEffectiveKey(ingredientId: string): string {
    return `ingredient:${ingredientId}`;
  }

  private buildPurchaseRecordPricingBasis(
    record: {
      actualQuantity: number;
      actualBaseQuantity?: number;
      actualCost: number;
    },
    ingredient: Pick<Ingredient, 'purchaseToBaseRatio' | 'type'>,
  ): PurchaseRecordPricingBasis | null {
    const baseQuantity = this.resolveActualBaseQuantity(record, ingredient);
    const ingredientRatio = this.resolvePurchaseToBaseRatio(
      ingredient.purchaseToBaseRatio,
    );

    if (
      !Number.isFinite(baseQuantity) ||
      baseQuantity <= 0 ||
      !Number.isFinite(record.actualCost) ||
      // 0 元采购不允许换算成单价：历史上就是这样把 0 价写进档案的（2026-11-06 修）
      record.actualCost <= 0
    ) {
      return null;
    }

    const baseUnitCost = record.actualCost / baseQuantity;
    const ingredientPurchaseQuantity = baseQuantity / ingredientRatio;

    return {
      baseQuantity,
      baseUnitCost,
      ingredientPurchaseQuantity,
      ingredientPricePerPurchaseUnit: this.roundPrice(
        baseUnitCost * ingredientRatio,
      ),
    };
  }

  private resolveActualBaseQuantity(
    record: {
      actualQuantity: number;
      actualBaseQuantity?: number;
    },
    ingredient: Pick<Ingredient, 'purchaseToBaseRatio' | 'type'>,
  ): number {
    if (
      record.actualBaseQuantity !== undefined &&
      Number.isFinite(record.actualBaseQuantity) &&
      record.actualBaseQuantity > 0
    ) {
      return record.actualBaseQuantity;
    }

    const ratio = this.resolvePurchaseToBaseRatio(ingredient.purchaseToBaseRatio);

    // 2026-11-07 复核：食材档案的换算恒为 1，拿它乘「几袋」等于把 2 记成 2 克，
    // 报销随后会把 39.9 ÷ 2 = 19.95 元/g 写进档案。宁可不给这条记录调价。
    if (ingredient.type === IngredientType.FOOD && ratio === 1) {
      return 0;
    }

    return record.actualQuantity * ratio;
  }

  /** 取原料当前价：真实实体走 getter，测试/裸对象走字段 */
  private resolveCurrentPriceOf(ingredient: any): number {
    if (typeof ingredient?.getEffectivePricePerPurchaseUnit === 'function') {
      return Number(ingredient.getEffectivePricePerPurchaseUnit());
    }
    return Number(ingredient?.currentPricePerPurchaseUnit ?? 0);
  }

  private resolvePurchaseToBaseRatio(ratio?: number | null): number {
    return Number.isFinite(ratio) && Number(ratio) > 0 ? Number(ratio) : 1;
  }

  private mergeWeightedAccumulator(
    existingAccumulator: WeightedAccumulator | undefined,
    nextPrice: number,
    nextQuantity: number,
  ): WeightedAccumulator {
    if (!existingAccumulator) {
      return {
        totalAmount: nextPrice * nextQuantity,
        totalQuantity: nextQuantity,
      };
    }

    return {
      totalAmount: existingAccumulator.totalAmount + nextPrice * nextQuantity,
      totalQuantity: existingAccumulator.totalQuantity + nextQuantity,
    };
  }

  private toWeightedPrice(accumulator: WeightedAccumulator): number {
    if (accumulator.totalQuantity <= 0) {
      return 0;
    }

    return this.roundCurrency(
      accumulator.totalAmount / accumulator.totalQuantity,
    );
  }

  /**
   * 写成本 + 留痕（2026-11-07 成本口径归位）。
   *
   * 顺序不能反：先写价，写成功再记流水。
   * 反过来会留下一条「有流水、价没变」的假记录，比没有流水更糟。
   */
  private async applyIngredientCost(params: {
    ingredientId: string;
    previousCost: number;
    nextCost: number;
    reimbursementId: string | null;
    purchaseRecordId: string | null;
    note: string | null;
    client?: TransactionClientLike;
  }): Promise<void> {
    if (params.client) {
      // 事务内：走事务客户端，和单据状态一起提交/回滚
      await (params.client as any).ingredient.update({
        where: { id: params.ingredientId },
        data: { currentPricePerPurchaseUnit: params.nextCost },
      });
    } else {
      await this.ingredientRepository.update(params.ingredientId, {
        currentPricePerPurchaseUnit: params.nextCost,
      });
    }

    await this.costHistory.record({
      ingredientId: params.ingredientId,
      oldCost: params.previousCost,
      newCost: params.nextCost,
      source: 'REIMBURSEMENT',
      reimbursementId: params.reimbursementId,
      purchaseRecordId: params.purchaseRecordId,
      note: params.note,
      tx: params.client,
    });
  }

  private toWeightedUnitCost(accumulator: WeightedAccumulator): number {
    if (accumulator.totalQuantity <= 0) {
      return 0;
    }

    return Number(
      (accumulator.totalAmount / accumulator.totalQuantity).toFixed(6),
    );
  }

  private roundCurrency(value: number): number {
    return Number(value.toFixed(2));
  }

  /**
   * 原料单价（元/采购单位）保留 6 位小数。
   *
   * 采购单位是 1g 的原料（占大多数），单价就是 0.0x 元/克；
   * 只保留 2 位会被抹成 0.01 / 0.02，误差可达 30%。
   * SKU 价格（元/桶、元/份）仍用 roundCurrency。
   */
  private roundPrice(value: number): number {
    return Number(value.toFixed(6));
  }

  private roundRatio(value: number): number {
    return Number(value.toFixed(4));
  }

  private toNumericSourceQuantity(
    sourceQuantity: number | DecimalLike,
  ): number {
    if (
      sourceQuantity !== null &&
      typeof sourceQuantity === 'object' &&
      'toNumber' in sourceQuantity &&
      typeof sourceQuantity.toNumber === 'function'
    ) {
      return sourceQuantity.toNumber();
    }

    return Number(sourceQuantity);
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middleIndex = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
      ? (sorted[middleIndex - 1] + sorted[middleIndex]) / 2
      : sorted[middleIndex];
  }

  private formatPercent(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
  }
}
