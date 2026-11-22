/**
 * 「AI 说没找到」的缺项，怎么落到导航角标上。
 *
 * 只按 `aiSnapshot.missing` 数会让角标永不消失：人后来把货架期填上了，
 * 角标还写着「缺2」，看起来像表单还有问题（2026-11-23 实测）。
 * 这里把「现在已经有值」的项剔掉；AI 的原始 missing 仍留在快照里，
 * 审核面板照样能查到它当初为什么没找到。
 */
import type { SupplementDraftPayload } from '@/api/supplementDrafts'
import { readDraftPath } from './supplementDraftState'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 草稿里这个字段现在是否已经有值（字符串非空 / 数组非空 / 其它非 null）。 */
export function hasFieldValue(
  payload: SupplementDraftPayload | null | undefined,
  path: string
): boolean {
  if (!payload) return false
  const value = readDraftPath(payload, path)
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

/** AI 报的 missing 里，哪些字段到现在还是空的。 */
export function stillMissingPaths(
  payload: SupplementDraftPayload | null | undefined,
  missing: unknown
): string[] {
  if (!Array.isArray(missing)) return []
  const paths: string[] = []
  for (const entry of missing) {
    if (!isRecord(entry)) continue
    const path = typeof entry.fieldPath === 'string' ? entry.fieldPath.trim() : ''
    if (path && !hasFieldValue(payload, path)) paths.push(path)
  }
  return paths
}
