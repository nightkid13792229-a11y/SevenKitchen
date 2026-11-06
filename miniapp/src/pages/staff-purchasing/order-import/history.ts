/**
 * 「识别记录」只读历史页的数据整形（2026-11-06）。
 *
 * 后端 listByPurchaseList 一直返回草稿 + 已确认（放弃的不返回），
 * 但核对页只加载草稿，所以确认之后就没有任何地方能回看 AI 当时认了什么。
 * 这个模块只做展示口径：排序、状态文案、行统计、金额回退，方便单测。
 */

export type ImportHistoryLine = {
  id?: string;
  rawName?: string;
  qty?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
  ingredientId?: string | null;
  procurementSkuId?: string | null;
  isPersonal?: boolean;
  state?: string;
};

export type ImportHistoryRow = {
  id: string;
  status?: string;
  channel?: string | null;
  orderTime?: string | null;
  createdAt?: string | null;
  confirmedAt?: string | null;
  paid?: number | null;
  subtotal?: number | null;
  shippingFee?: number | null;
  packagingFee?: number | null;
  imageUrls?: string[];
  lines?: ImportHistoryLine[];
};

export type ImportHistoryStatus = {
  text: string;
  tone: 'done' | 'pending';
};

export type ImportHistoryLineStats = {
  total: number;
  matched: number;
  pending: number;
  personal: number;
};

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function numberOf(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 最近识别的排最前；没有创建时间就退回下单时间，都没有的沉底。 */
export function sortHistoryImports<T extends ImportHistoryRow>(rows: T[]): T[] {
  return [...(rows || [])].sort((left, right) => {
    const a = timeOf(left.createdAt) ?? timeOf(left.orderTime);
    const b = timeOf(right.createdAt) ?? timeOf(right.orderTime);
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });
}

/** 已确认 = 已经生成过采购记录；其余（草稿）都还算待核对。 */
export function historyStatus(row: ImportHistoryRow): ImportHistoryStatus {
  return row?.status === 'CONFIRMED'
    ? { text: '已生成采购记录', tone: 'done' }
    : { text: '待核对', tone: 'pending' };
}

/** 行数口径：已匹配 / 待处理（还没选原料或商品）/ 个人采购。 */
export function historyLineStats(row: ImportHistoryRow): ImportHistoryLineStats {
  const lines = Array.isArray(row?.lines) ? row.lines : [];
  let matched = 0;
  let pending = 0;
  let personal = 0;

  for (const line of lines) {
    if (line?.isPersonal) {
      personal += 1;
      continue;
    }
    if (line?.ingredientId && line?.procurementSkuId) {
      matched += 1;
      continue;
    }
    pending += 1;
  }

  return { total: lines.length, matched, pending, personal };
}

/**
 * 凭证金额：优先实付，其次商品小计，最后按行累加。
 * 一分钱都没读到就返回 null —— 不要编成 0 元。
 */
export function historyAmount(row: ImportHistoryRow): number | null {  const paid = numberOf(row?.paid);
  if (paid !== null) return paid;

  const subtotal = numberOf(row?.subtotal);
  if (subtotal !== null) return subtotal;

  const lines = Array.isArray(row?.lines) ? row.lines : [];
  let sum = 0;
  let counted = 0;
  for (const line of lines) {
    const amount = numberOf(line?.lineTotal);
    if (amount === null) continue;
    sum += amount;
    counted += 1;
  }
  if (counted === 0) return null;
  return Math.round(sum * 100) / 100;
}

/**
 * 只有还没完成的清单，草稿才能回核对页继续改。
 * 清单已完成/已报销时，回核对页也提交不了，历史页就别给这个入口。
 */
export function canContinueReview(listStatus: string | null | undefined): boolean {
  return listStatus === 'PENDING';
}
