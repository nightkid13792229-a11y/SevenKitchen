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

  it('returns reviewable status when no rule packages or hard conflicts exist', () => {
    const service = new ConstraintSynthesisService();

    const result = service.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: [],
      hardConstraints: [],
      softConstraints: [],
    });

    expect(result.resultStatus).toBe(AiRecipeResultStatus.REVIEWABLE);
    expect(result.reviewRequired).toBe(false);
  });

  it('marks non-conflicting fat bounds with a rule package as manual review', () => {
    const service = new ConstraintSynthesisService();

    const result = service.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: ['PANCREAS_LOW_FAT'],
      hardConstraints: [
        {
          key: 'fat.minPercentCalories',
          value: 10,
          source: 'PANCREAS_LOW_FAT',
        },
        {
          key: 'fat.maxPercentCalories',
          value: 18,
          source: 'PANCREAS_LOW_FAT',
        },
      ],
      softConstraints: [],
    });

    expect(result.resultStatus).toBe(AiRecipeResultStatus.NEEDS_MANUAL_REVIEW);
    expect(result.reviewRequired).toBe(true);
  });

  it('returns unable status when later aggregate fat bounds conflict', () => {
    const service = new ConstraintSynthesisService();

    const result = service.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: ['PANCREAS_LOW_FAT', 'HIGH_FAT_TEST_RULE'],
      hardConstraints: [
        { key: 'fat.minPercentCalories', value: 8, source: 'PANCREAS_LOW_FAT' },
        { key: 'fat.maxPercentCalories', value: 30, source: 'PANCREAS_LOW_FAT' },
        {
          key: 'fat.minPercentCalories',
          value: 25,
          source: 'HIGH_FAT_TEST_RULE',
        },
        {
          key: 'fat.maxPercentCalories',
          value: 18,
          source: 'HIGH_FAT_TEST_RULE',
        },
      ],
      softConstraints: [],
    });

    expect(result.resultStatus).toBe(AiRecipeResultStatus.UNABLE_TO_COMPLETE);
    expect(result.reviewRequired).toBe(true);
    expect(result.hardConstraints.conflicts).toContain('fat bounds conflict');
  });

  it('returns unable status when a fat bound is malformed', () => {
    const service = new ConstraintSynthesisService();

    const result = service.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: ['PANCREAS_LOW_FAT'],
      hardConstraints: [
        {
          key: 'fat.maxPercentCalories',
          value: '18',
          source: 'PANCREAS_LOW_FAT',
        },
      ],
      softConstraints: [],
    });

    expect(result.resultStatus).toBe(AiRecipeResultStatus.UNABLE_TO_COMPLETE);
    expect(result.reviewRequired).toBe(true);
    expect(result.hardConstraints.conflicts).toContain('invalid fat bound value');
  });
});
