/**
 * 将订单状态改为已付款
 * 更新订单状态、支付时间和支付方式
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('💰 开始更新订单状态为已付款...\n');

  try {
    // ⚠️ SECURITY: Only update PENDING_PAYMENT orders, exclude cancelled orders
    const orders = await prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        cancelledAt: null, // ⚠️ CRITICAL: Do NOT update cancelled orders
      },
      select: {
        id: true,
        status: true,
        paidAt: true,
        paymentMethod: true,
        createdAt: true,
      },
    });

    console.log(`📋 找到 ${orders.length} 个待付款订单\n`);

    if (orders.length === 0) {
      console.log('❌ 没有找到待付款订单，无需修改');
      return;
    }

    console.log('待付款订单列表：');
    orders.forEach((order, index) => {
      console.log(`  订单 ${index + 1}: ${order.id} - ${order.status} (创建时间: ${order.createdAt.toISOString()})`);
    });
    console.log();

    // ⚠️ SECURITY: Only update PENDING_PAYMENT orders that are not cancelled
    const now = new Date();
    const result = await prisma.order.updateMany({
      where: {
        status: 'PENDING_PAYMENT',
        cancelledAt: null, // ⚠️ CRITICAL: Do NOT update cancelled orders
      },
      data: {
        status: 'PAID',
        paidAt: now,
        paymentMethod: 'OFFLINE_WECHAT', // 线下微信支付
        paymentStatus: 'SUCCESS',
      },
    });

    console.log('✅ 更新完成！');
    console.log(`   已更新 ${result.count} 个订单为已付款状态\n`);

    // 验证更新结果
    const updatedOrders = await prisma.order.findMany({
      select: {
        id: true,
        status: true,
        paidAt: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('验证结果：');
    updatedOrders.forEach((order, index) => {
      console.log(`\n订单 ${index + 1}:`);
      console.log(`  ID: ${order.id}`);
      console.log(`  状态: ${order.status}`);
      console.log(`  支付方式: ${order.paymentMethod || '未设置'}`);
      console.log(`  支付状态: ${order.paymentStatus || '未设置'}`);
      console.log(`  支付时间: ${order.paidAt?.toISOString() || '未设置'}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ 更新订单状态时出错:', error);
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
