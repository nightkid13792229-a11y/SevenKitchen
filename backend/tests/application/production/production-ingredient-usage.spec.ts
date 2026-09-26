/**
 * 生产锅次的原料用量计算 · 单元测试
 *
 * 这是**唯一一处**回答"这一锅用掉多少原料"的地方，算错就会：
 *   · 原料库存扣多/扣少（账实不符）
 *   · 与车间界面显示的数字对不上（员工会怀疑系统）
 *
 * 所以下面把三种原料的口径逐条钉死：
 *   食材   = 净产出 × 损耗率 × 配比%
 *   补剂   = 按营养素目标定量（与成本核算同一个函数），没有目标时回退配比
 *   算不出的原料要**明确报出来**，不能静默丢掉
 */
import { calculateProductionUsage } from '../../../src/application/production/production-ingredient-usage';

/** 一份最小可用的配方快照 */
function buildSnapshot(items: any[], lossRate = 1.07) {
  return {
    id: 'recipe-1',
    name: '测试食谱',
    production_loss_rate: lossRate,
    items,
  };
}

function foodItem(overrides: Record<string, any> = {}) {
  return {
    ingredient_id: 'ing-chicken',
    name: '鸡胸',
    ingredient_type: 'FOOD',
    ratio: 60,
    ...overrides,
  };
}

function supplementItem(overrides: Record<string, any> = {}) {
  return {
    ingredient_id: 'ing-calcium',
    name: '碳酸钙粉',
    ingredient_type: 'SUPPLEMENT',
    ratio: 0,
    unit_display_label: 'g',
    properties: { production_loss_rate: 1.02 },
    supplement_targets: [
      { fieldPath: 'minerals.calcium', label: '钙', targetValuePerKg: 1250, unit: 'mg' },
    ],
    // 与真实数据同形状：meta.rawBasisType 说明"每 100g 含多少"，数值直接挂在字段上
    nutrition_profile_snapshot: {
      meta: { rawBasisType: 'PER_100_G' },
      minerals: { calcium: 40000 },
    },
    ...overrides,
  };
}

describe('原料用量 · 食材', () => {
  it('食材按「净产出 × 损耗率 × 配比%」算（与车间界面、成本核算一致）', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: buildSnapshot([foodItem({ ratio: 60 })]),
      totalProductionG: 1000,
      supplementLossRate: 1.02,
    });

    // 1000g × 1.07 = 1070g 投料毛重；× 60% = 642g
    expect(result.foodInputWeightG).toBeCloseTo(1070, 4);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].requiredAmount).toBeCloseTo(642, 4);
    expect(result.items[0].unit).toBe('g');
    expect(result.items[0].calculation).toContain('投料毛重');
  });

  it('少了损耗率这一步就会少扣 7% —— 用一条反向断言守住它', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: buildSnapshot([foodItem({ ratio: 100 })]),
      totalProductionG: 1000,
      supplementLossRate: 1.02,
    });

    // 正确是 1070，不是 1000
    expect(result.items[0].requiredAmount).toBeCloseTo(1070, 4);
    expect(result.items[0].requiredAmount).not.toBeCloseTo(1000, 1);
  });

  it('配方快照没写损耗率时用 1.07 兜底', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: { items: [foodItem({ ratio: 100 })] },
      totalProductionG: 1000,
      supplementLossRate: 1.02,
    });
    expect(result.lossRate).toBe(1.07);
    expect(result.items[0].requiredAmount).toBeCloseTo(1070, 4);
  });

  it('没有配比的原料要报出来，而不是静默按 0 处理', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: buildSnapshot([foodItem({ ratio: 0 })]),
      totalProductionG: 1000,
      supplementLossRate: 1.02,
    });

    expect(result.items).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('配比');
  });
});

describe('原料用量 · 补剂（按营养素目标定量）', () => {
  it('按营养素目标算，而不是按配比 —— 这类补剂的配比本来就是 0', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: buildSnapshot([supplementItem()]),
      totalProductionG: 1000,
      supplementLossRate: 1.02,
    });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    // 每 kg 目标 1250mg ÷ 浓度 400mg/g（40000mg/100g）= 3.125g/kg × 1kg × 损耗 1.02
    expect(item.requiredAmount).toBeCloseTo(3.1875, 4);
    expect(item.type).toBe('SUPPLEMENT');
    expect(item.calculation).toContain('营养素目标');
    expect(result.skipped).toHaveLength(0);
  });

  it('补剂自己设了损耗率就用它自己的', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: buildSnapshot([
        supplementItem({ properties: { production_loss_rate: 1.05 } }),
      ]),
      totalProductionG: 1000,
      supplementLossRate: 1.02,
    });
    expect(result.items[0].requiredAmount).toBeCloseTo(3.28125, 4);
  });

  it('没设损耗率时才用全局值', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: buildSnapshot([supplementItem({ properties: {} })]),
      totalProductionG: 1000,
      supplementLossRate: 1.5,
    });
    expect(result.items[0].requiredAmount).toBeCloseTo(4.6875, 4);
  });

  it('既没有营养素目标也没有配比时，明确报出来（这正是原先抛错的地方）', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: buildSnapshot([
        supplementItem({ supplement_targets: [], ratio: 0 }),
      ]),
      totalProductionG: 1000,
      supplementLossRate: 1.02,
    });

    expect(result.items).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('营养素目标');
  });

  it('浓度缺失导致算不出来时，回退到配比而不是让整锅失败', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: buildSnapshot([
        supplementItem({
          // 有目标但快照里没有浓度
          nutrition_profile_snapshot: null,
          ratio: 1,
          properties: { production_loss_rate: 1 },
        }),
      ]),
      totalProductionG: 1000,
      supplementLossRate: 1.02,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].requiredAmount).toBeCloseTo(10, 4);
    expect(result.items[0].calculation).toContain('按配比');
  });
});

describe('原料用量 · 整体', () => {
  it('一锅多料时逐样返回，且每样都大于 0（实体层要求）', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: buildSnapshot([
        foodItem({ ingredient_id: 'a', name: '鸡胸', ratio: 50 }),
        foodItem({ ingredient_id: 'b', name: '牛腩', ratio: 30 }),
        foodItem({ ingredient_id: 'c', name: '南瓜', ratio: 20 }),
        supplementItem(),
      ]),
      totalProductionG: 500,
      supplementLossRate: 1.02,
    });

    expect(result.items).toHaveLength(4);
    expect(result.items.every((item) => item.requiredAmount > 0)).toBe(true);
    // 500 × 1.07 × 50% = 267.5
    expect(result.items[0].requiredAmount).toBeCloseTo(267.5, 4);
  });

  it('配方快照为空时不抛错，返回空结果交给调用方判断', () => {
    const result = calculateProductionUsage({
      recipeSnapshot: { items: [] },
      totalProductionG: 1000,
      supplementLossRate: 1.02,
    });
    expect(result.items).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });
});
