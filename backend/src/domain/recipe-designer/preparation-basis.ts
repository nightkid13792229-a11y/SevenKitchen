/**
 * 制备方法的「称重口径」必须与营养档案状态一致。
 *
 * 业务规则（2026-09-15 确认）：
 * - 熟档案（COOKED）→ 厨房按煮完之后的重量称 → 文案写「熟重」
 * - 生档案（RAW）→ 按生重称 → 文案写「生重」
 * - 干制品（DRIED / AIR_DRIED）→ 写「干重」
 * - 油/粉/补剂/罐头等没有生熟概念 → 不写口径词
 *
 * 该函数只用于「系统自动生成默认制备方法」的场景（新增原料、发布兜底），
 * 不会用于覆盖人工显式填写的文案。
 */

/** 口径词（受控词表 token） */
export const PREPARATION_BASIS_TOKENS = ['生重', '熟重', '干重'] as const;

/** 表达「熟后称重」语义的短语（与生/干档案冲突） */
export const COOKED_BASIS_PHRASES = [
  '煮熟后称重',
  '煮熟后沥水',
  '煮熟后沥水称重',
  '煮熟（不软）后称重',
  '煮熟后打碎',
] as const;

const BASIS_TOKEN_SET = new Set<string>(PREPARATION_BASIS_TOKENS);
const COOKED_BASIS_PHRASE_SET = new Set<string>(COOKED_BASIS_PHRASES);

/** 状态 → 应写的口径词；null 表示不该出现口径词；未列出表示状态未知、不处理 */
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

const splitSegments = (value: string): string[] =>
  value
    .split(/[、,，]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

/**
 * 按营养档案状态对齐制备方法文案的称重口径。
 *
 * - 文案为空 / 状态未知 → 原样返回
 * - 熟档案且原文已表达熟制或「…后称重」→ 视为已写清口径，原样返回
 * - 已有口径词 → 改为目标口径词（或删除）
 * - 生/干档案却写了熟制口径 → 换成生重/干重（保留「打碎」等加工步骤）
 * - 只写了「称重」没写口径 → 就地把「称重」改为目标口径词
 * - 完全没有称重表述 → 在「打碎/打粉」之前补上目标口径词
 */
export const alignPreparationMethodBasis = (
  text: string | null | undefined,
  preparationState: string | null | undefined,
): string | null => {
  const trimmed = text?.trim();
  if (!trimmed) {
    return trimmed ? trimmed : null;
  }

  const state = preparationState?.trim().toUpperCase();
  if (!state || !(state in BASIS_BY_STATE)) {
    return trimmed;
  }

  const targetBasis = BASIS_BY_STATE[state] ?? null;
  const segments = splitSegments(trimmed);
  const hasCookedBasisPhrase = segments.some((segment) =>
    COOKED_BASIS_PHRASE_SET.has(segment),
  );
  const hasWeighingPhrase = segments.some((segment) =>
    segment.endsWith('后称重'),
  );

  // 熟档案：原文已表达熟制口径或已有「…后称重」，保持不变
  if (targetBasis === '熟重' && (hasCookedBasisPhrase || hasWeighingPhrase)) {
    return trimmed;
  }

  const keepBlendStep =
    segments.includes('煮熟后打碎') && targetBasis !== '熟重';

  let insertIndex = -1;
  const next: string[] = [];
  for (const segment of segments) {
    const isBasisSegment =
      BASIS_TOKEN_SET.has(segment) || COOKED_BASIS_PHRASE_SET.has(segment);
    if (isBasisSegment) {
      if (insertIndex < 0) {
        insertIndex = next.length;
      }
      if (
        keepBlendStep &&
        segment === '煮熟后打碎' &&
        !next.includes('打碎')
      ) {
        next.push('打碎');
      }
      continue;
    }
    next.push(segment);
  }

  if (targetBasis === null) {
    const deduped = [...new Set(next)];
    return deduped.length > 0 ? deduped.join('、') : null;
  }

  if (!next.includes(targetBasis)) {
    const standaloneIndex = next.indexOf('称重');
    if (standaloneIndex >= 0) {
      next[standaloneIndex] = targetBasis;
    } else {
      let index = insertIndex;
      if (index < 0) {
        index = next.findIndex(
          (segment) => segment === '打碎' || segment === '打粉',
        );
      }
      if (index < 0) {
        index = next.length;
      }
      next.splice(index, 0, targetBasis);
    }
  }

  const deduped = [...new Set(next)];
  return deduped.length > 0 ? deduped.join('、') : null;
};

/** 判断文案里的称重口径是否与营养档案状态一致（供前端提示使用） */
export const isPreparationBasisConsistent = (
  text: string | null | undefined,
  preparationState: string | null | undefined,
): boolean => {
  const trimmed = text?.trim();
  const state = preparationState?.trim().toUpperCase();
  if (!trimmed || !state || !(state in BASIS_BY_STATE)) {
    return true;
  }

  const segments = splitSegments(trimmed);
  const expected = BASIS_BY_STATE[state] ?? null;
  const hasCookedBasisPhrase = segments.some((segment) =>
    COOKED_BASIS_PHRASE_SET.has(segment),
  );

  if (expected === null) {
    return (
      !segments.some((segment) => BASIS_TOKEN_SET.has(segment)) &&
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
      (segment) => BASIS_TOKEN_SET.has(segment) && segment !== expected,
    )
  );
};
