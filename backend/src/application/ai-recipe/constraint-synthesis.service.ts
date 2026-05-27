import { Injectable } from '@nestjs/common';
import { AiRecipeResultStatus } from '../../domain/ai-recipe/enums';
import type { RecipeConstraintSet } from '../../domain/ai-recipe/types';

type ConstraintInput = {
  key: string;
  value: unknown;
  source: string;
};

type SynthesisInput = {
  dogId: string;
  assessmentId: string;
  rulePackages: string[];
  hardConstraints: ConstraintInput[];
  softConstraints: ConstraintInput[];
};

@Injectable()
export class ConstraintSynthesisService {
  synthesize(input: SynthesisInput): RecipeConstraintSet {
    const fatConflict = this.getFatBoundsConflict(input.hardConstraints);

    if (fatConflict) {
      return {
        dogId: input.dogId,
        assessmentId: input.assessmentId,
        rulePackages: input.rulePackages,
        hardConstraints: {
          items: input.hardConstraints,
          conflicts: [fatConflict],
        },
        softConstraints: { items: input.softConstraints },
        reviewRequired: true,
        resultStatus: AiRecipeResultStatus.UNABLE_TO_COMPLETE,
      };
    }

    return {
      dogId: input.dogId,
      assessmentId: input.assessmentId,
      rulePackages: input.rulePackages,
      hardConstraints: { items: input.hardConstraints },
      softConstraints: { items: input.softConstraints },
      reviewRequired: input.rulePackages.length > 0,
      resultStatus:
        input.rulePackages.length > 0
          ? AiRecipeResultStatus.NEEDS_MANUAL_REVIEW
          : AiRecipeResultStatus.REVIEWABLE,
    };
  }

  private getFatBoundsConflict(constraints: ConstraintInput[]): string | null {
    const mins: number[] = [];
    const maxes: number[] = [];

    for (const constraint of constraints) {
      if (
        constraint.key !== 'fat.minPercentCalories' &&
        constraint.key !== 'fat.maxPercentCalories'
      ) {
        continue;
      }

      if (
        typeof constraint.value !== 'number' ||
        !Number.isFinite(constraint.value)
      ) {
        return 'invalid fat bound value';
      }

      if (constraint.key === 'fat.minPercentCalories') {
        mins.push(constraint.value);
      } else {
        maxes.push(constraint.value);
      }
    }

    if (mins.length === 0 || maxes.length === 0) {
      return null;
    }

    const highestMin = Math.max(...mins);
    const lowestMax = Math.min(...maxes);

    return highestMin > lowestMax ? 'fat bounds conflict' : null;
  }
}
