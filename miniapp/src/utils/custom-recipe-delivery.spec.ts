import { describe, expect, it } from 'vitest';
import {
  buildDeliveryDetailUrl,
  buildDeliveryDiyUrl,
  buildFinishedFoodOrderUrl,
  deliveryBatchCountText,
  hasFrozenNutritionReport,
  resolveDeliverySelection,
  selectFrozenNutritionReport,
} from './custom-recipe-delivery';

/**
 * 多份交付 · 页面选择口径（2026-10-21 · 第二阶段 Task 4）
 *
 * 订单里可能有一份，也可能一次交付 N 份。页面只认两个入口参数：
 *   · orderId —— 哪张订单；
 *   · recipeId —— 看哪一份（不传就看第一份）。
 *
 * 这组测试锁的是**选择规则本身**：默认第一份、按业务编号命中、
 * 老单份交付原样返回。页面模板不自己写 `find()`，否则三页三套规则。
 */

const content = (recipeId: string, name: string) => ({
  schemaVersion: 1,
  recipe: {
    recipeId,
    name,
    coverImageUrl: `https://cdn.example.com/${recipeId}.jpg`,
    items: [],
  },
  feeding: {
    dailyIntakeG: null,
    mealsPerDay: null,
    perMealG: null,
    cycleDays: null,
  },
  nutrition: { standard: null, energyDensityKcalPerKg: null },
  shopping: { lines: [], totalNetG: 0 },
  supplements: [],
  steps: [],
  storage: null,
  generatedAt: '2026-10-21T02:00:00.000Z',
});

const batch = () => ({
  batchId: 'batch-1',
  version: 1,
  deliveredAt: '2026-10-21T02:00:00.000Z',
  confirmedAt: null,
  itemCodes: ['RECIPE', 'SHOPPING_SOP'],
  items: [
    {
      id: 'item-1',
      recipeId: 'CR1759100000001',
      recipeName: '鸡肉南瓜',
      recipeCoverImageUrl: 'https://cdn.example.com/1.jpg',
      itemCodes: ['RECIPE', 'SHOPPING_SOP'],
      content: content('CR1759100000001', '鸡肉南瓜'),
    },
    {
      id: 'item-2',
      recipeId: 'CR1759100000002',
      recipeName: '鸭肉西兰花',
      recipeCoverImageUrl: null,
      itemCodes: ['RECIPE'],
      content: content('CR1759100000002', '鸭肉西兰花'),
    },
  ],
});

describe('多份交付 · 选哪一份', () => {
  it('★ 老单份交付原样返回（不包装、不改字段）', () => {
    const legacyContent = content('CR1759100000001', '单份专属鲜食');
    const legacy = {
      id: 'delivery-1',
      version: 2,
      deliveredAt: '2026-10-18T02:00:00.000Z',
      confirmedAt: null,
      itemCodes: ['RECIPE', 'NUTRITION_REPORT'],
      content: legacyContent,
    };

    const resolved = resolveDeliverySelection(legacy);

    expect(resolved?.isBatch).toBe(false);
    expect(resolved?.batchSize).toBe(1);
    expect(resolved?.content).toBe(legacyContent);
    expect(resolved?.version).toBe(2);
    expect(resolved?.itemCodes).toEqual(['RECIPE', 'NUTRITION_REPORT']);
    expect(resolved?.recipeId).toBe('CR1759100000001');
    expect(resolved?.recipeName).toBe('单份专属鲜食');
  });

  it('★ 多份批次按 recipeId 命中对应那一份', () => {
    const resolved = resolveDeliverySelection(batch(), 'CR1759100000002');

    expect(resolved?.isBatch).toBe(true);
    expect(resolved?.batchSize).toBe(2);
    expect(resolved?.content.recipe.name).toBe('鸭肉西兰花');
    expect(resolved?.itemCodes).toEqual(['RECIPE']);
    expect(resolved?.recipeId).toBe('CR1759100000002');
    expect(resolved?.recipeName).toBe('鸭肉西兰花');
    expect(resolved?.recipeCoverImageUrl).toBeNull();
    expect(resolved?.version).toBe(1);
  });

  it('★ 不传 recipeId（或传了查不到）时默认第一份，不能白屏', () => {
    expect(resolveDeliverySelection(batch())?.recipeName).toBe('鸡肉南瓜');
    expect(resolveDeliverySelection(batch(), '')?.recipeName).toBe('鸡肉南瓜');
    expect(
      resolveDeliverySelection(batch(), 'CR-NOT-EXIST')?.recipeName,
    ).toBe('鸡肉南瓜');
  });

  it('没有交付 / 空批次返回 null，由页面显示空态', () => {
    expect(resolveDeliverySelection(null)).toBeNull();
    expect(resolveDeliverySelection(undefined)).toBeNull();
    expect(
      resolveDeliverySelection({ ...batch(), items: [] } as any),
    ).toBeNull();
  });

  it('交付份数文案统一在这里生成', () => {
    expect(deliveryBatchCountText(2)).toBe('本次共交付 2 份');
    expect(deliveryBatchCountText(0)).toBe('本次共交付 0 份');
  });
});

describe('多份交付 · 页面路由', () => {
  it('进入某一份食谱时带上 orderId 与 recipeId', () => {
    expect(buildDeliveryDetailUrl('CR202610210001', 'CR1759100000002')).toBe(
      '/pages/custom-recipe/delivery?orderId=CR202610210001&recipeId=CR1759100000002',
    );
  });

  it('没有 recipeId 时只带 orderId（老链接 / 默认第一份）', () => {
    expect(buildDeliveryDetailUrl('CR202610210001')).toBe(
      '/pages/custom-recipe/delivery?orderId=CR202610210001',
    );
    expect(buildDeliveryDetailUrl('CR202610210001', null)).toBe(
      '/pages/custom-recipe/delivery?orderId=CR202610210001',
    );
  });

  it('「自己做」把 orderId / recipeId / dogId 一起传下去', () => {
    expect(
      buildDeliveryDiyUrl(
        'CR202610210001',
        'CR1759100000002',
        'dog-1',
      ),
    ).toBe(
      '/pages/recipe-diy/index?orderId=CR202610210001&recipeId=CR1759100000002&dogId=dog-1',
    );
  });

  it('「自己做」没有狗的编号时只带订单与食谱（页面自己让顾客选）', () => {
    expect(buildDeliveryDiyUrl('CR202610210001', 'CR1759100000002')).toBe(
      '/pages/recipe-diy/index?orderId=CR202610210001&recipeId=CR1759100000002',
    );
  });

  it('「订购成品」带这份食谱和这只狗', () => {
    expect(buildFinishedFoodOrderUrl('CR1759100000002', 'dog-1')).toBe(
      '/pages/recipe-order/index?recipeId=CR1759100000002&dogId=dog-1',
    );
    expect(buildFinishedFoodOrderUrl('CR1759100000002')).toBe(
      '/pages/recipe-order/index?recipeId=CR1759100000002',
    );
  });

  it('参数做 URL 编码，业务编号里的特殊字符不会截断查询串', () => {
    expect(buildDeliveryDetailUrl('CR 1', 'R/2')).toBe(
      '/pages/custom-recipe/delivery?orderId=CR%201&recipeId=R%2F2',
    );
  });
});


/**
 * 冻结营养报告（2026-11-08）
 *
 * 这两条判断决定"交付页显不显示报告入口"和"报告页渲染哪一份数据"。
 * 写在 utils 里是为了**能测行为**：页面模板里的 `v-if` 只能断言源码字符串，
 * 改坏了测试照样绿（审核实测过）。
 */
const report = {
  ingredientRows: [{ ingredientName: '鸡胸肉', weightPercentLabel: '70%' }],
  macroRows: [{ key: 'crudeProtein', name: '蛋白质', dryMatterLabel: '38.23%' }],
  energyDensityRows: [{ label: '每公斤配方', value: '3620 kcal/kg' }],
  nutrientSections: {
    minerals: {
      key: 'minerals',
      title: '微量元素',
      dryMatterHeader: '/100gDM',
      rows: [{ name: '钙', currentLabel: '2192' }],
    },
  },
};

const contentWithReport = (recipeId: string, name: string) => ({
  ...content(recipeId, name),
  nutrition: {
    standard: 'FEDIAF_2025',
    energyDensityKcalPerKg: 3620,
    scenario: 'EARLY_GROWTH_REPRODUCTION',
    report,
  },
});

describe('冻结营养报告 · 有没有 / 取哪一份', () => {
  it('★ 老快照没有 report → 不显示入口（不点进空页）', () => {
    expect(hasFrozenNutritionReport(content('CR1', '老交付'))).toBe(false);
  });

  it('report 显式为 null → 同样不显示（这单当场就没有报告）', () => {
    expect(
      hasFrozenNutritionReport({
        ...content('CR1', 'v2 无报告'),
        nutrition: {
          standard: 'FEDIAF_2025',
          energyDensityKcalPerKg: 3620,
          report: null,
        },
      }),
    ).toBe(false);
  });

  it('有冻结报告 → 显示入口', () => {
    expect(hasFrozenNutritionReport(contentWithReport('CR1', '有报告'))).toBe(
      true,
    );
  });

  it('★ 报告页按 recipeId 取 —— 多份交付里取中的那一份', () => {
    const delivery = {
      ...batch(),
      items: [
        {
          ...batch().items[0],
          content: contentWithReport('CR1759100000001', '鸡肉南瓜'),
        },
        {
          ...batch().items[1],
          content: contentWithReport('CR1759100000002', '鸭肉西兰花'),
        },
      ],
    };

    const selected = selectFrozenNutritionReport(delivery, 'CR1759100000002');
    expect(selected?.recipeName).toBe('鸭肉西兰花');
    expect(selected?.report.nutrientSections.minerals.rows[0].name).toBe('钙');
    expect(selected?.standard).toBe('FEDIAF_2025');
    expect(selected?.scenario).toBe('EARLY_GROWTH_REPRODUCTION');
  });

  it('★ 没有冻结报告 → null（页面据此说"这单没有报告"，不退回活行）', () => {
    expect(selectFrozenNutritionReport(null)).toBeNull();
    expect(selectFrozenNutritionReport(batch(), 'CR1759100000001')).toBeNull();
  });
});
