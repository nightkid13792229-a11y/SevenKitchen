/**
 * 食材成本口径对账（2026-11-07 成本口径归位 · Task 14）
 *
 * 三块：
 *   ① 逐条对账：折算后的成本 == 折算前成本 ÷ 折算前换算（6 位小数）
 *   ② 成本双跑：已发布食谱 × 1000g 净食，折算前后成本对比
 *   ③ 待补清单：还没有启用中采购商品的食材（这批在食谱里会按 0 元算）
 *
 * 默认 dry-run，只读不写。`--apply` 目前不写任何东西（留作将来修数据用）。
 *
 * 为什么必须跑在**生产库**上：本地库里 115 条食材的换算本来就是 1，
 * 折算在本地是空操作，跑不出问题。
 *
 * 用法：
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/audit-food-cost-basis.ts
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

async function main() {
  const apply = process.argv.includes('--apply');

  const foodIngredients = await prisma.ingredient.findMany({
    where: { type: 'FOOD' },
    select: {
      id: true,
      name: true,
      baseUnit: true,
      purchaseToBaseRatio: true,
      currentPricePerPurchaseUnit: true,
      procurementSkus: { where: { isActive: true }, select: { id: true } },
    },
  });

  // ① 逐条对账：拿备份表（生产库才有）对比
  const backupTableExists = await tableExists(
    'ingredient_food_cost_backup_20261107',
  );
  if (!backupTableExists) {
    console.log('[① ] 没有备份表，跳过逐条对账（本地库跑迁移时没有可折算的行）');
  } else {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        old_price: string;
        old_ratio: number;
        new_cost: string;
      }>
    >(Prisma.sql`
      SELECT b."id", i."name",
             b."current_price_per_purchase_unit"::text AS old_price,
             b."purchase_to_base_ratio" AS old_ratio,
             i."current_price_per_purchase_unit"::text AS new_cost
      FROM "ingredient_food_cost_backup_20261107" b
      JOIN "ingredient" i ON i."id" = b."id"
      WHERE b."purchase_to_base_ratio" IS DISTINCT FROM 1
    `);

    const mismatched = rows.filter((row) => {
      const expected = round6(Number(row.old_price) / Number(row.old_ratio));
      return Math.abs(expected - Number(row.new_cost)) > 1e-6;
    });

    console.log(
      `[① ] 折算对账：${rows.length} 条需要折算，${mismatched.length} 条不一致`,
    );
    for (const row of mismatched.slice(0, 10)) {
      console.log(
        `     ✗ ${row.name}: 旧 ${row.old_price} ÷ ${row.old_ratio} ≠ 新 ${row.new_cost}`,
      );
    }
  }

  // ② 成本双跑：只看已发布食谱，逐道算「每 1000g 净食的原料成本」
  const recipes = await prisma.recipe.findMany({
    where: { status: 'PUBLIC' },
    select: {
      id: true,
      name: true,
      productionLossRate: true,
      items: { select: { ingredientId: true, ratioPercent: true } },
    },
  });

  // 折算前的老价 / 老换算（只备份过「换算 ≠ 1」的行，其余按原值即新值）
  const oldPriceByIngredient = new Map<
    string,
    { price: number; ratio: number }
  >();
  if (backupTableExists) {
    const backupRows = await prisma.$queryRaw<
      Array<{ id: string; old_price: string; old_ratio: number }>
    >(Prisma.sql`
      SELECT "id",
             "current_price_per_purchase_unit"::text AS old_price,
             "purchase_to_base_ratio" AS old_ratio
      FROM "ingredient_food_cost_backup_20261107"
    `);
    for (const row of backupRows) {
      oldPriceByIngredient.set(row.id, {
        price: Number(row.old_price),
        ratio: Number(row.old_ratio) || 1,
      });
    }
  }

  let compared = 0;
  let drifted = 0;
  let maxDelta = 0;
  const driftedRecipes: Array<{ name: string; oldCost: number; newCost: number }> =
    [];
  for (const recipe of recipes) {
    const ids = recipe.items.map((item) => item.ingredientId);
    if (ids.length === 0) continue;

    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        type: true,
        baseUnit: true,
        currentPricePerPurchaseUnit: true,
        purchaseToBaseRatio: true,
        properties: true,
      },
    });
    const byId = new Map(ingredients.map((item) => [item.id, item]));

    const totalRatio = recipe.items.reduce(
      (sum, item) => sum + (item.ratioPercent ?? 0),
      0,
    );
    if (!(totalRatio > 0)) continue;

    let cost = 0;
    let oldCost = 0;
    for (const item of recipe.items) {
      const ingredient = byId.get(item.ingredientId);
      if (!ingredient || ingredient.type !== 'FOOD') continue;

      const ratio = Number(ingredient.purchaseToBaseRatio ?? 0);
      const price = Number(ingredient.currentPricePerPurchaseUnit ?? 0);
      if (!(ratio > 0)) continue;

      const yieldRate = Number(
        (ingredient.properties as any)?.edible_yield_rate ?? 1,
      );
      const share = (item.ratioPercent ?? 0) / totalRatio;
      const netG = 1000 * share;
      const grossG =
        (netG / (yieldRate > 0 ? yieldRate : 1)) * recipe.productionLossRate;

      cost += (grossG / ratio) * price;

      // 折算前：价 ÷ 换算（没有备份的行说明本来就等价）
      const old = oldPriceByIngredient.get(ingredient.id);
      const oldRatio = old?.ratio && old.ratio > 0 ? old.ratio : ratio;
      const oldPrice = old ? old.price : price;
      oldCost += (grossG / oldRatio) * oldPrice;
    }

    compared += 1;
    if (!Number.isFinite(cost) || !Number.isFinite(oldCost)) {
      drifted += 1;
      continue;
    }

    const delta = Math.abs(cost - oldCost);
    if (delta > maxDelta) maxDelta = delta;
    if (delta > 0.005) {
      drifted += 1;
      driftedRecipes.push({
        name: recipe.name,
        oldCost: Number(oldCost.toFixed(4)),
        newCost: Number(cost.toFixed(4)),
      });
    }
  }

  console.log(
    `[② ] 成本双跑：${compared} 个已发布食谱，新旧差最大 ¥${maxDelta.toFixed(4)}，` +
      `超过 1 分钱的 ${drifted} 个`,
  );
  for (const row of driftedRecipes.slice(0, 10)) {
    console.log(
      `     ✗ ${row.name}: 旧 ¥${row.oldCost} → 新 ¥${row.newCost}`,
    );
  }

  // ②b 上线前体检：换算为 0 的食材会让迁移直接除零失败
  const zeroRatio = foodIngredients.filter(
    (item) => !(Number(item.purchaseToBaseRatio) > 0),
  );
  console.log(`[②b] 换算为 0 的食材：${zeroRatio.length} 条（必须为 0，否则迁移会失败）`);
  for (const item of zeroRatio.slice(0, 10)) {
    console.log(`     ✗ ${item.name}`);
  }

  // ②c 上线前体检：采购商品缺换算会让「2 盒」记成「2 克」
  const skusWithoutRatio = await prisma.procurementSku.findMany({
    where: {
      isActive: true,
      ingredient: { type: 'FOOD' },
      OR: [{ purchaseToBaseRatio: null }, { purchaseToBaseRatio: { lte: 0 } }],
    },
    select: { name: true },
  });
  console.log(
    `[②c] 启用中但没填换算的采购商品：${skusWithoutRatio.length} 条（必须为 0，否则采购数量会记错）`,
  );
  for (const sku of skusWithoutRatio.slice(0, 10)) {
    console.log(`     ✗ ${sku.name}`);
  }

  // ③ 待补清单
  const pending = foodIngredients.filter((item) => item.procurementSkus.length === 0);
  const unpriced = foodIngredients.filter(
    (item) => Number(item.currentPricePerPurchaseUnit ?? 0) <= 0,
  );

  console.log(
    `[③ ] 待补采购商品：${pending.length} 条；成本为 0：${unpriced.length} 条（共 ${foodIngredients.length} 条食材）`,
  );
  for (const item of pending.slice(0, 10)) {
    console.log(`     · ${item.name}`);
  }

  if (apply) {
    console.log('--apply 目前不写任何东西：本脚本只做对账。');
  }

  await prisma.$disconnect();
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${name}
      ) AS "exists"
    `,
  );
  return Boolean(rows[0]?.exists);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
