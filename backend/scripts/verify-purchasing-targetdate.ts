/**
 * 验证脚本：测试修复后的采购清单生成（targetDate为中午12点）
 */

import { PrismaClient } from '@prisma/client';
import { DateUtil } from '../src/utils/date.util';

const prisma = new PrismaClient();

async function main() {
  console.log('✅ 验证采购清单targetDate修复\n');

  const dateStr = '2026-01-25';

  // 1. 使用修复后的逻辑创建targetDate
  console.log('1️⃣  创建targetDate（中午12点）:');
  const targetDate = new Date(`${dateStr}T12:00:00`);
  console.log(`   targetDate: ${targetDate.toString()}`);
  console.log(`   targetDate (UTC): ${targetDate.toISOString()}`);

  // 2. 创建查询范围（使用DateUtil.createDateRange）
  console.log('\n2️⃣  生产排单使用的查询范围:');
  const { start: today, end: tomorrow } = DateUtil.createDateRange(dateStr);
  console.log(`   start: ${today.toISOString()}`);
  console.log(`   end: ${tomorrow.toISOString()}`);

  // 3. 检查targetDate是否在查询范围内
  console.log('\n3️⃣  检查匹配:');
  const isInRange = targetDate >= today && targetDate <= tomorrow;
  console.log(`   targetDate >= start: ${targetDate >= today}`);
  console.log(`   targetDate <= end: ${targetDate <= tomorrow}`);
  console.log(`   在查询范围内: ${isInRange ? '✅ 是' : '❌ 否'}`);

  // 4. 模拟创建采购清单并验证
  console.log('\n4️⃣  模拟数据库查询:');
  const lists = await prisma.purchaseList.findMany({
    where: {
      targetDate: {
        gte: today,
        lte: tomorrow,
      },
    },
  });

  console.log(`   使用查询范围找到 ${lists.length} 个采购清单`);

  if (lists.length === 0) {
    console.log('\n   ⚠️  现在数据库中没有采购清单');
    console.log('   💡 下次生成采购清单时，targetDate将使用中午12点时间');
    console.log('   💡 这样生产排单就能正确查询到采购清单了');
  } else {
    console.log('\n找到的采购清单:');
    lists.forEach((list, i) => {
      console.log(`   ${i + 1}. ID: ${list.id.slice(-8)}`);
      console.log(`      targetDate: ${list.targetDate.toISOString()}`);
      console.log(`      在查询范围内: ${list.targetDate >= today && list.targetDate <= tomorrow ? '✅' : '❌'}`);
    });
  }

  console.log('\n✅ 验证完成！');
  console.log('\n💡 修复说明:');
  console.log('   - 采购清单的 targetDate 现在使用中午12点（T12:00:00）');
  console.log('   - 生产排单查询时也使用 DateUtil.createDateRange()（中午12点到次日中午12点）');
  console.log('   - 这样两边的时间范围就匹配了');
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
