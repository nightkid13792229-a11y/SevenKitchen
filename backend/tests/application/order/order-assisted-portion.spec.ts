import {
  buildPortionPreview,
  MIN_ASSISTED_ORDER_G,
} from 'src/application/order/assisted-portion';

/**
 * 代客下单的饭量/分装建议。
 *
 * 这里是纯计算：服务层只负责把狗狗体重、餐次、食谱能量密度算成
 * `dailyIntakeG` 再交进来。分开写是为了让"1 袋 = 1 顿""最低 1000g"
 * 这两条规则能被直接盯住。
 */
describe('buildPortionPreview · 代客下单饭量与分装建议', () => {
  it('按每日克数和餐次折算每餐克数与包数', () => {
    const result = buildPortionPreview({
      dailyIntakeG: 447,
      mealsPerDay: 2,
      days: 7,
    });

    expect(result).toEqual({
      dailyIntakeG: 447,
      perMealIntakeG: 224,
      mealsPerDay: 2,
      days: 7,
      totalG: 3129,
      suggestedPackagePlan: [{ packageSpecG: 224, packageCount: 14 }],
      minOrderG: MIN_ASSISTED_ORDER_G,
    });
  });

  it('总量不足 1000g 时给出需要抬到几天（不静默放过）', () => {
    const result = buildPortionPreview({
      dailyIntakeG: 100,
      mealsPerDay: 2,
      days: 7,
    });

    expect(result.totalG).toBe(700);
    expect(result.totalG).toBeLessThan(MIN_ASSISTED_ORDER_G);
  });

  it('每日克数缺失直接报错，不返回 0', () => {
    expect(() =>
      buildPortionPreview({ dailyIntakeG: 0, mealsPerDay: 2, days: 7 }),
    ).toThrow();
  });
});
