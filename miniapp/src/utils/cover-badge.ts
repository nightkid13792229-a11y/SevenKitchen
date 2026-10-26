/**
 * 封面角标文案解析
 *
 * 角标已从「每个食谱版本各一份的自由文本（coverTitle）」上移到
 * 「食谱系列的合规词表引用（coverBadges）」，这样运营改一次就全系列生效，
 * 而且结构上不可能填进违规词。
 *
 * 角标只来自系列合规词表；没配就不显示（不再回退版本级 coverTitle）。
 * 返回空串时，调用方据此不渲染角标。
 */
export interface CoverBadgeSource {
  /** 系列级角标（合规词表词名） */
  coverBadges?: string[] | null;
}

/** 多个角标之间的连接符：留出呼吸感，也比顿号更适合短标签 */
const COVER_BADGE_SEPARATOR = ' · ';

export function resolveCoverBadgeText(source?: CoverBadgeSource | null): string {
  if (!source) return '';

  const { coverBadges } = source;
  const badges = (coverBadges || [])
    .map((badge) => (typeof badge === 'string' ? badge.trim() : ''))
    .filter(Boolean);

  return badges.join(COVER_BADGE_SEPARATOR);
}
