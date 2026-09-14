/**
 * 制备方法的称重口径一致性检查（与 backend/src/domain/recipe-designer/preparation-basis.ts 规则一致）。
 *
 * 业务规则：熟档案 → 文案写「熟重」；生档案 → 「生重」；干制品 → 「干重」；
 * 油/粉/补剂等没有生熟概念 → 不写口径词。
 */

const BASIS_TOKENS = ['生重', '熟重', '干重'];

const COOKED_BASIS_PHRASES = [
  '煮熟后称重',
  '煮熟后沥水',
  '煮熟后沥水称重',
  '煮熟（不软）后称重',
  '煮熟后打碎',
];

const BASIS_BY_STATE: Record<string, string | null> = {
  RAW: '生重',
  COOKED: '熟重',
  DRIED: '干重',
  AIR_DRIED: '干重',
  FREEZE_DRIED: null,
  OIL: null,
  POWDER: null,
  CONCENTRATE: null,
  CANNED: null,
  SOAKED: null,
};

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
};

export const preparationStateLabel = (
  preparationState?: string | null,
): string => {
  const state = String(preparationState ?? '').trim().toUpperCase();
  return PREPARATION_STATE_LABELS[state] ?? state;
};

export const splitPreparationSegments = (
  value?: string | null,
): string[] => {
  return String(value ?? '')
    .split(/[、,，]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
};

/** 该文案里的称重口径是否与营养档案状态一致 */
export const isPreparationBasisConsistent = (
  text?: string | null,
  preparationState?: string | null,
): boolean => {
  const trimmed = String(text ?? '').trim();
  const state = String(preparationState ?? '').trim().toUpperCase();
  if (!trimmed || !state || !(state in BASIS_BY_STATE)) {
    return true;
  }

  const segments = splitPreparationSegments(trimmed);
  const expected = BASIS_BY_STATE[state] ?? null;
  const hasCookedBasisPhrase = segments.some((segment) =>
    COOKED_BASIS_PHRASES.includes(segment),
  );

  if (expected === null) {
    return (
      !segments.some((segment) => BASIS_TOKENS.includes(segment)) &&
      !hasCookedBasisPhrase
    );
  }

  if (segments.includes(expected)) {
    return true;
  }

  if (expected === '熟重') {
    return (
      hasCookedBasisPhrase ||
      segments.some((segment) => segment.endsWith('后称重'))
    );
  }

  return (
    !hasCookedBasisPhrase &&
    !segments.some(
      (segment) => BASIS_TOKENS.includes(segment) && segment !== expected,
    )
  );
};

/** 不一致时返回给运营看的提示文案，一致则返回 null */
export const preparationBasisMismatchHint = (
  text?: string | null,
  preparationState?: string | null,
  stateLabel?: string | null,
): string | null => {
  if (isPreparationBasisConsistent(text, preparationState)) {
    return null;
  }

  const state = String(preparationState ?? '').trim().toUpperCase();
  const expected = BASIS_BY_STATE[state] ?? '';
  const label = stateLabel?.trim() || preparationStateLabel(state);
  const found =
    splitPreparationSegments(text).find(
      (segment) =>
        BASIS_TOKENS.includes(segment) ||
        COOKED_BASIS_PHRASES.includes(segment),
    ) ?? '其它称重口径';

  return expected
    ? `营养状态是「${label}」，制备方法却写「${found}」，建议改为「${expected}」`
    : `营养状态是「${label}」（没有生熟概念），制备方法不应写「${found}」`;
};
