/**
 * 修复「配方总重过期」导致的配比/补剂浓度错误（一次性数据修复）
 *
 * 背景（2026-10-28 事故）：
 *   设计稿的 `total_weight_g` 只在评估成功落库时更新。人工在编辑器里改完克数后
 *   没有跑评估，发布时仍拿旧总重当分母，于是：
 *     · recipe_item.ratio_percent      = 新克数 ÷ 旧总重（合计不到 100%）
 *     · 补剂 targetValuePerKg          = 营养量 ÷ 旧总重（偏低）
 *   定价/采购那边会「归一到 100%」，所以采购单是对的；车间直接乘比例，于是偏少。
 *
 * 本脚本按「克数是唯一真源」重算：
 *   · 食材配比 = 克数 ÷ 食材克数合计 × 100（两位小数，与发布口径一致）
 *   · 补剂浓度 = 旧浓度 × 旧总重 ÷ 新总重（新总重 = 全部原料克数合计）
 *   · 同步修 recipe_item、订单里的 recipe_snapshot、设计稿 total_weight_g
 *
 * 用法（默认 dry-run，只打印不写库）：
 *   DATABASE_URL=... npx ts-node -r tsconfig-paths/register \
 *     scripts/repair-recipe-snapshot-ratios.ts \
 *     --recipe af33ac22-... --recipe 9aec0c8a-... --recipe 4e72f411-... \
 *     --orders SK20261028-001,SK20261028-002,SK20261028-004 \
 *     [--apply]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

function argValues(flag: string): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag && argv[i + 1]) out.push(argv[i + 1]);
    else if (argv[i].startsWith(`${flag}=`)) out.push(argv[i].slice(flag.length + 1));
  }
  return out;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

type SupplementTarget = {
  unit?: string;
  label?: string;
  fieldPath?: string;
  targetValuePerKg?: number;
  [key: string]: unknown;
};

function scaleTargets(
  targets: unknown,
  factor: number,
): { next: SupplementTarget[]; changes: Array<{ label: string; from: number; to: number }> } {
  const list = Array.isArray(targets) ? (targets as SupplementTarget[]) : [];
  const changes: Array<{ label: string; from: number; to: number }> = [];
  const next = list.map((t) => {
    const from = Number(t.targetValuePerKg);
    if (!Number.isFinite(from)) return t;
    const to = round2(from * factor);
    changes.push({ label: t.label ?? t.fieldPath ?? '?', from, to });
    return { ...t, targetValuePerKg: to };
  });
  return { next, changes };
}

type OrderItemRow = {
  id: string;
  orderNo: string;
  quantityG: number;
  recipeSnapshot: any;
};

async function main() {
  const recipeIds = argValues('--recipe');
  const orderNos = (argValues('--orders')[0] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (recipeIds.length === 0) {
    throw new Error('缺少 --recipe 参数');
  }

  console.log(`模式：${APPLY ? '【写入】--apply' : '【dry-run】只读，不改库'}`);
  console.log(`食谱：${recipeIds.join(', ')}`);
  console.log(`订单：${orderNos.join(', ') || '(不修订单快照)'}\n`);

  const orderItems: OrderItemRow[] = orderNos.length
    ? (
        await prisma.orderItem.findMany({
          where: { order: { orderNo: { in: orderNos } } },
          select: {
            id: true,
            quantityG: true,
            recipeSnapshot: true,
            order: { select: { orderNo: true } },
          },
        })
      ).map((r) => ({
        id: r.id,
        orderNo: r.order.orderNo ?? '',
        quantityG: Number(r.quantityG),
        recipeSnapshot: r.recipeSnapshot,
      }))
    : [];

  const summary: Array<Record<string, unknown>> = [];

  for (const recipeId of recipeIds) {
    const recipe = await prisma.recipe.findFirst({
      where: { recipeId },
      orderBy: { version: 'desc' },
    });
    if (!recipe) throw new Error(`找不到食谱 ${recipeId}`);

    const items = await prisma.recipeItem.findMany({
      where: { recipeId, recipeVersion: recipe.version },
      include: { ingredient: { select: { name: true, type: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    const design = await prisma.designRecipe.findUnique({ where: { id: recipeId } });
    const oldTotal = Number(design?.totalWeightG ?? 0);

    const weighted = items.filter((i) => Number(i.exampleWeight) > 0);
    const allTotal = round2(
      weighted.reduce((s, i) => s + Number(i.exampleWeight), 0),
    );
    const foodItems = weighted.filter((i) => i.ingredient.type === 'FOOD');
    const foodTotal = round2(
      foodItems.reduce((s, i) => s + Number(i.exampleWeight), 0),
    );
    if (foodTotal <= 0) throw new Error(`${recipeId} 没有食材克数，无法重算`);
    if (oldTotal <= 0) throw new Error(`${recipeId} 旧总重为 0，无法换算补剂`);

    const factor = oldTotal / allTotal;

    console.log(`\n=== ${recipe.name}（v${recipe.version}）`);
    console.log(
      `食材合计 ${foodTotal}g ｜ 全部原料合计 ${allTotal}g ｜ 发布时用的旧总重 ${oldTotal}g`,
    );
    console.log(`补剂换算倍数：${round2(factor * 100) / 100}\n`);
    console.log('食材配比：');
    console.log('  原料                     克数      旧配比 →  新配比');
    for (const item of foodItems) {
      const oldRatio = Number(item.ratioPercent ?? 0);
      const newRatio = round2((Number(item.exampleWeight) / foodTotal) * 100);
      console.log(
        `  ${item.ingredient.name.padEnd(20, ' ')} ${String(item.exampleWeight).padStart(6)}g  ${String(oldRatio).padStart(6)}% → ${String(newRatio).padStart(6)}%`,
      );
    }
    const newSum = round2(
      foodItems.reduce(
        (s, i) => s + round2((Number(i.exampleWeight) / foodTotal) * 100),
        0,
      ),
    );
    console.log(`  合计 → ${newSum}%\n`);

    // 补剂
    const supplementItems = items.filter((i) => i.ingredient.type === 'SUPPLEMENT');
    const supplementUpdates: Array<{ id: string; next: SupplementTarget[]; legacy: number | null }> = [];
    if (supplementItems.length) console.log('补剂浓度（每 kg 配方）：');
    for (const item of supplementItems) {
      const { next, changes } = scaleTargets(item.supplementTargets, factor);
      const legacyFrom = item.nutrientTargetValue === null ? null : Number(item.nutrientTargetValue);
      const legacyTo = legacyFrom === null ? null : round2(legacyFrom * factor);
      if (legacyFrom !== null) {
        console.log(
          `  ${item.ingredient.name.padEnd(20, ' ')} ${changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join('；')}` +
            (supplementItems[0] && changes[0]?.label !== '营养目标' ? `（legacy ${legacyFrom} → ${legacyTo}）` : ''),
        );
      } else {
        console.log(
          `  ${item.ingredient.name.padEnd(20, ' ')} ${changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join('；')}`,
        );
      }
      supplementUpdates.push({ id: item.id, next, legacy: legacyTo });
    }

    // 订单快照预览
    const relatedOrderItems = orderItems.filter(
      (o) => o.recipeSnapshot?.id === recipeId,
    );
    for (const oi of relatedOrderItems) {
      const lossRate = Number(oi.recipeSnapshot?.production_loss_rate ?? 1.07);
      const snapItems: any[] = Array.isArray(oi.recipeSnapshot?.items)
        ? oi.recipeSnapshot.items
        : [];
      const foodSnap = snapItems.filter(
        (s) => String(s.ingredient_type ?? 'FOOD').toUpperCase() === 'FOOD' && Number(s.example_weight) > 0,
      );
      const snapFoodTotal = round2(foodSnap.reduce((s, i) => s + Number(i.example_weight), 0));
      console.log(
        `\n  订单 ${oi.orderNo}（${oi.quantityG}g，损耗 ${lossRate}）车间用量预览：`,
      );
      for (const s of foodSnap.slice(0, 5)) {
        const oldR = Number(s.ratio ?? 0);
        const newR = round2((Number(s.example_weight) / snapFoodTotal) * 100);
        const oldG = round1(oi.quantityG * lossRate * (oldR / 100));
        const newG = round1(oi.quantityG * lossRate * (newR / 100));
        console.log(
          `    ${String(s.name).padEnd(10, ' ')} ${s.example_weight}g  ${oldR}% → ${newR}%   ${oldG}g → ${newG}g`,
        );
      }
      console.log(`    （共 ${foodSnap.length} 样食材，预览前 5 样；快照食材合计 ${snapFoodTotal}g）`);
    }

    summary.push({
      recipeId,
      name: recipe.name,
      version: recipe.version,
      foodTotal,
      allTotal,
      oldTotal,
      factor: round2(factor * 100) / 100,
      foodItems: foodItems.length,
      supplements: supplementItems.length,
      orderItems: relatedOrderItems.map((o) => o.orderNo),
    });

    if (!APPLY) continue;

    // ---------- 写入 ----------
    await prisma.$transaction(async (tx) => {
      for (const item of foodItems) {
        const newRatio = round2((Number(item.exampleWeight) / foodTotal) * 100);
        if (round2(Number(item.ratioPercent ?? 0)) === newRatio) continue;
        await tx.recipeItem.update({
          where: { id: item.id },
          data: { ratioPercent: newRatio },
        });
      }
      for (const item of supplementUpdates) {
        const data: Record<string, unknown> = { supplementTargets: item.next };
        if (item.legacy !== null) data.nutrientTargetValue = item.legacy;
        await tx.recipeItem.update({ where: { id: item.id }, data });
      }
      await tx.designRecipe.update({
        where: { id: recipeId },
        data: { totalWeightG: allTotal },
      });
      for (const oi of relatedOrderItems) {
        const snapshot = JSON.parse(JSON.stringify(oi.recipeSnapshot));
        const snapItems: any[] = Array.isArray(snapshot.items) ? snapshot.items : [];
        const snapFood = snapItems.filter(
          (s) => String(s.ingredient_type ?? 'FOOD').toUpperCase() === 'FOOD' && Number(s.example_weight) > 0,
        );
        const snapFoodTotal = snapFood.reduce((s, i) => s + Number(i.example_weight), 0);
        for (const s of snapItems) {
          const type = String(s.ingredient_type ?? 'FOOD').toUpperCase();
          if (type === 'FOOD' && Number(s.example_weight) > 0) {
            s.ratio = round2((Number(s.example_weight) / snapFoodTotal) * 100);
          } else if (type === 'SUPPLEMENT') {
            const { next } = scaleTargets(s.supplement_targets, factor);
            s.supplement_targets = next;
            if (s.nutrient_target_value !== null && s.nutrient_target_value !== undefined) {
              s.nutrient_target_value = round2(Number(s.nutrient_target_value) * factor);
            }
          }
        }
        await tx.orderItem.update({
          where: { id: oi.id },
          data: { recipeSnapshot: snapshot },
        });
      }
    });
    console.log('  → 已写入');
  }

  console.log('\n===== 汇总 =====');
  console.table(summary);
  if (!APPLY) console.log('\n（dry-run 结束，未写库；确认后加 --apply）');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
