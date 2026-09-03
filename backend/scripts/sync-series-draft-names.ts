import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes('--apply'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。可使用 ENV_FILE=.env.production pnpm sync:series-draft-names',
    );
  }

  // 合并命名模型：草稿名应始终等于所属系列名。
  // 找出所有名字与系列名不一致的草稿，逐个分配新版本号后同步。
  const drafts = await prisma.designRecipe.findMany({
    where: { seriesId: { not: null } },
    select: {
      id: true,
      name: true,
      version: true,
      seriesId: true,
      series: { select: { id: true, name: true } },
    },
    orderBy: [{ seriesId: 'asc' }, { updatedAt: 'asc' }],
  });

  const pending = drafts.filter(
    (draft) =>
      draft.series?.name?.trim() &&
      draft.name.trim() !== draft.series.name.trim(),
  );

  if (pending.length === 0) {
    console.log('没有名字与系列名不一致的草稿，无需同步。');
    return;
  }

  console.log(`共 ${pending.length} 份草稿需要同步系列名：`);
  for (const draft of pending) {
    console.log(
      `- ${draft.id} 「${draft.name}」 → 「${draft.series!.name}」（系列 ${draft.seriesId}）`,
    );
  }

  if (!args.apply) {
    console.log('\n预览模式：使用 --apply 执行写入。');
    return;
  }

  let updated = 0;
  for (const draft of pending) {
    const targetName = draft.series!.name;
    const latestVersion = await prisma.designRecipe.aggregate({
      where: { name: targetName },
      _max: { version: true },
    });
    const nextVersion = (latestVersion._max.version ?? 0) + 1;
    await prisma.designRecipe.update({
      where: { id: draft.id },
      data: { name: targetName, version: nextVersion },
    });
    updated += 1;
  }

  console.log(`\n完成：已同步 ${updated} 份草稿的系列名。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
