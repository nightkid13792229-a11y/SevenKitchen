import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('========== 查询2月1日的订单 ==========\n');

  // 1. 查询2月1日创建的订单
  console.log('【1】2026-02-01创建的订单:\n');
  const feb1Orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: new Date('2026-02-01T00:00:00.000Z'),
        lte: new Date('2026-02-01T23:59:59.999Z'),
      },
    },
  });

  console.log(`找到 ${feb1Orders.length} 个订单\n`);

  if (feb1Orders.length === 0) {
    console.log('❌ 2月1日没有创建任何订单');
    return;
  }

  feb1Orders.forEach((order, index) => {
    console.log(`订单 ${index + 1}:`);
    console.log(`  ID: ${order.id}`);
    console.log(`  状态: ${order.status}`);
    console.log(`  目标生产日期: ${order.targetProductionDate?.toISOString() || 'NULL'}`);
    console.log(`  创建时间: ${order.createdAt.toISOString()}`);
    console.log(`  支付时间: ${order.paidAt?.toISOString() || '未支付'}`);
    console.log(`  客户ID: ${order.customerId}`);
    console.log(`  狗ID: ${order.dogId || 'NULL'}`);
    console.log('');
  });

  // 2. 查询这些订单的状态
  console.log('【2】按状态统计:\n');
  const statusCount = feb1Orders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(statusCount).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  console.log('');

  // 3. 查询targetProductionDate为2026-02-02的订单
  console.log('【3】目标生产日期为2026-02-02的订单:\n');
  const targetFeb2Orders = await prisma.order.findMany({
    where: {
      targetProductionDate: {
        gte: new Date('2026-02-02T00:00:00.000Z'),
        lte: new Date('2026-02-02T23:59:59.999Z'),
      },
    },
  });

  console.log(`找到 ${targetFeb2Orders.length} 个订单\n`);

  if (targetFeb2Orders.length > 0) {
    targetFeb2Orders.forEach((order) => {
      console.log(`  - ${order.id.substring(0, 8)}... | ${order.status} | 创建于: ${order.createdAt.toISOString().split('T')[0]}`);
    });
    console.log('');
  }

  // 4. 检查采购清单
  console.log('【4】检查采购清单:\n');
  const purchaseLists = await prisma.purchaseList.findMany({
    where: {
      date: {
        gte: new Date('2026-02-02T00:00:00.000Z'),
        lte: new Date('2026-02-02T23:59:59.999Z'),
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`找到 ${purchaseLists.length} 个2月2日的采购清单\n`);

  if (purchaseLists.length > 0) {
    purchaseLists.forEach((list) => {
      console.log(`  采购清单:`);
      console.log(`    ID: ${list.id}`);
      console.log(`    日期: ${list.date.toISOString()}`);
      console.log(`    状态: ${list.status}`);
      console.log(`    订单ID: ${list.orderIds.join(', ')}`);
      console.log('');
    });
  }

  console.log('========== 查询完成 ==========');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
