import { describe, expect, it } from 'vitest';
import {
  getOrderStatusText,
  canApplyRefund,
  canApplyRemake,
  canApplyComplaint,
  canApplyAftersale,
} from './order-aftersale';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('order aftersale status rules (P1-6/7/8)', () => {
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

  it('allows refund from PAID through COMPLETED (within 7 days of completion)', () => {
    expect(canApplyRefund('PAID')).toBe(true);
    expect(canApplyRefund('PURCHASING')).toBe(true);
    expect(canApplyRefund('IN_PRODUCTION')).toBe(true);
    expect(canApplyRefund('FREEZING')).toBe(true);
    expect(canApplyRefund('SHIPPED')).toBe(true);
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

  it('allows remake only from FREEZING through COMPLETED (within 7 days)', () => {
    expect(canApplyRemake('FREEZING')).toBe(true);
    expect(canApplyRemake('SHIPPED')).toBe(true);
    expect(canApplyRemake('PAID')).toBe(false);
    expect(canApplyRemake('PURCHASING')).toBe(false);
    expect(canApplyRemake('IN_PRODUCTION')).toBe(false);

    const recent = new Date(Date.now() - 3 * DAY_MS).toISOString();
    const stale = new Date(Date.now() - 8 * DAY_MS).toISOString();
    expect(canApplyRemake('COMPLETED', recent)).toBe(true);
    expect(canApplyRemake('COMPLETED', stale)).toBe(false);
  });

  it('keeps complaint available from PAID through COMPLETED without the 7-day lock', () => {
    expect(canApplyComplaint('PAID')).toBe(true);
    expect(canApplyComplaint('COMPLETED')).toBe(true);
    expect(canApplyComplaint('INIT')).toBe(false);
    expect(canApplyComplaint('PENDING_PAYMENT')).toBe(false);

    const stale = new Date(Date.now() - 8 * DAY_MS).toISOString();
    // 投诉不受 7 天限制
    expect(canApplyAftersale('COMPLETED', stale)).toBe(true);
  });

  it('unifies the aftersale gate across list and detail (PAID is eligible)', () => {
    // 列表页与详情页共用同一规则：已付款即可申请售后（旧列表页只在急冻后显示入口）
    expect(canApplyAftersale('PAID')).toBe(true);
    expect(canApplyAftersale('INIT')).toBe(false);
    expect(canApplyAftersale('PENDING_PAYMENT')).toBe(false);
    expect(canApplyAftersale('CANCELLED')).toBe(false);
  });
});
