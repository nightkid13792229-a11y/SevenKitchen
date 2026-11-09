
import { resolveSpecChain } from '../procurement-sku-spec-chain';

const ok = (input: Parameters<typeof resolveSpecChain>[0]) => {
  const result = resolveSpecChain(input);
  if (!result.ok) {
    throw new Error(`预期能折算，实际失败：${result.reason}`);
  }
  return result.value;
};

describe('规格链折算', () => {
  it('★ 盒马鸡蛋「30枚 1.59kg」：30 枚、整盒 1.59kg，每枚 53 克（折算）', () => {
    const value = ok({
      links: [{ count: 30, unit: '枚' }],
      totalNetContent: { value: 1.59, unit: 'kg' },
      baseUnit: 'G',
    });

    expect(value.packCount).toBe(30);
    expect(value.perUnitAmount).toBe(53);
    expect(value.totalInBaseUnit).toBe(1590);
    expect(value.source).toBe('derived');
    expect(value.links).toEqual([
      { count: 30, unit: '枚' },
      { count: 53, unit: '克' },
    ]);
  });

  it('★ 模型把整盒总重误写进链尾（30枚 × 1590g）时，以总重为准纠正成每枚 53 克', () => {
    const value = ok({
      links: [
        { count: 30, unit: '枚' },
        { count: 1590, unit: 'g' },
      ],
      totalNetContent: { value: 1.59, unit: 'kg' },
      baseUnit: 'G',
    });

    expect(value.packCount).toBe(30);
    expect(value.perUnitAmount).toBe(53);
    expect(value.totalInBaseUnit).toBe(1590);
    expect(value.source).toBe('derived');
  });

  it('24瓶 × 330ml：包装上印的单价重量，不标折算', () => {
    const value = ok({
      links: [
        { count: 24, unit: '瓶' },
        { count: 330, unit: 'ml' },
      ],
      baseUnit: 'ML',
    });

    expect(value.packCount).toBe(24);
    expect(value.perUnitAmount).toBe(330);
    expect(value.totalInBaseUnit).toBe(7920);
    expect(value.source).toBe('printed');
  });

  it('三层包装（箱 → 捆 → 张）按个记账时连乘，不需要重量', () => {
    const value = ok({
      links: [
        { count: 10, unit: '捆' },
        { count: 50, unit: '张' },
      ],
      baseUnit: 'PCS',
    });

    expect(value.packCount).toBe(10);
    expect(value.perUnitAmount).toBe(50);
    expect(value.totalInBaseUnit).toBe(500);
    expect(value.source).toBe('printed');
  });

  it('按个记账时保留包装上的说法（张），不硬改成「个」', () => {
    const value = ok({
      links: [
        { count: 10, unit: '捆' },
        { count: 50, unit: '张' },
      ],
      baseUnit: 'PCS',
    });

    expect(value.amountUnitText).toBe('张');
    expect(value.links).toEqual([
      { count: 10, unit: '捆' },
      { count: 50, unit: '张' },
    ]);
  });

  it('单件商品「净含量 5kg」：件数按 1 算', () => {
    const value = ok({
      links: [{ count: 5, unit: 'kg' }],
      baseUnit: 'G',
    });

    expect(value.packCount).toBe(1);
    expect(value.perUnitAmount).toBe(5000);
    expect(value.totalInBaseUnit).toBe(5000);
    expect(value.source).toBe('printed');
  });

  it('折算除不尽时保留两位小数，合计按折后数算，保证账能对上', () => {
    const value = ok({
      links: [{ count: 7, unit: '枚' }],
      totalNetContent: { value: 1.59, unit: 'kg' },
      baseUnit: 'G',
    });

    expect(value.perUnitAmount).toBe(227.14);
    // 折后合计 = 7 × 227.14，和包装上的 1590 差 0.02 克（舍入），账内部自洽
    expect(value.totalInBaseUnit).toBe(1589.98);
  });

  it('链条和总重只差舍入误差（1% 以内）时不重算，保留包装上印的数', () => {
    const value = ok({
      links: [
        { count: 30, unit: '枚' },
        { count: 53.33, unit: 'g' },
      ],
      totalNetContent: { value: 1.6, unit: 'kg' },
      baseUnit: 'G',
    });

    expect(value.perUnitAmount).toBe(53.33);
    expect(value.source).toBe('printed');
  });
});

describe('规格链读不出来时判失败', () => {
  it('没有链条', () => {
    expect(
      resolveSpecChain({ links: null, baseUnit: 'G' }).ok,
    ).toBe(false);
  });

  it('只有件数、没有单件重量也没有总重', () => {
    const result = resolveSpecChain({
      links: [{ count: 30, unit: '枚' }],
      baseUnit: 'G',
    });

    expect(result).toEqual({ ok: false, reason: 'NO_BASE_AMOUNT' });
  });

  it('总重是毫升、原料按克记账：跨维度不换算', () => {
    const result = resolveSpecChain({
      links: [{ count: 30, unit: '枚' }],
      totalNetContent: { value: 1590, unit: 'ml' },
      baseUnit: 'G',
    });

    expect(result).toEqual({ ok: false, reason: 'NO_BASE_AMOUNT' });
  });

  it('件数不是整数（1.5 箱）不认，避免折算出半个件', () => {
    const result = resolveSpecChain({
      links: [
        { count: 1.5, unit: '箱' },
        { count: 500, unit: 'g' },
      ],
      baseUnit: 'G',
    });

    // 1.5 箱 × 500g 在账上说不清，宁可不认
    expect(result.ok).toBe(false);
  });
});
