export type AuditSeverity = 'high' | 'medium' | 'info';

export interface AuditedRecipeVersion {
  internalId: string;
  businessRecipeId: string;
  name: string;
  version: number;
  status: string;
  favoriteCount: number;
  actualFavoriteRecords: number;
  viewCount: number;
  diyGenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeAuditFlag {
  code: string;
  severity: AuditSeverity;
  message: string;
}

export interface RecipeAuditReport {
  businessRecipeId: string;
  name: string;
  latestOverallVersion: AuditedRecipeVersion;
  latestPublicVersion: AuditedRecipeVersion | null;
  versions: AuditedRecipeVersion[];
  flags: RecipeAuditFlag[];
}

export interface RecipeStatsAuditArgs {
  recipeId: string | null;
  includeOk: boolean;
  limit: number;
}

const SEVERITY_SCORE: Record<AuditSeverity, number> = {
  high: 100,
  medium: 10,
  info: 1,
};

export function buildRecipeAuditReport(
  recipeVersions: AuditedRecipeVersion[],
): RecipeAuditReport {
  if (recipeVersions.length === 0) {
    throw new Error('recipeVersions must not be empty');
  }

  const versions = [...recipeVersions].sort((left, right) => {
    if (right.version !== left.version) {
      return right.version - left.version;
    }
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });

  const latestOverallVersion = versions[0];
  const latestPublicVersion =
    versions.find((version) => version.status === 'PUBLIC') ?? null;

  const flags: RecipeAuditFlag[] = [];
  const mismatchedVersions = versions.filter(
    (version) => version.favoriteCount !== version.actualFavoriteRecords,
  );

  if (mismatchedVersions.length > 0) {
    flags.push({
      code: 'favorite_count_mismatch',
      severity: 'high',
      message: `favoriteCount 与 favorite_recipe 聚合不一致，涉及版本: ${mismatchedVersions
        .map((version) => `v${version.version}`)
        .join(', ')}`,
    });
  }

  if (!latestPublicVersion) {
    flags.push({
      code: 'missing_public_version',
      severity: 'info',
      message: '该食谱没有 PUBLIC 版本，首页橱窗不会展示它。',
    });
  }

  if (
    latestPublicVersion &&
    latestPublicVersion.internalId !== latestOverallVersion.internalId
  ) {
    flags.push({
      code: 'version_drift',
      severity: 'medium',
      message: `最新版本是 v${latestOverallVersion.version} (${latestOverallVersion.status})，但首页展示的是 v${latestPublicVersion.version} (PUBLIC)。`,
    });

    flags.push({
      code: 'view_count_not_fully_auditable',
      severity: 'info',
      message:
        'viewCount 没有事件明细表，只能确认写入路径和版本漂移风险，不能直接回放历史浏览总量。',
    });

    flags.push({
      code: 'diy_gen_count_not_fully_auditable',
      severity: 'info',
      message:
        'diyGenCount 没有事件明细表，只能确认写入路径和版本漂移风险，不能直接回放历史生成总量。',
    });
  }

  if (latestPublicVersion) {
    const favoriteRecordsOnNonDisplayedVersion = versions
      .filter((version) => version.internalId !== latestPublicVersion.internalId)
      .reduce((sum, version) => sum + version.actualFavoriteRecords, 0);

    if (favoriteRecordsOnNonDisplayedVersion > 0) {
      flags.push({
        code: 'favorite_records_on_non_displayed_version',
        severity: 'high',
        message: `有 ${favoriteRecordsOnNonDisplayedVersion} 条收藏记录挂在非首页展示版本上。`,
      });
    }
  }

  return {
    businessRecipeId: latestOverallVersion.businessRecipeId,
    name: latestOverallVersion.name,
    latestOverallVersion,
    latestPublicVersion,
    versions,
    flags,
  };
}

export function sortAuditReportsByRisk(
  reports: RecipeAuditReport[],
): RecipeAuditReport[] {
  return [...reports].sort((left, right) => {
    const scoreDiff = getRiskScore(right) - getRiskScore(left);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return left.businessRecipeId.localeCompare(right.businessRecipeId);
  });
}

export function parseRecipeStatsAuditArgs(
  argv: string[],
): RecipeStatsAuditArgs {
  let recipeId: string | null = null;
  let includeOk = false;
  let limit = 20;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--recipe') {
      recipeId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--include-ok') {
      includeOk = true;
      continue;
    }

    if (arg === '--limit') {
      const rawLimit = argv[index + 1];
      const parsedLimit = Number(rawLimit);
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        limit = parsedLimit;
      }
      index += 1;
    }
  }

  return {
    recipeId,
    includeOk,
    limit,
  };
}

function getRiskScore(report: RecipeAuditReport): number {
  return report.flags.reduce(
    (sum, flag) => sum + SEVERITY_SCORE[flag.severity],
    0,
  );
}
