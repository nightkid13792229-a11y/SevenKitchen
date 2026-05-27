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
        this.canEnableRulePackage(rulePackage.code, input),
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

  private canEnableRulePackage(code: string, input: BuildPlanInput): boolean {
    if (code === 'PANCREAS_LOW_FAT') {
      return input.evidence.some(
        (item) =>
          item.level === EvidenceLevel.A_CONFIRMED_DIAGNOSIS &&
          item.isConfirmed &&
          this.hasPancreasDiagnosis(item),
      );
    }

    if (code === 'WEIGHT_MANAGEMENT') {
      return this.hasWeightManagementContext(input);
    }

    return false;
  }

  private hasPancreasDiagnosis(evidence: EvidenceSummary): boolean {
    const diagnosis = evidence.confirmedData.diagnosis;

    if (typeof diagnosis !== 'string') {
      return false;
    }

    const normalizedDiagnosis = diagnosis.toLowerCase();
    return (
      diagnosis.includes('胰腺') ||
      normalizedDiagnosis.includes('pancreatitis') ||
      normalizedDiagnosis.includes('pancreas') ||
      normalizedDiagnosis.includes('pancreatic')
    );
  }

  private hasWeightManagementContext(input: BuildPlanInput): boolean {
    const targetWeightKg = input.confirmedInputs.targetWeightKg;

    return (
      input.dog.bcsScore >= 7 ||
      Boolean(input.confirmedInputs.weightManagementGoal) ||
      (typeof targetWeightKg === 'number' &&
        targetWeightKg < input.dog.currentWeightKg)
    );
  }

  private resolveMissingInfo(input: BuildPlanInput): MissingInfoCode[] {
    const missing = new Set<MissingInfoCode>();

    for (const rulePackage of input.activeRulePackages) {
      if (
        rulePackage.requiredFields.includes('targetWeightKg') &&
        this.isMissingValue(input.confirmedInputs.targetWeightKg)
      ) {
        missing.add(MissingInfoCode.TARGET_WEIGHT);
      }
      if (
        rulePackage.requiredFields.includes('dietHistory') &&
        this.isMissingValue(input.confirmedInputs.dietHistory)
      ) {
        missing.add(MissingInfoCode.DIET_HISTORY);
      }
    }

    return Array.from(missing);
  }

  private isMissingValue(value: unknown): boolean {
    return (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0)
    );
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
