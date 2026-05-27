import { ConstraintSynthesisService } from '../../src/application/ai-recipe/constraint-synthesis.service';
import { AiRecipeResultStatus } from '../../src/domain/ai-recipe/enums';

describe('ConstraintSynthesisService', () => {
  it('returns unable status when hard constraints conflict', () => {
    const service = new ConstraintSynthesisService();

    const result = service.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: ['PANCREAS_LOW_FAT', 'HIGH_FAT_TEST_RULE'],
      hardConstraints: [
        { key: 'fat.maxPercentCalories', value: 18, source: 'PANCREAS_LOW_FAT' },
        { key: 'fat.minPercentCalories', value: 25, source: 'HIGH_FAT_TEST_RULE' },
      ],
      softConstraints: [],
    });

    expect(result.resultStatus).toBe(AiRecipeResultStatus.UNABLE_TO_COMPLETE);
    expect(result.reviewRequired).toBe(true);
  });

  it('marks functional constraints as manual review when no hard conflict exists', () => {
    const service = new ConstraintSynthesisService();

    const result = service.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: ['WEIGHT_MANAGEMENT'],
      hardConstraints: [
        {
          key: 'energy.targetMode',
          value: 'WEIGHT_LOSS',
          source: 'WEIGHT_MANAGEMENT',
        },
      ],
      softConstraints: [],
    });

    expect(result.resultStatus).toBe(AiRecipeResultStatus.NEEDS_MANUAL_REVIEW);
    expect(result.reviewRequired).toBe(true);
  });
});
