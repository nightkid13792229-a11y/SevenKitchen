/**
 * 测试采购清单生成功能
 */

import { PrismaClient } from '@prisma/client';
import { DateUtil } from '../src/utils/date.util';

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 测试采购清单生成功能\n');

  // 1. 测试 DateUtil.createDateRange
  console.log('1️⃣  测试 DateUtil.createDateRange');
  const { start, end } = DateUtil.createDateRange('2026-01-23');
  console.log(`   开始时间（本地）: ${start.toString()}`);
  console.log(`   开始时间（UTC）: ${start.toISOString()}`);
  console.log(`   结束时间（本地）: ${end.toString()}`);
  console.log(`   结束时间（UTC）: ${end.toISOString()}`);
  console.log('');

  // 2. 查询指定日期的PAID订单
  console.log('2️⃣  查询指定日期的PAID订单');
  const orders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      targetProductionDate: {
        gte: start,
        lte: end,
      },
    },
    include: {
      items: true,
    },
  });

  console.log(`   找到 ${orders.length} 个PAID订单`);
  orders.forEach((order, index) => {
    console.log(`   ${index + 1}. ${order.id}`);
    console.log(`      状态: ${order.status}`);
    console.log(`      目标制作日期: ${order.targetProductionDate}`);
    console.log(`      订单项数量: ${order.items.length}`);
  });
  console.log('');

  // 3. 验证订单有定价快照
  console.log('3️⃣  验证订单有定价快照');
  let hasPricingSnapshot = 0;
  let hasNoPricingSnapshot = 0;

  for (const order of orders) {
    if (order.pricingBreakdownSnapshot) {
      hasPricingSnapshot++;
      console.log(`   ✅ ${order.id.slice(0, 8)}... 有定价快照`);
    } else {
      hasNoPricingSnapshot++;
      console.log(`   ❌ ${order.id.slice(0, 8)}... 无定价快照`);
    }
  }

  console.log(`\n   统计：`);
  console.log(`   有定价快照: ${hasPricingSnapshot}`);
  console.log(`   无定价快照: ${hasNoPricingSnapshot}`);
  console.log('');

  // 4. 结论
  console.log('4️⃣  测试结论');
  if (orders.length > 0 && hasPricingSnapshot === orders.length) {
    console.log('   ✅ 可以生成采购清单');
    console.log(`   ✅ 找到 ${orders.length} 个PAID订单`);
    console.log('   ✅ 所有订单都有定价快照');
  } else if (orders.length === 0) {
    console.log('   ❌ 无法生成采购清单');
    console.log('   ❌ 没有找到PAID订单');
  } else {
    console.log('   ⚠️  部分订单缺少定价快照');
    console.log('   ⚠️  只能生成部分采购清单');
  }
  console.log('');

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  });
