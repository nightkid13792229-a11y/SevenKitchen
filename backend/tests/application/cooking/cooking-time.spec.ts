import {
  COOKING_LABEL_JUDGEMENT,
  COOKING_TIME_JUDGEMENT,
  COOKING_TIME_MAX_WEIGHT_G,
  buildCookingAdvice,
  formatCookingTimes,
  getCookingTimes,
  isOverLimit,
  buildCookingAdviceForOrder,
  pickWeightPerBagG,
} from '../../../src/application/cooking/cooking-time';

/**
 * 烹饪时间唯一真源（服务端）。
 *
 * 生产标签和顾客端鲜食订单详情页都从这里取数，两边不再各维护一份表。
 * 口径（2026-11-03 老板定）：
 *   ≤150g   蒸/炖 约10分钟，低温慢煮 30分钟
 *   151–250g   约15分钟，45分钟
 *   251–400g   约20分钟，60分钟
 *   401–600g   约25分钟，90分钟
 *   >600g   不给固定时间，只给判定标准
 */
describe('烹饪时间口径（唯一真源）', () => {
  it.each([
    [80, 10, 10, 30],
    [150, 10, 10, 30],
    [151, 15, 15, 45],
    [250, 15, 15, 45],
    [251, 20, 20, 60],
    [400, 20, 20, 60],
    [401, 25, 25, 90],
    [600, 25, 25, 90],
  ])('%ig/袋 → 蒸%i 炖%i 慢煮%i', (weight, steam, stew, sousvide) => {
    expect(getCookingTimes(weight)).toEqual({ steam, stew, sousvide });
  });

  it('超过 600g 不给固定时间', () => {
    expect(COOKING_TIME_MAX_WEIGHT_G).toBe(600);
    expect(getCookingTimes(601)).toBeNull();
    expect(getCookingTimes(2000)).toBeNull();
    expect(isOverLimit(601)).toBe(true);
    expect(isOverLimit(600)).toBe(false);
  });

  it('重量不合法时当作拿不到时间，不要瞎给一个', () => {
    for (const value of [0, -10, Number.NaN, null, undefined]) {
      expect(getCookingTimes(value as number)).toBeNull();
    }
  });

  it('页面和标签用同一套文案格式', () => {
    expect(formatCookingTimes(200)).toEqual({
      steam: '约 15 分钟',
      stew: '约 15 分钟',
      sousvide: '45 分钟',
    });
    expect(formatCookingTimes(700)).toBeNull();
  });

  it('顾客端的判定标准原样保留', () => {
    expect(COOKING_TIME_JUDGEMENT).toContain('鲜食中心没有可见血水');
    expect(COOKING_TIME_JUDGEMENT).toContain('65℃');
  });

  it('标签超重时只印一句话，不提克重、不提出锅标准这四个字', () => {
    expect(COOKING_LABEL_JUDGEMENT).toBe(
      '蒸/炖：食物中心无可见血水即可；低温慢煮：食物中心达65℃后1分钟即可。',
    );
  });
});

describe('订单详情用的烹饪建议', () => {
  it('正常重量给出三项时间和判定文案', () => {
    expect(buildCookingAdvice(200)).toEqual({
      weightPerBagG: 200,
      overLimit: false,
      steam: '约 15 分钟',
      stew: '约 15 分钟',
      sousvide: '45 分钟',
      judgement: COOKING_TIME_JUDGEMENT,
    });
  });

  it('超重只给判定文案，三项时间为空', () => {
    expect(buildCookingAdvice(700)).toEqual({
      weightPerBagG: 700,
      overLimit: true,
      steam: null,
      stew: null,
      sousvide: null,
      judgement: COOKING_TIME_JUDGEMENT,
    });
  });

  it('拿不到每袋重量时返回 null，让页面走"暂未获取"分支', () => {
    expect(buildCookingAdvice(0)).toBeNull();
    expect(buildCookingAdvice(undefined as unknown as number)).toBeNull();
  });
});

describe('从订单条目里取每袋克重', () => {
  it('有分装明细时取第一档（与页面口径一致）', () => {
    expect(
      pickWeightPerBagG([
        {
          packageSpecG: 100,
          packagePlan: [
            { packageSpecG: 100, packageCount: 2 },
            { packageSpecG: 500, packageCount: 1 },
          ],
        },
      ]),
    ).toBe(100);
  });

  it('没有分装明细时退回 packageSpecG', () => {
    expect(pickWeightPerBagG([{ packageSpecG: 200, packagePlan: [] }])).toBe(200);
    expect(pickWeightPerBagG([{ packageSpecG: 208 }])).toBe(208);
  });

  it('没有条目或数据不全时返回 0', () => {
    expect(pickWeightPerBagG([])).toBe(0);
    expect(pickWeightPerBagG(undefined)).toBe(0);
    expect(pickWeightPerBagG([{}])).toBe(0);
  });
});

describe('订单对象 → 烹饪建议（订单详情接口用）', () => {
  it('取第一档克重，算出三项时间和判定', () => {
    expect(
      buildCookingAdviceForOrder({
        items: [
          {
            packageSpecG: 100,
            packagePlan: [{ packageSpecG: 100, packageCount: 2 }],
          },
        ],
      }),
    ).toMatchObject({
      weightPerBagG: 100,
      overLimit: false,
      steam: '约 10 分钟',
      sousvide: '30 分钟',
    });
  });

  it('超重订单只给判定', () => {
    expect(
      buildCookingAdviceForOrder({
        items: [{ packageSpecG: 700, packagePlan: [] }],
      }),
    ).toMatchObject({ weightPerBagG: 700, overLimit: true, steam: null });
  });

  it('没有条目时返回 null', () => {
    expect(buildCookingAdviceForOrder({ items: [] })).toBeNull();
  });
});
