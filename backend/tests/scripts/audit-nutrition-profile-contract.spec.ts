import { getRecommendedAction } from '../../scripts/audit-nutrition-profile-contract';
import type { NutritionProfileContractIssue } from '../../src/domain/nutrition-governance/nutrition-profile-contract';

describe('nutrition profile contract audit script', () => {
  it('recommends adding source form and conversion notes for missing conversion evidence', () => {
    const issues: NutritionProfileContractIssue[] = [
      {
        severity: 'ERROR',
        code: 'MISSING_CONVERSION_EVIDENCE',
        fieldPath: 'vitamins.vitaminD',
        message: 'vitamins.vitaminD requires conversion evidence.',
      },
    ];

    expect(getRecommendedAction(issues)).toBe(
      '补充原始来源形式和单位换算说明后再确认',
    );
  });

  it('prioritizes conversion evidence guidance when other issue codes are present', () => {
    const issues: NutritionProfileContractIssue[] = [
      {
        severity: 'ERROR',
        code: 'MISSING_REQUIRED_FIELD',
        fieldPath: 'macros.crudeProtein',
        message: 'macros.crudeProtein is required.',
      },
      {
        severity: 'ERROR',
        code: 'MISSING_CONVERSION_EVIDENCE',
        fieldPath: 'vitamins.vitaminE',
        message: 'vitamins.vitaminE requires conversion evidence.',
      },
    ];

    expect(getRecommendedAction(issues)).toBe(
      '补充原始来源形式和单位换算说明后再确认',
    );
  });
});
