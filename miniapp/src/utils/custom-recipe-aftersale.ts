/**
 * 多份订单 · 按份售后（2026-10-21 · 第二阶段 Task 6）
 *
 * ## 为什么抽出来
 *
 * 多份订单一次交付 N 份，售后时顾客可以只挑其中一份，也可以多选。
 * 页面要回答的四个问题必须各只有一份规则：
 *
 *   · 从某张卡片点进来 → 默认选中这一份（`recipeId` 命中的那份）；
 *   · 勾选 / 取消勾选 → 选中集合怎么变化；
 *   · 每份的说明 → 只把**选中且非空**的写进 `recipeRequests`；
 *   · 老订单没有批次 → **一个追加字段都不传**，保持整单售后原样。
 *
 * 如果把这些散落在页面模板里，很容易出现"点第二份、售后却指向第一份"
 * 或者"顾客写了逐份说明、提交时只发了共用说明"这类故障。
 *
 * 这里只放**纯函数**（不碰 uni API、不发请求），可以在 node 环境直接单测。
 */

import type {
  AftersaleRecipeRequest,
  DeliveryBatchItemSummary,
} from '../api/custom-recipe';

/** 批次订单一份都没选时给顾客看的话（行内错误，不是弹窗） */
export const AFTERSALE_BATCH_SELECTION_REQUIRED = '请至少选择一份要调整的食谱';

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

/** 收敛 id 列表：去空白、去重，保持原顺序 */
function normalizeIds(values: string[] | null | undefined): string[] {
  const list = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of list) {
    const id = normalizeId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * 售后页地址。
 *
 * 订单级入口只带 `orderId`；从某份食谱卡片进来时再带 `recipeId`，
 * 售后页据此默认勾选那一份。**路由拼接只在这里做一次。**
 */
export function buildAftersaleUrl(
  orderId: string,
  recipeId?: string | null,
): string {
  const params = [`orderId=${encodeURIComponent(normalizeId(orderId))}`];
  const wantedRecipeId = normalizeId(recipeId);
  if (wantedRecipeId) {
    params.push(`recipeId=${encodeURIComponent(wantedRecipeId)}`);
  }
  return `/pages/custom-recipe/aftersale?${params.join('&')}`;
}

/**
 * 订单详情里的批次明细 → 售后页的候选食谱。
 *
 * 老订单没有批次（`null` / 不返回）时返回空数组，页面据此走整单售后，
 * 不会因为"取不到批次"就把整单表单弄没。
 */
export function resolveAftersaleBatchItems(
  batch: { items?: DeliveryBatchItemSummary[] | null } | null | undefined,
): DeliveryBatchItemSummary[] {
  const rawItems =
    batch && Array.isArray(batch.items) ? (batch.items as DeliveryBatchItemSummary[]) : [];
  const seen = new Set<string>();
  return rawItems.filter((item) => {
    const deliveryItemId = normalizeId(item?.deliveryItemId);
    if (!deliveryItemId || seen.has(deliveryItemId)) return false;
    seen.add(deliveryItemId);
    return true;
  });
}

/**
 * 打开售后页时默认选中哪几份。
 *
 * 只有链接里带了 `recipeId`、并且这一批里确实有它时才选中；
 * **查不到就一份都不选** —— 菜单已经换过一版时，瞎选第一份比不选更糟。
 */
export function preselectAftersaleDeliveryItemIds(
  items:
    | Array<Pick<DeliveryBatchItemSummary, 'deliveryItemId' | 'recipeId'>>
    | null
    | undefined,
  recipeId?: string | null,
): string[] {
  const wantedRecipeId = normalizeId(recipeId);
  if (!wantedRecipeId) return [];

  const list = Array.isArray(items) ? items : [];
  const matched = list.find(
    (item) =>
      normalizeId(item?.recipeId) === wantedRecipeId &&
      Boolean(normalizeId(item?.deliveryItemId)),
  );
  return matched ? [normalizeId(matched.deliveryItemId)] : [];
}

/**
 * 勾选 / 取消勾选一份。
 *
 * 返回新数组，不修改传入的数组 —— 页面的选择状态只通过这个函数替换。
 */
export function toggleAftersaleDeliveryItem(
  selectedIds: string[] | null | undefined,
  deliveryItemId: string,
): string[] {
  const id = normalizeId(deliveryItemId);
  const current = normalizeIds(selectedIds);
  if (!id) return current;

  return current.includes(id)
    ? current.filter((entry) => entry !== id)
    : [...current, id];
}

/**
 * 收集逐份说明。
 *
 * **只收选中且有内容的份**：后端对每条 `recipeRequests` 都要求非空说明，
 * 把空字符串传过去只会让整单提交失败。
 * 没写任何逐份说明时返回空数组，提交时只发 `deliveryItemIds`。
 */
export function buildAftersaleRecipeRequests(
  selectedIds: string[] | null | undefined,
  texts: Record<string, string> | null | undefined,
): AftersaleRecipeRequest[] {
  const map = texts && typeof texts === 'object' ? texts : {};
  return normalizeIds(selectedIds)
    .map((deliveryItemId) => ({
      deliveryItemId,
      description: String(map[deliveryItemId] ?? '').trim(),
    }))
    .filter((entry) => entry.description.length > 0);
}

export interface AftersaleSelectionPayload {
  deliveryItemIds?: string[];
  recipeRequests?: AftersaleRecipeRequest[];
}

/**
 * 提交时追加的按份字段。
 *
 * 老订单（没有批次）返回空对象：提交入参里**不会多出任何键**，
 * 整单售后的请求形状与以前完全一致。
 */
export function buildAftersaleSelectionPayload(input: {
  isBatch: boolean;
  selectedIds?: string[] | null;
  texts?: Record<string, string> | null;
}): AftersaleSelectionPayload {
  if (!input.isBatch) return {};

  const deliveryItemIds = normalizeIds(input.selectedIds);
  const recipeRequests = buildAftersaleRecipeRequests(
    deliveryItemIds,
    input.texts,
  );

  return {
    deliveryItemIds,
    // 没有逐份说明时不带这个键（老口径只有一句共用说明）
    ...(recipeRequests.length > 0 ? { recipeRequests } : {}),
  };
}

/**
 * 批次订单必须至少选一份。
 *
 * 返回空字符串 = 通过；非空 = 直接显示给顾客的行内错误。
 * 老订单恒为通过，保持原来的整单校验。
 */
export function validateAftersaleBatchSelection(input: {
  isBatch: boolean;
  selectedIds?: string[] | null;
}): string {
  if (!input.isBatch) return '';
  return normalizeIds(input.selectedIds).length > 0
    ? ''
    : AFTERSALE_BATCH_SELECTION_REQUIRED;
}
