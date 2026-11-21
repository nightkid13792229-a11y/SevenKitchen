import {
  canConvertNutrientUnit,
  convertNutrientValue,
  normalizeNutrientUnit,
} from '../../../src/domain/recipe-designer/unit-conversion';

describe('营养素单位换算', () => {
  it('同单位原样返回', () => {
    expect(convertNutrientValue(15, 'mg', 'mg')).toBe(15);
    expect(convertNutrientValue(1.2, 'IU', 'IU')).toBe(1.2);
  });

  it('g / mg / ug 质量单位互转', () => {
    expect(convertNutrientValue(0.015, 'g', 'mg')).toBeCloseTo(15, 8);
    expect(convertNutrientValue(15, 'mg', 'g')).toBeCloseTo(0.015, 8);
    expect(convertNutrientValue(1, 'μg', 'mg')).toBeCloseTo(0.001, 8);
    expect(convertNutrientValue(1000, 'ug', 'mg')).toBeCloseTo(1, 8);
  });

  it('IU 与质量单位不能互换', () => {
    expect(canConvertNutrientUnit('IU', 'mg')).toBe(false);
    expect(convertNutrientValue(1, 'IU', 'mg')).toBeNull();
    expect(convertNutrientValue(1, 'mg', 'IU')).toBeNull();
  });

  it('空单位不猜', () => {
    expect(canConvertNutrientUnit('', 'mg')).toBe(false);
    expect(convertNutrientValue(1, '', 'mg')).toBeNull();
  });

  it('单位写法归一', () => {
    expect(normalizeNutrientUnit(' μg ')).toBe('ug');
    expect(normalizeNutrientUnit('MCG')).toBe('ug');
    expect(normalizeNutrientUnit('Mg')).toBe('mg');
  });
});
