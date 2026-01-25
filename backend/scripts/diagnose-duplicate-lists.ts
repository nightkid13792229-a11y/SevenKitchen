/**
 * 诊断脚本：检查重复的采购清单
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 检查采购清单重复情况\n');

  // 1. 查询所有采购清单
  const allLists = await prisma.purchaseList.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`1️⃣  数据库中共有 ${allLists.length} 个采购清单\n`);

  if (allLists.length === 0) {
    console.log('数据库中没有采购清单');
    return;
  }

  // 2. 按创建时间分组
  const timeGroups = new Map<string, any[]>();
  for (const list of allLists) {
    const timeKey = list.createdAt.toISOString();
    if (!timeGroups.has(timeKey)) {
      timeGroups.set(timeKey, []);
    }
    timeGroups.get(timeKey)!.push(list);
  }

  console.log('2️⃣  按创建时间分组:');
  let hasDuplicates = false;
  for (const [time, lists] of timeGroups.entries()) {
    if (lists.length > 1) {
      hasDuplicates = true;
      console.log(`\n   ⚠️  发现重复！时间: ${time}`);
      lists.forEach((list, i) => {
        console.log(`      ${i + 1}. ID: ${list.id}`);
        console.log(`         目标日期: ${list.targetDate.toISOString()}`);
        console.log(`         状态: ${list.status}`);
        console.log(`         原料数: ${list.itemCount}`);
        console.log(`         订单数: ${list.sourceOrderIds.length}`);
      });
    }
  }

  if (!hasDuplicates) {
    console.log('   ✅ 没有发现完全相同创建时间的清单\n');
  }

  // 3. 按目标日期分组
  console.log('\n3️⃣  按目标日期分组:');
  const dateGroups = new Map<string, any[]>();
  for (const list of allLists) {
    const dateKey = list.targetDate.toISOString().split('T')[0];
    if (!dateGroups.has(dateKey)) {
      dateGroups.set(dateKey, []);
    }
    dateGroups.get(dateKey)!.push(list);
  }

  for (const [date, lists] of dateGroups.entries()) {
    if (lists.length > 1) {
      console.log(`\n   ⚠️  日期 ${date} 有 ${lists.length} 个清单:`);
      lists.forEach((list, i) => {
        console.log(`      ${i + 1}. ID: ${list.id.slice(-8)}`);
        console.log(`         创建时间: ${list.createdAt.toISOString()}`);
        console.log(`         状态: ${list.status}`);
        console.log(`         原料数: ${list.itemCount}`);
        console.log(`         成本: ¥${list.totalEstimatedCost}`);
        console.log(`         订单IDs: ${list.sourceOrderIds.map((id: string) => id.slice(-8)).join(', ')}`);
      });
    } else {
      console.log(`\n   日期 ${date}: 1个清单`);
    }
  }

  // 4. 详细显示最近5个清单
  console.log('\n4️⃣  最近的5个采购清单:');
  const recentLists = allLists.slice(0, 5);
  recentLists.forEach((list, i) => {
    console.log(`\n   ${i + 1}. 清单ID: ${list.id}`);
    console.log(`      目标日期: ${list.targetDate.toISOString()}`);
    console.log(`      创建时间: ${list.createdAt.toISOString()}`);
    console.log(`      状态: ${list.status}`);
    console.log(`      原料数: ${list.itemCount}`);
    console.log(`      预估成本: ¥${list.totalEstimatedCost}`);
    console.log(`      创建人: ${list.createdById}`);
    console.log(`      关联订单数: ${list.sourceOrderIds.length}`);
    console.log(`      订单IDs: ${list.sourceOrderIds.map((id: string) => id.slice(-8)).join(', ')}`);

    // 检查是否有相同的sourceOrderIds
    const sameOrderLists = allLists.filter(l =>
      l.id !== list.id &&
      l.sourceOrderIds.length === list.sourceOrderIds.length &&
      l.sourceOrderIds.every(id => list.sourceOrderIds.includes(id))
    );

    if (sameOrderLists.length > 0) {
      console.log(`      ⚠️  发现与以下清单包含相同的订单:`);
      sameOrderLists.forEach(l => {
        console.log(`         - ${l.id.slice(-8)} (创建于 ${l.createdAt.toISOString()})`);
      });
    }
  });

  // 5. 检查是否有相同订单ID但不同清单ID的情况
  console.log('\n5️⃣  检查相同订单集合的采购清单:');
  const orderSetGroups = new Map<string, any[]>();

  for (const list of allLists) {
    // 将订单IDs排序后作为key
    const sortedOrderIds = [...list.sourceOrderIds].sort().join(',');
    if (!orderSetGroups.has(sortedOrderIds)) {
      orderSetGroups.set(sortedOrderIds, []);
    }
    orderSetGroups.get(sortedOrderIds)!.push(list);
  }

  for (const [orderIds, lists] of orderSetGroups.entries()) {
    if (lists.length > 1) {
      console.log(`\n   ⚠️  发现重复！相同的订单集合出现在多个清单中:`);
      console.log(`   订单集合: ${orderIds.slice(0, 100)}...`);
      lists.forEach((list, i) => {
        console.log(`      ${i + 1}. 清单ID: ${list.id.slice(-8)}`);
        console.log(`         创建时间: ${list.createdAt.toISOString()}`);
        console.log(`         状态: ${list.status}`);
        console.log(`         目标日期: ${list.targetDate.toISOString()}`);
      });
    }
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
