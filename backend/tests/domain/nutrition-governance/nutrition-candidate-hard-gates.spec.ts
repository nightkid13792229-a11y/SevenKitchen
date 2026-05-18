import {
  evaluateNutritionCandidateHardGates,
  resolveCandidateReviewGroup,
} from 'src/domain/nutrition-governance/nutrition-candidate-hard-gates';

const nutritionProfile = {
  macros: {
    energyKcal: 120,
    moisture: 70,
    crudeProtein: 20,
    crudeFat: 5,
  },
  minerals: {
    calcium: 12,
    phosphorus: 180,
  },
  meta: {
    rawBasisType: 'PER_100_G',
    sourceCode: 'USDA_FDC',
  },
};

const baseAgentReview = {
  recommendedAction: 'CONFIRM_PRIMARY',
  confidence: 'HIGH',
  identityVerdict: 'MATCH',
  stateVerdict: 'MATCH',
  ediblePortionVerdict: 'MATCH',
  processingVerdict: 'ACCEPTABLE',
  riskFlags: [],
  rationale: 'Matches the standard ingredient.',
};

const baseCandidate = {
  id: 'candidate-1',
  normalizedNutrition: nutritionProfile,
  sourceRecord: {
    id: 'source-1',
    sourceKey: 'USDA:123',
    foodName: 'Chicken breast, raw',
  },
  agentReview: baseAgentReview,
};

describe('nutrition candidate hard gates', () => {
  it('allows an Agent-approved candidate with source and critical nutrients', () => {
    const result = evaluateNutritionCandidateHardGates(baseCandidate);

    expect(result.canBatchConfirm).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(resolveCandidateReviewGroup(result, baseAgentReview)).toBe(
      'AUTO_REVIEWABLE',
    );
  });

  it('blocks batch confirmation when Agent recommends finding another source', () => {
    const agentReview = {
      ...baseAgentReview,
      recommendedAction: 'FIND_ALTERNATIVE_SOURCE',
    };
    const result = evaluateNutritionCandidateHardGates({
      ...baseCandidate,
      agentReview,
    });

    expect(result.canBatchConfirm).toBe(false);
    expect(result.blockingReasons).toContain('AGENT_RECOMMENDS_ALTERNATIVE');
    expect(resolveCandidateReviewGroup(result, agentReview)).toBe(
      'NOT_RECOMMENDED',
    );
  });

  it('blocks Agent recommendations that require human review from batch confirmation', () => {
    const agentReview = {
      ...baseAgentReview,
      recommendedAction: 'NEEDS_HUMAN_REVIEW',
      confidence: 'MEDIUM',
    };
    const result = evaluateNutritionCandidateHardGates({
      ...baseCandidate,
      agentReview,
    });

    expect(result.canBatchConfirm).toBe(false);
    expect(result.blockingReasons).toContain('AGENT_NEEDS_HUMAN_REVIEW');
    expect(resolveCandidateReviewGroup(result, agentReview)).toBe(
      'NEEDS_REVIEW',
    );
  });

  it('blocks missing critical nutrition data for food confirmation', () => {
    const result = evaluateNutritionCandidateHardGates({
      ...baseCandidate,
      normalizedNutrition: {
        macros: { crudeProtein: 20 },
        meta: { rawBasisType: 'PER_100_G' },
      },
    });

    expect(result.canBatchConfirm).toBe(false);
    expect(result.blockingReasons).toContain('MISSING_CRITICAL_NUTRIENTS');
  });
});
