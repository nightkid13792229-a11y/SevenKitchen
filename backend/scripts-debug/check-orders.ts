import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('查询生产环境订单状态...\n');

  // 先查询所有订单（不限日期）
  const allOrders = await prisma.order.findMany({
    select: {
      id: true,
      status: true,
      targetProductionDate: true,
      createdAt: true,
      customerId: true,
    },
    orderBy: [
      { createdAt: 'desc' },
    ],
    take: 20,
  });

  console.log(`数据库中共有订单（最近20个）:\n`);

  // 按状态分组统计
  const statusCount = allOrders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('按状态统计:');
  Object.entries(statusCount).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  console.log('\n订单详情:');
  allOrders.forEach((order) => {
    console.log(`  ID: ${order.id}`);
    console.log(`  状态: ${order.status}`);
    console.log(`  目标日期: ${order.targetProductionDate?.toISOString() || 'NULL'}`);
    console.log(`  创建时间: ${order.createdAt.toISOString()}`);
    console.log('  ---');
  });

  // 查询指定日期范围的订单
  const recentOrders = await prisma.order.findMany({
    where: {
      targetProductionDate: {
        gte: new Date('2026-02-01T00:00:00.000Z'),
        lte: new Date('2026-02-03T23:59:59.999Z'),
      },
    },
    select: {
      id: true,
      status: true,
      targetProductionDate: true,
      createdAt: true,
      customerId: true,
    },
    orderBy: [
      { targetProductionDate: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 50,
  });

  console.log(`找到 ${recentOrders.length} 个订单:\n`);

  // 按状态分组统计
  const statusCount = recentOrders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('按状态统计:');
  Object.entries(statusCount).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  console.log('\n订单详情:');
  recentOrders.forEach((order) => {
    console.log(`  ID: ${order.id}`);
    console.log(`  状态: ${order.status}`);
    console.log(`  目标日期: ${order.targetProductionDate?.toISOString()}`);
    console.log(`  创建时间: ${order.createdAt.toISOString()}`);
    console.log(`  客户ID: ${order.customerId}`);
    console.log('  ---');
  });

  // 检查2026-02-02的PAID订单
  const paidOrders = await prisma.order.findMany({
    where: {
      targetProductionDate: {
        gte: new Date('2026-02-02T00:00:00.000Z'),
        lte: new Date('2026-02-02T23:59:59.999Z'),
      },
      status: 'PAID',
    },
  });

  console.log(`\n2026-02-02的PAID订单数量: ${paidOrders.length}`);

  // 检查2026-02-02的PURCHASING订单
  const purchasingOrders = await prisma.order.findMany({
    where: {
      targetProductionDate: {
        gte: new Date('2026-02-02T00:00:00.000Z'),
        lte: new Date('2026-02-02T23:59:59.999Z'),
      },
      status: 'PURCHASING',
    },
  });

  console.log(`2026-02-02的PURCHASING订单数量: ${purchasingOrders.length}`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
