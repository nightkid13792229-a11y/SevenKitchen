import { NutritionAssessmentService } from '../../src/application/ai-recipe/nutrition-assessment.service';
import {
  AiRecipeResultStatus,
  EvidenceLevel,
  MissingInfoCode,
} from '../../src/domain/ai-recipe/enums';

describe('NutritionAssessmentService', () => {
  it('marks target weight and diet history as missing for obese dog context', () => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 12,
        bcsScore: 8,
        activityLevel: 'LOW',
      },
      evidence: [],
      confirmedInputs: {},
      activeRulePackages: [
        {
          code: 'WEIGHT_MANAGEMENT',
          requiredFields: ['targetWeightKg', 'dietHistory'],
        },
      ],
    });

    expect(plan.missingInfo).toContain(MissingInfoCode.TARGET_WEIGHT);
    expect(plan.missingInfo).toContain(MissingInfoCode.DIET_HISTORY);
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.LIMITED_DRAFT);
  });

  it('enables low fat package only with confirmed A level evidence', () => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 8,
        bcsScore: 5,
        activityLevel: 'NORMAL',
      },
      evidence: [
        {
          level: EvidenceLevel.A_CONFIRMED_DIAGNOSIS,
          sourceType: 'MEDICAL_REPORT',
          title: '胰腺炎报告',
          isConfirmed: true,
          confirmedData: { diagnosis: '慢性胰腺炎' },
        },
      ],
      confirmedInputs: { dietHistory: '鸡肉鲜食', targetWeightKg: 8 },
      activeRulePackages: [
        { code: 'PANCREAS_LOW_FAT', requiredFields: ['dietHistory'] },
      ],
    });

    expect(plan.enabledRulePackages).toContain('PANCREAS_LOW_FAT');
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.NEEDS_MANUAL_REVIEW);
  });
});
