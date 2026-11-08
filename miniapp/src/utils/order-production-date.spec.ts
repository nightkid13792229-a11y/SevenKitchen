import { describe, expect, it } from 'vitest';
import { canAdminEditOrderProductionDate } from './order-production-date';

/**
 * 2026-11-08 老板定：员工端/管理员端的鲜食订单详情，给管理员一个「改期」入口，
 * 但只在**还没开始采购**之前才给。采购一开始，制作日期就锁死（后台也是这么挡的）。
 */
describe('canAdminEditOrderProductionDate', () => {
  it('已付款、还没开始采购时可以改', () => {
    expect(
      canAdminEditOrderProductionDate({ status: 'PAID', type: 'FRESH_FOOD' }),
    ).toBe(true);
  });

  it('还没付款（待支付/初始）也允许，后台没拦这两个状态', () => {
    expect(
      canAdminEditOrderProductionDate({ status: 'PENDING_PAYMENT' }),
    ).toBe(true);
    expect(canAdminEditOrderProductionDate({ status: 'INIT' })).toBe(true);
  });

  it('采购一开始就锁死，生产/发货/售后同样不能再改', () => {
    for (const status of [
      'PURCHASING',
      'IN_PRODUCTION',
      'FREEZING',
      'SHIPPED',
      'COMPLETED',
      'CANCELLED',
      'AFTERSALE',
    ]) {
      expect(
        canAdminEditOrderProductionDate({ status, type: 'FRESH_FOOD' }),
      ).toBe(false);
    }
  });

  it('试吃装是现货，没有制作日期，不能改', () => {
    expect(
      canAdminEditOrderProductionDate({ status: 'PAID', type: 'TASTING_PACK' }),
    ).toBe(false);
  });

  it('订单还没加载出来时不露出入口', () => {
    expect(canAdminEditOrderProductionDate(null)).toBe(false);
    expect(canAdminEditOrderProductionDate(undefined)).toBe(false);
  });
});
