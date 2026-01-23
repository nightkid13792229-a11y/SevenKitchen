/**
 * 修改订单日期
 * 将现有订单的创建日期改为1月22日，目标制作日期改为1月23日
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📅 开始修改订单日期...\n');

  try {
    // 查询所有订单
    const orders = await prisma.order.findMany({
      select: {
        id: true,
        createdAt: true,
        targetProductionDate: true,
      },
    });

    console.log(`📋 找到 ${orders.length} 个订单\n`);

    if (orders.length === 0) {
      console.log('❌ 没有找到订单，无需修改');
      return;
    }

    // 设置新日期
    const newCreatedAt = new Date('2026-01-22T10:00:00.000Z'); // 1月22日
    const newTargetDate = new Date('2026-01-23T00:00:00.000Z'); // 1月23日

    console.log('修改计划：');
    console.log(`  创建日期 → ${newCreatedAt.toISOString()}`);
    console.log(`  目标制作日期 → ${newTargetDate.toISOString()}\n`);

    // 批量更新所有订单
    const result = await prisma.order.updateMany({
      data: {
        createdAt: newCreatedAt,
        targetProductionDate: newTargetDate,
      },
    });

    console.log('✅ 修改完成！');
    console.log(`   已更新 ${result.count} 个订单\n`);

    // 验证修改结果
    const updatedOrders = await prisma.order.findMany({
      select: {
        id: true,
        createdAt: true,
        targetProductionDate: true,
      },
      take: 3, // 只显示前3个
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('验证结果（前3个订单）：');
    updatedOrders.forEach((order, index) => {
      console.log(`\n订单 ${index + 1}:`);
      console.log(`  ID: ${order.id}`);
      console.log(`  创建日期: ${order.createdAt.toISOString()}`);
      console.log(`  目标日期: ${order.targetProductionDate?.toISOString() || '未设置'}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ 修改订单日期时出错:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
