import { describe, expect, it } from 'vitest';
import {
  buildDeliveryDetailUrl,
  buildDeliveryShoppingUrl,
  deliveryBatchCountText,
  resolveDeliverySelection,
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

  it('第 2 页同样把 recipeId 传下去，避免回退到第一份', () => {
    expect(buildDeliveryShoppingUrl('CR202610210001', 'CR1759100000002')).toBe(
      '/pages/custom-recipe/delivery-shopping?orderId=CR202610210001&recipeId=CR1759100000002',
    );
  });

  it('参数做 URL 编码，业务编号里的特殊字符不会截断查询串', () => {
    expect(buildDeliveryDetailUrl('CR 1', 'R/2')).toBe(
      '/pages/custom-recipe/delivery?orderId=CR%201&recipeId=R%2F2',
    );
  });
});
