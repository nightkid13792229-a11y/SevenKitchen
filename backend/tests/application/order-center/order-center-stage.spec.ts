import { OrderCenterService } from '../../../src/application/order-center/order-center.service';

/**
 * 订单中心「真实阶段」回归（2026-11-08）。
 *
 * 背景：统一状态组把鲜食的已付款 / 采购中 / 生产中压成一句「处理中」，
 * 老板看不出单子停在哪一步。这里锁住三类订单各自的阶段文案和筛选口径，
 * 避免以后有人顺手把 stageLabel 改回统一组。
 */
describe('OrderCenterService · 真实阶段文案', () => {
  const service = new OrderCenterService({} as never);

  const stageLabel = (
    type: 'FOOD' | 'CUSTOM_RECIPE' | 'SUPPLEMENT',
    rawStatus: string,
    group:
      | 'PENDING'
      | 'PENDING_PAYMENT'
      | 'IN_PROGRESS'
      | 'TO_SHIP'
      | 'SHIPPED'
      | 'COMPLETED'
      | 'CANCELLED' = 'IN_PROGRESS',
  ) =>
    (
      service as unknown as {
        stageLabelFor: (t: string, raw: string, g: string) => string;
      }
    ).stageLabelFor(type, rawStatus, group);

  const statuses = (method: string, value: string): string[] =>
    (service as unknown as Record<string, (v: string) => string[]>)[method](
      value,
    );

  it('鲜食：已付款 / 采购中 / 生产中 各说各的，不再写「处理中」', () => {
    expect(stageLabel('FOOD', 'PAID')).toBe('已付款');
    expect(stageLabel('FOOD', 'PURCHASING')).toBe('采购中');
    expect(stageLabel('FOOD', 'IN_PRODUCTION')).toBe('生产中');
    expect(stageLabel('FOOD', 'FREEZING')).toBe('待发货');
  });

  it('定制：已付款 / 制作中 / 已交付', () => {
    expect(stageLabel('CUSTOM_RECIPE', 'PAID')).toBe('已付款');
    expect(stageLabel('CUSTOM_RECIPE', 'IN_PROGRESS')).toBe('制作中');
    expect(stageLabel('CUSTOM_RECIPE', 'DELIVERED')).toBe('已交付');
  });

  it('补剂：付了钱就是待发货（没有生产环节），分装中只留给历史单', () => {
    expect(stageLabel('SUPPLEMENT', 'PAID', 'TO_SHIP')).toBe('待发货');
    expect(stageLabel('SUPPLEMENT', 'PACKED', 'TO_SHIP')).toBe('待发货');
    expect(stageLabel('SUPPLEMENT', 'PACKING')).toBe('分装中');
  });

  it('未知状态回落到统一组，不漏英文状态码', () => {
    expect(stageLabel('FOOD', 'UNKNOWN', 'IN_PROGRESS')).toBe('处理中');
  });

  it('阶段筛选按原始状态收窄', () => {
    expect(statuses('foodStatuses', 'PAID')).toEqual(['PAID']);
    expect(statuses('foodStatuses', 'IN_PRODUCTION')).toEqual([
      'IN_PRODUCTION',
    ]);
    expect(statuses('customStatuses', 'MAKING')).toEqual(['IN_PROGRESS']);
    expect(statuses('supplementStatuses', 'PACKING')).toEqual(['PACKING']);
    // 补剂的 PAID 归「待发货」，不在「已付款」里
    expect(statuses('supplementStatuses', 'PAID')).toEqual([]);
    expect(statuses('supplementStatuses', 'TO_SHIP')).toEqual([
      'PAID',
      'PACKED',
    ]);
  });

  it('★ 试吃装是现货：付款即待发货，不跟普通鲜食的「已付款」混（2026-11-10）', () => {
    const foodGroup = (status: string, type: string) =>
      (
        service as unknown as {
          foodGroup: (s: string, shippedAt: Date | null, t: string) => string;
        }
      ).foodGroup(status, null, type);

    expect(foodGroup('PAID', 'TASTING_PACK')).toBe('TO_SHIP');
    expect(foodGroup('PAID', 'FRESH_FOOD')).toBe('IN_PROGRESS');
    // 卡片在「待发货」里要写待发货，不能还写已付款
    expect(stageLabel('FOOD', 'PAID', 'TO_SHIP')).toBe('待发货');
    expect(stageLabel('FOOD', 'PAID', 'IN_PROGRESS')).toBe('已付款');
  });

  it('★ 待发货筛选带上试吃装 PAID；已付款 / 处理中把它排除，避免同一单进两个 tab', () => {
    const where = (q: Record<string, unknown>) =>
      (
        service as unknown as {
          foodStatusWhere: (query: Record<string, unknown>) => unknown;
        }
      ).foodStatusWhere(q);

    expect(where({ status: 'TO_SHIP' })).toEqual({
      OR: [{ status: 'FREEZING' }, { status: 'PAID', type: 'TASTING_PACK' }],
    });
    expect(where({ status: 'PAID' })).toEqual({
      status: 'PAID',
      type: { not: 'TASTING_PACK' },
    });
    const inProgress: any = where({ status: 'IN_PROGRESS' });
    expect(inProgress.status).toEqual({
      in: ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'AFTERSALE'],
    });
    expect(inProgress.NOT).toEqual({ status: 'PAID', type: 'TASTING_PACK' });
  });

  it('草稿单（INIT）不再是员工待办：默认排除，「待处理」筛出空', () => {
    const where = (
      service as unknown as {
        foodStatusWhere: (q: Record<string, unknown>) => unknown;
      }
    ).foodStatusWhere({});
    expect(where).toEqual({ status: { not: 'INIT' } });
    expect(statuses('foodStatuses', 'PENDING')).toEqual([]);
  });

  it('旧版小程序还在用的统一组不会被弄坏', () => {
    expect(statuses('foodStatuses', 'IN_PROGRESS')).toEqual([
      'PAID',
      'PURCHASING',
      'IN_PRODUCTION',
      'AFTERSALE',
    ]);
    // 2026-11-08：已完成只算 COMPLETED。DELIVERED 有自己的「已交付」筛选，
    // 再并进「已完成」会出现「卡片写已交付、筛已完成却筛到」。
    // 旧版小程序短期在「全部」里还能看到已交付单。
    expect(statuses('customStatuses', 'COMPLETED')).toEqual(['COMPLETED']);
    expect(statuses('customStatuses', 'DELIVERED')).toEqual(['DELIVERED']);
  });
});
