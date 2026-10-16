import { describe, expect, it } from 'vitest';
import {
  buildPaymentTimeoutHint,
  describeCustomRecipeRefund,
  estimateDeliveryDate,
  formatAmount,
  formatDate,
  formatMonthDay,
  formatRemainingMinutes,
  resolvePaymentDeadlineAt,
} from './custom-recipe-order';

/**
 * 定制订单展示口径的单元测试。
 *
 * ## ⚠️ 状态与目标的文案测试搬走了，不是删了
 *
 * 这里原有三组用例（状态文案 / 目标文案 / 样式档位），钉的是
 * 「五个状态都有中文，含此前漏掉的已取消」这类意图。
 *
 * **那些意图完全有效，而且比原来更要紧了** —— 只是它们现在属于：
 *
 *   ① **后端**：`backend/tests/application/platform-options/platform-options.service.spec.ts`
 *      断言所有枚举值都被补进选项字典、缺标签会 warn。服务启动时自动同步，
 *      所以"后端加枚举、前端没跟上"这件事在机制上被堵住了。
 *   ② **`utils/option-set.ts`**：前端只保证"去后端取"，
 *      以及"查不到时兜成中文，绝不把英文枚举漏给顾客"。
 *
 * 为什么搬走而不是在前端再守一遍：本地那三份表**恰恰是漏掉 `COMPLETED`
 * 的那三份** —— 顾客点完「确认收到」再回列表，看到的是英文 `COMPLETED`。
 * 在前端再守一遍等于把同一个毛病留着。
 *
 * 这个文件剩下的是**纯格式化**（金额 / 日期 / 退款进展 / 支付时限），
 * 它们不含枚举映射，留在前端是对的。
 */



describe('custom recipe formatting', () => {
  it('金额整数不带小数、非整数保留两位', () => {
    expect(formatAmount(300)).toBe('300');
    expect(formatAmount(29.9)).toBe('29.90');
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(undefined)).toBe('0');
    expect(formatAmount(null)).toBe('0');
    expect(formatAmount('abc')).toBe('0');
  });

  it('日期按本地时区格式化，取不到值走兜底', () => {
    expect(formatDate('2026-10-08T00:00:00.000Z', '—')).toBe('2026-10-08');
    expect(formatDate(null, '—')).toBe('—');
    expect(formatDate('not-a-date', '—')).toBe('—');
    // 本地时区：北京时间 10-08 00:30 不能显示成 10-07
    expect(formatDate('2026-10-07T16:30:00.000Z', '—')).toBe('2026-10-08');
  });

  it('月日文案用于「预计 10 月 8 日交付」', () => {
    expect(formatMonthDay('2026-10-08T00:00:00.000Z')).toBe('10 月 8 日');
    expect(formatMonthDay(null)).toBe('');
  });
});

describe('custom recipe refund display', () => {
  it('退款中', () => {
    expect(describeCustomRecipeRefund({ refundStatus: 'PROCESSING' })).toEqual({
      text: '退款中',
      tone: 'processing',
    });
  });

  it('已退款带上金额', () => {
    expect(
      describeCustomRecipeRefund({ refundStatus: 'REFUNDED', refundAmount: 300 }),
    ).toEqual({ text: '已退款 ¥300', tone: 'done' });
  });

  it('退款失败要说得让顾客知道找谁', () => {
    expect(describeCustomRecipeRefund({ refundStatus: 'FAILED' })).toEqual({
      text: '退款未成功，请联系客服',
      tone: 'failed',
    });
  });

  it('兼容微信侧的别名状态', () => {
    expect(describeCustomRecipeRefund({ refundStatus: 'PENDING' })?.tone).toBe(
      'processing',
    );
    expect(describeCustomRecipeRefund({ refundStatus: 'SUCCESS' })?.tone).toBe(
      'done',
    );
    expect(describeCustomRecipeRefund({ refundStatus: 'ABNORMAL' })?.tone).toBe(
      'failed',
    );
  });

  it('没有退款状态就不显示（不猜）', () => {
    expect(describeCustomRecipeRefund(null)).toBeNull();
    expect(describeCustomRecipeRefund({})).toBeNull();
    expect(describeCustomRecipeRefund({ refundStatus: null })).toBeNull();
    expect(describeCustomRecipeRefund({ refundStatus: 'WHAT_IS_THIS' })).toBeNull();
  });
});

describe('custom recipe payment deadline', () => {
  const createdAt = '2026-10-04T02:00:00.000Z';
  const now = Date.parse('2026-10-04T02:10:00.000Z');

  it('优先用后端给的 paymentDeadlineAt', () => {
    const deadline = resolvePaymentDeadlineAt({
      paymentDeadlineAt: '2026-10-04T02:30:00.000Z',
      createdAt,
      paymentTimeoutMinutes: 60,
    });
    expect(deadline).toBe(Date.parse('2026-10-04T02:30:00.000Z'));
  });

  it('没有截止时间时用下单时间 + 配置超时分钟数估算', () => {
    const deadline = resolvePaymentDeadlineAt({
      paymentDeadlineAt: null,
      createdAt,
      paymentTimeoutMinutes: 30,
    });
    expect(deadline).toBe(Date.parse('2026-10-04T02:30:00.000Z'));
  });

  it('超时配置为 0（不自动关单）且没有截止时间 → 不给截止时间', () => {
    expect(
      resolvePaymentDeadlineAt({
        paymentDeadlineAt: null,
        createdAt,
        paymentTimeoutMinutes: 0,
      }),
    ).toBeNull();
  });

  it('两个口径都没有 → 不算、也不显示时限文案', () => {
    expect(resolvePaymentDeadlineAt({})).toBeNull();
    expect(buildPaymentTimeoutHint({ now })).toBe('');
    expect(buildPaymentTimeoutHint({ paymentTimeoutMinutes: 0, now })).toBe('');
  });

  it('有截止时间时给出"还剩多久"', () => {
    expect(formatRemainingMinutes(now + 12 * 60 * 1000, now)).toBe('12 分钟');
    expect(formatRemainingMinutes(now + 30 * 1000, now)).toBe('不到 1 分钟');
    expect(formatRemainingMinutes(now - 1, now)).toBe('');
  });

  it('有时限时文案写清"超时会自动取消"', () => {
    const hint = buildPaymentTimeoutHint({
      paymentDeadlineAt: '2026-10-04T02:30:00.000Z',
      now,
    });
    expect(hint).toContain('前完成支付');
    expect(hint).toContain('还剩 20 分钟');
    expect(hint).toContain('超时订单会自动取消');
  });

  it('只有配置分钟数时用"X 分钟内"口径，不编具体时刻', () => {
    expect(
      buildPaymentTimeoutHint({ paymentTimeoutMinutes: 30, now }),
    ).toBe('请在 30 分钟内完成支付，超时订单会自动取消');
  });

  it('已经超过时限时如实说，不再显示倒计时', () => {
    expect(
      buildPaymentTimeoutHint({
        paymentDeadlineAt: '2026-10-04T02:00:00.000Z',
        now,
      }),
    ).toBe('已超过支付时限，订单可能已被自动取消');
  });
});

describe('estimate delivery date', () => {
  it('按工作日顺延，跳过周末', () => {
    // 2026-10-08 是周四，3 个工作日 → 10-13（周二，跳过 10-10/11 周末）
    const result = estimateDeliveryDate(3, new Date('2026-10-08T03:00:00.000Z'));
    expect(result).not.toBeNull();
    expect(result!.getDay()).not.toBe(0);
    expect(result!.getDay()).not.toBe(6);
    expect(formatMonthDay(result!)).toBe('10 月 13 日');
  });

  it('配置为 0 或缺失时不算日期（页面改为"以系统排期为准"）', () => {
    expect(estimateDeliveryDate(0)).toBeNull();
    expect(estimateDeliveryDate(Number.NaN)).toBeNull();
  });
});
