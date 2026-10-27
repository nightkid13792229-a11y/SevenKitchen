/**
 * 把「已交付但被系列改名连带改掉」的私密食谱名字恢复成交付当时的名字。
 *
 * ## 背景
 *
 * `renameSeries` 原来会把该系列下**所有** Recipe 行一起改名，包括已经交付给
 * 顾客的私密定制食谱。于是历史订单里出现「名字是鸭肉高蛋白定制餐、点开原料
 * 却是兔里脊」—— 名字跟着系列走，原料冻结在交付那一刻，两边对不上。
 *
 * 改名逻辑已修（交付过的不再改名）；这个脚本负责把**已经被改坏的历史数据**
 * 修回来。名字的唯一可信来源是交付快照
 * （`custom_recipe_delivery_item.content_snapshot.recipe.name`）。
 *
 * ## 只修「还没重交过」的行
 *
 * 交付之后如果又重新交付过，Recipe 行会被重新写入（名字与原料都是新的），
 * 这时旧快照的名字已经过时，不能拿来覆盖。判断口径：
 *   **Recipe 行的原料名单与快照里的完全一致** → 说明交付后没有重写过内容，
 *   只是被改名连坐；这时才恢复名字。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register prisma/restore-delivered-recipe-names.ts
 *   npx ts-node -r tsconfig-paths/register prisma/restore-delivered-recipe-names.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

interface SnapshotLike {
  recipe?: {
    name?: string;
    items?: Array<{ name?: string }>;
  };
}

function itemNames(raw: unknown): string[] {
  const items = (raw as SnapshotLike | null)?.recipe?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item?.name ?? '').trim())
    .filter(Boolean)
    .sort();
}

function snapshotName(raw: unknown): string {
  return String((raw as SnapshotLike | null)?.recipe?.name ?? '').trim();
}

async function main() {
  /**
   * 只需要「已交付」的 Recipe：批次交付 + 老单份交付两条路都看。
   */
  const deliveredItems = await prisma.customRecipeDeliveryItem.findMany({
    select: {
      recipeId: true,
      contentSnapshot: true,
      batch: { select: { deliveredAt: true } },
      recipe: { select: { id: true, name: true, items: { select: { ingredient: { select: { name: true } } } } } },
    },
  });
  const legacyDeliveries = await prisma.customRecipeDelivery.findMany({
    select: {
      recipeId: true,
      contentSnapshot: true,
      deliveredAt: true,
      recipe: { select: { id: true, name: true, items: { select: { ingredient: { select: { name: true } } } } } },
    },
  });

  const rows = [
    ...deliveredItems.map((item) => ({
      recipeId: item.recipeId,
      snapshot: item.contentSnapshot,
      deliveredAt: item.batch?.deliveredAt ?? null,
      recipe: item.recipe,
    })),
    ...legacyDeliveries.map((item) => ({
      recipeId: item.recipeId,
      snapshot: item.contentSnapshot,
      deliveredAt: item.deliveredAt,
      recipe: item.recipe,
    })),
  ];

  /** 同一份食谱可能交付过多次：取最新那次的快照 */
  const latestByRecipe = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const current = latestByRecipe.get(row.recipeId);
    const rowTime = row.deliveredAt ? row.deliveredAt.getTime() : 0;
    const currentTime = current?.deliveredAt ? current.deliveredAt.getTime() : -1;
    if (!current || rowTime >= currentTime) latestByRecipe.set(row.recipeId, row);
  }

  let checked = 0;
  let mismatched = 0;
  let repaired = 0;
  let skipped = 0;

  for (const [recipeId, row] of Array.from(latestByRecipe.entries())) {
    if (!row.recipe) continue;
    checked += 1;

    const wanted = snapshotName(row.snapshot);
    if (!wanted || wanted === row.recipe.name) continue;
    mismatched += 1;

    const liveNames = row.recipe.items
      .map((item) => String(item.ingredient?.name ?? '').trim())
      .filter(Boolean)
      .sort();
    const snapNames = itemNames(row.snapshot);
    const sameContent =
      liveNames.length > 0 &&
      liveNames.length === snapNames.length &&
      liveNames.every((name, index) => name === snapNames[index]);

    if (!sameContent) {
      skipped += 1;
      console.log(
        `[skip] ${recipeId} 「${row.recipe.name}」≠ 快照「${wanted}」：交付后被重写过内容，不覆盖`,
      );
      continue;
    }

    console.log(
      `[fix ] ${recipeId} 「${row.recipe.name}」→「${wanted}」（交付于 ${row.deliveredAt?.toISOString() ?? '未知'}）`,
    );
    if (APPLY) {
      await prisma.recipe.update({
        where: { id: recipeId },
        data: { name: wanted },
      });
    }
    repaired += 1;
  }

  console.log(
    `\n检查 ${checked} 份已交付食谱：名字不一致 ${mismatched} 份，` +
      `${APPLY ? '已修复' : '可修复'} ${repaired} 份，跳过 ${skipped} 份。` +
      (APPLY ? '' : '\n（未写入。加 --apply 执行）'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
