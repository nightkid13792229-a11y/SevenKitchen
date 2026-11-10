import {
  CARRIER_CODES,
  CARRIER_NAME_BY_CODE,
  toCarrierCode,
} from 'src/application/shipping/carrier-catalog';

/**
 * 承运商归一（2026-11-10）。
 *
 * 存根上印的名字五花八门（顺丰速运 / 顺丰 / SF EXPRESS），
 * 而订单里存的是 `SF` 这样的代码。这一层把名字收成 8 个固定代码。
 *
 * 铁律：**认不出来就给 null，不许按名字里有没有某个字去猜** ——
 * 猜错会把这单记成别家快递，财务和客服都跟着错。
 */
describe('承运商归一 · 别名', () => {
  it.each([
    ['顺丰速运', 'SF'],
    ['顺丰', 'SF'],
    ['SF EXPRESS', 'SF'],
    ['sf', 'SF'],
    ['京东快递', 'JD'],
    ['京东物流', 'JD'],
    ['圆通速递', 'YTO'],
    ['中通快递', 'ZTO'],
    ['申通快递', 'STO'],
    ['韵达速递', 'YD'],
    ['EMS', 'EMS'],
    ['邮政特快专递', 'EMS'],
    ['邮政包裹', 'POSTB'],
  ])('%s → %s', (raw, code) => {
    expect(toCarrierCode(raw)).toBe(code);
  });

  it('前后空格与全角不影响', () => {
    expect(toCarrierCode('  顺丰速运  ')).toBe('SF');
    expect(toCarrierCode('ＳＦ')).toBe('SF');
  });

  it('★ 认不出来给 null，不许猜', () => {
    expect(toCarrierCode('某某快运')).toBeNull();
    expect(toCarrierCode('')).toBeNull();
    expect(toCarrierCode(null)).toBeNull();
    expect(toCarrierCode(undefined)).toBeNull();
  });
});

describe('承运商归一 · 字典自身', () => {
  it('固定 8 个代码，顺序固定（下拉位置不能漂）', () => {
    expect([...CARRIER_CODES]).toEqual([
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

  it('每个代码都有中文名', () => {
    expect(CARRIER_NAME_BY_CODE.SF).toBe('顺丰速运');
    expect(CARRIER_NAME_BY_CODE.POSTB).toBe('邮政包裹');
  });
});
