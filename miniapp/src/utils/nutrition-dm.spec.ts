import { describe, expect, it } from 'vitest';
import { toDryMatterMacros } from './nutrition-dm';

describe('toDryMatterMacros', () => {
  it('按水分折算成干物质占比', () => {
    const macros = toDryMatterMacros({
      proteinPercent: 20,
      fatPercent: 10,
      ashPercent: 5,
      moisturePercent: 60,
      crudeFiberPercent: 2,
      carbohydratePercent: 3,
    });

    expect(macros.protein).toBe(50);
    expect(macros.fat).toBe(25);
    expect(macros.ash).toBe(12.5);
    expect(macros.fiber).toBe(5);
    expect(macros.carbohydrate).toBe(7.5);
  });

  it('保留一位小数', () => {
    const macros = toDryMatterMacros({
      proteinPercent: 11.1,
      moisturePercent: 70,
    });
    expect(macros.protein).toBe(37);
  });

  it('水分缺失/为 0 时全部返回 null', () => {
    expect(toDryMatterMacros(null).protein).toBeNull();
    expect(
      toDryMatterMacros({ proteinPercent: 20, moisturePercent: null }).protein,
    ).toBeNull();
    expect(
      toDryMatterMacros({ proteinPercent: 20, moisturePercent: 0 }).protein,
    ).toBeNull();
  });

  it('单项缺失只影响该项', () => {
    const macros = toDryMatterMacros({
      proteinPercent: 20,
      moisturePercent: 50,
      fatPercent: null,
    });
    expect(macros.protein).toBe(40);
    expect(macros.fat).toBeNull();
  });
});
