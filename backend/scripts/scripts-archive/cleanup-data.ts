/**
 * 清理本地开发环境数据
 * 删除所有订单、采购清单和生产批次
 *
 * ⚠️ 警告：此脚本将删除以下数据：
 * - 所有订单（Order, OrderItem, OrderStatusHistory, OrderPricingSnapshot）
 * - 所有采购清单（PurchaseList, PurchaseItem, PurchaseRecord）
 * - 所有生产批次（ProductionBatch）
 *
 * 执行前请确保已备份数据库！
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 开始清理所有业务数据...\n');
  console.log('⚠️  警告：此操作将删除所有订单、采购清单和生产批次数据！\n');

  try {
    // 1. 删除订单相关子表数据
    console.log('1️⃣  清理订单相关数据...');

    const pricingSnapshotCount = await prisma.orderPricingSnapshot.deleteMany({});
    console.log(`   - OrderPricingSnapshot: ${pricingSnapshotCount.count} 条`);

    const orderHistoryCount = await prisma.orderStatusHistory.deleteMany({});
    console.log(`   - OrderStatusHistory: ${orderHistoryCount.count} 条`);

    const orderItemCount = await prisma.orderItem.deleteMany({});
    console.log(`   - OrderItem: ${orderItemCount.count} 条`);

    const orderCount = await prisma.order.deleteMany({});
    console.log(`   - Order: ${orderCount.count} 条`);
    console.log('   ✅ 订单数据已清空\n');

    // 2. 删除采购相关数据
    console.log('2️⃣  清理采购数据...');

    const purchaseRecordCount = await prisma.purchaseRecord.deleteMany({});
    console.log(`   - PurchaseRecord: ${purchaseRecordCount.count} 条`);

    const purchaseItemCount = await prisma.purchaseItem.deleteMany({});
    console.log(`   - PurchaseItem: ${purchaseItemCount.count} 条`);

    const purchaseListCount = await prisma.purchaseList.deleteMany({});
    console.log(`   - PurchaseList: ${purchaseListCount.count} 条`);
    console.log('   ✅ 采购数据已清空\n');

    // 3. 删除生产批次数据
    console.log('3️⃣  清理生产批次数据...');

    const productionBatchCount = await prisma.productionBatch.deleteMany({});
    console.log(`   - ProductionBatch: ${productionBatchCount.count} 条`);
    console.log('   ✅ 生产批次数据已清空\n');

    console.log('✨ 所有业务数据清理完成！\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 删除统计：');
    console.log(`  - 订单总数：${orderCount.count} 个`);
    console.log(`  - 订单项：${orderItemCount.count} 个`);
    console.log(`  - 订单历史：${orderHistoryCount.count} 条`);
    console.log(`  - 价格快照：${pricingSnapshotCount.count} 个`);
    console.log(`  - 采购清单：${purchaseListCount.count} 个`);
    console.log(`  - 采购项：${purchaseItemCount.count} 个`);
    console.log(`  - 采购记录：${purchaseRecordCount.count} 条`);
    console.log(`  - 生产批次：${productionBatchCount.count} 个`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('\n❌ 删除数据时出错:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
