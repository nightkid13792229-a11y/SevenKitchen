/**
 * 售后「免费重做」端到端验证
 *
 * ⚠️ 本脚本会**临时改写订单数据**（把一张订单置为售后中并创建测试用重做单），
 *    运行结束后自动还原并删除测试单。**只应在本地/测试库运行，不要对生产库执行。**
 *    运行：cd backend && npx ts-node -r tsconfig-paths/register prisma/verify-remake-flow.ts
 *
 * 验证目标（按重要性排序）：
 *   1) 重做单被创建为 PAID 状态、0 元、条目未分配批次
 *   2) **重做单能被"采购清单候选查询"捞到** —— 这正是原先断掉的一环
 *   3) 重做单能被"生产排产候选查询"接手的先决条件成立（状态/条目均满足）
 *   4) C 端订单列表不展示重做单
 *   5) 原单与重做单双向可追溯
 *   6) 防重复：同一原单不能重做两次
 *
 * 运行结束后自动清理（删除重做单、还原原单），不留脏数据。
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { OrderService } from '../src/application/order/order.service';
import { ORDER_REPOSITORY } from '../src/application/order/order.service.tokens';
import { OrderStatus, AftersaleType } from '../src/domain/order/enums';

const prisma = new PrismaClient();
const results: Array<[string, boolean, string]> = [];

function check(label: string, ok: boolean, detail = '') {
  results.push([label, ok, detail]);
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? `   ${detail}` : ''}`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const orderService = app.get(OrderService);
  const orderRepository = app.get<any>(ORDER_REPOSITORY);

  // ---------- 准备：找一张订单，临时置为 AFTERSALE + REMAKE ----------
  const original = await prisma.order.findFirst({
    where: { status: 'AFTERSALE' as any },
    include: { items: true },
  });
  if (!original) {
    console.log('❌ 本地库没有 AFTERSALE 订单，无法验证');
    await app.close();
    return;
  }

  const originalAftersaleType = original.aftersaleType;
  const originalStatus = original.status;

  console.log(`\n原单：${original.orderNo}  状态=${original.status}  条目=${original.items.length}\n`);

  await prisma.order.update({
    where: { id: original.id },
    data: { aftersaleType: 'REMAKE' as any },
  });

  let remakeId: string | null = null;

  try {
    // ---------- 1) 创建重做单 ----------
    const targetProductionDate = new Date();
    targetProductionDate.setDate(targetProductionDate.getDate() + 1);
    const dateStr = `${targetProductionDate.getFullYear()}-${String(
      targetProductionDate.getMonth() + 1,
    ).padStart(2, '0')}-${String(targetProductionDate.getDate()).padStart(2, '0')}`;
    const productionDate = new Date(`${dateStr}T00:00:00`);

    console.log('【1】创建重做单');
    const remake = await orderService.createRemakeOrderFrom(
      original.id,
      'verify-script',
      productionDate,
    );
    remakeId = remake.id;

    check('重做单已创建', Boolean(remake.id), `单号 ${remake.orderNo}`);
    check('状态为 PAID（进采购清单的前提）', remake.status === OrderStatus.PAID, remake.status);
    check('金额为 0', remake.amountTotal === 0 && remake.amountProduct === 0 && remake.amountShipping === 0);
    check('制作日期已写入', Boolean(remake.targetProductionDate), productionDate.toISOString().slice(0, 10));
    check('指向原单', remake.remakeFromOrderId === original.id);

    const remakeItems = await prisma.orderItem.findMany({ where: { orderId: remake.id } });
    check('条目已复制', remakeItems.length === original.items.length, `原 ${original.items.length} → 新 ${remakeItems.length}`);
    check(
      '新条目未分配批次（可被排产分配）',
      remakeItems.every((i) => i.productionBatchId === null),
    );
    check(
      'recipeSnapshot 与原单一致（重做的是同一版）',
      remakeItems.length > 0 &&
        JSON.stringify(remakeItems[0].recipeSnapshot) ===
          JSON.stringify(original.items[0].recipeSnapshot),
    );

    // ---------- 2) 【关键】采购清单候选查询能否捞到它 ----------
    console.log('\n【2】采购清单候选查询（原先断掉的一环）');
    const { list: purchaseCandidates } =
      await orderRepository.findByTargetProductionDateRange({
        status: OrderStatus.PAID,
        startDate: new Date(`${dateStr}T00:00:00`),
        endDate: new Date(`${dateStr}T23:59:59.999`),
      });
    check(
      '重做单出现在采购清单候选里',
      purchaseCandidates.some((o: any) => o.id === remake.id),
      `该日候选 ${purchaseCandidates.length} 单`,
    );

    // ---------- 3) 排产候选的先决条件 ----------
    console.log('\n【3】生产排产接手条件');
    await prisma.order.update({
      where: { id: remake.id },
      data: { status: 'PURCHASING' as any },
    });
    const { list: productionCandidates } =
      await orderRepository.findByTargetProductionDateRange({
        status: OrderStatus.PURCHASING,
        startDate: new Date(`${dateStr}T00:00:00`),
        endDate: new Date(`${dateStr}T23:59:59.999`),
      });
    check('采购完成后能进入排产候选', productionCandidates.some((o: any) => o.id === remake.id));
    const unallocated = await prisma.orderItem.count({
      where: { orderId: remake.id, productionBatchId: null },
    });
    check('排产所需的"未分配条目"存在', unallocated > 0, `${unallocated} 个`);

    // ---------- 4) C 端列表不展示重做单 ----------
    console.log('\n【4】顾客侧可见性');
    const customerOrders = await orderService.listOrdersByCustomerId(original.customerId);
    check('C 端订单列表过滤掉重做单', !customerOrders.some((o) => o.id === remake.id));
    check('C 端仍能看到原单', customerOrders.some((o) => o.id === original.id));

    // ---------- 5) 双向可追溯 ----------
    console.log('\n【5】父子关联');
    const child = await prisma.order.findUnique({
      where: { id: remake.id },
      select: { remakeFromOrderId: true, remakeFromOrder: { select: { orderNo: true } } },
    });
    check('子 → 父 可追溯', child?.remakeFromOrderId === original.id, `指向 ${child?.remakeFromOrder?.orderNo}`);
    const parent = await prisma.order.findUnique({
      where: { id: original.id },
      select: { remakeOrder: { select: { orderNo: true } } },
    });
    check('父 → 子 可追溯', parent?.remakeOrder?.orderNo === remake.orderNo, `指向 ${parent?.remakeOrder?.orderNo}`);

    // ---------- 6) 防重复 ----------
    console.log('\n【6】防重复');
    try {
      await orderService.createRemakeOrderFrom(original.id, 'verify-script', productionDate);
      check('重复重做被拒绝', false, '竟然又创建了一张');
    } catch (e: any) {
      check('重复重做被拒绝', true, e.message.slice(0, 40));
    }

    // ---------- 7) 重做率可统计 ----------
    console.log('\n【7】重做率可统计');
    const remakeCount = await prisma.order.count({
      where: { remakeFromOrderId: { not: null } },
    });
    const completedCount = await prisma.order.count({ where: { status: 'COMPLETED' as any } });
    check('可用一条查询算出重做单数', remakeCount >= 1, `重做单 ${remakeCount} 张 / 已完成订单 ${completedCount} 张`);
  } finally {
    // ---------- 清理 ----------
    if (remakeId) {
      await prisma.orderItem.deleteMany({ where: { orderId: remakeId } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: remakeId } });
      await prisma.order.delete({ where: { id: remakeId } }).catch(() => undefined);
    }
    await prisma.orderStatusHistory.deleteMany({
      where: { orderId: original.id, metadata: { path: ['remakeOrderId'], not: undefined } as any },
    }).catch(() => undefined);
    await prisma.order.update({
      where: { id: original.id },
      data: { aftersaleType: originalAftersaleType, status: originalStatus },
    });
    console.log('\n🧹 已清理测试数据，原单已还原');

    const failed = results.filter(([, ok]) => !ok);
    console.log(
      `\n===== 结果：${results.length - failed.length}/${results.length} 项通过 =====`,
    );
    if (failed.length) {
      console.log('失败项：');
      for (const [label, , detail] of failed) console.log(`  - ${label} ${detail}`);
    }
    await app.close();
  }
}

main()
  .catch((e) => {
    console.error('验证脚本异常:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
