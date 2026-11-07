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
  private readonly defaultAutoApproveThreshold = 0.08;
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
  ): Promise<IngredientPriceChangeView[]> {
    const pendingChanges = await this.prisma.ingredientPriceChange.findMany({
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
  ): Promise<void> {
    const pendingOrApprovedChanges =
      await this.prisma.ingredientPriceChange.findMany({
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

    await this.prisma.ingredientPriceChange.updateMany({
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
  ): Promise<void> {
    const approvedChanges = (await this.prisma.ingredientPriceChange.findMany({
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

    // 先把原料当前价退回变更前的值
    await this.restorePricesAfterRejectedApproval(
      reimbursementId,
      approvedChanges,
    );

    // 再把这些变更退回待确认，并清掉「已应用」的痕迹
    await this.prisma.ingredientPriceChange.updateMany({
      where: {
        reimbursementId,
        status: 'APPROVED',
      },
      data: {
        status: 'PENDING',
        reviewedById: null,
        reviewedAt: null,
        reviewComment: null,
        appliedCurrentPricePerPurchaseUnit: null,
        appliedEffectivePricePerPurchaseUnit: null,
        gateAction: null,
        gateReason: null,
      },
    });

    this.logger.log(
      `Reverted ${approvedChanges.length} approved price changes for reimbursement ${reimbursementId} by ${operatorId ?? 'unknown'}`,
    );
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
  ): Promise<void> {
    if (changes.length === 0) {
      return;
    }

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
        ? await this.prisma.procurementSku.findMany({
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
      // 基准：历史采购价中位数；没有历史就退回当前档案价；都没有 = 首次定价
      const anchorPrice =
        anchors.get(change.ingredientId) ??
        this.resolveCurrentPriceOf(sourceIngredient);

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
        await this.prisma.ingredientPriceChange.update({
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
        await this.prisma.ingredientPriceChange.update({
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
      await this.prisma.ingredientPriceChange.update({
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
  ): Promise<void> {
    const fallbackApprovedByIngredient = new Map<
      string,
      IngredientPriceChangeRecord
    >();

    for (const change of approvedChanges) {
      fallbackApprovedByIngredient.set(change.ingredientId, change);
    }

    for (const [
      ingredientId,
      fallbackChange,
    ] of fallbackApprovedByIngredient.entries()) {
      const latestApproved = (await this.prisma.ingredientPriceChange.findFirst(
        {
          where: {
            ingredientId,
            status: 'APPROVED',
            reimbursementId: {
              not: reimbursementId,
            },
          },
          orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
        },
      )) as IngredientPriceChangeRecord | null;

      const restoredCurrentPrice =
        latestApproved?.appliedCurrentPricePerPurchaseUnit?.toNumber() ??
        fallbackChange.previousCurrentPricePerPurchaseUnit.toNumber();

      await this.ingredientRepository.update(ingredientId, {
        currentPricePerPurchaseUnit: restoredCurrentPrice,
      });
    }

    for (const [
      ingredientId,
      fallbackChange,
    ] of fallbackApprovedByIngredient.entries()) {
      const latestApproved = (await this.prisma.ingredientPriceChange.findFirst(
        {
          where: {
            ingredientId,
            status: 'APPROVED',
            reimbursementId: {
              not: reimbursementId,
            },
          },
          orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
        },
      )) as IngredientPriceChangeRecord | null;

      // 2026-11-06：只剩一个价格字段，回滚也就是回滚「当前价」
      const restoredPrice =
        latestApproved?.appliedCurrentPricePerPurchaseUnit?.toNumber() ??
        fallbackChange.previousCurrentPricePerPurchaseUnit.toNumber();

      if (Number.isFinite(restoredPrice) && restoredPrice > 0) {
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
    ingredient: Pick<Ingredient, 'purchaseToBaseRatio'>,
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
    ingredient: Pick<Ingredient, 'purchaseToBaseRatio'>,
  ): number {
    if (
      record.actualBaseQuantity !== undefined &&
      Number.isFinite(record.actualBaseQuantity) &&
      record.actualBaseQuantity > 0
    ) {
      return record.actualBaseQuantity;
    }

    return (
      record.actualQuantity *
      this.resolvePurchaseToBaseRatio(ingredient.purchaseToBaseRatio)
    );
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
  }): Promise<void> {
    await this.ingredientRepository.update(params.ingredientId, {
      currentPricePerPurchaseUnit: params.nextCost,
    });

    await this.costHistory.record({
      ingredientId: params.ingredientId,
      oldCost: params.previousCost,
      newCost: params.nextCost,
      source: 'REIMBURSEMENT',
      reimbursementId: params.reimbursementId,
      purchaseRecordId: params.purchaseRecordId,
      note: params.note,
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
