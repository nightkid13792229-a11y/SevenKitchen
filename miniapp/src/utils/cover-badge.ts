/**
 * 封面角标文案解析
 *
 * 角标已从「每个食谱版本各一份的自由文本（coverTitle）」上移到
 * 「食谱系列的合规词表引用（coverBadges）」，这样运营改一次就全系列生效，
 * 而且结构上不可能填进违规词。
 *
 * 迁移期间两者的关系：
 *   1. 有新模型的系列 → 用 coverBadges（合规词表词名，可能 1–2 个）
 *   2. 还没配的系列   → 回退到旧的 coverTitle，**保证不会出现"角标突然全没了"**
 *   3. 都没有         → 返回空串，调用方据此不渲染角标
 */
export interface CoverBadgeSource {
  /** 系列级角标（合规词表词名） */
  coverBadges?: string[] | null;
  /** 版本级旧字段，仅作兜底 */
  coverTitle?: string | null;
}

/** 多个角标之间的连接符：留出呼吸感，也比顿号更适合短标签 */
const COVER_BADGE_SEPARATOR = ' · ';

export function resolveCoverBadgeText(source?: CoverBadgeSource | null): string {
  if (!source) return '';

  const badges = (source.coverBadges || [])
    .map((badge) => (typeof badge === 'string' ? badge.trim() : ''))
    .filter(Boolean);

  if (badges.length > 0) return badges.join(COVER_BADGE_SEPARATOR);

  const legacy = typeof source.coverTitle === 'string' ? source.coverTitle.trim() : '';
  return legacy;
}
