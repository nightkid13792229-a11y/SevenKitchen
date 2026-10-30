import {
  AssistedOrderService,
  ASSISTED_GIFT_REASONS,
} from '../src/application/custom-recipe/assisted-order.service';

/**
 * 赠送单的收款归一化（2026-10-30）
 *
 * ## 背景（线上真实卡点）
 *
 * 代客下单页此前把「赠送」当成「实收与报价不一致」：
 * 员工必须把实收改成 0、手写一段差异原因，还得给一笔**不存在的钱**
 * 挑一个收款渠道（订单上于是留下「线下微信」这种假信息）。
 *
 * 赠送是常规动作（老客户回馈 / 售后补偿 / 朋友人情），
 * 所以它必须是一个**显式结算方式**：金额固定 0、不记渠道、原因必填。
 *
 * 这里锁住四件事：
 *   ① 赠送一定是已成交，不能挂成待付款的 0 元单；
 *   ② 原因必须是四个 code 之一，选「其他」必须补说明；
 *   ③ 赠送单不接受页面传来的金额/渠道 —— 哪怕传了 999 也落 0；
 *   ④ 非赠送单的口径一个字都不能变（渠道/实收/差异原因照旧）。
 */
function buildService(): AssistedOrderService {
  // 只测纯归一化，不碰数据库/报价/排期
  return new AssistedOrderService(
    null as any,
    null as any,
    null as any,
    null as any,
  );
}

function resolvePayment(raw: unknown, payableAmount = 299) {
  return (buildService() as any).resolvePayment(raw, payableAmount);
}

describe('赠送单 · 收款归一化', () => {
  it('★ 赠送原因必须是四个 code 之一', () => {
    expect(ASSISTED_GIFT_REASONS).toEqual([
      'REPEAT_CUSTOMER',
      'AFTERSALE_COMPENSATION',
      'FRIEND_SERVICE',
      'OTHER',
    ]);

    expect(() =>
      resolvePayment({ collected: true, isGift: true }),
    ).toThrow('请选择赠送原因');

    expect(() =>
      resolvePayment({ collected: true, isGift: true, giftReason: '瞎填' }),
    ).toThrow('请选择赠送原因');
  });

  it('★ 赠送单必须已成交，不能是待付款', () => {
    expect(() =>
      resolvePayment({
        collected: false,
        isGift: true,
        giftReason: 'REPEAT_CUSTOMER',
      }),
    ).toThrow('赠送单必须是已成交状态');
  });

  it('★ 原因选「其他」必须补一句说明', () => {
    expect(() =>
      resolvePayment({ collected: true, isGift: true, giftReason: 'OTHER' }),
    ).toThrow('必须补充说明');

    const result = resolvePayment({
      collected: true,
      isGift: true,
      giftReason: 'OTHER',
      giftNote: '  朋友家狗狗试吃  ',
    });
    expect(result.giftNote).toBe('朋友家狗狗试吃');
  });

  it('★ 赠送单金额固定 0、不记渠道，页面传什么都不算数', () => {
    const result = resolvePayment({
      collected: true,
      isGift: true,
      giftReason: 'REPEAT_CUSTOMER',
      giftNote: '第三次复购',
      // 页面若误传了这些，也不该落库
      amount: 999,
      channel: 'OFFLINE_WECHAT',
      externalRef: 'wx-123',
      overrideReason: '手滑',
    });

    expect(result).toMatchObject({
      collected: true,
      isGift: true,
      giftReason: 'REPEAT_CUSTOMER',
      giftNote: '第三次复购',
      amount: 0,
      channel: null,
      externalRef: null,
      overrideReason: null,
    });
  });

  it('★ 补充说明超长要拦住', () => {
    expect(() =>
      resolvePayment({
        collected: true,
        isGift: true,
        giftReason: 'FRIEND_SERVICE',
        giftNote: 'x'.repeat(201),
      }),
    ).toThrow('不能超过 200 个字符');
  });
});

describe('正常收款 · 口径不变', () => {
  it('★ 缺收款渠道仍然拒绝', () => {
    expect(() => resolvePayment({ collected: true, amount: 299 })).toThrow(
      '收款渠道只能是线下微信、线下支付宝或其他',
    );
  });

  it('★ 实收与报价不一致仍必须填原因', () => {
    expect(() =>
      resolvePayment({
        collected: true,
        channel: 'OFFLINE_WECHAT',
        amount: 0,
      }),
    ).toThrow('实收金额与系统报价不一致时，必须填写原因');
  });

  it('★ 正常收款不会被误标成赠送', () => {
    const result = resolvePayment({
      collected: true,
      channel: 'OFFLINE_WECHAT',
      amount: 299,
    });

    expect(result).toMatchObject({
      isGift: false,
      giftReason: null,
      giftNote: null,
      amount: 299,
      channel: 'OFFLINE_WECHAT',
    });
  });
});
