import { BadRequestException } from '@nestjs/common';

import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';

function service() {
  return Object.create(RecipeDesignerService.prototype) as any;
}

const target = {
  nutrientKey: 'phosphorus',
  label: '磷',
  category: 'MINERAL',
  expressionBasis: 'PER_1000_KCAL_ME',
  unit: 'g',
  minValue: 1,
  maxValue: 4,
  fieldPaths: ['minerals.phosphorus'],
};
const sameTargetPerMj = {
  ...target,
  expressionBasis: 'PER_MJ_ME',
  minValue: 0.24,
  maxValue: 0.96,
};
const sameTargetDm = {
  ...target,
  expressionBasis: 'PER_100G_DRY_MATTER',
  minValue: 0.3,
  maxValue: 1.2,
};

describe('RecipeDesignerService · 目标覆盖', () => {
  it('DM 覆盖会转成每 100g 干物质', () => {
    const next = service().applyAssessmentTargetOverrides(
      [target, sameTargetPerMj, sameTargetDm],
      [
      {
        nutrientKey: 'phosphorus',
        basis: 'DM',
        minValue: 0.2,
        maxValue: 0.5,
        citationId: 'K1',
      },
    ]);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      expressionBasis: 'PER_100G_DRY_MATTER',
      unit: 'g',
      minValue: 0.2,
      maxValue: 0.5,
    });
  });

  it('未知营养素直接报错', () => {
    expect(() =>
      service().applyAssessmentTargetOverrides([target], [
        {
          nutrientKey: 'unknown',
          basis: 'DM',
          minValue: 1,
          maxValue: 2,
          citationId: 'K1',
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it('下限大于上限直接报错', () => {
    expect(() =>
      service().applyAssessmentTargetOverrides([target], [
        {
          nutrientKey: 'phosphorus',
          basis: 'DM',
          minValue: 2,
          maxValue: 1,
          citationId: 'K1',
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it('mg 目标保持 mg，不强制改成 g', () => {
    const zincTarget = {
      ...target,
      nutrientKey: 'zinc',
      label: '锌',
      category: 'TRACE_ELEMENT',
      unit: 'mg',
      minValue: 10,
      maxValue: 40,
      fieldPaths: ['minerals.zinc'],
    };
    const next = service().applyAssessmentTargetOverrides([zincTarget], [
      {
        nutrientKey: 'zinc',
        basis: 'PER_1000_KCAL',
        minValue: 15,
        maxValue: 40,
        unit: 'mg',
        citationId: 'K1',
      },
    ]);

    expect(next[0]).toMatchObject({
      unit: 'mg',
      minValue: 15,
      maxValue: 40,
    });
  });

  it('g 约束换算成 mg 目标', () => {
    const zincTarget = {
      ...target,
      nutrientKey: 'zinc',
      label: '锌',
      category: 'TRACE_ELEMENT',
      unit: 'mg',
      minValue: 10,
      maxValue: 40,
      fieldPaths: ['minerals.zinc'],
    };
    const next = service().applyAssessmentTargetOverrides([zincTarget], [
      {
        nutrientKey: 'zinc',
        basis: 'PER_1000_KCAL',
        minValue: 0.015,
        maxValue: 0.04,
        unit: 'g',
        citationId: 'K1',
      },
    ]);

    expect(next[0]?.minValue).toBeCloseTo(15, 8);
    expect(next[0]?.unit).toBe('mg');
    expect(next[0]?.maxValue).toBe(40);
  });

  it('没有写单位时按目标单位解释，保持向后兼容', () => {
    const zincTarget = {
      ...target,
      nutrientKey: 'zinc',
      label: '锌',
      category: 'TRACE_ELEMENT',
      unit: 'mg',
      minValue: 10,
      maxValue: 40,
      fieldPaths: ['minerals.zinc'],
    };
    const next = service().applyAssessmentTargetOverrides([zincTarget], [
      {
        nutrientKey: 'zinc',
        basis: 'PER_1000_KCAL',
        minValue: 15,
        maxValue: 40,
        citationId: 'K1',
      },
    ]);

    expect(next[0]?.minValue).toBe(15);
    expect(next[0]?.unit).toBe('mg');
  });

  it('IU 与 mg 不能互换时给出明确错误', () => {
    const vitaminDTarget = {
      ...target,
      nutrientKey: 'vitaminD',
      label: '维生素 D',
      category: 'VITAMIN',
      unit: 'IU',
      minValue: 500,
      maxValue: 800,
      fieldPaths: ['vitamins.vitaminD'],
    };

    expect(() =>
      service().applyAssessmentTargetOverrides([vitaminDTarget], [
        {
          nutrientKey: 'vitaminD',
          basis: 'PER_1000_KCAL',
          minValue: 10,
          maxValue: null,
          unit: 'mg',
          citationId: 'K1',
        },
      ]),
    ).toThrow(BadRequestException);
  });
});
