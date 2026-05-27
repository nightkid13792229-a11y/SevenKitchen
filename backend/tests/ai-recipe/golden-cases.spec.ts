import { ConstraintSynthesisService } from '../../src/application/ai-recipe/constraint-synthesis.service';
import { EvidenceService } from '../../src/application/ai-recipe/evidence.service';
import { NutritionAssessmentService } from '../../src/application/ai-recipe/nutrition-assessment.service';
import {
  AiRecipeResultStatus,
  EvidenceLevel,
} from '../../src/domain/ai-recipe/enums';

describe('AI recipe golden cases', () => {
  it('does not enable pancreas package from owner text alone', () => {
    const evidenceService = new EvidenceService();
    const assessment = new NutritionAssessmentService();
    const evidenceLevel = evidenceService.gradeEvidence({
      sourceType: 'OWNER_TEXT',
      isConfirmed: false,
      confirmedData: { diagnosis: '医生说过胰腺炎' },
      attachmentUrls: [],
    });
    const plan = assessment.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 8,
        bcsScore: 5,
        activityLevel: 'NORMAL',
      },
      evidence: [
        {
          level: evidenceLevel,
          sourceType: 'OWNER_TEXT',
          title: '医生说过胰腺炎',
          isConfirmed: false,
          confirmedData: { diagnosis: '医生说过胰腺炎' },
        },
      ],
      confirmedInputs: { dietHistory: '鸡肉鲜食' },
      activeRulePackages: [
        { code: 'PANCREAS_LOW_FAT', requiredFields: ['dietHistory'] },
      ],
    });

    expect(evidenceLevel).toBe(EvidenceLevel.C_OWNER_REPORTED);
    expect(plan.enabledRulePackages).not.toContain('PANCREAS_LOW_FAT');
    expect(plan.disabledRulePackages).toContainEqual(
      expect.objectContaining({
        code: 'PANCREAS_LOW_FAT',
        reason: expect.stringContaining('证据等级不足'),
      }),
    );
  });

  it('never lets stool photo evidence enable a disease package', () => {
    const evidence = new EvidenceService();
    const level = evidence.gradeEvidence({
      sourceType: 'STOOL_PHOTO',
      isConfirmed: true,
      confirmedData: {
        diagnosis: '慢性胰腺炎',
        observation: '软便',
        testIndicators: ['cPLI'],
        reportDate: '2026-05-01',
        clinicName: 'Test Clinic',
      },
      attachmentUrls: ['https://cdn.test/stool.jpg'],
    });
    const assessment = new NutritionAssessmentService();
    const plan = assessment.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 8,
        bcsScore: 5,
        activityLevel: 'NORMAL',
      },
      evidence: [
        {
          level,
          sourceType: 'STOOL_PHOTO',
          title: '粪便照片',
          isConfirmed: true,
          confirmedData: {
            diagnosis: '慢性胰腺炎',
            observation: '软便',
          },
        },
      ],
      confirmedInputs: { dietHistory: '鸡肉鲜食' },
      activeRulePackages: [
        { code: 'PANCREAS_LOW_FAT', requiredFields: ['dietHistory'] },
      ],
    });

    expect(level).toBe(EvidenceLevel.D_ATTACHMENT_OBSERVATION);
    expect(plan.enabledRulePackages).not.toContain('PANCREAS_LOW_FAT');
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.REVIEWABLE);
  });

  it('blocks impossible hard constraints after assessment enables multiple packages', () => {
    const assessment = new NutritionAssessmentService();
    const plan = assessment.buildPlan({
      dog: {
        id: 'dog-1',
        currentWeightKg: 12,
        bcsScore: 8,
        activityLevel: 'LOW',
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
      confirmedInputs: {
        dietHistory: '鸡肉鲜食',
        targetWeightKg: 10,
      },
      activeRulePackages: [
        { code: 'PANCREAS_LOW_FAT', requiredFields: ['dietHistory'] },
        {
          code: 'WEIGHT_MANAGEMENT',
          requiredFields: ['targetWeightKg', 'dietHistory'],
        },
      ],
    });
    const constraints = new ConstraintSynthesisService();
    const result = constraints.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: plan.enabledRulePackages,
      hardConstraints: [
        { key: 'fat.maxPercentCalories', value: 18, source: 'PANCREAS_LOW_FAT' },
        {
          key: 'fat.minPercentCalories',
          value: 20,
          source: 'WEIGHT_MANAGEMENT',
        },
      ],
      softConstraints: [],
    });

    expect(plan.enabledRulePackages).toEqual(
      expect.arrayContaining(['PANCREAS_LOW_FAT', 'WEIGHT_MANAGEMENT']),
    );
    expect(plan.enabledRulePackages).toHaveLength(2);
    expect(result.resultStatus).toBe(AiRecipeResultStatus.UNABLE_TO_COMPLETE);
    expect(result.hardConstraints.conflicts).toContain('fat bounds conflict');
  });
});
