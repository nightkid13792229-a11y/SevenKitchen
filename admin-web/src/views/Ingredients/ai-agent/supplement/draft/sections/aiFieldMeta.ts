/**
 * 区块字段的 AI 来源 / 缺失提示（只读 `draft.aiSnapshot`）。
 *
 * 与 BasicSection 里已有的徽标同一口径：`fields[path]` 是来源，
 * `missing[].fieldPath` 是 AI 自己承认没读到的项。这里抽出来给
 * 其余区块复用，避免每个区块各写一套解析。
 */
import type { SupplementDraftAiSnapshot } from '@/api/supplementDrafts'

export interface DraftAiFieldTag {
  text: string
  low: boolean
}

const SOURCE_LABELS: Record<string, string> = {
  LABEL: 'AI 读标签',
  FRONT: 'AI 读正面图',
  LINK: 'AI 读商品页',
  CATALOG: '目录',
  RULE: '规则',
  INFERENCE: 'AI 推断'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 字段路径 → 来源徽标；没有 AI 来源返回 null。 */
export function aiFieldTag(
  snapshot: SupplementDraftAiSnapshot | null | undefined,
  path: string
): DraftAiFieldTag | null {
  const fields = snapshot?.fields
  if (!isRecord(fields)) return null
  const raw = fields[path]
  if (!isRecord(raw)) return null
  const source = typeof raw.source === 'string' ? raw.source : ''
  const label = SOURCE_LABELS[source]
  if (!label) return null
  const confidence = typeof raw.confidence === 'string' ? raw.confidence : ''
  return {
    text: confidence === 'LOW' ? `${label} · 低置信` : label,
    low: confidence === 'LOW'
  }
}

/** 字段路径 → AI 承认没找到的原因；没有返回空串。 */
export function aiMissingReason(
  snapshot: SupplementDraftAiSnapshot | null | undefined,
  path: string
): string {
  const list = snapshot?.missing
  if (!Array.isArray(list)) return ''
  for (const raw of list) {
    if (!isRecord(raw)) continue
    if (raw.fieldPath === path) {
      return typeof raw.reason === 'string' ? raw.reason : ''
    }
  }
  return ''
}
