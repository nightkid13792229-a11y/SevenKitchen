/**
 * 诊断脚本：检查1月25日的订单状态
 * 用于排查为什么采购清单生成失败
 */

import { PrismaClient } from '@prisma/client';
import { DateUtil } from '../src/utils/date.util';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 诊断1月25日订单状态\n');

  // 1. 创建日期范围
  console.log('1️⃣  查询范围设置');
  const { start: startDate, end: endDate } = DateUtil.createDateRange('2026-01-25');
  console.log(`   开始时间（本地）: ${startDate.toString()}`);
  console.log(`   开始时间（UTC）: ${startDate.toISOString()}`);
  console.log(`   结束时间（本地）: ${endDate.toString()}`);
  console.log(`   结束时间（UTC）: ${endDate.toISOString()}`);
  console.log('');

  // 2. 查询所有PAID状态的订单（不限日期）
  console.log('2️⃣  查询所有PAID状态的订单');
  const allPaidOrders = await prisma.order.findMany({
    where: {
      status: 'PAID',
    },
    select: {
      id: true,
      status: true,
      targetProductionDate: true,
      paidAt: true,
      totalAmount: true,
      createdAt: true,
      customer: {
        select: {
          nickname: true,
        },
      },
    },
    orderBy: {
      paidAt: 'desc',
    },
  });

  console.log(`   找到 ${allPaidOrders.length} 个PAID订单`);

  if (allPaidOrders.length > 0) {
    console.log('\n   订单列表:');
    allPaidOrders.forEach((order, index) => {
      console.log(`   ${index + 1}. 订单ID: ${order.id.slice(-8)}`);
      console.log(`      支付时间: ${order.paidAt ? order.paidAt.toISOString() : 'N/A'}`);
      console.log(`      目标制作日期: ${order.targetProductionDate ? order.targetProductionDate.toISOString() : 'N/A'}`);
      console.log(`      客户: ${order.customer.nickname}`);
      console.log(`      金额: ¥${order.totalAmount}`);
      console.log('');
    });
  }

  // 3. 查询指定日期范围的订单（使用targetProductionDate）
  console.log('3️⃣  查询targetProductionDate在1月25日范围的PAID订单');
  const rangeOrders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      targetProductionDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      id: true,
      status: true,
      targetProductionDate: true,
      paidAt: true,
      totalAmount: true,
      customer: {
        select: {
          nickname: true,
        },
      },
    },
  });

  console.log(`   找到 ${rangeOrders.length} 个符合条件的PAID订单`);

  if (rangeOrders.length === 0) {
    console.log('\n   ⚠️  没有找到符合条件的订单！');

    // 检查是否有PAID订单的targetProductionDate为NULL
    const nullTargetDateOrders = await prisma.order.findMany({
      where: {
        status: 'PAID',
        targetProductionDate: null,
      },
      select: {
        id: true,
        paidAt: true,
      },
    });

    if (nullTargetDateOrders.length > 0) {
      console.log(`\n   发现 ${nullTargetDateOrders.length} 个PAID订单的targetProductionDate为NULL:`);
      nullTargetDateOrders.forEach((order, index) => {
        console.log(`   ${index + 1}. ${order.id.slice(-8)} - paidAt: ${order.paidAt ? order.paidAt.toISOString() : 'N/A'}`);
      });
    }
  } else {
    console.log('\n   符合条件的订单:');
    rangeOrders.forEach((order, index) => {
      console.log(`   ${index + 1}. 订单ID: ${order.id.slice(-8)}`);
      console.log(`      支付时间: ${order.paidAt ? order.paidAt.toISOString() : 'N/A'}`);
      console.log(`      目标制作日期: ${order.targetProductionDate ? order.targetProductionDate.toISOString() : 'N/A'}`);
      console.log(`      客户: ${order.customer.nickname}`);
      console.log('');
    });
  }

  // 4. 检查PURCHASING状态的订单（可能已经生成过采购清单）
  console.log('4️⃣  检查PURCHASING状态的订单');
  const purchasingOrders = await prisma.order.findMany({
    where: {
      status: 'IN_PRODUCTION', // PURCHASING状态可能不存在于数据库enum中
      targetProductionDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      id: true,
      status: true,
      targetProductionDate: true,
      paidAt: true,
    },
  });

  if (purchasingOrders.length > 0) {
    console.log(`   发现 ${purchasingOrders.length} 个PURCHASING状态的订单:`);
    purchasingOrders.forEach((order, index) => {
      console.log(`   ${index + 1}. ${order.id.slice(-8)} - ${order.targetProductionDate ? order.targetProductionDate.toISOString() : 'N/A'}`);
    });
    console.log('\n   ⚠️  这些订单已经生成过采购清单！');
  } else {
    console.log('   没有PURCHASING状态的订单');
  }

  // 5. 检查1月25日是否已存在采购清单
  console.log('\n5️⃣  检查1月25日的采购清单');
  const existingPurchaseLists = await prisma.purchaseList.findMany({
    where: {
      targetDate: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  if (existingPurchaseLists.length > 0) {
    console.log(`   发现 ${existingPurchaseLists.length} 个采购清单:`);
    existingPurchaseLists.forEach((list, index) => {
      console.log(`   ${index + 1}. 清单ID: ${list.id}`);
      console.log(`      目标日期: ${list.targetDate.toISOString()}`);
      console.log(`      状态: ${list.status}`);
      console.log(`      包含订单数: ${list.sourceOrderIds.length}`);
    });
  } else {
    console.log('   没有找到1月25日的采购清单');
  }

  console.log('\n✅ 诊断完成');
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
