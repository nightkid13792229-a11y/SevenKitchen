/**
 * 多份交付 · 页面选择与路由（2026-10-21 · 第二阶段 Task 4）
 *
 * ## 为什么抽出来
 *
 * 多份订单交付的是**一个批次里的 N 份食谱**，页面拿到的是 `items[]`。
 * 三张页面（订单详情、交付第 1 页、采购第 2 页）都要回答同一个问题：
 * 「现在看的是哪一份？」规则必须只有一份：
 *
 *   · 传了 `recipeId` → 命中那一份；
 *   · 没传 / 查不到 → 第一份（链接旧了也不能白屏）。
 *
 * 如果每页各写一个 `find()`，就会出现"卡片点第二份、详情显示第一份"
 * 这种看起来正常但内容是错的故障。
 *
 * 老单份交付（`content` 形状）走同一函数的另一支，**字段原样透传**，
 * 保证老订单的展示一个字都不变。
 *
 * 这里只放**纯函数**（不碰 uni API、不发请求），可以在 node 环境直接单测。
 */

import type {
  DeliveryBatchContent,
  DeliveryBatchContentItem,
  DeliveryContent,
  OrderDelivery,
} from '../api/custom-recipe';

export type CustomRecipeDeliveryResponse =
  | OrderDelivery
  | DeliveryBatchContent;

/** 页面真正要渲染的那一份（老单份 / 批次中的某一份，形状一致） */
export interface ResolvedDelivery {
  /** 这批是不是多份批次 */
  isBatch: boolean;
  /** 本批共几份（老单份恒为 1） */
  batchSize: number;
  /** 选中项在批次里的下标（老单份恒为 0） */
  selectedIndex: number;
  content: DeliveryContent;
  version: number;
  deliveredAt: string;
  confirmedAt: string | null;
  itemCodes: string[];
  /** 业务编号（不是数据库主键）—— 路由与售后都用它 */
  recipeId: string | null;
  recipeName: string | null;
  recipeCoverImageUrl: string | null;
}

/** 响应是不是多份批次（老单份没有 `batchId`） */
export function isDeliveryBatchContent(
  delivery: CustomRecipeDeliveryResponse | null | undefined,
): delivery is DeliveryBatchContent {
  return Boolean(
    delivery &&
      typeof delivery === 'object' &&
      'batchId' in delivery &&
      Array.isArray((delivery as DeliveryBatchContent).items),
  );
}

/**
 * 选出要展示的那一份，返回下标。
 *
 * 空批次返回 -1；传了 recipeId 但查不到时回落到第一份 ——
 * 顾客从旧链接/历史消息点进来时，看到第一份总比看到空白页好。
 */
export function findDeliveryBatchItemIndex(
  items: DeliveryBatchContentItem[] | null | undefined,
  recipeId?: string | null,
): number {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return -1;

  const wanted = String(recipeId ?? '').trim();
  if (!wanted) return 0;

  const index = list.findIndex(
    (item) => String(item?.recipeId ?? '') === wanted,
  );
  return index >= 0 ? index : 0;
}

/** 按 recipeId 取批次中的一份；默认第一份 */
export function selectDeliveryBatchItem(
  items: DeliveryBatchContentItem[] | null | undefined,
  recipeId?: string | null,
): DeliveryBatchContentItem | null {
  const list = Array.isArray(items) ? items : [];
  const index = findDeliveryBatchItemIndex(list, recipeId);
  return index >= 0 ? list[index] : null;
}

/**
 * 把后端响应收敛成页面可直接渲染的一份。
 *
 * 老单份：`content` / `version` / `itemCodes` 原样返回；
 * 多份批次：取 `items` 里命中的那一份，带上批次级的版本与交付时间。
 */
export function resolveDeliverySelection(
  delivery: CustomRecipeDeliveryResponse | null | undefined,
  recipeId?: string | null,
): ResolvedDelivery | null {
  if (!delivery) return null;

  if (isDeliveryBatchContent(delivery)) {
    const index = findDeliveryBatchItemIndex(delivery.items, recipeId);
    if (index < 0) return null;

    const item = delivery.items[index];
    return {
      isBatch: true,
      batchSize: delivery.items.length,
      selectedIndex: index,
      content: item.content,
      version: delivery.version,
      deliveredAt: delivery.deliveredAt,
      confirmedAt: delivery.confirmedAt ?? null,
      itemCodes: Array.isArray(item.itemCodes) ? item.itemCodes : [],
      recipeId: item.recipeId ?? null,
      recipeName: item.recipeName ?? item.content?.recipe?.name ?? null,
      recipeCoverImageUrl: item.recipeCoverImageUrl ?? null,
    };
  }

  return {
    isBatch: false,
    batchSize: 1,
    selectedIndex: 0,
    content: delivery.content,
    version: delivery.version,
    deliveredAt: delivery.deliveredAt,
    confirmedAt: delivery.confirmedAt ?? null,
    itemCodes: Array.isArray(delivery.itemCodes) ? delivery.itemCodes : [],
    recipeId: delivery.content?.recipe?.recipeId ?? null,
    recipeName: delivery.content?.recipe?.name ?? null,
    recipeCoverImageUrl: delivery.content?.recipe?.coverImageUrl ?? null,
  };
}

/** 订单详情顶部那句「本次共交付 N 份」—— 文案只有一份 */
export function deliveryBatchCountText(count: number): string {
  const numeric = Number(count);
  const total =
    Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0;
  return `本次共交付 ${total} 份`;
}

function buildQuery(orderId: string, recipeId?: string | null): string {
  const params = [
    `orderId=${encodeURIComponent(String(orderId ?? '').trim())}`,
  ];
  const wantedRecipeId = String(recipeId ?? '').trim();
  if (wantedRecipeId) {
    params.push(`recipeId=${encodeURIComponent(wantedRecipeId)}`);
  }
  return params.join('&');
}

/** 订单详情某张卡片 → 交付第 1 页（必须带上这一份的 recipeId） */
export function buildDeliveryDetailUrl(
  orderId: string,
  recipeId?: string | null,
): string {
  return `/pages/custom-recipe/delivery?${buildQuery(orderId, recipeId)}`;
}

/** 交付第 1 页 → 自己做（DIY 配置页） */
export function buildDeliveryDiyUrl(
  orderId: string,
  recipeId?: string | null,
  dogId?: string | null,
): string {
  const params = [
    `orderId=${encodeURIComponent(String(orderId ?? '').trim())}`,
  ];
  const wantedRecipeId = String(recipeId ?? '').trim();
  if (wantedRecipeId) {
    params.push(`recipeId=${encodeURIComponent(wantedRecipeId)}`);
  }
  const wantedDogId = String(dogId ?? '').trim();
  if (wantedDogId) {
    params.push(`dogId=${encodeURIComponent(wantedDogId)}`);
  }
  return `/pages/recipe-diy/index?${params.join('&')}`;
}

/** 交付第 1 页 / 制作单 → 订购成品 */
export function buildFinishedFoodOrderUrl(
  recipeId: string,
  dogId?: string | null,
): string {
  const params = [
    `recipeId=${encodeURIComponent(String(recipeId ?? '').trim())}`,
  ];
  const wantedDogId = String(dogId ?? '').trim();
  if (wantedDogId) {
    params.push(`dogId=${encodeURIComponent(wantedDogId)}`);
  }
  return `/pages/recipe-order/index?${params.join('&')}`;
}
