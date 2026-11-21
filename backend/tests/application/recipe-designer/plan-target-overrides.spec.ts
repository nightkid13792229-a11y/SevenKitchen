import { buildPlanTargetOverrides } from '../../../src/application/recipe-designer/agent/plan-target-overrides';
import type { AgentNutritionPlan } from '../../../src/application/recipe-designer/agent/propose-plan';
import type { FediafAssessmentTarget } from '../../../src/domain/recipe-designer/types';

function target(
  nutrientKey: string,
  minValue: number | null,
  maxValue: number | null,
  expressionBasis: 'PER_100G_DRY_MATTER' | 'PER_1000_KCAL_ME',
  unit = 'g',
): FediafAssessmentTarget {
  return {
    nutrientKey,
    label: nutrientKey,
    category: 'MACRO',
    expressionBasis,
    unit,
    minValue,
    maxValue,
    fieldPaths: [],
  };
}

function plan(
  constraints: AgentNutritionPlan['constraints'],
): AgentNutritionPlan {
  return { summary: 'x', constraints, nonNutrient: [] };
}

describe('plan target overrides', () => {
  it('keeps the baseline minimum when the plan only sets a maximum', () => {
    const result = buildPlanTargetOverrides(
      plan([
        {
          key: 'fat',
          label: '脂肪',
          min: null,
          max: 10,
          unit: 'PERCENT_DM',
          basis: '',
          source: 'plan',
          hard: true,
        },
      ]),
      [target('fat', 5.5, 25, 'PER_100G_DRY_MATTER')],
    );

    expect(result.overrides[0]).toMatchObject({
      nutrientKey: 'fat',
      basis: 'DM',
      minValue: 5.5,
      maxValue: 10,
    });
  });

  it('converts per-MJ to per-1000-kcal', () => {
    const result = buildPlanTargetOverrides(
      plan([
        {
          key: 'sodium',
          label: '钠',
          min: null,
          max: 1,
          unit: 'PER_MJ',
          basis: '',
          source: 'plan',
          hard: true,
        },
      ]),
      [target('sodium', 0.25, 3.75, 'PER_1000_KCAL_ME')],
    );

    expect(result.overrides[0]?.maxValue).toBeCloseTo(4.1839, 3);
  });

  it('reports unsupported units instead of dropping them silently', () => {
    const result = buildPlanTargetOverrides(
      plan([
        {
          key: 'fat',
          label: '脂肪',
          min: null,
          max: 500,
          unit: 'MG_PER_DAY',
          basis: '',
          source: 'plan',
          hard: true,
        },
      ]),
      [target('fat', 5.5, 25, 'PER_100G_DRY_MATTER')],
    );

    expect(result.overrides).toHaveLength(0);
    expect(result.unsupported[0]?.key).toBe('fat');
  });

  it('keeps a mg target in mg and does not convert the baseline side', () => {
    const result = buildPlanTargetOverrides(
      plan([
        {
          key: 'zinc',
          label: '锌',
          min: 15,
          max: null,
          unit: 'PER_1000_KCAL',
          nutrientUnit: 'mg',
          basis: '',
          source: 'plan',
          hard: true,
        },
      ]),
      [target('zinc', 10, 40, 'PER_1000_KCAL_ME', 'mg')],
    );

    expect(result.overrides[0]).toMatchObject({
      nutrientKey: 'zinc',
      unit: 'mg',
      minValue: 15,
      maxValue: 40,
    });
  });

  it('converts a g plan value into a mg target', () => {
    const result = buildPlanTargetOverrides(
      plan([
        {
          key: 'zinc',
          label: '锌',
          min: 0.015,
          max: null,
          unit: 'PER_1000_KCAL',
          nutrientUnit: 'g',
          basis: '',
          source: 'plan',
          hard: true,
        },
      ]),
      [target('zinc', 10, 40, 'PER_1000_KCAL_ME', 'mg')],
    );

    expect(result.overrides[0]?.minValue).toBeCloseTo(15, 8);
    expect(result.overrides[0]?.unit).toBe('mg');
  });

  it('reports a non-convertible unit instead of silently using the raw value', () => {
    const result = buildPlanTargetOverrides(
      plan([
        {
          key: 'vitaminD',
          label: '维生素 D',
          min: 10,
          max: null,
          unit: 'PER_1000_KCAL',
          nutrientUnit: 'mg',
          basis: '',
          source: 'plan',
          hard: true,
        },
      ]),
      [target('vitaminD', 500, 800, 'PER_1000_KCAL_ME', 'IU')],
    );

    expect(result.overrides).toHaveLength(0);
    expect(result.unsupported[0]?.reason).toContain('不能换算');
  });
});
