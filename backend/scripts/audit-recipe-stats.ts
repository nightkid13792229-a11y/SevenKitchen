import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  buildRecipeAuditReport,
  parseRecipeStatsAuditArgs,
  sortAuditReportsByRisk,
  type AuditedRecipeVersion,
  type RecipeAuditFlag,
  type RecipeAuditReport,
} from '../src/support/recipe-stats-audit';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

async function main() {
  const args = parseRecipeStatsAuditArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。可使用 ENV_FILE=.env.production pnpm audit:recipe-stats',
    );
  }

  const versions = await loadRecipeVersions(args.recipeId);

  if (versions.length === 0) {
    if (args.recipeId) {
      console.log(`未找到业务食谱 ID 为 ${args.recipeId} 的记录。`);
      return;
    }

    console.log('未找到任何食谱记录。');
    return;
  }

  const reports = buildReports(versions);
  const filteredReports = args.includeOk
    ? reports
    : reports.filter((report) => report.flags.length > 0);
  const visibleReports = args.recipeId
    ? filteredReports
    : filteredReports.slice(0, args.limit);

  printHeader(reports.length, filteredReports.length, args);

  if (visibleReports.length === 0) {
    console.log('未发现需要优先关注的收藏数/版本漂移风险。');
    return;
  }

  if (args.recipeId) {
    printRecipeDetail(visibleReports[0]);
    return;
  }

  printSummary(visibleReports);
}

async function loadRecipeVersions(
  recipeId: string | null,
): Promise<AuditedRecipeVersion[]> {
  const recipes = await prisma.recipe.findMany({
    where: recipeId ? { recipeId } : undefined,
    select: {
      id: true,
      recipeId: true,
      name: true,
      version: true,
      status: true,
      favoriteCount: true,
      viewCount: true,
      diyGenCount: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
  });

  const internalIds = recipes.map((recipe) => recipe.id);
  const favoriteCounts =
    internalIds.length > 0
      ? await prisma.favoriteRecipe.groupBy({
          by: ['recipeId'],
          where: {
            recipeId: {
              in: internalIds,
            },
          },
          _count: {
            recipeId: true,
          },
        })
      : [];

  const favoriteCountMap = new Map(
    favoriteCounts.map((row) => [row.recipeId, row._count.recipeId]),
  );

  return recipes.map((recipe) => ({
    internalId: recipe.id,
    businessRecipeId: recipe.recipeId,
    name: recipe.name,
    version: recipe.version,
    status: recipe.status,
    favoriteCount: recipe.favoriteCount,
    actualFavoriteRecords: favoriteCountMap.get(recipe.id) ?? 0,
    viewCount: recipe.viewCount,
    diyGenCount: recipe.diyGenCount,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  }));
}

function buildReports(versions: AuditedRecipeVersion[]): RecipeAuditReport[] {
  const versionMap = new Map<string, AuditedRecipeVersion[]>();

  for (const version of versions) {
    const existing = versionMap.get(version.businessRecipeId) ?? [];
    existing.push(version);
    versionMap.set(version.businessRecipeId, existing);
  }

  return sortAuditReportsByRisk(
    Array.from(versionMap.values()).map((group) => buildRecipeAuditReport(group)),
  );
}

function printHeader(
  totalReports: number,
  flaggedReports: number,
  args: ReturnType<typeof parseRecipeStatsAuditArgs>,
) {
  console.log('Recipe Stats Audit');
  console.log('Read-only Prisma audit for recipe showcase counters.');
  console.log(
    'favoriteCount 可直接对账 favorite_recipe；viewCount 和 diyGenCount 只能做风险扫描，因为没有事件明细表。',
  );
  console.log(`ENV_FILE=${process.env.ENV_FILE || '.env'}`);
  console.log(`扫描食谱组数: ${totalReports}`);
  console.log(`命中风险食谱组数: ${flaggedReports}`);
  if (!args.recipeId) {
    console.log(`当前输出上限: ${args.limit}`);
  }
  console.log('');
}

function printSummary(reports: RecipeAuditReport[]) {
  console.log('Summary');

  for (const report of reports) {
    const highestSeverity = report.flags[0]?.severity?.toUpperCase() ?? 'OK';
    const latestPublic = report.latestPublicVersion
      ? `v${report.latestPublicVersion.version}`
      : 'none';
    const latestOverall = `v${report.latestOverallVersion.version}`;

    console.log(
      `- ${highestSeverity} ${report.businessRecipeId} | ${report.name} | public=${latestPublic} overall=${latestOverall}`,
    );

    for (const flag of report.flags) {
      console.log(`  ${formatFlag(flag)}`);
    }
  }
}

function printRecipeDetail(report: RecipeAuditReport) {
  console.log(`Recipe ${report.businessRecipeId}`);
  console.log(`名称: ${report.name}`);
  console.log(
    `最新版本: v${report.latestOverallVersion.version} (${report.latestOverallVersion.status})`,
  );
  console.log(
    `首页展示版本: ${
      report.latestPublicVersion
        ? `v${report.latestPublicVersion.version} (${report.latestPublicVersion.status})`
        : '无 PUBLIC 版本'
    }`,
  );
  console.log('');

  if (report.flags.length === 0) {
    console.log('Flags');
    console.log('- 无风险标记');
  } else {
    console.log('Flags');
    for (const flag of report.flags) {
      console.log(`- ${formatFlag(flag)}`);
    }
  }

  console.log('');
  console.log('Versions');
  for (const version of report.versions) {
    const markers: string[] = [];
    if (version.internalId === report.latestOverallVersion.internalId) {
      markers.push('latest-overall');
    }
    if (version.internalId === report.latestPublicVersion?.internalId) {
      markers.push('home-displayed');
    }

    console.log(
      `- v${version.version} ${version.status} id=${version.internalId} favorites=${version.favoriteCount}/${version.actualFavoriteRecords} views=${version.viewCount} diy=${version.diyGenCount}${markers.length > 0 ? ` [${markers.join(', ')}]` : ''}`,
    );
  }
}

function formatFlag(flag: RecipeAuditFlag): string {
  return `[${flag.severity.toUpperCase()}] ${flag.code}: ${flag.message}`;
}

main()
  .catch((error) => {
    console.error('Recipe stats audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
