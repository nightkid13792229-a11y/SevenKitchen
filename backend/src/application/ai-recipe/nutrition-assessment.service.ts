import { Injectable } from '@nestjs/common';
import {
  AiRecipeResultStatus,
  EvidenceLevel,
  MissingInfoCode,
} from '../../domain/ai-recipe/enums';
import type {
  EvidenceSummary,
  NutritionManagementPlan,
} from '../../domain/ai-recipe/types';

type DogContext = {
  id: string;
  currentWeightKg: number;
  bcsScore: number;
  activityLevel: string;
};

type RulePackageInput = {
  code: string;
  requiredFields: string[];
};

type BuildPlanInput = {
  dog: DogContext;
  evidence: EvidenceSummary[];
  confirmedInputs: Record<string, unknown>;
  activeRulePackages: RulePackageInput[];
};

@Injectable()
export class NutritionAssessmentService {
  buildPlan(input: BuildPlanInput): NutritionManagementPlan {
    const enabledRulePackages = input.activeRulePackages
      .filter((rulePackage) =>
        this.canEnableRulePackage(rulePackage.code, input.evidence),
      )
      .map((rulePackage) => rulePackage.code);

    const missingInfo = this.resolveMissingInfo(input);
    const resultStatus = this.resolveResultStatus(
      enabledRulePackages,
      missingInfo,
    );

    return {
      inputSummary: {
        dogId: input.dog.id,
        currentWeightKg: input.dog.currentWeightKg,
        bcsScore: input.dog.bcsScore,
        activityLevel: input.dog.activityLevel,
      },
      evidence: input.evidence,
      missingInfo,
      enabledRulePackages,
      disabledRulePackages: input.activeRulePackages
        .filter(
          (rulePackage) => !enabledRulePackages.includes(rulePackage.code),
        )
        .map((rulePackage) => ({
          code: rulePackage.code,
          reason: '证据等级不足或缺少确认资料',
        })),
      nutritionTargets: {},
      ingredientPolicy: {},
      conflictReport: [],
      feedingPrinciples: [],
      monitoringPlan: [],
      citations: [],
      resultStatus,
    };
  }

  private canEnableRulePackage(
    code: string,
    evidence: EvidenceSummary[],
  ): boolean {
    if (code === 'PANCREAS_LOW_FAT') {
      return evidence.some(
        (item) =>
          item.level === EvidenceLevel.A_CONFIRMED_DIAGNOSIS &&
          item.isConfirmed,
      );
    }

    if (code === 'WEIGHT_MANAGEMENT') {
      return true;
    }

    return false;
  }

  private resolveMissingInfo(input: BuildPlanInput): MissingInfoCode[] {
    const missing = new Set<MissingInfoCode>();

    for (const rulePackage of input.activeRulePackages) {
      if (
        rulePackage.requiredFields.includes('targetWeightKg') &&
        input.confirmedInputs.targetWeightKg === undefined
      ) {
        missing.add(MissingInfoCode.TARGET_WEIGHT);
      }
      if (
        rulePackage.requiredFields.includes('dietHistory') &&
        input.confirmedInputs.dietHistory === undefined
      ) {
        missing.add(MissingInfoCode.DIET_HISTORY);
      }
    }

    return Array.from(missing);
  }

  private resolveResultStatus(
    enabledRulePackages: string[],
    missingInfo: MissingInfoCode[],
  ): AiRecipeResultStatus {
    if (missingInfo.length > 0) {
      return AiRecipeResultStatus.LIMITED_DRAFT;
    }

    if (enabledRulePackages.length > 0) {
      return AiRecipeResultStatus.NEEDS_MANUAL_REVIEW;
    }

    return AiRecipeResultStatus.REVIEWABLE;
  }
}
