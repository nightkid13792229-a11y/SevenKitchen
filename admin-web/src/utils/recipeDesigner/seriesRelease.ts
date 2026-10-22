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
  SeriesReleaseState,
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
  stage: Pick<SeriesReleaseStageReadiness, 'status'> & SeriesReleaseStageUpdateView
): string {
  if (isSeriesReleaseStagePendingUpdate(stage)) {
    const latest = normalizeSeriesReleaseVersion(stage.latestRecipeVersion)
    const published = normalizeSeriesReleaseVersion(
      stage.publishedRecipeVersion
    )
    if (latest !== null && published !== null) {
      return `已发布 v${published}，最新 v${latest} 待重新发布`
    }
    return '有更新草稿等待重新发布'
  }
  switch (stage.status) {
    case 'EMPTY':
      return '还没有设计稿或阶段食谱'
    case 'DRAFT':
      return '设计稿还没保存进系列仓库'
    case 'READY':
      return '已保存进系列仓库，可随系列发布'
    case 'PUBLIC':
      return '已发布，重新发布时会刷新展示资料'
    default:
      return ''
  }
}

/* ------------------------------------------------------------------ *
 * 重新发布 / 下架（2026-10-22）
 *
 * 后端 readiness 新增 releaseState / hasPendingUpdate 等字段；
 * 下面的函数对**旧后端响应**也做兜底（字段缺失时按 businessStatus +
 * 版本号推断），这样前端可以先上线，不依赖后端同一次部署。
 * ------------------------------------------------------------------ */

export const SERIES_RELEASE_STATES: SeriesReleaseState[] = [
  'UNPUBLISHED',
  'PUBLISHED',
  'NEEDS_UPDATE'
]

/** 系列展示状态中文：未上线 / 待重新发布 / 已上线（最新） */
export const SERIES_RELEASE_STATE_LABELS: Record<SeriesReleaseState, string> = {
  UNPUBLISHED: '未上线',
  PUBLISHED: '已上线（最新）',
  NEEDS_UPDATE: '待重新发布'
}

/** 判断待更新 / 推导系列状态时需要的最小字段集合 */
export interface SeriesReleaseStageUpdateView {
  latestRecipeVersion?: number | null
  publishedRecipeVersion?: number | null
  hasPendingUpdate?: boolean | null
}

export type SeriesReleaseStateSource = {
  releaseState?: SeriesReleaseState | string | null
  businessStatus?: string | null
  hasPendingUpdates?: boolean | null
  stages?: SeriesReleaseStageUpdateView[] | null
  summary?: { pendingStageCount?: number | null } | null
}

/** 版本号只认正整数；缺失 / 非法统一按 null（展示为「暂无」） */
export function normalizeSeriesReleaseVersion(value: unknown): number | null {
  const version = Number(value)
  if (!Number.isFinite(version) || version <= 0) return null
  return Math.trunc(version)
}

/**
 * 该阶段是否有一版更新的草稿等待发布。
 *
 * 后端已算好 `hasPendingUpdate` 时直接采用；旧后端没有这个字段，
 * 用 `latestRecipeVersion > publishedRecipeVersion` 兜底（与后端口径一致）。
 */
export function isSeriesReleaseStagePendingUpdate(
  stage: SeriesReleaseStageUpdateView | null | undefined
): boolean {
  if (stage?.hasPendingUpdate === true) return true
  const latest = normalizeSeriesReleaseVersion(stage?.latestRecipeVersion)
  const published = normalizeSeriesReleaseVersion(
    stage?.publishedRecipeVersion
  )
  if (latest === null || published === null) return false
  return latest > published
}

/** 待更新阶段数：优先用后端 summary，缺失时按阶段列表兜底 */
export function resolveSeriesReleasePendingStageCount(
  readiness: SeriesReleaseStateSource | null | undefined
): number {
  const fromSummary = Number(readiness?.summary?.pendingStageCount)
  if (Number.isFinite(fromSummary) && fromSummary >= 0) {
    return Math.trunc(fromSummary)
  }
  return (readiness?.stages ?? []).filter(isSeriesReleaseStagePendingUpdate)
    .length
}

/**
 * 整条系列的展示状态。
 *
 * 优先用后端 `releaseState`；旧后端没有时按 businessStatus + 待更新阶段推断：
 *  · 不是 PUBLIC          → UNPUBLISHED
 *  · PUBLIC 且有更新草稿  → NEEDS_UPDATE
 *  · PUBLIC 且全部最新    → PUBLISHED
 */
export function resolveSeriesReleaseState(
  readiness: SeriesReleaseStateSource | null | undefined
): SeriesReleaseState {
  const raw = String(readiness?.releaseState ?? '')
    .trim()
    .toUpperCase()
  if (SERIES_RELEASE_STATES.includes(raw as SeriesReleaseState)) {
    return raw as SeriesReleaseState
  }

  const businessStatus = String(readiness?.businessStatus ?? '')
    .trim()
    .toUpperCase()
  const hasPendingUpdates =
    readiness?.hasPendingUpdates === true ||
    resolveSeriesReleasePendingStageCount(readiness) > 0

  if (businessStatus !== 'PUBLIC') return 'UNPUBLISHED'
  return hasPendingUpdates ? 'NEEDS_UPDATE' : 'PUBLISHED'
}

export function seriesReleaseStateLabel(
  state: SeriesReleaseState | string
): string {
  return (
    SERIES_RELEASE_STATE_LABELS[state as SeriesReleaseState] ?? String(state || '')
  )
}

/** 未上线=灰、已上线（最新）=绿、待重新发布=橙 */
export function seriesReleaseStateTagType(
  state: SeriesReleaseState | string
): SeriesReleaseStageTagType {
  switch (state) {
    case 'PUBLISHED':
      return 'success'
    case 'NEEDS_UPDATE':
      return 'warning'
    default:
      return 'info'
  }
}

/** 主按钮文案：第一次发布叫「发布系列」，已上线过叫「重新发布系列」 */
export function seriesReleasePrimaryActionLabel(
  readiness: SeriesReleaseStateSource | null | undefined
): string {
  return resolveSeriesReleaseState(readiness) === 'UNPUBLISHED'
    ? '发布系列'
    : '重新发布系列'
}

/**
 * 主按钮是否展示：门槛就绪、且**已上线（最新）**时没有可发的版本，直接隐藏。
 *
 * 待重新发布（NEEDS_UPDATE）仍要展示，因为最新草稿还没发给顾客。
 */
export function isSeriesReleasePrimaryActionAvailable(
  readiness:
    | (SeriesReleaseStateSource & { ready?: boolean | null })
    | null
    | undefined
): boolean {
  if (readiness?.ready !== true) return false
  return resolveSeriesReleaseState(readiness) !== 'PUBLISHED'
}

/** 下架按钮是否展示：只有「已上线（最新）」或「待重新发布」的系列才能下架 */
export function canUnpublishSeries(
  readiness: SeriesReleaseStateSource | null | undefined
): boolean {
  return resolveSeriesReleaseState(readiness) !== 'UNPUBLISHED'
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

/**
 * 单个阶段的版本号文案：同时区分「最新版本」和「已发布版本」。
 *
 *  · 没有阶段食谱           → 暂无阶段食谱
 *  · 从未发布过             → 最新 v3 · 未发布
 *  · 有更新草稿             → 最新 v4 · 已发布 v3
 *  · 已发布且没有更新草稿   → 最新 v3
 */
export function formatSeriesReleaseStageVersion(
  stage: SeriesReleaseStageUpdateView
): string {
  const latest = normalizeSeriesReleaseVersion(stage.latestRecipeVersion)
  const published = normalizeSeriesReleaseVersion(
    stage.publishedRecipeVersion
  )
  if (latest === null) return '暂无阶段食谱'
  if (published === null) return `最新 v${latest} · 未发布`
  if (isSeriesReleaseStagePendingUpdate(stage)) {
    return `最新 v${latest} · 已发布 v${published}`
  }
  return `最新 v${latest}`
}

/** 整个系列最新一条阶段食谱的版本号 */
export function formatSeriesReleaseLatestVersion(
  readiness: Pick<SeriesReleaseReadiness, 'stages'> | null | undefined
): string {
  const versions = (readiness?.stages ?? [])
    .map((stage) => normalizeSeriesReleaseVersion(stage.latestRecipeVersion))
    .filter((version): version is number => version !== null)
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
