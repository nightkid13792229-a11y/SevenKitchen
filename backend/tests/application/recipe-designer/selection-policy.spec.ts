import { filterSelectionByPlan } from '../../../src/application/recipe-designer/agent/selection-policy';
import type {
  AgentNutritionPlan,
  AgentSelection,
} from '../../../src/application/recipe-designer/agent/propose-plan';

function food(name: string, category: string) {
  return {
    kind: 'FOOD' as const,
    name,
    foodCategory: category,
    reason: 'x',
    dataStatus: 'MISSING' as const,
  };
}

function planWithFat(max: number | null): AgentNutritionPlan {
  return {
    summary: 'x',
    constraints:
      max === null
        ? []
        : [
            {
              key: 'fat',
              label: '脂肪',
              min: null,
              max,
              unit: 'PERCENT_DM',
              basis: 'x',
              source: 'x',
              hard: true,
            },
          ],
    nonNutrient: [],
  };
}

const selection: AgentSelection = {
  summary: 'x',
  items: [
    food('猪里脊', '畜肉类及制品'),
    food('兔里脊', '畜肉类及制品'),
    food('鳕鱼', '水产类'),
    food('鲈鱼', '水产类'),
    food('亚麻籽', '坚果种子类'),
    food('奇亚籽', '坚果种子类'),
    food('橄榄油', '油脂类'),
    food('亚麻籽油', '油脂类'),
    food('蒸馏水', '其他'),
    food('纯净水', '其他'),
  ],
};

describe('selection policy', () => {
  it('removes nuts, oils and other for a low-fat plan', () => {
    const filtered = filterSelectionByPlan(selection, planWithFat(10));

    expect(filtered.items).toHaveLength(4);
    expect(
      filtered.items.every((item) =>
        ['畜肉类及制品', '水产类'].includes(item.foodCategory ?? ''),
      ),
    ).toBe(true);
    expect(filtered.skippedCategories?.map((item) => item.category)).toEqual(
      expect.arrayContaining(['坚果种子类', '油脂类', '其他']),
    );
  });

  it('keeps nuts/oils when the plan is not low-fat', () => {
    const filtered = filterSelectionByPlan(selection, planWithFat(20));

    expect(filtered.items).toHaveLength(8);
    expect(
      filtered.items.some((item) => item.foodCategory === '坚果种子类'),
    ).toBe(true);
    expect(
      filtered.skippedCategories?.some((item) => item.category === '其他'),
    ).toBe(true);
  });
});
