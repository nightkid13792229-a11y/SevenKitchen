/**
 * 补剂浓度口径切换：`每 kg 配方` → `每 kg 食材`
 *
 * 背景（2026-10-29 定案）：
 *   补剂目标一直是「营养素量 ÷ 全部配料重量 × 1000」，但
 *   · 文案写的是「每kg食材添加 X」；
 *   · 车间投放按食材净重乘回去。
 *   两端不同基准，导致实际投放比配方本意少 0.7%–2%（补剂占配方的比例）。
 *
 * 代码侧已改为按「食材有效重量合计」计；本脚本把存量食谱的浓度按同一
 * 基准换算：新浓度 = 旧浓度 × 全部配料合计 ÷ 食材合计。
 * 只改 `recipe_item`（已发布食谱），不动订单快照与设计稿缓存。
 *
 * ⚠️ **一次性脚本**：库里的浓度没有「口径版本」标记，重复执行会再乘一次
 * （每次 +0.7%–3%）。2026-10-29 已在生产执行过一次，除非确认要再次换算，
 * 否则不要再加 --apply。
 *
 * 用法（默认 dry-run）：
 *   DATABASE_URL=... npx ts-node -r tsconfig-paths/register \
 *     scripts/recompute-supplement-targets-food-basis.ts [--apply]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type Target = {
  label?: string;
  targetValuePerKg?: number;
  [key: string]: unknown;
};

async function main() {
  console.log(`模式：${APPLY ? '【写入】--apply' : '【dry-run】只读'}\n`);

  const recipes = await prisma.recipe.findMany({
    where: { status: { in: ['PUBLIC', 'PRIVATE_CUSTOM'] } },
    select: { id: true, recipeId: true, version: true, name: true, status: true },
    orderBy: [{ name: 'asc' }],
  });

  let touchedRecipes = 0;
  let touchedRows = 0;
  const samples: Array<Record<string, unknown>> = [];

  for (const recipe of recipes) {
    const items = await prisma.recipeItem.findMany({
      where: { recipeId: recipe.recipeId, recipeVersion: recipe.version },
      include: { ingredient: { select: { name: true, type: true } } },
    });

    const weighted = items.filter((item) => Number(item.exampleWeight) > 0);
    const foodTotal = weighted
      .filter((item) => item.ingredient.type === 'FOOD')
      .reduce((sum, item) => sum + Number(item.exampleWeight), 0);
    const allTotal = weighted.reduce(
      (sum, item) => sum + Number(item.exampleWeight),
      0,
    );

    const supplements = items.filter(
      (item) =>
        item.ingredient.type === 'SUPPLEMENT' &&
        Array.isArray(item.supplementTargets),
    );
    if (supplements.length === 0) continue;
    if (foodTotal <= 0 || allTotal <= 0) {
      console.warn(
        `⚠️ ${recipe.name}（${recipe.recipeId}）没有食材克数，跳过`,
      );
      continue;
    }

    const factor = allTotal / foodTotal;
    if (Math.abs(factor - 1) < 0.0001) continue;

    touchedRecipes += 1;
    for (const item of supplements) {
      const targets = item.supplementTargets as unknown as Target[];
      const scaled = targets.map((target) => {
        const value = Number(target.targetValuePerKg);
        return Number.isFinite(value)
          ? { ...target, targetValuePerKg: round2(value * factor) }
          : target;
      });
      const legacy =
        item.nutrientTargetValue === null
          ? null
          : round2(Number(item.nutrientTargetValue) * factor);
      const changed =
        targets.some((target) =>
          Number.isFinite(Number(target.targetValuePerKg)),
        ) || legacy !== null;
      if (!changed) continue;

      if (samples.length < 8) {
        samples.push({
          recipe: recipe.name,
          supplement: item.ingredient.name,
          factor: round2(factor * 1000) / 1000,
          from: targets[0]?.targetValuePerKg,
          to: scaled[0]?.targetValuePerKg,
        });
      }
      touchedRows += 1;

      if (APPLY) {
        await prisma.recipeItem.update({
          where: { id: item.id },
          data: {
            supplementTargets: scaled as unknown as object,
            ...(legacy !== null ? { nutrientTargetValue: legacy } : {}),
          },
        });
      }
    }
  }

  console.log(`受影响食谱：${touchedRecipes} 份；补剂行：${touchedRows} 条`);
  console.table(samples);
  if (!APPLY) console.log('\n（dry-run 结束，未写库；确认后加 --apply）');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
