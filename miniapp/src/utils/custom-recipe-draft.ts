/**
 * 定制食谱页的本地草稿（2026-10-19）。
 *
 * 老板确认：草稿先放手机本地。
 *
 * 为什么需要它：
 *   定制页里的文字、报告、体重方向在付款前都只是“这一单的草稿”。
 *   如果不存草稿，用户清空/修改后离开再回来，页面又会从狗狗档案预填，
 *   看起来像“清空白清了”；而付款前也不应该改狗狗档案。
 *
 * 存储粒度：按“顾客 + 狗”各存一份，互不覆盖。
 * 过期时间：7 天。过期草稿不再恢复；页面负责清理其中的 COS 文件。
 */

export interface CustomRecipeReportDraft {
  attachments: string[]
  attachmentKeys: string[]
  testDate: string | null
  testMethod: string
  ocrText: string | null
  summary: string | null
  results: Array<{ allergen: string; level: string }>
}

export interface CustomRecipeDraft {
  dogId: string
  updatedAt: number
  form: Record<string, any>
  hasFoodAllergy: boolean | null
  weightGoalChoice: 'LOSS' | 'GAIN' | 'MAINTAIN' | null
  prefilledAllergyText: string
  /** 最近一次由这份草稿创建的订单；用于付款后清理报告/附件草稿 */
  lastOrderId: string | null
}

const STORAGE_KEY = 'custom_recipe_drafts'
export const CUSTOM_RECIPE_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

type DraftMap = Record<string, CustomRecipeDraft>

function buildKey(customerId: string, dogId: string) {
  return `${customerId}:${dogId}`
}

function readDraftMap(): DraftMap {
  try {
    const value = uni.getStorageSync(STORAGE_KEY)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch (error) {
    console.warn('[CustomRecipeDraft] 读取草稿失败:', error)
    return {}
  }
}

function writeDraftMap(value: DraftMap) {
  try {
    uni.setStorageSync(STORAGE_KEY, value)
  } catch (error) {
    console.warn('[CustomRecipeDraft] 保存草稿失败:', error)
  }
}

function normalizeDraft(value: any): CustomRecipeDraft | null {
  if (!value || typeof value !== 'object') return null
  const dogId = String(value.dogId || '').trim()
  const form = value.form && typeof value.form === 'object' && !Array.isArray(value.form)
    ? value.form
    : null
  if (!dogId || !form) return null

  const hasFoodAllergy =
    value.hasFoodAllergy === true || value.hasFoodAllergy === false
      ? value.hasFoodAllergy
      : null
  const weightGoalChoice = ['LOSS', 'GAIN', 'MAINTAIN'].includes(value.weightGoalChoice)
    ? value.weightGoalChoice
    : null

  return {
    dogId,
    updatedAt: Number(value.updatedAt) || 0,
    form,
    hasFoodAllergy,
    weightGoalChoice,
    prefilledAllergyText: String(value.prefilledAllergyText || ''),
    lastOrderId: value.lastOrderId ? String(value.lastOrderId) : null,
  }
}

export function saveCustomRecipeDraft(
  customerId: string,
  dogId: string,
  draft: Omit<CustomRecipeDraft, 'dogId' | 'updatedAt' | 'lastOrderId'> & {
    lastOrderId?: string | null
    updatedAt?: number
  },
): void {
  if (!customerId || !dogId) return
  const current = readDraftMap()
  const previous = normalizeDraft(current[buildKey(customerId, dogId)])
  const normalized = normalizeDraft({
    ...draft,
    dogId,
    // 普通自动保存不携带订单号时，不能把已记录的订单号冲掉
    lastOrderId: (draft as any).lastOrderId ?? previous?.lastOrderId ?? null,
    updatedAt: draft.updatedAt || Date.now(),
  })
  if (!normalized) return
  current[buildKey(customerId, dogId)] = normalized
  writeDraftMap(current)
}

export function loadCustomRecipeDraft(
  customerId: string,
  dogId: string,
): CustomRecipeDraft | null {
  if (!customerId || !dogId) return null
  const current = readDraftMap()
  return normalizeDraft(current[buildKey(customerId, dogId)])
}

export function clearCustomRecipeDraft(customerId: string, dogId: string): void {
  if (!customerId || !dogId) return
  const current = readDraftMap()
  const key = buildKey(customerId, dogId)
  if (!(key in current)) return
  delete current[key]
  writeDraftMap(current)
}

export function isCustomRecipeDraftExpired(
  draft: CustomRecipeDraft | null,
  now = Date.now(),
): boolean {
  if (!draft) return false
  return draft.updatedAt <= 0 || now - draft.updatedAt > CUSTOM_RECIPE_DRAFT_TTL_MS
}

/**
 * 已付款后保留“下次还能用”的选择，但清掉只属于上一单的报告/附件草稿。
 *
 * 2026-10-21 老板确认：已付款的顾客下一次也应看到上次的选择，
 * 不要重复填；但报告已经在狗狗档案里，不能再把上一单的报告原件
 * 复制成新单的草稿（会重复入库、重复占用文件）。
 *
 * 保留：目标方向、当前食物、换粮原因、肠胃情况、偏好/忌口、备注、
 *       过敏文本、体重方向、是否同步档案。
 * 清掉：reportDrafts、attachmentUrls、attachmentKeys。
 */
export function retainCustomRecipeChoicesAfterPayment(
  customerId: string,
  dogId: string,
): void {
  if (!customerId || !dogId) return
  const current = readDraftMap()
  const key = buildKey(customerId, dogId)
  const draft = normalizeDraft(current[key])
  if (!draft) return

  const form = { ...draft.form }
  form.reportDrafts = []
  form.attachmentUrls = []
  form.attachmentKeys = []

  current[key] = {
    ...draft,
    form,
    lastOrderId: null,
    // 重新记为最近使用，避免刚付完款就因 7 天过期被清
    updatedAt: Date.now(),
  }
  writeDraftMap(current)
}


/** 订单创建成功后记住订单号，供下次进入时判断是否已付款 */
export function markCustomRecipeDraftSubmitted(
  customerId: string,
  dogId: string,
  orderId: string,
): void {
  if (!customerId || !dogId || !orderId) return
  const current = readDraftMap()
  const key = buildKey(customerId, dogId)
  const draft = normalizeDraft(current[key])
  if (!draft) return
  current[key] = {
    ...draft,
    lastOrderId: orderId,
    updatedAt: Date.now(),
  }
  writeDraftMap(current)
}
