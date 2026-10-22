/**
 * 产品线整系列发布（2026-10-22）· 纯函数
 *
 * 「系列发布」抽屉只负责编辑与展示，能不能发布**始终以后端
 * `release-readiness` 为准**。这里集中做：
 *  · 阶段状态 / 问题归属的中文与颜色；
 *  · readiness → 可编辑表单，以及表单 → PATCH 的差异计算；
 *  · 进度、版本号等展示文案。
 *
 * 不发请求、不参与门槛判断，方便单测。
 */
import type {
  SeriesReleaseIssue,
  SeriesReleaseIssueScope,
  SeriesReleaseReadiness,
  SeriesReleaseStageReadiness,
  SeriesReleaseStageStatus,
  UpdateRecipeSeriesReleaseSettingsPayload
} from '@/types/recipeDesigner'

/** 阶段状态中文：与后端 `series-release-readiness.ts` 的口径一致 */
export const SERIES_RELEASE_STAGE_STATUS_LABELS: Record<
  SeriesReleaseStageStatus,
  string
> = {
  EMPTY: '空白',
  DRAFT: '草稿',
  READY: '待发布',
  PUBLIC: '已发布'
}

/** 阻断 / 提醒归属中文 */
export const SERIES_RELEASE_ISSUE_SCOPE_LABELS: Record<
  SeriesReleaseIssueScope,
  string
> = {
  SERIES: '系列设置',
  PRESENTATION: '展示资料',
  STAGE: '生命阶段'
}

const SERIES_RELEASE_ISSUE_SCOPE_ORDER: SeriesReleaseIssueScope[] = [
  'SERIES',
  'PRESENTATION',
  'STAGE'
]

export type SeriesReleaseStageTagType =
  | 'info'
  | 'warning'
  | 'success'
  | 'primary'

export function seriesReleaseStageStatusLabel(
  status: SeriesReleaseStageStatus | string
): string {
  return (
    SERIES_RELEASE_STAGE_STATUS_LABELS[
      status as SeriesReleaseStageStatus
    ] ?? String(status || '')
  )
}

/** 空白=灰、草稿=橙、待发布=蓝、已发布=绿 */
export function seriesReleaseStageTagType(
  status: SeriesReleaseStageStatus | string
): SeriesReleaseStageTagType {
  switch (status) {
    case 'PUBLIC':
      return 'success'
    case 'READY':
      return 'primary'
    case 'DRAFT':
      return 'warning'
    default:
      return 'info'
  }
}

/** 阶段状态的一句话说明，帮助营养师知道下一步做什么 */
export function seriesReleaseStageHint(
  stage: Pick<SeriesReleaseStageReadiness, 'status'>
): string {
  switch (stage.status) {
    case 'EMPTY':
      return '还没有设计稿或阶段食谱'
    case 'DRAFT':
      return '设计稿还没保存进系列仓库'
    case 'READY':
      return '已保存进系列仓库，可随系列发布'
    case 'PUBLIC':
      return '已发布，发布时会刷新展示资料'
    default:
      return ''
  }
}

/** readiness → 发布设置表单（文本统一 trim，数组归一） */
export interface SeriesReleaseForm {
  requiredLifeStages: string[]
  coverImageUrl: string
  coverTitle: string
  sellingPoint: string
  targetHealthTags: string[]
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function isSameStringSet(left: unknown, right: unknown): boolean {
  const leftSet = normalizeStringList(left).sort()
  const rightSet = normalizeStringList(right).sort()
  if (leftSet.length !== rightSet.length) return false
  return leftSet.every((value, index) => value === rightSet[index])
}

export function emptySeriesReleaseForm(): SeriesReleaseForm {
  return {
    requiredLifeStages: [],
    coverImageUrl: '',
    coverTitle: '',
    sellingPoint: '',
    targetHealthTags: []
  }
}

export function buildSeriesReleaseForm(
  readiness:
    | Pick<SeriesReleaseReadiness, 'requiredLifeStages' | 'presentation'>
    | null
    | undefined
): SeriesReleaseForm {
  return {
    requiredLifeStages: normalizeStringList(
      readiness?.requiredLifeStages ?? []
    ),
    coverImageUrl: normalizeText(readiness?.presentation?.coverImageUrl),
    coverTitle: normalizeText(readiness?.presentation?.coverTitle),
    sellingPoint: normalizeText(readiness?.presentation?.sellingPoint),
    targetHealthTags: normalizeStringList(
      readiness?.presentation?.targetHealthTags ?? []
    )
  }
}

export function cloneSeriesReleaseForm(
  form: SeriesReleaseForm
): SeriesReleaseForm {
  return {
    requiredLifeStages: [...form.requiredLifeStages],
    coverImageUrl: form.coverImageUrl,
    coverTitle: form.coverTitle,
    sellingPoint: form.sellingPoint,
    targetHealthTags: [...form.targetHealthTags]
  }
}

/**
 * 只返回真正变化的字段（patch semantics）。
 * 显式清空时文本按 null 发送，避免把空串写进数据库。
 */
export function buildSeriesReleaseSettingsPatch(
  form: SeriesReleaseForm,
  baseline: SeriesReleaseForm
): UpdateRecipeSeriesReleaseSettingsPayload {
  const patch: UpdateRecipeSeriesReleaseSettingsPayload = {}

  if (!isSameStringSet(form.requiredLifeStages, baseline.requiredLifeStages)) {
    patch.requiredLifeStages = normalizeStringList(form.requiredLifeStages)
  }
  if (!isSameStringSet(form.targetHealthTags, baseline.targetHealthTags)) {
    patch.targetHealthTags = normalizeStringList(form.targetHealthTags)
  }

  const textFields = [
    'coverImageUrl',
    'coverTitle',
    'sellingPoint'
  ] as const
  for (const key of textFields) {
    const current = normalizeText(form[key])
    const previous = normalizeText(baseline[key])
    if (current === previous) continue
    patch[key] = current || null
  }

  return patch
}

export function hasSeriesReleaseSettingsPatch(
  patch: UpdateRecipeSeriesReleaseSettingsPayload
): boolean {
  return Object.keys(patch).length > 0
}

export function isSeriesReleaseFormDirty(
  form: SeriesReleaseForm,
  baseline: SeriesReleaseForm
): boolean {
  return hasSeriesReleaseSettingsPatch(
    buildSeriesReleaseSettingsPatch(form, baseline)
  )
}

export interface SeriesReleaseProgress {
  ready: number
  total: number
  percent: number
  label: string
}

/** 必填阶段进度（3/5 → 60%）；没配置必填阶段时明确显示未配置 */
export function seriesReleaseProgress(
  readiness:
    | Pick<SeriesReleaseReadiness, 'summary'>
    | null
    | undefined
): SeriesReleaseProgress {
  const total = Math.max(
    0,
    Number(readiness?.summary?.requiredStageCount) || 0
  )
  const ready = Math.min(
    total,
    Math.max(0, Number(readiness?.summary?.readyStageCount) || 0)
  )
  return {
    ready,
    total,
    percent: total > 0 ? Math.round((ready / total) * 100) : 0,
    label:
      total > 0
        ? `${ready}/${total} 个必填阶段就绪`
        : '还没有选择必填生命阶段'
  }
}

/** 单个阶段最新版本号 */
export function formatSeriesReleaseStageVersion(
  stage: Pick<SeriesReleaseStageReadiness, 'latestRecipeVersion'>
): string {
  const version = Number(stage.latestRecipeVersion)
  if (!Number.isFinite(version) || version <= 0) return '暂无阶段食谱'
  return `v${version}`
}

/** 整个系列最新一条阶段食谱的版本号 */
export function formatSeriesReleaseLatestVersion(
  readiness: Pick<SeriesReleaseReadiness, 'stages'> | null | undefined
): string {
  const versions = (readiness?.stages ?? [])
    .map((stage) => Number(stage.latestRecipeVersion))
    .filter((version) => Number.isFinite(version) && version > 0)
  if (versions.length === 0) return '暂无阶段食谱'
  return `v${Math.max(...versions)}`
}

export function resolveSeriesReleaseIssueScope(
  scope?: string | null
): SeriesReleaseIssueScope {
  const normalized = String(scope ?? '').trim().toUpperCase()
  return SERIES_RELEASE_ISSUE_SCOPE_ORDER.includes(
    normalized as SeriesReleaseIssueScope
  )
    ? (normalized as SeriesReleaseIssueScope)
    : 'SERIES'
}

export function seriesReleaseIssueScopeLabel(
  scope?: string | null
): string {
  return SERIES_RELEASE_ISSUE_SCOPE_LABELS[resolveSeriesReleaseIssueScope(scope)]
}

export interface SeriesReleaseIssueGroup<
  TIssue extends Pick<SeriesReleaseIssue, 'scope'>
> {
  scope: SeriesReleaseIssueScope
  label: string
  issues: TIssue[]
}

/** 阻断 / 提醒按归属分组；空分组不返回 */
export function groupSeriesReleaseIssues<
  TIssue extends Pick<SeriesReleaseIssue, 'scope'>
>(issues: TIssue[]): SeriesReleaseIssueGroup<TIssue>[] {
  return SERIES_RELEASE_ISSUE_SCOPE_ORDER.map((scope) => ({
    scope,
    label: SERIES_RELEASE_ISSUE_SCOPE_LABELS[scope],
    issues: issues.filter(
      (issue) => resolveSeriesReleaseIssueScope(issue.scope) === scope
    )
  })).filter((group) => group.issues.length > 0)
}
