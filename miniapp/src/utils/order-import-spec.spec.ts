import { describe, expect, it } from 'vitest';
import { isSpecMismatch, specWarningText, unitWarningText } from './order-import-spec';

describe('isSpecMismatch', () => {
  it('300g/份 的商品挂 500g/份 的订单行 → 规格不符', () => {
    expect(isSpecMismatch('500g/份', '300g/份')).toBe(true);
  });

  it('写法不同但都是 300g → 不算不符', () => {
    expect(isSpecMismatch('约300g', '300g/份')).toBe(false);
    expect(isSpecMismatch('0.3kg', '300g')).toBe(false);
  });

  it('只写件数的规格：30 枚 vs 6 枚 → 规格不符', () => {
    expect(isSpecMismatch('30枚/盒', '6枚/盒')).toBe(true);
  });

  it('截图只写包装件数（2 袋）而商品按克标规格 → 不误判', () => {
    expect(isSpecMismatch('2袋', '300g/份')).toBe(false);
  });

  it('「1 盒」只是包装单位，不拿来比件数', () => {
    expect(isSpecMismatch('1盒', '6枚/盒')).toBe(false);
  });

  it('任何一边没读到规格 → 无从判断，不算不符', () => {
    expect(isSpecMismatch(null, '300g/份')).toBe(false);
    expect(isSpecMismatch('500g/份', null)).toBe(false);
    expect(isSpecMismatch('', '')).toBe(false);
  });
});

describe('specWarningText', () => {
  it('把两边的规格都写出来，并说清按商品规格算', () => {
    const text = specWarningText('500g/份', '300g/份');
    expect(text).toContain('500g/份');
    expect(text).toContain('300g/份');
    expect(text).toContain('按商品规格');
  });

  it('规格一致时不出提示', () => {
    expect(specWarningText('300g/份', '300g/份')).toBeNull();
  });
});

describe('unitWarningText：这行的单位和商品的单位', () => {
  it('两边一致时不给提示', () => {
    expect(unitWarningText('袋', '袋')).toBeNull();
  });

  it('写「斤」却挂在「袋」卖的商品上时，说清换算不成立', () => {
    const text = unitWarningText('斤', '袋');
    expect(text).toContain('斤');
    expect(text).toContain('袋');
    expect(text).toContain('数量');
  });

  it('不只是让改单位，还要先按截图换算数量', () => {
    const text = unitWarningText('斤', 'kg') || '';
    expect(text).toContain('单位对不上');
    expect(text).toContain('换算好数量');
    expect(text).toContain('1kg = 2斤');
  });

  it('大小写/空格不同不算单位不符，和后台口径一致', () => {
    expect(unitWarningText('KG', 'kg')).toBeNull();
    expect(unitWarningText(' kg ', 'kg')).toBeNull();
  });

  it('缺一边时不判断（老数据/商品没填单位）', () => {
    expect(unitWarningText('', '袋')).toBeNull();
    expect(unitWarningText('斤', null)).toBeNull();
  });
});
