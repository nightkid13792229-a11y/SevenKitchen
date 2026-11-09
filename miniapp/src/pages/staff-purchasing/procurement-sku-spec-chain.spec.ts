import { describe, expect, it } from 'vitest';
import {
  computeSpecRatio,
  firstIncompleteLinkIndex,
  formatSpecChain,
  multiplySpecLinks,
  needsInnerLayer,
} from './procurement-sku-spec-chain';

describe('multiplySpecLinks', () => {
  it('★ 盒马鸡蛋：30 枚 × 53 克 = 1590 克，不是 30 × 1590', () => {
    expect(multiplySpecLinks([{ count: '30', unit: '枚' }])).toBe(30);
  });

  it('三层包装：10 捆 × 20 包 = 200 件', () => {
    expect(
      multiplySpecLinks([
        { count: '10', unit: '捆' },
        { count: '20', unit: '包' },
      ]),
    ).toBe(200);
  });

  it('没有内层时按 1 件算（单件商品）', () => {
    expect(multiplySpecLinks([])).toBe(1);
  });

  it('有一层没填数量就返回 null，不能默认成 1', () => {
    expect(multiplySpecLinks([{ count: '', unit: '枚' }])).toBeNull();
  });

  it('件数必须是正整数：0、负数、小数都不认', () => {
    expect(multiplySpecLinks([{ count: '0', unit: '枚' }])).toBeNull();
    expect(multiplySpecLinks([{ count: '-2', unit: '枚' }])).toBeNull();
    expect(multiplySpecLinks([{ count: '1.5', unit: '箱' }])).toBeNull();
  });
});

describe('firstIncompleteLinkIndex', () => {
  it('都填好了返回 -1', () => {
    expect(
      firstIncompleteLinkIndex([
        { count: '10', unit: '捆' },
        { count: '20', unit: '包' },
      ]),
    ).toBe(-1);
  });

  it('单位没填也算没填好', () => {
    expect(firstIncompleteLinkIndex([{ count: '10', unit: ' ' }])).toBe(0);
  });

  it('返回第一个没填好的下标', () => {
    expect(
      firstIncompleteLinkIndex([
        { count: '10', unit: '捆' },
        { count: '', unit: '包' },
      ]),
    ).toBe(1);
  });
});

describe('computeSpecRatio', () => {
  it('件数 × 基准数量', () => {
    expect(
      computeSpecRatio({ links: [{ count: '30', unit: '枚' }], amountText: '53' }),
    ).toBe(1590);
  });

  it('单件商品只有基准数量', () => {
    expect(computeSpecRatio({ links: [], amountText: '5000' })).toBe(5000);
  });

  it('有一层没填就返回 0，页面据此不显示合计', () => {
    expect(
      computeSpecRatio({ links: [{ count: '', unit: '枚' }], amountText: '53' }),
    ).toBe(0);
  });
});

describe('formatSpecChain', () => {
  it('拼出人话：30 枚 × 53 克', () => {
    expect(
      formatSpecChain({
        links: [{ count: '30', unit: '枚' }],
        amountText: '53',
        baseUnitText: '克',
      }),
    ).toBe('30 枚 × 53 克');
  });

  it('没填的格子用问号占位，不冒充数字', () => {
    expect(
      formatSpecChain({
        links: [{ count: '', unit: '枚' }],
        amountText: '',
        baseUnitText: '克',
      }),
    ).toBe('? 枚 × ? 克');
  });
});

describe('needsInnerLayer', () => {
  it('★ 整箱商品一层都没填：必须拦住，不能按 1 件算', () => {
    for (const purchaseUnit of ['箱', '桶', '提', '件']) {
      expect(
        needsInnerLayer({ purchaseUnit, linkCount: 0, confirmedSingle: false }),
      ).toBe(true);
    }
  });

  it('填了一层就放行', () => {
    expect(
      needsInnerLayer({ purchaseUnit: '箱', linkCount: 1, confirmedSingle: false }),
    ).toBe(false);
  });

  it('员工确认"这件只有一件"后放行', () => {
    expect(
      needsInnerLayer({ purchaseUnit: '箱', linkCount: 0, confirmedSingle: true }),
    ).toBe(false);
  });

  it('袋/包/盒这类单件单位不拦', () => {
    for (const purchaseUnit of ['袋', '包', '盒', '瓶']) {
      expect(
        needsInnerLayer({ purchaseUnit, linkCount: 0, confirmedSingle: false }),
      ).toBe(false);
    }
  });
});
