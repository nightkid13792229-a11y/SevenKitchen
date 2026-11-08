import { describe, expect, it } from 'vitest';
import {
  canAdminEditOrderProductionDate,
  checkProductionDateSelection,
  describeProductionDateUpdateError,
  formatProductionDateLabel,
} from './order-production-date';

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

/**
 * 日期显示：库里是「某一天的 UTC 零点」，必须按东八区取年月日。
 * 直接截 ISO 字符串或按手机本地时区算都会差一天（顾客在负时区时尤其明显）。
 */
describe('formatProductionDateLabel', () => {
  it('UTC 零点的制作日按上海日历日显示，不吃掉一天', () => {
    expect(formatProductionDateLabel('2026-11-09T00:00:00.000Z')).toBe(
      '2026年11月9日 周一',
    );
  });

  it('选择器回传的 YYYY-MM-DD 也显示同一天', () => {
    expect(formatProductionDateLabel('2026-11-10')).toBe('2026年11月10日 周二');
  });

  it('没有日期时说「未设置」，不显示空白', () => {
    expect(formatProductionDateLabel(null)).toBe('未设置');
    expect(formatProductionDateLabel('')).toBe('未设置');
    expect(formatProductionDateLabel(undefined)).toBe('未设置');
  });

  it('脏数据原样回显，不崩', () => {
    expect(formatProductionDateLabel('not-a-date')).toBe('not-a-date');
  });
});

/**
 * 选完日期先挡两道：早于可选范围、跟原来一样。
 * 挡不住的话，点开选择器直接确定就会把订单推迟一天。
 */
describe('checkProductionDateSelection', () => {
  const minDate = '2026-11-08';

  it('早于最早可选日 → 拦下', () => {
    expect(
      checkProductionDateSelection({
        selectedDate: '2026-11-07',
        minDate,
        currentDate: '2026-11-09',
      }),
    ).toBe('before-min');
  });

  it('跟原制作日相同 → 提示没变化，不发请求', () => {
    expect(
      checkProductionDateSelection({
        selectedDate: '2026-11-09',
        minDate,
        currentDate: '2026-11-09',
      }),
    ).toBe('unchanged');
  });

  it('正常改到另一天 → 放行', () => {
    expect(
      checkProductionDateSelection({
        selectedDate: '2026-11-12',
        minDate,
        currentDate: '2026-11-09',
      }),
    ).toBe('ok');
  });

  it('原订单还没有制作日 → 只要不早于今天就算正常', () => {
    expect(
      checkProductionDateSelection({
        selectedDate: '2026-11-10',
        minDate,
        currentDate: null,
      }),
    ).toBe('ok');
  });

  it('选择器没回传日期 → 按不可用处理', () => {
    expect(
      checkProductionDateSelection({
        selectedDate: '',
        minDate,
        currentDate: '2026-11-09',
      }),
    ).toBe('before-min');
  });
});

/**
 * 后台的报错有一半是英文（状态翻转、权限），直接怼到 toast 上
 * 客服只会看到半句 "Cannot update target production date..."。
 * 这里统一翻成人话；并且区分「要不要顺手刷新让入口消失」。
 */
describe('describeProductionDateUpdateError', () => {
  it('采购刚被启动（状态已是 PURCHASING）→ 说人话，并要求刷新', () => {
    expect(
      describeProductionDateUpdateError(
        'Cannot update target production date for order in status: PURCHASING',
      ),
    ).toEqual({
      text: '这一单已经开始采购，制作日期不能再改',
      shouldRefresh: true,
    });
  });

  it('已经到了更后面的状态 → 也翻成中文，不再出现英文', () => {
    const result = describeProductionDateUpdateError(
      'Cannot update target production date for order in status: SHIPPED',
    );
    expect(result.text).toContain('不能再改');
    expect(result.text).not.toMatch(/[A-Za-z]{4,}/);
    expect(result.shouldRefresh).toBe(true);
  });

  it('后台已经给了中文的「采购已开始」→ 原样用，并要求刷新', () => {
    expect(
      describeProductionDateUpdateError('采购已开始，不能修改制作日期'),
    ).toEqual({
      text: '采购已开始，不能修改制作日期',
      shouldRefresh: true,
    });
  });

  it('权限不足（员工误触）→ 说清楚只有管理员能改', () => {
    expect(
      describeProductionDateUpdateError(
        'You do not have permission to modify this order',
      ),
    ).toEqual({ text: '只有管理员能改制作日期', shouldRefresh: true });
  });

  it('日期本身不合规 → 原样提示，但不刷新页面', () => {
    expect(
      describeProductionDateUpdateError('制作日期不能超过90天后'),
    ).toEqual({ text: '制作日期不能超过90天后', shouldRefresh: false });
  });

  it('网络或未知错误 → 给一句能看懂的话，不把英文抛给客服', () => {
    expect(describeProductionDateUpdateError('Network Error')).toEqual({
      text: '改期失败，请重试',
      shouldRefresh: false,
    });
    expect(describeProductionDateUpdateError('')).toEqual({
      text: '改期失败，请重试',
      shouldRefresh: false,
    });
    expect(describeProductionDateUpdateError(null)).toEqual({
      text: '改期失败，请重试',
      shouldRefresh: false,
    });
  });
});
