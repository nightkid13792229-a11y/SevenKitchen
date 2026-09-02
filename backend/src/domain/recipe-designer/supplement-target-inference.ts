import {
  resolveSupplementTargetField,
  type SupplementTargetFieldReference,
} from '../ingredient/supplement-target-mapping';
import type { NutritionProfile } from '../ingredient/types';
import {
  readProfileFieldAmount,
  type NutritionProfileAmountRead,
} from './nutrition-profile-reader';
import type { DesignRecipeAssessmentResult } from './recipe-assessment';
import type { AssessmentEntry } from './types';

export type SupplementTargetInferenceReason =
  | 'CREATES_DEFICIENCY'
  | 'WORSENS_DEFICIENCY'
  | 'CONTRIBUTES_NUTRIENT';

export interface InferredSupplementTarget {
  fieldPath: string;
  fieldKey: string;
  label: string;
  unit: string;
  targetValuePerKg: number;
  reason: SupplementTargetInferenceReason;
}

export interface InferSupplementTargetByRemovalInput {
  itemId: string;
  itemName?: string | null;
  itemNutritionProfile: NutritionProfile | null | undefined;
  itemWeightG: number;
  totalRecipeWeightG: number;
  fullAssessment: DesignRecipeAssessmentResult;
  assessmentWithoutItem: DesignRecipeAssessmentResult;
}

interface Candidate {
  field: SupplementTargetFieldReference;
  amountRead: NutritionProfileAmountRead;
  reason: SupplementTargetInferenceReason;
}

export function inferSupplementTargetByRemoval(
  input: InferSupplementTargetByRemovalInput,
): InferredSupplementTarget | null {
  const targets = inferSupplementTargetsByRemoval(input);
  return targets.length === 1 ? targets[0] : null;
}

export function inferSupplementTargetsByRemoval(
  input: InferSupplementTargetByRemovalInput,
): InferredSupplementTarget[] {
  if (
    !Number.isFinite(input.itemWeightG) ||
    input.itemWeightG <= 0 ||
    !Number.isFinite(input.totalRecipeWeightG) ||
    input.totalRecipeWeightG <= 0
  ) {
    return [];
  }

  const candidates = input.fullAssessment.entries
    .map((entry) => {
      const field = resolveAssessmentSupplementTargetField(entry);
      if (!field) {
        return null;
      }

      const entryWithoutItem = findAssessmentEntryByFieldPath(
        input.assessmentWithoutItem,
        field.fieldPath,
      );
      if (!entryWithoutItem) {
        return null;
      }

      const reason = resolveDeficiencyAttributionReason(
        entry,
        entryWithoutItem,
      );
      if (!reason) {
        return null;
      }

      const amountRead = readProfileFieldAmount(
        input.itemNutritionProfile,
        field.fieldPath,
        input.itemWeightG,
      );
      const contributionAmount = Number(amountRead.amount);
      if (
        amountRead.missing ||
        !Number.isFinite(contributionAmount) ||
        contributionAmount <= 0
      ) {
        return null;
      }

      return { field, amountRead, reason };
    })
    .filter((candidate): candidate is Candidate => candidate !== null);

  // 缺口归因推断为空时的兜底：补剂从原料库正常添加后，即使删除它不会造成新缺口
  // （配方本身已达标，或删除后仅数据缺失），也按它对 FEDIAF 可评估微量营养素的
  // 实际贡献生成营养目标，避免发布时因"缺少营养目标"被硬性拦截。
  // 仅统计非宏量营养素（维生素/矿物质/氨基酸/脂肪酸），纯功能性补剂（如膳食纤维）
  // 不产出目标，维持原有"必须能归因到营养缺口"的校验语义。
  const effectiveCandidates =
    candidates.length > 0
      ? candidates
      : input.fullAssessment.entries
          .map((entry): Candidate | null => {
            if (entry.category === 'MACRO') {
              return null;
            }

            const field = resolveAssessmentSupplementTargetField(entry);
            if (!field) {
              return null;
            }

            const amountRead = readProfileFieldAmount(
              input.itemNutritionProfile,
              field.fieldPath,
              input.itemWeightG,
            );
            const contributionAmount = Number(amountRead.amount);
            if (
              amountRead.missing ||
              !Number.isFinite(contributionAmount) ||
              contributionAmount <= 0
            ) {
              return null;
            }

            return {
              field,
              amountRead,
              reason: 'CONTRIBUTES_NUTRIENT' as const,
            };
          })
          .filter((candidate): candidate is Candidate => candidate !== null);

  const inferredTargets = effectiveCandidates
    .map((candidate) => {
      const contributionAmount = Number(candidate.amountRead.amount);
      const targetValuePerKg = roundTargetValuePerKg(
        (contributionAmount / input.totalRecipeWeightG) * 1000,
      );
      if (!Number.isFinite(targetValuePerKg) || targetValuePerKg <= 0) {
        return null;
      }

      return {
        fieldPath: candidate.field.fieldPath,
        fieldKey: candidate.field.fieldKey,
        label: candidate.field.label,
        unit: candidate.field.unit,
        targetValuePerKg,
        reason: candidate.reason,
      };
    })
    .filter((target): target is InferredSupplementTarget => target !== null);

  return [
    ...new Map(
      inferredTargets.map((target) => [target.fieldPath, target]),
    ).values(),
  ].sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
}

function resolveAssessmentSupplementTargetField(
  entry: AssessmentEntry,
): SupplementTargetFieldReference | null {
  if (isAssessmentRatioEntry(entry) || entry.excludeFromAttention) {
    return null;
  }

  return (
    resolveSupplementTargetField(entry.nutrientKey) ??
    resolveSupplementTargetField(entry.label)
  );
}

function findAssessmentEntryByFieldPath(
  assessment: DesignRecipeAssessmentResult,
  fieldPath: string,
): AssessmentEntry | undefined {
  return assessment.entries.find((entry) => {
    const field = resolveAssessmentSupplementTargetField(entry);
    return field?.fieldPath === fieldPath;
  });
}

function resolveDeficiencyAttributionReason(
  fullEntry: AssessmentEntry,
  entryWithoutItem: AssessmentEntry,
): SupplementTargetInferenceReason | null {
  if (
    fullEntry.status !== 'DEFICIENT' &&
    fullEntry.status !== 'MISSING_DATA' &&
    entryWithoutItem.status === 'DEFICIENT'
  ) {
    return 'CREATES_DEFICIENCY';
  }

  if (
    fullEntry.status === 'DEFICIENT' &&
    entryWithoutItem.status === 'DEFICIENT' &&
    isFiniteNumber(fullEntry.currentValue) &&
    isFiniteNumber(entryWithoutItem.currentValue) &&
    entryWithoutItem.currentValue < fullEntry.currentValue
  ) {
    return 'WORSENS_DEFICIENCY';
  }

  return null;
}

function isAssessmentRatioEntry(entry: AssessmentEntry): boolean {
  return (
    entry.category === 'RATIO' ||
    entry.expressionBasis === 'RATIO' ||
    (entry as { calculation?: string }).calculation === 'RATIO'
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundTargetValuePerKg(value: number): number {
  return Math.round(value * 1000) / 1000;
}
