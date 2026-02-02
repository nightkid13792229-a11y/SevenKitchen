import { PrismaClient } from '@prisma/client';

/**
 * 清理本地数据库的测试数据
 * 删除所有订单、采购清单和生产任务
 */
async function cleanupTestData() {
  const prisma = new PrismaClient();

  console.log('🔧 开始清理本地数据库...\n');

  try {
    // 1. 删除采购记录（需要先删除，因为它有外键但没有Cascade）
    const purchaseRecordsCount = await prisma.purchaseRecord.deleteMany({});
    console.log(`✅ 删除采购记录: ${purchaseRecordsCount.count} 条`);

    // 2. 删除采购清单（会自动级联删除采购项）
    const purchaseListsCount = await prisma.purchaseList.deleteMany({});
    console.log(`✅ 删除采购清单: ${purchaseListsCount.count} 条`);

    // 3. 删除生产批次（会自动级联删除包装单元）
    const productionBatchesCount = await prisma.productionBatch.deleteMany({});
    console.log(`✅ 删除生产批次: ${productionBatchesCount.count} 条`);

    // 4. 删除订单（会自动级联删除订单项和状态历史）
    const ordersCount = await prisma.order.deleteMany({});
    console.log(`✅ 删除订单: ${ordersCount.count} 条`);

    console.log('\n✨ 数据清理完成！');
  } catch (error) {
    console.error('❌ 清理失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行清理
cleanupTestData()
  .then(() => {
    console.log('\n✅ 脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 脚本执行失败:', error);
    process.exit(1);
  });
