import { BaseUnit } from '../../ingredient/enums';
import {
  deriveRatio,
  formatPackaging,
  normalizeBaseUnitText,
  packagingFromLegacy,
  readPackaging,
  validatePackaging,
} from '../packaging';

const allowed = ['箱', '袋', '盒', '斤', '份'];

const check = (packaging: unknown, purchaseUnit = '箱', baseUnit: BaseUnit = BaseUnit.G) =>
  validatePackaging({ packaging, purchaseUnit, baseUnit, allowedUnits: allowed });

describe('deriveRatio', () => {
  it('连乘中间层再乘末层', () => {
    expect(
      deriveRatio({ links: [{ count: 10, unit: '捆' }], amount: 500, amountUnit: BaseUnit.G }),
    ).toBe(5000);
    expect(deriveRatio({ links: [], amount: 500, amountUnit: BaseUnit.G })).toBe(500);
    expect(
      deriveRatio({
        links: [
          { count: 10, unit: '捆' },
          { count: 2, unit: '包' },
        ],
        amount: 250,
        amountUnit: BaseUnit.G,
      }),
    ).toBe(5000);
  });
});

describe('validatePackaging', () => {
  it('末层必须是原料基准单位', () => {
    const result = check({ links: [], amount: 500, amountUnit: 'ML' }, '箱', BaseUnit.G);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain('AMOUNT_UNIT_MISMATCH');
  });

  it('「克」「g」「个」这些写法也能认', () => {
    for (const unitText of ['克', 'g', 'G']) {
      const result = check({ links: [], amount: 500, amountUnit: unitText });
      expect(result.ok).toBe(true);
    }
  });

  it('不接受 0 / 负数 / 小数件数', () => {
    for (const bad of [0, -1, 1.5]) {
      const result = check({ links: [{ count: bad, unit: '捆' }], amount: 500, amountUnit: 'G' });
      expect(result.ok).toBe(false);
    }
  });

  it('层数超过 3 层拒绝', () => {
    const links = [1, 2, 3, 4].map((count) => ({ count, unit: '层' }));
    const result = check({ links, amount: 1, amountUnit: 'G' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain('TOO_MANY_LINKS');
  });

  it('采购单位不在字典 → 拒，且不猜', () => {
    const result = check({ links: [], amount: 500, amountUnit: 'G' }, '挂');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain('PURCHASE_UNIT_NOT_ALLOWED');
  });

  it('采购单位为空 → 拒', () => {
    const result = check({ links: [], amount: 500, amountUnit: 'G' }, '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain('PURCHASE_UNIT_MISSING');
  });

  it('通过时归一化（去空格）并返回倍数', () => {
    const result = check({ links: [{ count: 10, unit: ' 捆 ' }], amount: 500, amountUnit: 'G' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ratio).toBe(5000);
      expect(result.spec.links[0].unit).toBe('捆');
    }
  });

  it('不是对象 → INVALID_SHAPE', () => {
    expect(check(null).ok).toBe(false);
    expect(check('5000').ok).toBe(false);
  });
});

describe('packagingFromLegacy', () => {
  it('老数据回填成「只有末层」，倍数不变', () => {
    const spec = packagingFromLegacy({
      ratio: 1590,
      baseUnit: 'G',
      printedText: '30枚 1.59kg',
    });
    expect(spec).toEqual({
      links: [],
      amount: 1590,
      amountUnit: BaseUnit.G,
      printedText: '30枚 1.59kg',
    });
    expect(deriveRatio(spec)).toBe(1590);
  });
});

describe('formatPackaging', () => {
  it('连成一句人话', () => {
    expect(
      formatPackaging({ links: [{ count: 10, unit: '捆' }], amount: 500, amountUnit: BaseUnit.G }, '箱'),
    ).toBe('1 箱 = 10 捆 × 500 克');
    expect(formatPackaging({ links: [], amount: 500, amountUnit: BaseUnit.G }, '斤')).toBe(
      '1 斤 = 500 克',
    );
  });

  it('按个记账时保留「枚」的说法', () => {
    expect(
      formatPackaging(
        { links: [], amount: 30, amountUnit: BaseUnit.PCS, amountLabel: '枚' },
        '盒',
      ),
    ).toBe('1 盒 = 30 枚');
  });
});

describe('readPackaging', () => {
  it('读出合法层级', () => {
    expect(
      readPackaging({ links: [{ count: 30, unit: '枚' }], amount: 53, amountUnit: 'G' }),
    ).toMatchObject({ amount: 53, amountUnit: 'G', links: [{ count: 30, unit: '枚' }] });
  });

  it('坏数据返回 null，交给 legacy 兜底', () => {
    expect(readPackaging(null)).toBeNull();
    expect(readPackaging({ amount: 0, amountUnit: 'G' })).toBeNull();
    expect(readPackaging({ amount: 500, amountUnit: '???' })).toBeNull();
  });
});

describe('normalizeBaseUnitText', () => {
  it('认清常见写法', () => {
    expect(normalizeBaseUnitText('克')).toBe(BaseUnit.G);
    expect(normalizeBaseUnitText('ML')).toBe(BaseUnit.ML);
    expect(normalizeBaseUnitText('张')).toBe(BaseUnit.PCS);
    expect(normalizeBaseUnitText('')).toBeNull();
  });
});
