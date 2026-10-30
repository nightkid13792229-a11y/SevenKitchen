/**
 * 「部位 / 状态 / 预处理」字段的长度口径：
 * 只数实际内容字符，`/`、顿号、空格、标点、符号都不计入。
 *
 * 这是业务字段，不是任意备注，所以上限固定为 10。
 */
export const PREPARATION_METHOD_MAX_CONTENT_LENGTH = 10;

const NON_CONTENT_CHARACTER_RE = /[\p{P}\p{S}\s]/u;

export const countPreparationMethodContentCharacters = (
  value: string | null | undefined,
): number =>
  Array.from(String(value ?? '')).filter(
    (character) => !NON_CONTENT_CHARACTER_RE.test(character),
  ).length;

export const isPreparationMethodWithinContentLimit = (
  value: string | null | undefined,
  limit = PREPARATION_METHOD_MAX_CONTENT_LENGTH,
): boolean => countPreparationMethodContentCharacters(value) <= limit;

/**
 * 保内容、丢超出的字符；用于历史/复制等不能直接报错的场景。
 * 分隔符会保留在已保留的内容字符之间，末尾分隔符会被去掉。
 */
export const truncatePreparationMethodContent = (
  value: string | null | undefined,
  limit = PREPARATION_METHOD_MAX_CONTENT_LENGTH,
): string => {
  const characters = Array.from(String(value ?? ''));
  let contentCount = 0;
  let result = '';

  for (const character of characters) {
    if (!NON_CONTENT_CHARACTER_RE.test(character)) {
      if (contentCount >= limit) break;
      contentCount += 1;
    }
    result += character;
  }

  return result.trim();
};
