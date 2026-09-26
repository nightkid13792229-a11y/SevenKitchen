/**
 * 订单类型的展示口径（列表页与详情页共用）
 *
 * 三种类型的标签颜色与文案只在这里定义一次：
 * 之前是两边各写一个三元表达式，加"试吃装"时很容易改一边漏一边。
 */
import { OrderType } from '@/types/order';

type TagType = 'success' | 'warning' | 'info' | 'primary' | 'danger';

const LABELS: Record<string, string> = {
  [OrderType.FRESH_FOOD]: '鲜食制作',
  [OrderType.CUSTOM_SERVICE]: '定制服务',
  [OrderType.TASTING_PACK]: '试吃装（现货）',
};

/** 列表页用的短文案 */
const SHORT_LABELS: Record<string, string> = {
  [OrderType.FRESH_FOOD]: '鲜食',
  [OrderType.CUSTOM_SERVICE]: '定制',
  [OrderType.TASTING_PACK]: '试吃装',
};

const TAG_TYPES: Record<string, TagType> = {
  [OrderType.FRESH_FOOD]: 'success',
  [OrderType.CUSTOM_SERVICE]: 'warning',
  // 现货与需排产的鲜食区分开，用中性蓝
  [OrderType.TASTING_PACK]: 'primary',
};

export function orderTypeLabel(type?: string, short = false): string {
  const table = short ? SHORT_LABELS : LABELS;
  return table[type ?? ''] ?? '未知类型';
}

export function orderTypeTagType(type?: string): TagType {
  return TAG_TYPES[type ?? ''] ?? 'info';
}

/** 现货订单没有制作日期，也不需要排产 —— 详情页据此隐藏相关区块 */
export function isStockOrder(type?: string): boolean {
  return type === OrderType.TASTING_PACK;
}
