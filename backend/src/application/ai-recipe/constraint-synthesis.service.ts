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
    const hasFatConflict = this.hasFatBoundsConflict(input.hardConstraints);

    if (hasFatConflict) {
      return {
        dogId: input.dogId,
        assessmentId: input.assessmentId,
        rulePackages: input.rulePackages,
        hardConstraints: {
          items: input.hardConstraints,
          conflicts: ['fat bounds conflict'],
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

  private hasFatBoundsConflict(constraints: ConstraintInput[]): boolean {
    const max = constraints.find(
      (item) => item.key === 'fat.maxPercentCalories',
    );
    const min = constraints.find(
      (item) => item.key === 'fat.minPercentCalories',
    );

    if (!max || !min) {
      return false;
    }

    return Number(min.value) > Number(max.value);
  }
}
