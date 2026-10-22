/**
 * ③ 档案成型与 ④ 终检共用的纯规则。
 *
 * 这里只放「怎么念、算不算齐、主档案选谁」这类可测的判定；
 * 真正能不能提交永远以后端终检为准，前端不重算营养规则。
 */
import type {
  CheckItem,
  CoverageCategory,
  ExceptionRecord,
  FinalCheckResult,
  NutritionEvidenceEntry,
  PreparationState,
  ProfileDraft
} from '@/types/ingredientCreation'
import { groupCheckItems } from './checkPresentation'
import { resolveDefaultPrimaryState } from './stateCoverage'

/** 档案覆盖统计：目录里有多少字段、填了多少、还缺哪些。 */
export interface ProfileCoverage {
  filled: number
  total: number
  /** 0–100，保留一位小数 */
  percent: number
  missingFields: string[]
  missingLabels: string[]
}

export interface ProfileCoverageField {
  fieldPath: string
  label: string
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 按营养字段目录统计一份档案的覆盖率。
 *
 * 口径与后端缝合方案一致：**目录里的全部字段**都算分母（不是只算宏量），
 * 这样 ③ 顶部「缺 xx」与 ② 站缝合方案的缺失清单指同一批字段。
 * `finalValue = 0` 是「有值」，只有 `null` / 缺行才算缺失。
 */
export function computeProfileCoverage(
  entries: readonly Pick<NutritionEvidenceEntry, 'fieldPath' | 'finalValue'>[],
  fields: readonly ProfileCoverageField[]
): ProfileCoverage {
  const valueByPath = new Map<string, number | null>()
  for (const entry of entries) {
    if (entry && typeof entry.fieldPath === 'string') {
      valueByPath.set(entry.fieldPath, toFiniteNumber(entry.finalValue))
    }
  }

  const missingFields: string[] = []
  const missingLabels: string[] = []
  let filled = 0

  for (const field of fields) {
    const value = valueByPath.get(field.fieldPath)
    if (value === null || value === undefined) {
      missingFields.push(field.fieldPath)
      missingLabels.push(field.label)
    } else {
      filled += 1
    }
  }

  const total = fields.length
  const percent =
    total > 0 ? Math.round((filled / total) * 1000) / 10 : 0

  return { filled, total, percent, missingFields, missingLabels }
}

/**
 * ③ 顶部的「营养待补」文案。
 *
 * 通过率不设硬门槛：只要有缺项就持续显示，不拦下一步。
 * 百分比的 0 / 100 边界按原样显示，避免出现 `100.0` 或 `NaN`。
 */
export function formatCoverageNotice(
  percent: number,
  missingLabels: readonly string[],
  limit: number = Number.MAX_SAFE_INTEGER
): string {
  if (missingLabels.length === 0) {
    return ''
  }

  const safePercent = Number.isFinite(percent)
    ? Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10
    : 0
  const labels =
    missingLabels.length > limit
      ? `${missingLabels.slice(0, Math.max(0, limit)).join('、')} 等 ${missingLabels.length} 项`
      : missingLabels.join('、')

  return `营养待补：覆盖率 ${safePercent}%，缺 ${labels}`
}

/** 证据账本的状态文案；四档与设计文档第六节一致。 */
export const EVIDENCE_STATUS_META: Readonly<
  Record<
    NutritionEvidenceEntry['status'],
    { label: string; type: 'success' | 'primary' | 'warning' | 'info' }
  >
> = {
  DIRECT: { label: '直接', type: 'success' },
  CONVERTED: { label: '换算', type: 'primary' },
  FILLED: { label: '补位', type: 'warning' },
  MANUAL: { label: '人工裁决', type: 'warning' }
}

/** 一条例外记录是否真的「可查」：理由、操作人、时间缺一不可。 */
export function isExceptionRecordComplete(
  record: Partial<ExceptionRecord> | null | undefined
): boolean {
  if (!record) {
    return false
  }

  return (
    typeof record.code === 'string' &&
    record.code.trim().length > 0 &&
    typeof record.reason === 'string' &&
    record.reason.trim().length > 0 &&
    typeof record.approvedBy === 'string' &&
    record.approvedBy.trim().length > 0 &&
    typeof record.approvedAt === 'string' &&
    record.approvedAt.trim().length > 0
  )
}

/**
 * 每个「可例外」规则都必须有一条完整、同 code 的放行记录。
 *
 * 例外记录只带 `code`（类型文件里的形状），所以同一条规则出现多项时
 * 共用一条理由；这是既有数据契约，页面不能自己发明字段。
 */
export function areAllExceptionableApproved(
  items: readonly CheckItem[],
  exceptions: readonly ExceptionRecord[]
): boolean {
  if (items.length === 0) {
    return true
  }

  const approvedCodes = new Set(
    exceptions.filter(isExceptionRecordComplete).map((item) => item.code)
  )

  return items.every((item) => approvedCodes.has(item.code))
}

/**
 * ④ 站「下一步」的唯一闸门：
 * 后端的 `blocking` 为空，且所有 `exceptionable` 都有完整理由与操作人。
 * 提醒不阻断。
 */
export function canLeaveCheckStep(
  result: FinalCheckResult | null | undefined,
  exceptions: readonly ExceptionRecord[]
): boolean {
  const grouped = groupCheckItems(result)
  return (
    grouped.blocking.length === 0 &&
    areAllExceptionableApproved(grouped.exceptionable, exceptions)
  )
}

const PREPARATION_STATE_ORDER: readonly PreparationState[] = ['RAW', 'COOKED']

/** 把档案按「先生后熟」排序；同状态保持原顺序。 */
export function sortProfilesByState<T extends Pick<ProfileDraft, 'preparationState'>>(
  profiles: readonly T[]
): T[] {
  return profiles
    .map((profile, index) => ({ profile, index }))
    .sort(
      (left, right) =>
        PREPARATION_STATE_ORDER.indexOf(left.profile.preparationState) -
          PREPARATION_STATE_ORDER.indexOf(right.profile.preparationState) ||
        left.index - right.index
    )
    .map(({ profile }) => profile)
}

function isValidCategory(category: unknown): category is CoverageCategory {
  return (
    category === 'MEAT_ORGAN' ||
    category === 'STARCHY_VEGETABLE' ||
    category === 'OTHER'
  )
}

/**
 * ⑥ 收尾时选哪份做「主档案」：
 * 1. ② 站选的缝合主来源对应哪份档案，就是哪份；
 * 2. 否则按 ① 站类别的默认主状态；
 * 3. 都对不上时退回第一份。
 */
export function resolvePrimaryProfileIndex(
  profiles: readonly Pick<ProfileDraft, 'preparationState' | 'sourceRecordId'>[],
  input: {
    primarySourceRecordId?: string | null
    category?: CoverageCategory | null
  }
): number {
  if (profiles.length === 0) {
    return -1
  }

  const primarySourceRecordId = input.primarySourceRecordId
  if (primarySourceRecordId) {
    const bySource = profiles.findIndex(
      (profile) => profile.sourceRecordId === primarySourceRecordId
    )
    if (bySource >= 0) {
      return bySource
    }
  }

  if (isValidCategory(input.category)) {
    const preferredState = resolveDefaultPrimaryState(input.category)
    const byState = profiles.findIndex(
      (profile) => profile.preparationState === preferredState
    )
    if (byState >= 0) {
      return byState
    }
  }

  return 0
}
