import { describe, expect, it } from 'vitest';
import {
  getOrderStatusText,
  canApplyRefund,
  canApplyRemake,
  canApplyComplaint,
  canApplyAftersale,
  canCancelOrder,
  isAftersaleLocked,
  getAftersaleEntryLabel,
} from './order-aftersale';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 2026-09-19 售后窗口重新划分：
 *   ① 取消窗口：已付款（尚未进入采购）
 *   ② 锁定期  ：采购中 / 生产中 / 急冻中
 *   ③ 售后窗口：已发货 / 已完成
 *   投诉建议全程保留。
 */
describe('order aftersale windows', () => {
  it('maps every known status to Chinese and never leaks raw English codes', () => {
    expect(getOrderStatusText('INIT')).toBe('待确认');
    expect(getOrderStatusText('PENDING_PAYMENT')).toBe('待付款');
    expect(getOrderStatusText('PAID')).toBe('已付款');
    expect(getOrderStatusText('PURCHASING')).toBe('采购中');
    expect(getOrderStatusText('IN_PRODUCTION')).toBe('生产中');
    expect(getOrderStatusText('FREEZING')).toBe('急冻中');
    expect(getOrderStatusText('SHIPPED')).toBe('已发货');
    expect(getOrderStatusText('COMPLETED')).toBe('已完成');
    expect(getOrderStatusText('CANCELLED')).toBe('已取消');
    expect(getOrderStatusText('AFTERSALE')).toBe('售后中');
    expect(getOrderStatusText('SOME_FUTURE_STATUS')).toBe('处理中');
    expect(getOrderStatusText(null)).toBe('处理中');
  });

  // ===== ① 取消窗口 =====
  it('allows cancelling only while the order has not entered purchasing', () => {
    expect(canCancelOrder('PAID')).toBe(true);
    // 采购开始后就代表我们已经为这一单产生成本，不再允许自助取消
    expect(canCancelOrder('PURCHASING')).toBe(false);
    expect(canCancelOrder('IN_PRODUCTION')).toBe(false);
    expect(canCancelOrder('FREEZING')).toBe(false);
    expect(canCancelOrder('SHIPPED')).toBe(false);
    expect(canCancelOrder('COMPLETED')).toBe(false);
  });

  // ===== ② 锁定期 =====
  it('locks self-service refunds and remakes during purchasing / production / freezing', () => {
    for (const status of ['PURCHASING', 'IN_PRODUCTION', 'FREEZING']) {
      expect(isAftersaleLocked(status)).toBe(true);
      expect(canApplyRefund(status)).toBe(false);
      expect(canApplyRemake(status)).toBe(false);
    }
    // 锁定期之外不算锁定
    expect(isAftersaleLocked('PAID')).toBe(false);
    expect(isAftersaleLocked('SHIPPED')).toBe(false);
    expect(isAftersaleLocked('COMPLETED')).toBe(false);
  });

  // ===== ③ 售后窗口 =====
  it('allows refund only from SHIPPED and COMPLETED (within 7 days of completion)', () => {
    expect(canApplyRefund('SHIPPED')).toBe(true);
    expect(canApplyRefund('PAID')).toBe(false);
    expect(canApplyRefund('PURCHASING')).toBe(false);
    expect(canApplyRefund('IN_PRODUCTION')).toBe(false);
    expect(canApplyRefund('FREEZING')).toBe(false);
    expect(canApplyRefund('INIT')).toBe(false);
    expect(canApplyRefund('PENDING_PAYMENT')).toBe(false);
    expect(canApplyRefund('CANCELLED')).toBe(false);
    expect(canApplyRefund('AFTERSALE')).toBe(false);
  });

  it('locks refund on completed orders older than 7 days', () => {
    const recent = new Date(Date.now() - 3 * DAY_MS).toISOString();
    const stale = new Date(Date.now() - 8 * DAY_MS).toISOString();

    expect(canApplyRefund('COMPLETED', recent)).toBe(true);
    expect(canApplyRefund('COMPLETED', stale)).toBe(false);
    expect(canApplyRefund('COMPLETED', null)).toBe(true);
  });

  it('allows remake only from SHIPPED through COMPLETED (within 7 days)', () => {
    expect(canApplyRemake('SHIPPED')).toBe(true);
    // 东西还没到手，"重做"没有意义
    expect(canApplyRemake('FREEZING')).toBe(false);
    expect(canApplyRemake('PAID')).toBe(false);
    expect(canApplyRemake('PURCHASING')).toBe(false);
    expect(canApplyRemake('IN_PRODUCTION')).toBe(false);

    const recent = new Date(Date.now() - 3 * DAY_MS).toISOString();
    const stale = new Date(Date.now() - 8 * DAY_MS).toISOString();
    expect(canApplyRemake('COMPLETED', recent)).toBe(true);
    expect(canApplyRemake('COMPLETED', stale)).toBe(false);
  });

  // ===== 投诉建议：全程保留 =====
  it('keeps complaint available in every holdable status, without the 7-day lock', () => {
    for (const status of [
      'PAID',
      'PURCHASING',
      'IN_PRODUCTION',
      'FREEZING',
      'SHIPPED',
      'COMPLETED',
    ]) {
      expect(canApplyComplaint(status)).toBe(true);
    }
    expect(canApplyComplaint('INIT')).toBe(false);
    expect(canApplyComplaint('PENDING_PAYMENT')).toBe(false);

    const stale = new Date(Date.now() - 8 * DAY_MS).toISOString();
    // 投诉不受 7 天限制，也不受锁定期影响 —— 不能把顾客的发声渠道关掉
    expect(canApplyAftersale('COMPLETED', stale)).toBe(true);
    expect(canApplyAftersale('IN_PRODUCTION')).toBe(true);
  });

  // ===== 入口文案按阶段不同 =====
  it('labels the entry by stage so customers never see refund wording for a cancel', () => {
    expect(getAftersaleEntryLabel('PAID')).toBe('取消订单');
    expect(getAftersaleEntryLabel('SHIPPED')).toBe('申请售后');
    expect(getAftersaleEntryLabel('COMPLETED')).toBe('申请售后');
    // 锁定期只剩投诉建议
    expect(getAftersaleEntryLabel('PURCHASING')).toBe('投诉建议');
    expect(getAftersaleEntryLabel('IN_PRODUCTION')).toBe('投诉建议');
    expect(getAftersaleEntryLabel('FREEZING')).toBe('投诉建议');
    expect(getAftersaleEntryLabel('CANCELLED')).toBe('');
    expect(getAftersaleEntryLabel('INIT')).toBe('');
  });

  it('unifies the aftersale gate across list and detail', () => {
    expect(canApplyAftersale('PAID')).toBe(true);
    expect(canApplyAftersale('INIT')).toBe(false);
    expect(canApplyAftersale('PENDING_PAYMENT')).toBe(false);
    expect(canApplyAftersale('CANCELLED')).toBe(false);
  });
});
