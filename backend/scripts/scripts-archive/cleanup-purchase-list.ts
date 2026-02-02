/**
 * 清理脚本：删除现有采购清单以便重新生成
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  清理采购清单\n');

  // 1. 查看现有采购清单
  const lists = await prisma.purchaseList.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`找到 ${lists.length} 个采购清单:`);
  lists.forEach((list, i) => {
    console.log(`\n${i + 1}. ID: ${list.id.slice(-8)}`);
    console.log(`   目标日期: ${list.targetDate.toISOString()}`);
    console.log(`   创建时间: ${list.createdAt.toISOString()}`);
    console.log(`   状态: ${list.status}`);
  });

  if (lists.length === 0) {
    console.log('\n数据库中没有采购清单');
    return;
  }

  // 2. 恢复关联订单的状态（PURCHASING → PAID）
  console.log('\n恢复订单状态...');

  for (const list of lists) {
    if (list.sourceOrderIds.length > 0) {
      const updated = await prisma.order.updateMany({
        where: {
          id: {
            in: list.sourceOrderIds,
          },
          status: 'IN_PRODUCTION', // PURCHASING在数据库中是IN_PRODUCTION
        },
        data: {
          status: 'PAID',
        },
      });

      console.log(`   清单 ${list.id.slice(-8)}: 恢复了 ${updated.count} 个订单的状态为PAID`);
    }
  }

  // 3. 删除采购清单
  console.log('\n删除采购清单...');
  await prisma.purchaseList.deleteMany({});
  console.log('✅ 已删除所有采购清单');

  // 4. 验证
  const remaining = await prisma.purchaseList.count();
  console.log(`\n剩余采购清单数量: ${remaining}`);

  // 5. 显示恢复后的PAID订单
  const paidOrders = await prisma.order.findMany({
    where: {
      status: 'PAID',
    },
    select: {
      id: true,
      targetProductionDate: true,
      paidAt: true,
    },
    orderBy: {
      paidAt: 'desc',
    },
  });

  console.log(`\n当前PAID订单数量: ${paidOrders.length}`);
  paidOrders.forEach((order, i) => {
    console.log(`${i + 1}. ${order.id.slice(-8)} - ${order.targetProductionDate ? order.targetProductionDate.toISOString() : 'N/A'}`);
  });
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
