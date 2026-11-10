import { CARRIERS, carrierIndexOf } from './carriers';

/**
 * 承运商清单（2026-11-10）。
 *
 * 原先三个页面各写一份、还各不相同：鲜食/补剂发货弹窗只有 6 家
 * （**没有申通、没有邮政包裹**），合并发货页有 8 家 —— 走申通寄的单，
 * 员工根本没法正确记录。这里收成一份，谁要加就只改这里。
 */
describe('承运商清单', () => {
  it('固定 8 家，顺序固定（下拉位置不能漂）', () => {
    expect(CARRIERS.map((item) => item.code)).toEqual([
      'SF',
      'JD',
      'YTO',
      'ZTO',
      'STO',
      'YD',
      'EMS',
      'POSTB',
    ]);
  });

  it('默认第一家是顺丰（老员工的手感别变）', () => {
    expect(CARRIERS[0]).toEqual({ code: 'SF', name: '顺丰速运' });
  });

  it('按代码找下标', () => {
    expect(carrierIndexOf('STO')).toBe(4);
    expect(carrierIndexOf('POSTB')).toBe(7);
  });

  it('★ 认不出来回落到 0，不许返回 -1（picker 会炸）', () => {
    expect(carrierIndexOf('NOPE')).toBe(0);
    expect(carrierIndexOf(null)).toBe(0);
    expect(carrierIndexOf(undefined)).toBe(0);
    expect(carrierIndexOf('')).toBe(0);
  });
});
