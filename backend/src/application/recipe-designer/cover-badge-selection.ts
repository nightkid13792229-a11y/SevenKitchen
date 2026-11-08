import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../infrastructure/prisma.service';
import {
  COVER_BADGE_ALLOWED_NAMES,
  isCoverBadgeEligibleName,
} from '../../domain/recipe-designer/cover-badge-policy';
import { scanForbiddenClaims } from './recipe-copywriting-compliance';

/** 封面角标最多两个：封面左下角一行放不下更多。 */
export const MAX_SERIES_COVER_BADGES = 2;

/**
 * 封面角标 id 的统一校验（2026-11-08 抽公共）。
 *
 * 依次校验：数量、是否存在、是否在白名单、是否含法规禁用词。
 * 发布草稿与老的角标保存接口都走这一份，避免「草稿能存违规词、
 * 老接口不能」这种两套口径。
 */
export async function resolveSeriesCoverBadgeIds(
  prisma: Pick<PrismaService, 'recipeHealthTag'>,
  rawIds: string[],
): Promise<string[]> {
  const ids = [
    ...new Set(
      (Array.isArray(rawIds) ? rawIds : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    ),
  ];

  if (ids.length > MAX_SERIES_COVER_BADGES) {
    throw new BadRequestException(
      `封面角标最多 ${MAX_SERIES_COVER_BADGES} 个（当前 ${ids.length} 个）`,
    );
  }
  if (ids.length === 0) return [];

  const found = await prisma.recipeHealthTag.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  if (found.length !== ids.length) {
    const foundIds = new Set(found.map((tag) => tag.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    throw new BadRequestException(
      `以下标签不在合规词表中，无法作为封面角标：${missing.join('、')}`,
    );
  }

  const byId = new Map(found.map((tag) => [tag.id, tag.name]));
  const orderedNames = ids
    .map((id) => byId.get(id))
    .filter((name): name is string => Boolean(name));

  // 只允许老板确认的 6 个词；「含…」/工艺特性/FEDIAF 2021 一律拒绝
  const ineligible = orderedNames.filter(
    (name) => !isCoverBadgeEligibleName(name),
  );
  if (ineligible.length > 0) {
    throw new BadRequestException(
      `以下词不能作为封面角标：${ineligible.join('、')}。只允许：${COVER_BADGE_ALLOWED_NAMES.join('、')}`,
    );
  }

  // 双保险：即使词表被历史数据污染，也不允许违规词出现在角标上
  const violations = orderedNames.filter(
    (name) => scanForbiddenClaims(name).length > 0,
  );
  if (violations.length > 0) {
    throw new BadRequestException(
      `标签「${violations.join('、')}」包含法规禁止的表述，不能作为封面角标`,
    );
  }

  return ids;
}
