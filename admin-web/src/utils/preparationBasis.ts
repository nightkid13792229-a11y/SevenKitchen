/**
 * 「部位 / 状态 / 预处理」的称重口径一致性提示。
 *
 * 业务规则：熟档案 → 文案写「熟」或「熟重」；生档案 → 「生」或「生重」；
 * 干制品 → 「干」或「干重」；油/粉/补剂等没有生熟概念 → 不写口径词。
 *
 * 2026-10-26：新字段推荐写「生 / 熟 / 干」，同时兼容历史「生重 / 熟重 / 干重」。
 * 这里只做**非阻塞提示**，不修改用户输入。
 */
import { PREPARATION_FIELD_LABEL } from '@/constants/preparationField'

const BASIS_TOKENS = ['生重', '熟重', '干重', '生', '熟', '干']

const COOKED_BASIS_PHRASES = [
  '煮熟后称重',
  '煮熟后沥水',
  '煮熟后沥水称重',
  '煮熟（不软）后称重',
  '煮熟后打碎',
]

const BASIS_TOKENS_BY_STATE: Record<string, string[]> = {
  RAW: ['生重', '生'],
  COOKED: ['熟重', '熟'],
  DRIED: ['干重', '干'],
  AIR_DRIED: ['干重', '干'],
  FREEZE_DRIED: [],
  OIL: [],
  POWDER: [],
  CONCENTRATE: [],
  CANNED: [],
  SOAKED: [],
}

const BASIS_LABEL_BY_STATE: Record<string, string> = {
  RAW: '生',
  COOKED: '熟',
  DRIED: '干',
  AIR_DRIED: '干',
}

/** 状态 → 中文标签（后端已给 label 时优先用后端的） */
export const PREPARATION_STATE_LABELS: Record<string, string> = {
  RAW: '生',
  COOKED: '熟',
  DRIED: '干',
  AIR_DRIED: '干',
  FREEZE_DRIED: '冻干',
  OIL: '油脂',
  POWDER: '粉',
  CONCENTRATE: '浓缩补剂',
  CANNED: '罐头',
  SOAKED: '水发',
}

export const preparationStateLabel = (
  preparationState?: string | null,
): string => {
  const state = String(preparationState ?? '').trim().toUpperCase()
  return PREPARATION_STATE_LABELS[state] ?? state
}

export const splitPreparationSegments = (
  value?: string | null,
): string[] => {
  return String(value ?? '')
    .split(/[、,，/]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

const isCookedBasisPhrase = (segment: string) =>
  COOKED_BASIS_PHRASES.includes(segment) || segment.endsWith('后称重')

/** 该文案里的称重口径是否与营养档案状态一致 */
export const isPreparationBasisConsistent = (
  text?: string | null,
  preparationState?: string | null,
): boolean => {
  const trimmed = String(text ?? '').trim()
  const state = String(preparationState ?? '').trim().toUpperCase()
  if (!trimmed || !state || !(state in BASIS_TOKENS_BY_STATE)) {
    return true
  }

  const segments = splitPreparationSegments(trimmed)
  const expectedTokens = BASIS_TOKENS_BY_STATE[state] ?? []
  const actualTokens = segments.filter((segment) =>
    BASIS_TOKENS.includes(segment),
  )
  const hasCookedPhrase = segments.some(isCookedBasisPhrase)
  const hasAnyBasis = actualTokens.length > 0 || hasCookedPhrase

  // 油/粉/补剂等没有生熟概念：出现口径词才提示。
  if (expectedTokens.length === 0) {
    return !hasAnyBasis
  }

  // 自由文本没写口径词时不应被当成冲突。
  if (!hasAnyBasis) {
    return true
  }

  if (actualTokens.some((token) => expectedTokens.includes(token))) {
    return true
  }

  if (expectedTokens.includes('熟') && hasCookedPhrase) {
    return true
  }

  // 只写了「沥干后称重」这类非熟制短语，无法判断，按一致处理。
  if (actualTokens.length === 0 && !hasCookedPhrase) {
    return true
  }

  return false
}

/** 不一致时返回给运营看的提示文案，一致则返回 null */
export const preparationBasisMismatchHint = (
  text?: string | null,
  preparationState?: string | null,
  stateLabel?: string | null,
): string | null => {
  if (isPreparationBasisConsistent(text, preparationState)) {
    return null
  }

  const state = String(preparationState ?? '').trim().toUpperCase()
  const expected = BASIS_LABEL_BY_STATE[state] ?? ''
  const label = stateLabel?.trim() || preparationStateLabel(state)
  const found =
    splitPreparationSegments(text).find(
      (segment) =>
        BASIS_TOKENS.includes(segment) || isCookedBasisPhrase(segment),
    ) ?? '其它称重口径'

  return expected
    ? `营养状态是「${label}」，${PREPARATION_FIELD_LABEL}却写「${found}」，建议改为「${expected}」`
    : `营养状态是「${label}」（没有生熟概念），${PREPARATION_FIELD_LABEL}不应写「${found}」`
}
