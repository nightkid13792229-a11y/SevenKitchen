import { describe, expect, it } from 'vitest';
import { shouldOpenMultipack } from './procurement-sku-multipack';

describe('多件装开关规则', () => {
  it('★ 箱/桶/提/件没读出件数时必须打开，不能按 1 件算', () => {
    for (const purchaseUnit of ['箱', '桶', '提', '件']) {
      expect(
        shouldOpenMultipack({
          purchaseUnit,
          packCountText: '',
          packCountMissing: true,
        }),
      ).toBe(true);
    }
  });

  it('读出 24 件时打开', () => {
    expect(
      shouldOpenMultipack({
        purchaseUnit: '箱',
        packCountText: '24',
        packCountMissing: false,
      }),
    ).toBe(true);
  });

  it('读出 1 件时不用打开：整箱只有 1 件，按 1 算是对的', () => {
    expect(
      shouldOpenMultipack({
        purchaseUnit: '箱',
        packCountText: '1',
        packCountMissing: false,
      }),
    ).toBe(false);
  });

  it('袋/包/瓶/盒这类单件单位，没给件数也不打开', () => {
    for (const purchaseUnit of ['袋', '包', '瓶', '盒']) {
      expect(
        shouldOpenMultipack({
          purchaseUnit,
          packCountText: '',
          packCountMissing: true,
        }),
      ).toBe(false);
    }
  });

  it('袋里读出 24 件时仍要打开：原来的多件乘法不能被改掉', () => {
    expect(
      shouldOpenMultipack({
        purchaseUnit: '袋',
        packCountText: '24',
        packCountMissing: false,
      }),
    ).toBe(true);
  });

  it('件数缺失标记没带上、但输入是空的，也按"没读到"处理', () => {
    expect(
      shouldOpenMultipack({
        purchaseUnit: '箱',
        packCountText: '',
        packCountMissing: false,
      }),
    ).toBe(true);
  });

  it('件数读到 0 时也打开，不能当成 1 件放过去', () => {
    expect(
      shouldOpenMultipack({
        purchaseUnit: '箱',
        packCountText: '0',
        packCountMissing: false,
      }),
    ).toBe(true);
  });
});
