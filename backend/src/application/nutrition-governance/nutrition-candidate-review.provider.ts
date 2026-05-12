import type { NutritionCandidateAgentReview } from '../../domain/nutrition-governance/agent-review.types';

export const NUTRITION_CANDIDATE_REVIEW_PROVIDER = Symbol(
  'NUTRITION_CANDIDATE_REVIEW_PROVIDER',
);

export interface NutritionCandidateReviewInput {
  ingredient: { id: string; name: string; type: string };
  sourceRecord: {
    id: string;
    sourceType?: string;
    sourceKey?: string | null;
    foodName?: string | null;
    foodNameEn?: string | null;
    category?: string | null;
    dataType?: string | null;
  };
  normalizedNutrition: unknown;
}

export interface NutritionCandidateReviewProvider {
  reviewFoodCandidate(
    input: NutritionCandidateReviewInput,
  ): Promise<NutritionCandidateAgentReview>;
}

export class DisabledNutritionCandidateReviewProvider
  implements NutritionCandidateReviewProvider
{
  async reviewFoodCandidate(): Promise<NutritionCandidateAgentReview> {
    return {
      provider: 'disabled',
      model: 'disabled',
      promptVersion: 'nutrition-candidate-review-v1',
      identityVerdict: 'UNKNOWN',
      stateVerdict: 'UNKNOWN',
      ediblePortionVerdict: 'UNKNOWN',
      processingVerdict: 'UNKNOWN',
      recommendedAction: 'NEEDS_HUMAN_REVIEW',
      preparationState: null,
      preparationStateLabel: null,
      ediblePortionLabel: null,
      processingLabel: null,
      riskFlags: ['AGENT_REVIEW_PROVIDER_DISABLED'],
      rationale: 'Agent review provider is not configured; manual review is required.',
      confidence: 'MEDIUM',
    };
  }
}
