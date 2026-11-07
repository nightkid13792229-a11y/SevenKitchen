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
});
