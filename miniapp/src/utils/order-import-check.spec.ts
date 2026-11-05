import { describe, expect, it } from 'vitest';
import { orderImportIncompleteNotice } from './order-import-check';

describe('orderImportIncompleteNotice', () => {
  it('模型没说不完整 → 不提示', () => {
    expect(
      orderImportIncompleteNotice({ incomplete: false, incompleteReason: null }),
    ).toBeNull();
  });

  it('模型说不完整 → 用模型给的原因', () => {
    expect(
      orderImportIncompleteNotice({
        incomplete: true,
        incompleteReason: '商品列表被折叠，只看到 3 行',
      }),
    ).toBe('商品列表被折叠，只看到 3 行');
  });

  it('模型说不完整但没给原因 → 用兜底文案', () => {
    const notice = orderImportIncompleteNotice({
      incomplete: true,
      incompleteReason: '   ',
    });
    expect(notice).toContain('没读完整');
  });
});
