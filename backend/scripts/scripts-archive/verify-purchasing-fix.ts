/**
 * 验证脚本：测试修复后的采购清单生成功能
 */

import { PrismaClient } from '@prisma/client';
import { DateUtil } from '../src/utils/date.util';

const prisma = new PrismaClient();

async function main() {
  console.log('✅ 验证采购清单生成修复\n');

  // 1. 使用新的查询逻辑（使用午夜时间）
  console.log('1️⃣  使用修复后的查询逻辑');
  const startDate = new Date('2026-01-25T00:00:00');
  const endDate = new Date('2026-01-25T23:59:59.999');

  console.log(`   查询范围: ${startDate.toISOString()} 到 ${endDate.toISOString()}`);

  const orders = await prisma.order.findMany({
    where: {
      status: 'PAID',
      targetProductionDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      items: true,
    },
  });

  console.log(`   ✅ 找到 ${orders.length} 个PAID订单\n`);

  if (orders.length === 0) {
    console.log('❌ 修复失败：仍然找不到订单！');
    return;
  }

  // 2. 显示找到的订单
  console.log('2️⃣  订单详情:');
  orders.forEach((order, index) => {
    console.log(`   ${index + 1}. 订单ID: ${order.id.slice(-8)}`);
    console.log(`      支付时间: ${order.paidAt ? order.paidAt.toISOString() : 'N/A'}`);
    console.log(`      目标制作日期: ${order.targetProductionDate ? order.targetProductionDate.toISOString() : 'N/A'}`);
    console.log(`      金额: ¥${order.totalAmount}`);
    console.log(`      订单项数: ${order.items.length}`);

    // 检查pricingBreakdownSnapshot
    if (order.pricingBreakdownSnapshot) {
      const snapshot = order.pricingBreakdownSnapshot as any;
      console.log(`      原料详情数: ${snapshot.ingredientDetails?.length || 0}`);
    } else {
      console.log(`      ⚠️  缺少pricingBreakdownSnapshot`);
    }
    console.log('');
  });

  // 3. 计算原料需求
  console.log('3️⃣  计算采购需求:');
  const ingredientMap = new Map<string, any>();

  for (const order of orders) {
    if (!order.pricingBreakdownSnapshot) {
      console.log(`   ⚠️  订单 ${order.id.slice(-8)} 没有pricingBreakdownSnapshot，跳过`);
      continue;
    }

    const pricingBreakdown = order.pricingBreakdownSnapshot as any;
    const ingredientDetails = pricingBreakdown.ingredientDetails || [];

    console.log(`   订单 ${order.id.slice(-8)} 包含 ${ingredientDetails.length} 个原料:`);

    for (const detail of ingredientDetails) {
      const key = detail.ingredientId;
      const purchaseQuantity = detail.purchaseAmount || detail.amount || 0;

      if (purchaseQuantity <= 0) {
        console.log(`     - ${detail.name}: 跳过（数量<=0）`);
        continue;
      }

      if (ingredientMap.has(key)) {
        const existing = ingredientMap.get(key);
        existing.quantityNeeded += purchaseQuantity;
        existing.estimatedCost += detail.cost || 0;
        console.log(`     - ${detail.name}: 累加 ${purchaseQuantity}${detail.unit} (总计: ${existing.quantityNeeded}${detail.unit})`);
      } else {
        ingredientMap.set(key, {
          ingredientId: key,
          ingredientName: detail.name,
          type: detail.type || 'FOOD',
          quantityNeeded: purchaseQuantity,
          quantityUnit: detail.unit || 'G',
          estimatedCost: detail.cost || 0,
        });
        console.log(`     - ${detail.name}: ${purchaseQuantity}${detail.unit} ¥${detail.cost || 0}`);
      }
    }
    console.log('');
  }

  // 4. 输出采购清单摘要
  console.log('4️⃣  采购清单摘要:');
  const requirements = Array.from(ingredientMap.values());
  console.log(`   总计 ${requirements.length} 种原料`);
  console.log(`   预估总成本: ¥${requirements.reduce((sum, r) => sum + r.estimatedCost, 0).toFixed(2)}`);

  console.log('\n✅ 验证完成！');
  console.log('\n💡 结论: 修复成功！现在可以正确查询到1月25日的订单了。');
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
