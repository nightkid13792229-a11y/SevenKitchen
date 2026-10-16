/**
 * 历史交付回填 · 校验（2026-10-16 食谱定制重构 批次 1.6.5）
 *
 * ## 它回答三个问题
 *
 *   ① **有没有漏**：每张"已交付/已完成"且挂着食谱的订单，是不是都有交付记录？
 *   ② **版本号连不连**：同一订单的交付版本是不是 1、2、3… 中间不断？
 *      （重交时靠它算"第几版"，断了会让顾客看到"第 3 版"却找不到第 2 版）
 *   ③ **快照能不能用**：每条交付记录都有内容快照，且结构版本号是认识的？
 *      快照坏了 = 顾客点开"查看定制食谱"是一片空白。
 *
 * ## 用法
 *
 *   npx ts-node -r tsconfig-paths/register scripts/verify-custom-recipe-deliveries.ts
 *
 * 退出码 0 = 全部通过；1 = 有问题（会把问题逐条列出来）。
 */
import { CustomRecipeStatus, PrismaClient } from '@prisma/client';
import { SNAPSHOT_SCHEMA_VERSION } from '../src/domain/custom-recipe/custom-recipe.delivery';

const prisma = new PrismaClient();

interface Problem {
  orderNo: string;
  kind: string;
  detail: string;
}

async function main() {
  console.log('定制单交付记录 · 校验');
  console.log('');

  const problems: Problem[] = [];

  const orders = await prisma.customRecipeOrder.findMany({
    where: {
      status: {
        in: [CustomRecipeStatus.DELIVERED, CustomRecipeStatus.COMPLETED],
      },
      recipeId: { not: null },
    },
    include: {
      deliveries: { orderBy: { version: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`检查范围：状态为已交付/已完成、且挂着食谱的订单 —— 共 ${orders.length} 张`);
  console.log('');

  let totalDeliveries = 0;
  let backfilledCount = 0;
  let missingSnapshot = 0;

  for (const order of orders) {
    // ① 有没有漏
    if (order.deliveries.length === 0) {
      problems.push({
        orderNo: order.orderId,
        kind: '缺少交付记录',
        detail: `订单挂着食谱 ${order.recipeId}，但一条交付记录都没有`,
      });
      continue;
    }

    totalDeliveries += order.deliveries.length;

    // ② 版本号连不连（应为 1..n）
    const versions = order.deliveries.map((d) => d.version);
    const expected = Array.from(
      { length: versions.length },
      (_, index) => index + 1,
    );
    if (versions.join(',') !== expected.join(',')) {
      problems.push({
        orderNo: order.orderId,
        kind: '版本号不连续',
        detail: `实际 [${versions.join(', ')}]，应为 [${expected.join(', ')}]`,
      });
    }

    for (const delivery of order.deliveries) {
      // ③ 快照能不能用
      const snapshot = delivery.contentSnapshot as Record<string, unknown> | null;
      if (!snapshot || typeof snapshot !== 'object') {
        missingSnapshot += 1;
        problems.push({
          orderNo: order.orderId,
          kind: '快照缺失',
          detail: `第 ${delivery.version} 版没有内容快照 —— 顾客点开会是空白`,
        });
        continue;
      }

      const version = snapshot.schemaVersion;
      if (version !== SNAPSHOT_SCHEMA_VERSION) {
        problems.push({
          orderNo: order.orderId,
          kind: '快照结构版本不认识',
          detail: `第 ${delivery.version} 版 schemaVersion=${String(version)}，当前支持 ${SNAPSHOT_SCHEMA_VERSION}`,
        });
      }

      if (!snapshot.recipe) {
        problems.push({
          orderNo: order.orderId,
          kind: '快照缺少食谱主体',
          detail: `第 ${delivery.version} 版快照里没有 recipe`,
        });
      }

      if (snapshot.backfilled) {
        backfilledCount += 1;
      }

      // 交付时间不该是未来（时间轴会显示成"还没发生"）
      if (delivery.deliveredAt.getTime() > Date.now() + 60_000) {
        problems.push({
          orderNo: order.orderId,
          kind: '交付时间在未来',
          detail: `第 ${delivery.version} 版交付时间 ${delivery.deliveredAt.toISOString()}`,
        });
      }
    }
  }

  console.log('=== 统计 ===');
  console.log(`  订单：${orders.length} 张`);
  console.log(`  交付记录：${totalDeliveries} 条`);
  console.log(`  其中脚本回填的：${backfilledCount} 条`);
  console.log(`  快照缺失：${missingSnapshot} 条`);
  console.log('');

  if (problems.length === 0) {
    console.log('✓ 全部通过：没有漏、版本号连续、快照结构都认识。');
    return;
  }

  console.log(`✗ 发现 ${problems.length} 个问题：`);
  for (const problem of problems) {
    console.log(`  · [${problem.kind}] ${problem.orderNo} —— ${problem.detail}`);
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('校验失败：', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
