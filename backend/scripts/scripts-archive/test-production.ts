/**
 * 测试生产排单功能
 */

import { PrismaClient } from '@prisma/client';
import { DateUtil } from '../src/utils/date.util';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 测试生产排单功能\n');

  // 1. 创建测试采购清单（已完成状态）
  console.log('1️⃣  创建测试采购清单');
  const { start: targetDate } = DateUtil.createDateRange('2026-01-23');

  // 先删除可能存在的测试采购清单
  await prisma.purchaseList.deleteMany({
    where: { targetDate },
  });

  const purchaseList = await prisma.purchaseList.create({
    data: {
      id: randomUUID(),
      targetDate,
      status: 'COMPLETED',
      totalEstimatedCost: 1000,
      itemCount: 0,  // 暂时设为0，不创建采购项
      createdById: '65c162eb-5767-42fa-8075-5cfc1e765fce', // ADMIN用户
      sourceOrderIds: [
        '12d63cf2-fbbe-4a23-908b-e6fba4a99d96',
        '8ec99256-403e-4501-b0d4-7c577ab26d3b',
        'd55a5508-c9c5-4de3-9bec-cdc9ebc2a1f8',
      ],
    },
  });

  console.log(`   ✅ 采购清单ID: ${purchaseList.id}`);
  console.log(`   ✅ 目标日期: ${purchaseList.targetDate}`);
  console.log(`   ✅ 状态: ${purchaseList.status}`);
  console.log('');

  // 2. 测试查询采购清单
  console.log('2️⃣  测试查询采购清单');
  const { start, end } = DateUtil.createDateRange('2026-01-23');

  const purchaseLists = await prisma.purchaseList.findMany({
    where: {
      targetDate: {
        gte: start,
        lte: end,
      },
      status: 'COMPLETED',
    },
  });

  console.log(`   找到 ${purchaseLists.length} 个已完成采购清单`);

  if (purchaseLists.length > 0) {
    const list = purchaseLists[0];
    console.log(`   ✅ 采购清单ID: ${list.id}`);
    console.log(`   ✅ 目标日期: ${list.targetDate}`);
    console.log(`   ✅ 状态: ${list.status}`);
    console.log('');
  } else {
    console.log('   ❌ 未找到已完成的采购清单');
    console.log('');
  }

  // 3. 测试查询PAID订单
  console.log('3️⃣  测试查询PAID订单');
  const orders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      targetProductionDate: {
        gte: start,
        lte: end,
      },
    },
  });

  console.log(`   找到 ${orders.length} 个PAID订单`);
  orders.forEach((order, index) => {
    console.log(`   ${index + 1}. ${order.id.slice(0, 8)}... - ${order.targetProductionDate}`);
  });
  console.log('');

  // 4. 结论
  console.log('4️⃣  测试结论');
  if (purchaseLists.length > 0 && orders.length > 0) {
    console.log('   ✅ 可以进行生产排单');
    console.log(`   ✅ 找到 ${purchaseLists.length} 个已完成采购清单`);
    console.log(`   ✅ 找到 ${orders.length} 个PAID订单`);
  } else {
    if (purchaseLists.length === 0) {
      console.log('   ❌ 无法进行生产排单');
      console.log('   ❌ 未找到已完成的采购清单');
    }
    if (orders.length === 0) {
      console.log('   ❌ 无法进行生产排单');
      console.log('   ❌ 未找到PAID订单');
    }
  }
  console.log('');

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  });
