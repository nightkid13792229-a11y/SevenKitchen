import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('========== 查询生产环境订单状态 ==========\n');

  // 1. 查询所有订单（最近20个）
  console.log('【1】所有订单（最近20个）:\n');
  const allOrders = await prisma.order.findMany({
    select: {
      id: true,
      status: true,
      targetProductionDate: true,
      createdAt: true,
      customerId: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (allOrders.length === 0) {
    console.log('  ❌ 数据库中没有任何订单！\n');
  } else {
    const statusCount = allOrders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('  按状态统计:');
    Object.entries(statusCount).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });

    console.log('\n  最近5个订单:');
    allOrders.slice(0, 5).forEach((order) => {
      console.log(`    - ${order.id.substring(0, 8)}... | ${order.status} | ${order.targetProductionDate?.toISOString().split('T')[0] || 'NULL'}`);
    });
    console.log('');
  }

  // 2. 查询2026-02-02的订单
  console.log('【2】2026-02-02的订单:\n');
  const todayOrders = await prisma.order.findMany({
    where: {
      targetProductionDate: {
        gte: new Date('2026-02-02T00:00:00.000Z'),
        lte: new Date('2026-02-02T23:59:59.999Z'),
      },
    },
  });

  if (todayOrders.length === 0) {
    console.log('  ❌ 2026-02-02没有任何订单\n');
  } else {
    const todayStatusCount = todayOrders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('  按状态统计:');
    Object.entries(todayStatusCount).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });
    console.log('');
  }

  // 3. 查询PAID状态的订单
  console.log('【3】所有PAID状态的订单:\n');
  const paidOrders = await prisma.order.findMany({
    where: { status: 'PAID' },
    select: {
      id: true,
      targetProductionDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (paidOrders.length === 0) {
    console.log('  ❌ 没有PAID状态的订单\n');
  } else {
    console.log(`  找到 ${paidOrders.length} 个PAID订单:`);
    paidOrders.forEach((order) => {
      console.log(`    - ${order.id.substring(0, 8)}... | ${order.targetProductionDate?.toISOString().split('T')[0] || 'NULL'}`);
    });
    console.log('');
  }

  // 4. 查询PURCHASING状态的订单
  console.log('【4】所有PURCHASING状态的订单:\n');
  const purchasingOrders = await prisma.order.findMany({
    where: { status: 'PURCHASING' },
    select: {
      id: true,
      targetProductionDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (purchasingOrders.length === 0) {
    console.log('  ❌ 没有PURCHASING状态的订单\n');
  } else {
    console.log(`  找到 ${purchasingOrders.length} 个PURCHASING订单:`);
    purchasingOrders.forEach((order) => {
      console.log(`    - ${order.id.substring(0, 8)}... | ${order.targetProductionDate?.toISOString().split('T')[0] || 'NULL'}`);
    });
    console.log('');
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
