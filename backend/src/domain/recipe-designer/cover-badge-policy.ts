/**
 * 封面角标可选词白名单（2026-10-27 老板确认）。
 *
 * 角标只用于封面展示，不参与顾客筛选或 AI 文案；健康标签词表本身不删。
 * 「含…」原料事实、工艺特性、符合 FEDIAF 2021 都已移出角标可选范围。
 */
export const COVER_BADGE_ALLOWED_NAMES = [
  '低脂',
  '易消化',
  '挑食友好',
  '适口性优先',
  '符合 FEDIAF 2025',
  '单一动物蛋白',
] as const;

const COVER_BADGE_ALLOWED_NAME_SET = new Set<string>(COVER_BADGE_ALLOWED_NAMES);

/** 是否是允许用作封面角标的词（按词名精确匹配，trim 后比较） */
export function isCoverBadgeEligibleName(name: unknown): boolean {
  return (
    typeof name === 'string' &&
    COVER_BADGE_ALLOWED_NAME_SET.has(name.trim())
  );
}

/**
 * 从任意词名列表里挑出可作角标的词：trim、去空、去重、保持原顺序。
 * 历史数据里混入的「含…」/工艺特性等会被静默丢弃。
 */
export function pickCoverBadgeNames(
  names: unknown[] | null | undefined,
): string[] {
  if (!Array.isArray(names)) return [];

  const result: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (!COVER_BADGE_ALLOWED_NAME_SET.has(trimmed) || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
