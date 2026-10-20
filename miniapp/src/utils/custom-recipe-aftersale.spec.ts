import { describe, expect, it } from 'vitest';
import {
  AFTERSALE_BATCH_SELECTION_REQUIRED,
  buildAftersaleRecipeRequests,
  buildAftersaleSelectionPayload,
  buildAftersaleUrl,
  preselectAftersaleDeliveryItemIds,
  resolveAftersaleBatchItems,
  toggleAftersaleDeliveryItem,
  validateAftersaleBatchSelection,
} from './custom-recipe-aftersale';

/**
 * 多份订单 · 按份售后（2026-10-21 · 第二阶段 Task 6）
 *
 * 售后页要回答四个问题，规则只放一份在这里：
 *
 *   ① 从订单详情点进来时，默认选中哪一份？
 *   ② 勾选 / 取消勾选怎么变化？
 *   ③ 每份的说明怎么写进 `recipeRequests`？
 *   ④ 老订单（没有批次）怎么保证**一个字段都不多传**？
 *
 * 页面模板不自己写 `find()` / `filter()`，否则"点第二份却默认第一份"
 * 这类故障会在页面之间各错一套。
 */

const items = [
  {
    deliveryItemId: 'item-1',
    recipeId: 'CR1759100000001',
    recipeName: '鸡肉南瓜',
    recipeCoverImageUrl: null,
    itemCodes: ['RECIPE'],
  },
  {
    deliveryItemId: 'item-2',
    recipeId: 'CR1759100000002',
    recipeName: '鸭肉西兰花',
    recipeCoverImageUrl: null,
    itemCodes: ['RECIPE'],
  },
];

describe('按份售后 · 默认选中哪一份', () => {
  it('★ 带 recipeId 打开时，选中那一份的 deliveryItemId', () => {
    expect(
      preselectAftersaleDeliveryItemIds(items, 'CR1759100000002'),
    ).toEqual(['item-2']);
  });

  it('★ 没带 recipeId 时一份都不选（顾客自己勾）', () => {
    expect(preselectAftersaleDeliveryItemIds(items, '')).toEqual([]);
    expect(preselectAftersaleDeliveryItemIds(items, null)).toEqual([]);
    expect(preselectAftersaleDeliveryItemIds(items, undefined)).toEqual([]);
  });

  it('★ recipeId 在批次里找不到时也不瞎选第一份', () => {
    expect(
      preselectAftersaleDeliveryItemIds(items, 'CR-ALREADY-REPLACED'),
    ).toEqual([]);
    expect(preselectAftersaleDeliveryItemIds([], 'CR1759100000001')).toEqual([]);
    expect(preselectAftersaleDeliveryItemIds(null, 'CR1759100000001')).toEqual([]);
  });

  it('老订单没有批次明细时不会凭空选出一份', () => {
    expect(resolveAftersaleBatchItems(null)).toEqual([]);
    expect(resolveAftersaleBatchItems({ items: null })).toEqual([]);
    expect(resolveAftersaleBatchItems({ items: [] })).toEqual([]);
  });
});

describe('按份售后 · 复选多份', () => {
  it('★ 可以勾选多份，也可以取消其中一份', () => {
    let selected = toggleAftersaleDeliveryItem([], 'item-1');
    expect(selected).toEqual(['item-1']);

    selected = toggleAftersaleDeliveryItem(selected, 'item-2');
    expect(selected).toEqual(['item-1', 'item-2']);

    selected = toggleAftersaleDeliveryItem(selected, 'item-1');
    expect(selected).toEqual(['item-2']);
  });

  it('重复的 id 会被收敛，不会提交两份相同的选择', () => {
    expect(
      toggleAftersaleDeliveryItem(['item-1', 'item-1'], 'item-2'),
    ).toEqual(['item-1', 'item-2']);
  });

  it('不修改传进来的数组（页面上的选择是只读快照）', () => {
    const original = ['item-1'];
    toggleAftersaleDeliveryItem(original, 'item-2');
    expect(original).toEqual(['item-1']);
  });
});

describe('按份售后 · 每份自己的说明', () => {
  it('★ 只收集选中且写了内容的份，并 trim', () => {
    expect(
      buildAftersaleRecipeRequests(['item-1', 'item-2'], {
        'item-1': '  鸡肉换成鸭肉  ',
        'item-2': '   ',
      }),
    ).toEqual([{ deliveryItemId: 'item-1', description: '鸡肉换成鸭肉' }]);
  });

  it('★ 没写逐份说明时只发选中 id（不编空说明）', () => {
    const payload = buildAftersaleSelectionPayload({
      isBatch: true,
      selectedIds: ['item-1'],
      texts: {},
    });

    expect(payload).toEqual({ deliveryItemIds: ['item-1'] });
    // 后端要求每条说明非空；空文本传过去只会被拒
    expect(payload).not.toHaveProperty('recipeRequests');
  });

  it('★ 写了说明时 deliveryItemIds 与 recipeRequests 一起发', () => {
    expect(
      buildAftersaleSelectionPayload({
        isBatch: true,
        selectedIds: ['item-1', 'item-2'],
        texts: { 'item-2': '鸭肉太多，想换一种蛋白' },
      }),
    ).toEqual({
      deliveryItemIds: ['item-1', 'item-2'],
      recipeRequests: [
        { deliveryItemId: 'item-2', description: '鸭肉太多，想换一种蛋白' },
      ],
    });
  });

  it('说明只针对选中的份，取消勾选后不再提交', () => {
    expect(
      buildAftersaleSelectionPayload({
        isBatch: true,
        selectedIds: ['item-2'],
        texts: {
          'item-1': '这份不提交',
          'item-2': '这份保留',
        },
      }),
    ).toEqual({
      deliveryItemIds: ['item-2'],
      recipeRequests: [
        { deliveryItemId: 'item-2', description: '这份保留' },
      ],
    });
  });
});

describe('按份售后 · 老订单原样', () => {
  it('★ 没有批次时完全不追加 deliveryItemIds / recipeRequests', () => {
    const payload = buildAftersaleSelectionPayload({
      isBatch: false,
      // 即使页面上残留了选择，也不能带到老订单的整单售后里
      selectedIds: ['item-1'],
      texts: { 'item-1': '不该出现' },
    });

    expect(payload).toEqual({});
    expect(payload).not.toHaveProperty('deliveryItemIds');
    expect(payload).not.toHaveProperty('recipeRequests');
  });

  it('老订单的校验不会因为份选择而拦住提交', () => {
    expect(
      validateAftersaleBatchSelection({ isBatch: false, selectedIds: [] }),
    ).toBe('');
  });
});

describe('按份售后 · 至少选一份', () => {
  it('★ 批次订单一份都没选时给出明确的行内错误', () => {
    expect(
      validateAftersaleBatchSelection({ isBatch: true, selectedIds: [] }),
    ).toBe(AFTERSALE_BATCH_SELECTION_REQUIRED);
    expect(
      validateAftersaleBatchSelection({
        isBatch: true,
        selectedIds: ['  '],
      }),
    ).toBe(AFTERSALE_BATCH_SELECTION_REQUIRED);
  });

  it('选了至少一份就通过', () => {
    expect(
      validateAftersaleBatchSelection({
        isBatch: true,
        selectedIds: ['item-1'],
      }),
    ).toBe('');
  });
});

describe('按份售后 · 路由只在这里拼', () => {
  it('★ 从某一份卡片进售后时带上 recipeId', () => {
    expect(buildAftersaleUrl('CR1759100000000', 'CR1759100000002')).toBe(
      '/pages/custom-recipe/aftersale?orderId=CR1759100000000&recipeId=CR1759100000002',
    );
  });

  it('订单级售后入口保持原来的链接形状（不带 recipeId）', () => {
    expect(buildAftersaleUrl('CR1759100000000')).toBe(
      '/pages/custom-recipe/aftersale?orderId=CR1759100000000',
    );
  });

  it('参数会编码，不会拼出坏链接', () => {
    expect(buildAftersaleUrl('CR 1', 'CR/2')).toBe(
      '/pages/custom-recipe/aftersale?orderId=CR%201&recipeId=CR%2F2',
    );
  });
});

describe('按份售后 · 不做抵扣', () => {
  it('★ 提交的额外字段只有按份选择，没有抵扣 / credit', () => {
    const payload = buildAftersaleSelectionPayload({
      isBatch: true,
      selectedIds: ['item-1'],
      texts: { 'item-1': '换一种肉' },
    });

    expect(Object.keys(payload).sort()).toEqual([
      'deliveryItemIds',
      'recipeRequests',
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/credit|deduct|抵扣/i);
  });
});
