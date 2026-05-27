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

  it('does not enable weight management for normal BCS without explicit weight loss context', () => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 8,
        bcsScore: 5,
        activityLevel: 'NORMAL',
      },
      evidence: [],
      confirmedInputs: { dietHistory: '鸡肉鲜食', targetWeightKg: 8 },
      activeRulePackages: [
        {
          code: 'WEIGHT_MANAGEMENT',
          requiredFields: ['targetWeightKg', 'dietHistory'],
        },
      ],
    });

    expect(plan.enabledRulePackages).not.toContain('WEIGHT_MANAGEMENT');
    expect(plan.disabledRulePackages).toContainEqual({
      code: 'WEIGHT_MANAGEMENT',
      reason: '证据等级不足或缺少确认资料',
    });
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.REVIEWABLE);
  });

  it('does not report missing weight fields for disabled weight management package', () => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 8,
        bcsScore: 5,
        activityLevel: 'NORMAL',
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

    expect(plan.enabledRulePackages).not.toContain('WEIGHT_MANAGEMENT');
    expect(plan.missingInfo).not.toContain(MissingInfoCode.TARGET_WEIGHT);
    expect(plan.missingInfo).not.toContain(MissingInfoCode.DIET_HISTORY);
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.REVIEWABLE);
  });

  it('enables weight management when target weight is lower than current weight', () => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 8,
        bcsScore: 5,
        activityLevel: 'NORMAL',
      },
      evidence: [],
      confirmedInputs: { dietHistory: '鸡肉鲜食', targetWeightKg: 7.5 },
      activeRulePackages: [
        {
          code: 'WEIGHT_MANAGEMENT',
          requiredFields: ['targetWeightKg', 'dietHistory'],
        },
      ],
    });

    expect(plan.enabledRulePackages).toContain('WEIGHT_MANAGEMENT');
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.NEEDS_MANUAL_REVIEW);
  });

  it.each([
    [
      'B level confirmed pancreas evidence',
      {
        level: EvidenceLevel.B_TEST_INDICATED,
        sourceType: 'MEDICAL_REPORT',
        title: '胰腺炎指标',
        isConfirmed: true,
        confirmedData: { diagnosis: '慢性胰腺炎' },
      },
    ],
    [
      'A level unconfirmed pancreas evidence',
      {
        level: EvidenceLevel.A_CONFIRMED_DIAGNOSIS,
        sourceType: 'MEDICAL_REPORT',
        title: '胰腺炎报告',
        isConfirmed: false,
        confirmedData: { diagnosis: '慢性胰腺炎' },
      },
    ],
    [
      'unrelated A level diagnosis',
      {
        level: EvidenceLevel.A_CONFIRMED_DIAGNOSIS,
        sourceType: 'MEDICAL_REPORT',
        title: '肾病报告',
        isConfirmed: true,
        confirmedData: { diagnosis: '慢性肾病' },
      },
    ],
  ])('does not enable low fat package for %s', (_caseName, evidence) => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 8,
        bcsScore: 5,
        activityLevel: 'NORMAL',
      },
      evidence: [evidence],
      confirmedInputs: { dietHistory: '鸡肉鲜食', targetWeightKg: 8 },
      activeRulePackages: [
        { code: 'PANCREAS_LOW_FAT', requiredFields: ['dietHistory'] },
      ],
    });

    expect(plan.enabledRulePackages).not.toContain('PANCREAS_LOW_FAT');
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.REVIEWABLE);
  });

  it('marks blank diet history as missing', () => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 12,
        bcsScore: 8,
        activityLevel: 'LOW',
      },
      evidence: [],
      confirmedInputs: { dietHistory: '   ', targetWeightKg: 10 },
      activeRulePackages: [
        {
          code: 'WEIGHT_MANAGEMENT',
          requiredFields: ['targetWeightKg', 'dietHistory'],
        },
      ],
    });

    expect(plan.missingInfo).toContain(MissingInfoCode.DIET_HISTORY);
    expect(plan.missingInfo).not.toContain(MissingInfoCode.TARGET_WEIGHT);
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.LIMITED_DRAFT);
  });

  it('maps missing treats field to treat intake for enabled weight management', () => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 12,
        bcsScore: 8,
        activityLevel: 'LOW',
      },
      evidence: [],
      confirmedInputs: { targetWeightKg: 10, dietHistory: '鸡肉鲜食' },
      activeRulePackages: [
        {
          code: 'WEIGHT_MANAGEMENT',
          requiredFields: ['treats'],
        },
      ],
    });

    expect(plan.enabledRulePackages).toContain('WEIGHT_MANAGEMENT');
    expect(plan.missingInfo).toContain(MissingInfoCode.TREAT_INTAKE);
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.LIMITED_DRAFT);
  });

  it('maps missing medical records field to confirmed report for enabled pancreas package', () => {
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
          confirmedData: { diagnosis: 'chronic pancreatitis' },
        },
      ],
      confirmedInputs: { dietHistory: '鸡肉鲜食' },
      activeRulePackages: [
        {
          code: 'PANCREAS_LOW_FAT',
          requiredFields: ['medicalRecords'],
        },
      ],
    });

    expect(plan.enabledRulePackages).toContain('PANCREAS_LOW_FAT');
    expect(plan.missingInfo).toContain(MissingInfoCode.CONFIRMED_REPORT);
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.LIMITED_DRAFT);
  });
});
