/**
 * 食谱名称的长度规则（2026-10-27）。
 *
 * 为什么是 12：生产标签 70×100mm、标题 5mm 单行不换行，扣掉左右边距后
 * 可用宽度 61mm，正好装 12 个全角字。第 13 个字不是"不好看"，是**印不出来**。
 *
 * 口径统一在这里，前端只做提示，后端负责拦。
 */

export const RECIPE_NAME_MAX_LENGTH = 12;

export class RecipeNameLengthError extends Error {
  constructor(actual: number) {
    super(
      `食谱名称最多 ${RECIPE_NAME_MAX_LENGTH} 个字，超了标签印不下（当前 ${actual} 字）`,
    );
    this.name = 'RecipeNameLengthError';
  }
}

/** 按"字"数，不是按 UTF-16 code unit：中文、数字、符号、emoji 都算 1 个字。 */
export function countRecipeNameLength(name: string): number {
  return [...name.trim()].length;
}

/**
 * 校验并返回去掉首尾空格的名称。
 * 空名由调用方决定文案（各入口语境不同），这里只管长度。
 */
export function assertRecipeNameLength(name: string): string {
  const trimmed = name.trim();
  const length = countRecipeNameLength(trimmed);
  if (length > RECIPE_NAME_MAX_LENGTH) {
    throw new RecipeNameLengthError(length);
  }
  return trimmed;
}
