import { request } from '../utils/api'

/**
 * 体重管理计划 API（阶段 B2）
 *
 * 对应后端 `/api/v1/dogs/:dogId/weight-goal-plan/*`。
 *
 * 业务规则（速率、力度校正、安全边界）全在后端，这里只做透传 ——
 * 顾客端**不重复实现任何算法**，否则迟早两边算出不一样的数字。
 */

export type WeightGoalDirection = 'LOSS' | 'GAIN'

export type WeightGoalPlanStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'MAINTENANCE'
  | 'COMPLETED'
  | 'CANCELLED'

export type WeightGoalIntensityKey = 'STANDARD' | 'GENTLE' | 'GENTLER'

export interface WeightGoalPlanView {
  id: string
  dogId: string
  direction: WeightGoalDirection
  status: WeightGoalPlanStatus

  startWeightKg: number
  startBcsScore: number
  targetWeightKg: number
  suggestedTargetWeightKg: number

  currentKcal: number
  floorKcal: number
  ceilingKcal: number
  targetRatePercentPerWeek: number

  startDate: string
  estimatedGoalDate: string | null
  nextReviewDate: string | null
  lastWeighInDate: string | null
  lastRatePercentPerWeek: number | null

  pausedReason: string | null
  maintenanceStartedAt: string | null

  currentWeightKg: number
  /** 朝目标已经走完的量（公斤，正数） */
  changedKg: number
  /** 距离目标还差多少（公斤，正数） */
  remainingKg: number
  progressPercent: number
  goalReached: boolean

  intensity: { key: string; label: string; factor: number }
  availableIntensities: Array<{
    key: string
    label: string
    kcal: number
    allowed: boolean
  }>
  notes: string[]
}

export interface WeightGoalSuggestionView {
  direction: WeightGoalDirection
  currentWeightKg: number
  bcsScore: number
  targetWeightKg: number
  suggestedTargetWeightKg: number
  currentKcal: number
  floorKcal: number
  ceilingKcal: number
  targetRatePercentPerWeek: number
  estimatedGoalDate: string | null
  requiresScreening: boolean
  notes: string[]
}

export interface WeightGoalAdjustmentView {
  id: string
  reason: string
  energyBefore: number
  energyAfter: number
  ratePercentPerWeek: number | null
  weightKg: number | null
  note: string | null
  createdAt: string
}

export interface WeightGoalScreeningQuestion {
  key: string
  title: string
}

export const weightGoalPlanApi = {
  /**
   * 系统建议（不落库）＋ 增重排查的问题清单。
   *
   * `direction` 是**顾客坚持要的方向**（定制页「我还是想增重/减重」）：
   * 只在体况理想、系统本来不给建议时才生效 —— 偏胖/偏瘦的狗仍按系统方向走，
   * 免得给偏胖的狗建出增重计划（后端 domain 里有这条边界）。
   */
  suggestion: (dogId: string, direction?: 'LOSS' | 'GAIN') =>
    request<{
      suggestion: WeightGoalSuggestionView | null
      screeningQuestions: WeightGoalScreeningQuestion[]
    }>({
      url:
        `/dogs/${dogId}/weight-goal-plan/suggestion` +
        (direction ? `?direction=${direction}` : ''),
      method: 'GET',
    }),

  current: (dogId: string) =>
    request<WeightGoalPlanView | null>({
      url: `/dogs/${dogId}/weight-goal-plan`,
      method: 'GET',
    }),

  adjustments: (dogId: string) =>
    request<WeightGoalAdjustmentView[]>({
      url: `/dogs/${dogId}/weight-goal-plan/adjustments`,
      method: 'GET',
    }),

  create: (
    dogId: string,
    data: {
      targetWeightKg?: number
      intensity?: WeightGoalIntensityKey
      screening?: Record<string, boolean>
    },
  ) =>
    request<WeightGoalPlanView>({
      url: `/dogs/${dogId}/weight-goal-plan`,
      method: 'POST',
      data,
    }),

  updateTarget: (dogId: string, targetWeightKg: number) =>
    request<WeightGoalPlanView>({
      url: `/dogs/${dogId}/weight-goal-plan/target`,
      method: 'PUT',
      data: { targetWeightKg },
    }),

  updateIntensity: (dogId: string, intensity: WeightGoalIntensityKey) =>
    request<WeightGoalPlanView>({
      url: `/dogs/${dogId}/weight-goal-plan/intensity`,
      method: 'PUT',
      data: { intensity },
    }),

  resume: (dogId: string) =>
    request<WeightGoalPlanView>({
      url: `/dogs/${dogId}/weight-goal-plan/resume`,
      method: 'PUT',
    }),

  end: (dogId: string) =>
    request<{ ended: boolean }>({
      url: `/dogs/${dogId}/weight-goal-plan`,
      method: 'DELETE',
    }),

  cancel: (dogId: string) =>
    request<{ cancelled: boolean }>({
      url: `/dogs/${dogId}/weight-goal-plan/cancel`,
      method: 'DELETE',
    }),
}

// ==================== 展示用文案（纯前端，不含任何算法） ====================

export function getPlanStatusLabel(status: WeightGoalPlanStatus): string {
  const map: Record<WeightGoalPlanStatus, string> = {
    ACTIVE: '进行中',
    PAUSED: '已暂停',
    MAINTENANCE: '维持期',
    COMPLETED: '已结束',
    CANCELLED: '已取消',
  }
  return map[status] || '未知'
}

export function getDirectionLabel(direction: WeightGoalDirection): string {
  return direction === 'LOSS' ? '减重' : '增重'
}

/** 速率文案：约定后端返回的是「带符号」值（掉重为负） */
export function formatRate(rate: number | null): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return '还没有足够的数据'
  }
  const abs = Math.abs(rate).toFixed(1)
  if (Math.abs(rate) < 0.05) {
    return '基本持平'
  }
  return rate < 0 ? `近两周 −${abs}%/周` : `近两周 +${abs}%/周`
}

/**
 * 速率是否在目标区间内。
 *
 * ⚠️ 阈值这里只是**为了给顾客一句「正常 / 偏慢 / 偏快」的话**，
 * 不参与任何调整决策 —— 调整由后端按 SACN5 的规则做。
 */
export function describeRate(
  rate: number | null,
  direction: WeightGoalDirection,
): { text: string; tone: 'normal' | 'slow' | 'fast' | 'unknown' } {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return { text: '还没有足够的数据', tone: 'unknown' }
  }
  // 换算成「朝目标推进」的速率
  const progress = direction === 'LOSS' ? -rate : rate
  if (progress < 0.5) {
    return { text: '比目标慢一些', tone: 'slow' }
  }
  if (progress > 2) {
    return { text: '比目标快一些', tone: 'fast' }
  }
  return { text: '正常', tone: 'normal' }
}

/** 距下次称重还有几天；负数表示已过期 */
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr).getTime()
  if (Number.isNaN(target)) return null
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24))
}
