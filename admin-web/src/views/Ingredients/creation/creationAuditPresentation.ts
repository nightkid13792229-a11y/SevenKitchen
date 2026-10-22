/**
 * 「创建记录」抽屉的展示逻辑。
 *
 * 后端返回的是**原始 JSON**（AI 提案快照 + 提交时的字段差异），形状会随站点
 * 历史变化；这里集中做容错与中文格式化，组件只负责画表，方便单测空状态与
 * 「AI 值 → 最终值」这类容易出错的格式。
 */
import type {
  AuditChangeKind,
  IngredientCreationAuditChanges,
  IngredientCreationAuditFieldChange
} from '@/types/ingredientCreation'
import { PROFILE_FIELD_BY_PATH } from './profileLedger'

export const EMPTY_PROPOSAL_TEXT = '这次创建没有留下提案快照'
export const EMPTY_CHANGES_TEXT = '这次创建没有留下人工改动记录'

const PROPOSAL_KIND_LABELS: Record<string, string> = {
  INTAKE: '起手口径',
  CANDIDATES: '候选检索',
  MERGE: '缝合方案',
  CHECK: '终检'
}

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  DIRECT: '直接采用',
  FILLED: '补缺',
  MANUAL: '人改值',
  CONFLICT: '多来源冲突'
}

const CHANGE_KIND_LABELS: Record<AuditChangeKind, string> = {
  VALUE_CHANGED: '人改值',
  CONFLICT_RESOLVED: '冲突已裁决',
  MANUALLY_ADDED: '人工新增',
  REMOVED_FROM_FINAL: '从最终值移除'
}

const PREPARATION_LABELS: Record<string, string> = {
  RAW: '生档案',
  COOKED: '熟档案'
}

export interface AuditProposalFieldRow {
  fieldPath: string
  fieldLabel: string
  valueText: string
  statusLabel: string
  sourceText: string
}

export interface AuditProposalSnapshotView {
  kind: string
  kindLabel: string
  createdAt: string
  fieldRows: AuditProposalFieldRow[]
  summaryLines: string[]
}

export interface AuditProposalSection {
  snapshots: AuditProposalSnapshotView[]
  isEmpty: boolean
  emptyText: string
}

export interface AuditChangeRow {
  key: string
  profileLabel: string
  fieldPath: string
  fieldLabel: string
  aiValueText: string
  finalValueText: string
  statusLabel: string
  changedBy: string
}

export interface AuditExceptionRow {
  key: string
  code: string
  reason: string
  approvedBy: string
  approvedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** 营养字段目录里的中文名；目录外的字段（自定义项）保留原路径。 */
export function fieldLabel(fieldPath: string): string {
  return PROFILE_FIELD_BY_PATH.get(fieldPath)?.label ?? fieldPath
}

/** `20 g`；缺值统一显示 `—`，绝不把 null 输出成 0。 */
export function formatQuantity(
  value: number | null,
  unit: string | null
): string {
  if (value === null) {
    return '—'
  }
  return unit ? `${value} ${unit}` : String(value)
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatStates(value: unknown): string {
  const labels = readArray(value)
    .map((state) => readText(state))
    .filter((state): state is string => Boolean(state))
    .map((state) => PREPARATION_LABELS[state] ?? state)
  return labels.length ? labels.join('、') : '—'
}

function buildMergeFieldRows(
  raw: Record<string, unknown>
): AuditProposalFieldRow[] {
  const rows: AuditProposalFieldRow[] = []

  for (const item of readArray(raw.rows)) {
    if (!isRecord(item)) {
      continue
    }
    const fieldPath = readText(item.fieldPath)
    if (!fieldPath) {
      continue
    }
    const status = readText(item.status)
    rows.push({
      fieldPath,
      fieldLabel: fieldLabel(fieldPath),
      valueText:
        status === 'CONFLICT'
          ? '待裁决'
          : formatQuantity(readNumber(item.value), readText(item.unit)),
      statusLabel: (status && PROPOSAL_STATUS_LABELS[status]) ?? status ?? '—',
      sourceText: readText(item.sourceRecordId) ?? '—'
    })
  }

  for (const item of readArray(raw.conflicts)) {
    if (!isRecord(item)) {
      continue
    }
    const fieldPath = readText(item.fieldPath)
    if (!fieldPath) {
      continue
    }
    const candidates = readArray(item.candidates).filter(isRecord)
    const values = candidates
      .map((candidate) =>
        formatQuantity(
          readNumber(candidate.value),
          readText(candidate.unit)
        )
      )
      .filter((text) => text !== '—')
    rows.push({
      fieldPath,
      fieldLabel: fieldLabel(fieldPath),
      valueText: values.length ? values.join(' / ') : '待裁决',
      statusLabel: '多来源冲突',
      sourceText:
        candidates
          .map((candidate) => readText(candidate.sourceRecordId))
          .filter((id): id is string => Boolean(id))
          .join(' / ') || '—'
    })
  }

  return rows
}

function buildSnapshot(
  raw: Record<string, unknown>
): AuditProposalSnapshotView | null {
  const kind = readText(raw.kind)
  if (!kind) {
    return null
  }

  const snapshot: AuditProposalSnapshotView = {
    kind,
    kindLabel: PROPOSAL_KIND_LABELS[kind] ?? kind,
    createdAt: readText(raw.createdAt) ?? '',
    fieldRows: [],
    summaryLines: []
  }

  if (kind === 'MERGE') {
    snapshot.fieldRows = buildMergeFieldRows(raw)
    const primary = readText(raw.primarySourceRecordId)
    snapshot.summaryLines.push(`主来源：${primary ?? '—'}`)
    snapshot.summaryLines.push(
      `缺失字段：${readArray(raw.missingFields).length} 项`
    )
    return snapshot
  }

  if (kind === 'INTAKE') {
    const name = readText(raw.name)
    const nameEn = readText(raw.nameEn)
    if (name) {
      snapshot.summaryLines.push(`名称：${name}`)
    }
    if (nameEn) {
      snapshot.summaryLines.push(`英文名：${nameEn}`)
    }
    snapshot.summaryLines.push(`必做状态：${formatStates(raw.requiredStates)}`)
    return snapshot
  }

  if (kind === 'CANDIDATES') {
    snapshot.summaryLines.push(
      `候选：${readArray(raw.candidates).length} 条`
    )
    const excluded = readNumber(raw.excludedCount)
    if (excluded !== null) {
      snapshot.summaryLines.push(`因烤/煎排除：${excluded} 条`)
    }
    return snapshot
  }

  if (kind === 'CHECK') {
    snapshot.summaryLines.push(`拦死：${readArray(raw.blocking).length} 项`)
    snapshot.summaryLines.push(
      `可例外：${readArray(raw.exceptionable).length} 项`
    )
    snapshot.summaryLines.push(`提醒：${readArray(raw.warnings).length} 项`)
  }

  return snapshot
}

/** AI 提案快照 → 按站点分组的展示结构；没有快照时给出明确空文案。 */
export function buildProposalSection(proposals: unknown): AuditProposalSection {
  const snapshots = readArray(proposals)
    .filter(isRecord)
    .map(buildSnapshot)
    .filter((snapshot): snapshot is AuditProposalSnapshotView =>
      Boolean(snapshot)
    )

  return {
    snapshots,
    isEmpty: snapshots.length === 0,
    emptyText: EMPTY_PROPOSAL_TEXT
  }
}

function buildAiValueText(
  change: IngredientCreationAuditFieldChange
): string {
  const candidates = readArray(change.aiCandidates).filter(isRecord)
  if (candidates.length) {
    return candidates
      .map((candidate) =>
        formatQuantity(
          readNumber(candidate.value),
          readText(candidate.unit)
        )
      )
      .join(' / ')
  }
  return formatQuantity(change.aiValue, change.aiUnit)
}

/** 人工改动 → 展示行；空的 `fields` 返回空数组，由组件显示空状态。 */
export function buildAuditChangeRows(changes: unknown): AuditChangeRow[] {
  if (!isRecord(changes)) {
    return []
  }

  const fields = readArray(changes.fields).filter(isRecord)
  return fields.map((raw, index) => {
    const fieldPath = readText(raw.fieldPath) ?? ''
    const change = readText(raw.change) as AuditChangeKind | null
    const preparationState =
      readText(raw.preparationState) === 'COOKED' ? 'COOKED' : 'RAW'
    const profileIndex = readNumber(raw.profileIndex) ?? 0
    const fieldChange = raw as unknown as IngredientCreationAuditFieldChange

    return {
      key: `${preparationState}:${fieldPath}:${profileIndex || index}`,
      profileLabel: PREPARATION_LABELS[preparationState] ?? preparationState,
      fieldPath,
      fieldLabel: fieldLabel(fieldPath),
      aiValueText: buildAiValueText(fieldChange),
      finalValueText: formatQuantity(
        readNumber(raw.finalValue),
        readText(raw.finalUnit)
      ),
      statusLabel: change
        ? (CHANGE_KIND_LABELS[change] ?? change)
        : '未分类',
      changedBy: readText(raw.finalConfirmedBy) ?? '未记录'
    }
  })
}

/** 人登记的例外（理由 + 操作人 + 时间）。 */
export function buildAuditExceptionRows(changes: unknown): AuditExceptionRow[] {
  if (!isRecord(changes)) {
    return []
  }

  return readArray(changes.exceptions)
    .filter(isRecord)
    .map((raw) => {
      const code = readText(raw.code) ?? '—'
      const approvedAt = readText(raw.approvedAt)
      return {
        key: `${code}:${approvedAt ?? ''}`,
        code,
        reason: readText(raw.reason) ?? '—',
        approvedBy: readText(raw.approvedBy) ?? '未记录',
        approvedAt: formatDateTime(approvedAt)
      }
    })
}

/** 供抽屉判断 `changes` 是否为空时使用。 */
export function readAuditChanges(
  changes: unknown
): IngredientCreationAuditChanges | null {
  return isRecord(changes)
    ? (changes as unknown as IngredientCreationAuditChanges)
    : null
}
