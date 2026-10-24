/**
 * 顾客端订单类型的文案单一来源（2026-10-24）。
 *
 * 为什么单独一个文件：`定制 / 成品 / 补剂` 这三个名字原先散在
 * 订单列表的类型 Tab、卡片角标、定制专属列表、首页/我的入口里，
 * 每改一次名字都要全仓搜。现在顾客端统一读这里。
 *
 * ⚠️ 员工端（staff-*）保留自己的内部短名（定制/成品/补剂），不跟这里混：
 * 内部沟通要短，顾客端要准确。
 */

export type CustomerOrderType = 'custom' | 'food' | 'supplement';
export type OrderTypeFilter = CustomerOrderType | 'ALL';

export interface OrderTypeMeta {
  /** 顾客端完整名称：食谱定制 / 成品鲜食 / 预分装补剂 */
  label: string;
  /** 与色条、角标一致的类型色调 */
  tone: CustomerOrderType;
}

export const ORDER_TYPE_META: Record<CustomerOrderType, OrderTypeMeta> = {
  custom: { label: '食谱定制', tone: 'custom' },
  food: { label: '成品鲜食', tone: 'food' },
  supplement: { label: '预分装补剂', tone: 'supplement' },
};

/** 类型筛选的 Tab；顺序就是顾客看到的顺序 */
export const ORDER_TYPE_TABS: Array<{
  value: OrderTypeFilter;
  label: string;
}> = [
  { value: 'ALL', label: '全部' },
  { value: 'custom', label: ORDER_TYPE_META.custom.label },
  { value: 'food', label: ORDER_TYPE_META.food.label },
  { value: 'supplement', label: ORDER_TYPE_META.supplement.label },
];

/**
 * 类型码 → 顾客端名称。
 * 未知码返回空串，不把内部码直接丢给顾客。
 */
export function orderTypeLabel(type: CustomerOrderType | string): string {
  const meta = ORDER_TYPE_META[type as CustomerOrderType];
  return meta ? meta.label : '';
}
