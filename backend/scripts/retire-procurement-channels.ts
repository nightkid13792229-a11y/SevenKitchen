/**
 * 停用「批发市场」「美菜网」两个渠道的采购商品（默认 dry-run）。
 *
 * 背景（2026-11-04）：老板决定以后不从这两个渠道采购。
 * 只停用（isActive=false），不物理删除：
 *   · procurement_sku_price_history 对 SKU 是级联删除，硬删会抹掉历史价；
 *   · 采购记录里存的是 SKU 名称快照，停用后历史单据仍可读。
 *
 *   npx ts-node -r tsconfig-paths/register scripts/retire-procurement-channels.ts
 *   npx ts-node -r tsconfig-paths/register scripts/retire-procurement-channels.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const CHANNELS = ['批发市场', '美菜网'];

async function main() {
  const targets = await prisma.procurementSku.findMany({
    where: { isActive: true, purchaseChannel: { in: CHANNELS } },
    select: {
      id: true,
      name: true,
      purchaseChannel: true,
      ingredientId: true,
      ingredient: { select: { name: true } },
    },
    orderBy: [{ purchaseChannel: 'asc' }, { name: 'asc' }],
  });

  const byChannel = new Map<string, number>();
  for (const sku of targets) {
    const key = sku.purchaseChannel || '(空)';
    byChannel.set(key, (byChannel.get(key) ?? 0) + 1);
  }

  console.log(
    `[retire-procurement-channels] mode=${apply ? 'APPLY' : 'DRY-RUN'} total=${targets.length}`,
  );
  for (const [channel, count] of byChannel) {
    console.log(`  ${channel}: ${count} 个采购商品`);
  }

  const targetIds = new Set(targets.map((sku) => sku.id));
  const affectedIngredients = new Set(targets.map((sku) => sku.ingredientId));

  // 停用后一个可用商品都不剩的原料：这些原料在日采里会要求现场新建商品。
  const remaining = await prisma.procurementSku.findMany({
    where: {
      isActive: true,
      ingredientId: { in: Array.from(affectedIngredients) },
    },
    select: { id: true, ingredientId: true, ingredient: { select: { name: true } } },
  });
  const leftByIngredient = new Map<string, number>();
  for (const sku of remaining) {
    if (targetIds.has(sku.id)) continue;
    leftByIngredient.set(
      sku.ingredientId,
      (leftByIngredient.get(sku.ingredientId) ?? 0) + 1,
    );
  }
  const noSku = Array.from(affectedIngredients)
    .filter((id) => (leftByIngredient.get(id) ?? 0) === 0)
    .map(
      (id) =>
        targets.find((sku) => sku.ingredientId === id)?.ingredient.name ?? id,
    );

  console.log(`  停用后无可用商品的原料: ${noSku.length}`);
  noSku.forEach((name) => console.log(`    - ${name}`));

  if (!apply) {
    console.log('  （dry-run：加 --apply 才会写库）');
    return;
  }

  const result = await prisma.procurementSku.updateMany({
    where: { id: { in: Array.from(targetIds) } },
    data: { isActive: false },
  });
  console.log(`  已停用 ${result.count} 个采购商品`);
}

main()
  .catch((error) => {
    console.error('[retire-procurement-channels] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
