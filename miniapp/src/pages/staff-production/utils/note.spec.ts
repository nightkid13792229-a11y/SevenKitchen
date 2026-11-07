import { describe, expect, it } from 'vitest';
import { hasAllergyText } from './note';

describe('顾客备注 · 过敏提醒识别', () => {
  it('明确写了过敏就提醒', () => {
    expect(hasAllergyText('对鸡肉过敏，请换鸭肉')).toBe(true);
    expect(hasAllergyText('过敏：牛肉')).toBe(true);
  });

  it('否定说法不误报', () => {
    expect(hasAllergyText('不过敏')).toBe(false);
    expect(hasAllergyText('无过敏史')).toBe(false);
    expect(hasAllergyText('过敏已排除')).toBe(false);
    expect(hasAllergyText('没有过敏')).toBe(false);
  });

  it('只有分装要求时不算过敏', () => {
    expect(hasAllergyText('鸡胸切小块，分装 100g')).toBe(false);
    expect(hasAllergyText('')).toBe(false);
    expect(hasAllergyText(null)).toBe(false);
  });
});
