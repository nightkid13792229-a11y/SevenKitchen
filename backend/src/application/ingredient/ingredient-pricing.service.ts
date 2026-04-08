import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { INGREDIENT_REPOSITORY } from './ingredient.service';
import { GlobalConfigService } from '../config/global-config.service';
import {
  PURCHASE_RECORD_REPOSITORY,
} from '../purchasing/purchasing.service.tokens';
import type { PurchaseRecordRepository } from '../../domain/purchasing/purchase-record.repository';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import type { Ingredient } from '../../domain/ingredient';

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
  sourceQuantity: number;
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
  sourceQuantity: number;
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
    const ingredients = await this.ingredientRepository.findByIds(ingredientIds);
    const ingredientMap = new Map<string, Ingredient>(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    const changeRows = purchaseRecords.flatMap((record) => {
      const ingredient = ingredientMap.get(record.ingredientId);

      if (!ingredient || record.actualQuantity <= 0) {
        return [];
      }

      const sourcePricePerPurchaseUnit = this.roundCurrency(
        record.actualCost / record.actualQuantity,
      );
      const previousCurrentPricePerPurchaseUnit = this.roundCurrency(
        ingredient.currentPricePerPurchaseUnit,
      );
      const previousEffectivePrice = this.roundCurrency(
        ingredient.getEffectivePricePerPurchaseUnit(),
      );

      return [
        {
          ingredientId: ingredient.id,
          reimbursementId,
          purchaseRecordId: record.id,
          ingredientName: ingredient.name,
          sourceQuantity: record.actualQuantity,
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
    const pendingChanges = await this.prisma.ingredientPriceChange.findMany({
      where: {
        reimbursementId,
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'asc',
      },
    }) as IngredientPriceChangeRecord[];

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

  async rejectChangesForReimbursement(
    reimbursementId: string,
    reviewerId?: string | null,
    reviewComment?: string,
  ): Promise<void> {
    const pendingOrApprovedChanges = await this.prisma.ingredientPriceChange.findMany({
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

  async getPriceChangesForReimbursement(
    reimbursementId: string,
  ): Promise<IngredientPriceChangeView[]> {
    const rows = await this.prisma.ingredientPriceChange.findMany({
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
    }) as Array<
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
      sourceQuantity: row.sourceQuantity,
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
  ): Promise<void> {
    if (changes.length === 0) {
      return;
    }

    const groupedEffectiveAccumulator = new Map<string, WeightedAccumulator>();
    const ingredientCurrentAccumulator = new Map<string, WeightedAccumulator>();
    const ingredients = await this.ingredientRepository.findByIds(
      Array.from(new Set(changes.map((change) => change.ingredientId))),
    );
    const ingredientMap = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    for (const change of changes) {
      const sourceIngredient = ingredientMap.get(change.ingredientId);
      if (!sourceIngredient) {
        continue;
      }

      const effectiveKey = this.buildEffectiveKey(change.ingredientId);
      groupedEffectiveAccumulator.set(
        effectiveKey,
        this.mergeWeightedAccumulator(
          groupedEffectiveAccumulator.get(effectiveKey),
          change.sourcePricePerPurchaseUnit.toNumber() /
            sourceIngredient.purchaseToBaseRatio,
          change.sourceQuantity * sourceIngredient.purchaseToBaseRatio,
        ),
      );
      ingredientCurrentAccumulator.set(
        change.ingredientId,
        this.mergeWeightedAccumulator(
          ingredientCurrentAccumulator.get(change.ingredientId),
          change.sourcePricePerPurchaseUnit.toNumber(),
          change.sourceQuantity,
        ),
      );
    }

    const appliedCurrentPriceByIngredient = new Map<string, number>();
    for (const [ingredientId, accumulator] of ingredientCurrentAccumulator.entries()) {
      const currentPrice = this.toWeightedPrice(accumulator);
      appliedCurrentPriceByIngredient.set(ingredientId, currentPrice);
      await this.ingredientRepository.update(ingredientId, {
        currentPricePerPurchaseUnit: currentPrice,
      });
    }

    const appliedEffectiveUnitCostByKey = new Map<string, number>();
    const handledIngredients = new Set<string>();

    for (const change of changes) {
      const sourceIngredient = ingredientMap.get(change.ingredientId);
      if (!sourceIngredient) {
        continue;
      }

      const effectiveKey = this.buildEffectiveKey(change.ingredientId);
      const effectiveAccumulator = groupedEffectiveAccumulator.get(effectiveKey);
      if (!effectiveAccumulator) {
        continue;
      }

      const effectiveUnitCost = this.toWeightedUnitCost(effectiveAccumulator);
      appliedEffectiveUnitCostByKey.set(effectiveKey, effectiveUnitCost);

      if (handledIngredients.has(change.ingredientId)) {
        continue;
      }

      const effectivePricePerPurchaseUnit = this.roundCurrency(
        effectiveUnitCost * sourceIngredient.purchaseToBaseRatio,
      );
      await this.ingredientRepository.updateEffectivePrice(
        change.ingredientId,
        effectivePricePerPurchaseUnit,
      );
      handledIngredients.add(change.ingredientId);
    }

    const reviewedAt = new Date();
    for (const change of changes) {
      const sourceIngredient = ingredientMap.get(change.ingredientId);
      if (!sourceIngredient) {
        continue;
      }

      const effectiveKey = this.buildEffectiveKey(change.ingredientId);
      const appliedEffectiveUnitCost = appliedEffectiveUnitCostByKey.get(
        effectiveKey,
      );
      const appliedEffectivePrice = this.roundCurrency(
        (appliedEffectiveUnitCost ??
          change.proposedEffectivePrice.toNumber() /
            sourceIngredient.purchaseToBaseRatio) *
          sourceIngredient.purchaseToBaseRatio,
      );
      const appliedCurrentPrice =
        appliedCurrentPriceByIngredient.get(change.ingredientId) ??
        change.sourcePricePerPurchaseUnit.toNumber();

      await this.prisma.ingredientPriceChange.update({
        where: { id: change.id },
        data: {
          proposedEffectivePrice: appliedEffectivePrice,
          appliedCurrentPricePerPurchaseUnit: appliedCurrentPrice,
          appliedEffectivePricePerPurchaseUnit: appliedEffectivePrice,
          status: 'APPROVED',
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
    const fallbackApprovedByIngredient = new Map<string, IngredientPriceChangeRecord>();

    for (const change of approvedChanges) {
      fallbackApprovedByIngredient.set(change.ingredientId, change);
    }

    for (const [ingredientId, fallbackChange] of fallbackApprovedByIngredient.entries()) {
      const latestApproved = await this.prisma.ingredientPriceChange.findFirst({
        where: {
          ingredientId,
          status: 'APPROVED',
          reimbursementId: {
            not: reimbursementId,
          },
        },
        orderBy: [
          { reviewedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }) as IngredientPriceChangeRecord | null;

      const restoredCurrentPrice =
        latestApproved?.appliedCurrentPricePerPurchaseUnit?.toNumber() ??
        fallbackChange.previousCurrentPricePerPurchaseUnit.toNumber();

      await this.ingredientRepository.update(ingredientId, {
        currentPricePerPurchaseUnit: restoredCurrentPrice,
      });
    }

    for (const [ingredientId, fallbackChange] of fallbackApprovedByIngredient.entries()) {
      const latestApproved = await this.prisma.ingredientPriceChange.findFirst({
        where: {
          ingredientId,
          status: 'APPROVED',
          reimbursementId: {
            not: reimbursementId,
          },
        },
        orderBy: [
          { reviewedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }) as IngredientPriceChangeRecord | null;

      const restoredEffectivePrice =
        latestApproved?.appliedEffectivePricePerPurchaseUnit?.toNumber() ??
        fallbackChange.previousEffectivePrice.toNumber();

      await this.ingredientRepository.updateEffectivePrice(
        ingredientId,
        restoredEffectivePrice,
      );
    }
  }

  private async getAutoApproveThreshold(): Promise<number> {
    const config = await this.globalConfigService.getGlobalConfig();
    return config.ingredientPriceAutoApproveThreshold ??
      this.defaultAutoApproveThreshold;
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

    const ingredients = await this.ingredientRepository.findByIds(ingredientIds);
    const ingredientMap = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    const approvedHistoryRows = await this.prisma.ingredientPriceChange.findMany({
      where: {
        status: 'APPROVED',
        ingredientId: { in: ingredientIds },
      },
      select: {
        ingredientId: true,
      },
    });
    const approvedHistoryKeys = new Set(
      approvedHistoryRows.map((row) => this.buildEffectiveKey(row.ingredientId)),
    );

    const historyEntries = await Promise.all(
      ingredientIds.map(async (ingredientId) => [
        ingredientId,
        await this.purchaseRecordRepository.findByIngredientId(ingredientId),
      ] as const),
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

      if (ingredient) {
        const historicalBaseQuantities = (
          purchaseHistoryMap.get(change.ingredientId) ?? []
        )
          .filter((record) => record.id !== change.purchaseRecordId)
          .slice(0, this.quantityOutlierSampleSize)
          .map(
            (record) => record.actualQuantity * ingredient.purchaseToBaseRatio,
          );

        if (
          historicalBaseQuantities.length >= this.quantityOutlierHistoryMinCount
        ) {
          const medianBaseQuantity = this.calculateMedian(
            historicalBaseQuantities,
          );
          const currentBaseQuantity =
            change.sourceQuantity * ingredient.purchaseToBaseRatio;

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

    return this.roundCurrency(accumulator.totalAmount / accumulator.totalQuantity);
  }

  private toWeightedUnitCost(accumulator: WeightedAccumulator): number {
    if (accumulator.totalQuantity <= 0) {
      return 0;
    }

    return Number((accumulator.totalAmount / accumulator.totalQuantity).toFixed(6));
  }

  private roundCurrency(value: number): number {
    return Number(value.toFixed(2));
  }

  private roundRatio(value: number): number {
    return Number(value.toFixed(4));
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
