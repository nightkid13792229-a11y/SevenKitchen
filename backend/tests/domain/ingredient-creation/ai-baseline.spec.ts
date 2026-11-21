import {
  mergeIngredientBaseline,
  mergeProfileBaseline,
} from '../../../src/domain/ingredient-creation/ai-baseline';

describe('aiBaseline', () => {
  const at1 = '2026-11-21T10:00:00.000Z';
  const at2 = '2026-11-21T10:01:00.000Z';

  it('按来源记录合并 AI 写入的营养值；后写覆盖前写', () => {
    const first = mergeProfileBaseline(
      null,
      'src-1',
      [{ fieldPath: 'macros.crudeProtein', finalValue: 25, unit: 'g' }],
      at1,
    );
    const second = mergeProfileBaseline(
      first,
      'src-1',
      [{ fieldPath: 'macros.crudeProtein', finalValue: 26, unit: 'g' }],
      at2,
    );
    expect(second.profiles['src-1']['macros.crudeProtein']).toEqual({
      value: 26,
      unit: 'g',
      at: at2,
    });
    expect(first.profiles['src-1']['macros.crudeProtein'].value).toBe(25);
  });

  it('原料卡字段按字段名合并，已有字段不丢', () => {
    const first = mergeIngredientBaseline(null, { labelNames: ['鸡肝'] }, at1);
    const second = mergeIngredientBaseline(first, { cfctClass: '禽肉类' }, at2);
    expect(second.ingredient.labelNames.value).toEqual(['鸡肝']);
    expect(second.ingredient.cfctClass.value).toBe('禽肉类');
  });
});
