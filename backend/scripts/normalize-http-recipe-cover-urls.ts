/**
 * 把历史遗留的 http:// 图片地址统一升级为 https://（目前只涉及 recipe.cover_image_url）。
 *
 * 背景：
 *   早期 CDN 域名未配置 HTTPS，正式食谱的封面地址是以 http://img.sevenkitchen.cloud/...
 *   落库的。后台页面本身走 HTTPS，引用 http 图片会触发浏览器 Mixed Content 警告
 *   （Chromium 会自动升级为 HTTPS，图片仍能显示，但控制台一直报警）。
 *   后端读接口已经做了兜底归一化（src/utils/image-url.util.ts），
 *   本脚本用于把库里这份脏数据本身修干净。
 *
 * 用法（默认 dry-run，只读不写）：
 *   npx ts-node -r tsconfig-paths/register scripts/normalize-http-recipe-cover-urls.ts
 *   npx ts-node -r tsconfig-paths/register scripts/normalize-http-recipe-cover-urls.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

type RecipeCoverRecord = {
  id: string;
  recipeId: string;
  version: number;
  name: string;
  status: string;
  coverImageUrl: string;
};

type NormalizePrisma = {
  recipe: {
    findMany: (args: unknown) => Promise<RecipeCoverRecord[]>;
    update: (args: unknown) => Promise<unknown>;
  };
};

export type NormalizeHttpCoverUrlsArgs = {
  apply: boolean;
};

export type NormalizeHttpCoverUrlsCounters = {
  scanned: number;
  applied: number;
  errors: number;
};

export function toHttpsUrl(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

export function parseNormalizeArgs(argv: string[]): NormalizeHttpCoverUrlsArgs {
  let apply = false;
  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
    }
  }
  return { apply };
}

export async function runNormalizeHttpCoverUrls({
  prisma,
  apply,
  logger,
}: {
  prisma: NormalizePrisma;
  apply: boolean;
  logger: Logger;
}): Promise<NormalizeHttpCoverUrlsCounters> {
  logger.info(
    apply
      ? 'Applying http→https cover url normalization...'
      : 'Dry run: http→https cover url normalization...',
  );

  const rows = await prisma.recipe.findMany({
    where: { coverImageUrl: { startsWith: 'http://' } },
    select: {
      id: true,
      recipeId: true,
      version: true,
      name: true,
      status: true,
      coverImageUrl: true,
    },
    orderBy: [{ name: 'asc' }, { version: 'desc' }],
  });

  const counters: NormalizeHttpCoverUrlsCounters = {
    scanned: rows.length,
    applied: 0,
    errors: 0,
  };

  for (const row of rows) {
    const nextUrl = toHttpsUrl(row.coverImageUrl);
    logger.info(
      `${apply ? 'Applying' : 'Would normalize'} ${row.name} v${row.version} (${row.status}): ${row.coverImageUrl} -> ${nextUrl}`,
    );

    if (!apply) {
      continue;
    }

    try {
      await prisma.recipe.update({
        where: { id: row.id },
        data: { coverImageUrl: nextUrl },
      });
      counters.applied += 1;
    } catch (error) {
      counters.errors += 1;
      logger.error(
        `${row.name} (${row.id}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger.info(
    `Summary: scanned=${counters.scanned}, applied=${counters.applied}, errors=${counters.errors}`,
  );
  return counters;
}

async function main() {
  loadEnv({ path: process.env.ENV_FILE || '.env' });
  const args = parseNormalizeArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const counters = await runNormalizeHttpCoverUrls({
      prisma: prisma as unknown as NormalizePrisma,
      apply: args.apply,
      logger: console,
    });
    if (counters.errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
