/**
 * 补剂库存预占回填（一次性，2026-10-20 P7）
 *
 * 背景：P2 之前已付款且已排期的补剂订单没有 InventoryAllocation。
 * 直接打开 SUPPLEMENT_INVENTORY_RESERVATION_ENABLED=true 会让这些单
 * 在分装时被“没有预占”拦住。
 *
 * 安全设计：
 * - 默认 dry-run，只打印，不写库；
 * - 只处理 status=PAID、packingDate 非空、没有 ACTIVE 预占的订单；
 * - 幂等：已有预占跳过；
 * - 不动 PACKED/SHIPPED/COMPLETED（库存已在分装时消耗或历史缺失，不追溯扣减）。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-supplement-inventory.ts
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-supplement-inventory.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { SupplementInventoryService } from '../src/application/supplement-shop/supplement-inventory.service';

// 脚本要真正建预占；平时开关默认关闭
process.env.SUPPLEMENT_INVENTORY_RESERVATION_ENABLED = 'true';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.min(1000, Math.max(1, Number(limitArg?.split('=')[1]) || 200));

async function main() {
  const inventory = new SupplementInventoryService(prisma as any);

  const orders = await prisma.supplementOrder.findMany({
    where: {
      status: 'PAID',
      packingDate: { not: null },
    },
    select: {
      id: true,
      orderNo: true,
      packingDate: true,
      items: {
        select: {
          name: true,
          unit: true,
          packedAmount: true,
          bags: true,
        },
      },
    },
    orderBy: { paidAt: 'asc' },
    take: limit,
  });

  const orderIds = orders.map((order) => order.id);
  const activeAllocations = orderIds.length
    ? await prisma.inventoryAllocation.findMany({
        where: {
          sourceType: 'SUPPLEMENT_PACK',
          status: 'ACTIVE',
          sourceOrderIds: { hasSome: orderIds },
        },
        select: { sourceOrderIds: true },
      })
    : [];
  const allocated = new Set(
    activeAllocations.flatMap((allocation) => allocation.sourceOrderIds),
  );
  const pending = orders.filter((order) => !allocated.has(order.id));
  console.log(
    `[backfill-supplement-inventory] mode=${apply ? 'APPLY' : 'DRY-RUN'} candidates=${pending.length}/${orders.length}`,
  );

  let done = 0;
  let failed = 0;
  for (const order of pending) {
    const line = `${order.orderNo} 分装日=${order.packingDate?.toISOString().slice(0, 10)} 明细=${order.items.length}`;
    if (!apply) {
      console.log(`  DRY ${line}`);
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        await inventory.reserveForOrder(tx, order.id);
      });
      done += 1;
      console.log(`  OK  ${line}`);
    } catch (error) {
      failed += 1;
      console.error(`  ERR ${line}: ${(error as Error).message}`);
    }
  }

  console.log(
    `[backfill-supplement-inventory] done=${done} failed=${failed} dry=${apply ? 0 : pending.length}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
