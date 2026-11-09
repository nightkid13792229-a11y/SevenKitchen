import { assertPurchaseListsCompleted } from 'src/application/production/production-gate';

describe('production gate', () => {
  it('没有采购清单时拒绝', () => {
    expect(() => assertPurchaseListsCompleted([], '2026-11-10')).toThrow(
      '请先生成 2026-11-10 的采购清单',
    );
  });

  it('有未完成清单时拒绝并说明张数', () => {
    expect(() =>
      assertPurchaseListsCompleted(
        [
          { id: 'pl-1', status: 'COMPLETED' },
          { id: 'pl-2', status: 'PENDING' },
        ],
        '2026-11-10',
      ),
    ).toThrow('还有 1 张未完成');
  });

  it('全部完成时放行', () => {
    expect(() =>
      assertPurchaseListsCompleted(
        [{ id: 'pl-1', status: 'COMPLETED' }],
        '2026-11-10',
      ),
    ).not.toThrow();
  });
});
