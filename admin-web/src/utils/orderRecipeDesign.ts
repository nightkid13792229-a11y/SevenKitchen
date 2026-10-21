/**
 * 订单绑定食谱设计 · 工作台展示口径（2026-10-22 · Task 5/6）。
 *
 * 进度、容量、状态文案都收在这里：
 * 页面只绑定，测试直接跑纯函数，避免「按钮一个规则、文案另一个规则」。
 */
import type {
  OrderDesignWorkspaceSlot,
  OrderRecipeDesignStatus,
} from '@/types/orderRecipeDesign'

type OrderDesignTagType = 'info' | 'success' | 'primary'

interface OrderDesignStatusMeta {
  label: string
  tagType: OrderDesignTagType
}

const STATUS_META: Record<OrderRecipeDesignStatus, OrderDesignStatusMeta> = {
  EDITING: { label: '编辑中', tagType: 'info' },
  READY: { label: '已就绪', tagType: 'success' },
  DELIVERED: { label: '已交付', tagType: 'primary' },
  REMOVED: { label: '已移除', tagType: 'info' },
}

export function orderDesignStatusLabel(status: string): string {
  return (
    STATUS_META[status as OrderRecipeDesignStatus]?.label ??
    String(status || '')
  )
}

export function orderDesignStatusTagType(status: string): OrderDesignTagType {
  return STATUS_META[status as OrderRecipeDesignStatus]?.tagType ?? 'info'
}

/** 本单份数兜底：老订单没有 `recipeQuantity`，一律按 1 份。 */
export function normalizeOrderDesignQuantity(
  value: number | null | undefined,
): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : 1
}

export function countActiveSlots(
  slots: readonly OrderDesignWorkspaceSlot[],
): number {
  return slots.filter(
    (slot) => slot.status === 'EDITING' || slot.status === 'READY',
  ).length
}

export function countReadySlots(
  slots: readonly OrderDesignWorkspaceSlot[],
): number {
  return slots.filter((slot) => slot.status === 'READY').length
}

export function countDeliveredSlots(
  slots: readonly OrderDesignWorkspaceSlot[],
): number {
  return slots.filter((slot) => slot.status === 'DELIVERED').length
}

export interface OrderDesignProgress {
  total: number
  ready: number
  delivered: number
  /** 已就绪 + 已交付（用于画进度条，避免交付后退回 0%） */
  completed: number
  percent: number
  text: string
  /** 全部 READY，或全部 DELIVERED */
  complete: boolean
}

/**
 * 工作台进度。
 *
 * 已交付的订单 `readyCount` 会变成 0（后端只统计 READY），
 * 所以进度条必须把 DELIVERED 也算上；文案在全部交付后改说「已交付」。
 */
export function buildOrderDesignProgress(
  quantity: number | null | undefined,
  slots: readonly OrderDesignWorkspaceSlot[],
): OrderDesignProgress {
  const total = normalizeOrderDesignQuantity(quantity)
  const ready = countReadySlots(slots)
  const delivered = countDeliveredSlots(slots)
  const completed = ready + delivered
  const percent =
    total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const text =
    delivered > 0 && delivered >= total
      ? `已交付 ${delivered} / ${total} 份`
      : `已就绪 ${ready} / ${total} 份`

  return {
    total,
    ready,
    delivered,
    completed,
    percent,
    text,
    complete: delivered >= total || (ready > 0 && ready >= total),
  }
}

/** 本单 N 份是否已经建满（编辑中 + 已就绪占满容量）。 */
export function canAddOrderDesignSlot(
  quantity: number | null | undefined,
  activeCount: number,
): boolean {
  return activeCount < normalizeOrderDesignQuantity(quantity)
}

/** 恰好 N 份 READY 才允许管理员最终提交。 */
export function isOrderDesignAllReady(
  quantity: number | null | undefined,
  readyCount: number,
): boolean {
  const total = normalizeOrderDesignQuantity(quantity)
  return total > 0 && readyCount === total
}

/** 生命阶段代码 → 中文（与后端 SERIES_LIFE_STAGE_LABELS 一致）。 */
export const ORDER_DESIGN_LIFE_STAGE_LABELS: Record<string, string> = {
  PUPPY_UNDER_14_WEEKS: '小于 14 周幼犬',
  PUPPY_14_WEEKS_PLUS: '14 周以上幼犬',
  HIGH_ACTIVITY_ADULT: '普通成年犬',
  LOW_ACTIVITY_ADULT_OR_SENIOR: '低能量成年犬 / 老年犬',
  REPRODUCTION: '繁殖期',
}

export function formatOrderDesignLifeStage(
  lifeStage: string | null | undefined,
): string {
  const key = String(lifeStage || '').trim()
  if (!key) return '未标注'
  return ORDER_DESIGN_LIFE_STAGE_LABELS[key] ?? key
}

/** 模板来源 → 后台业务口径。 */
export function formatOrderDesignSourceKind(
  sourceKind: string | null | undefined,
): string {
  switch (String(sourceKind || '').toUpperCase()) {
    case 'CATALOG':
      return '橱窗食谱'
    case 'CUSTOM':
      return '顾客定制（私密）'
    default:
      return String(sourceKind || '')
  }
}
