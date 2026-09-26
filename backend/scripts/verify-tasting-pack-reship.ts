/**
 * 试吃装「免费补发」· 真实数据库验证脚本
 *
 * 补发是现货特有的一条路：不收款、不采购、不排产，
 * 但从成品库存里**真的拿走了一套货**。这个脚本把这条路上最容易出错的几件事钉死：
 *
 *   ① 补发单是一张 0 元的现货订单，能从后台正常发货
 *   ② 补发必须扣成品库存（不是嘴上说说，账要对得上）
 *   ③ 补发套数默认等于原单套数，且不允许超过
 *   ④ 同一张原单不能重复补发；但**取消过的补发单不算数**，可以重新补发
 *   ⑤ 库存不够时直接失败，绝不会留下发不出去的补发单，也不会把库存扣成负数
 *   ⑥ 顾客申请过售后时，补发就是这次售后的处理结果，补发送达后原单自动结案
 *
 * 全程使用真实 Service（不是 mock），用完清理临时顾客与商品。
 *
 * 用法：cd backend && npx ts-node -r tsconfig-paths/register scripts/verify-tasting-pack-reship.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma.service';
import { TastingPackService } from '../src/application/tasting-pack/tasting-pack.service';
import { TastingPackStockService } from '../src/application/tasting-pack/tasting-pack-stock.service';
import { TastingPackConfigService } from '../src/application/tasting-pack/tasting-pack-config.service';
import { OrderService } from '../src/application/order/order.service';
import {
  AftersaleType,
  OrderStatus,
  OrderType,
} from '../src/domain/order/enums';

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` —— ${detail}` : ''}`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const prisma = app.get(PrismaService);
  const packService = app.get(TastingPackService);
  const stockService = app.get(TastingPackStockService);
  const configService = app.get(TastingPackConfigService);
  const orderService = app.get(OrderService);

  const stamp = Date.now();
  let customerId = '';
  let packId = '';
  const originalEnabled = (await configService.getConfig()).enabled;

  const available = () => stockService.getAvailableSets(packId);

  try {
    // ==========================================================
    // 准备：临时顾客 + 地址 + 商品 + 12 套库存
    // ==========================================================
    const customer = await prisma.user.create({
      data: {
        phone: `9${String(stamp).slice(-10)}`,
        nickname: '补发验证顾客',
        role: 'CUSTOMER',
      },
    });
    customerId = customer.id;

    const address = await prisma.address.create({
      data: {
        userId: customerId,
        recipientName: '验证收件人',
        phone: '13800000000',
        region: { province: '上海市', city: '上海市', district: '徐汇区' },
        detail: '验证路 1 号',
        isDefault: true,
      },
    });

    const recipes = await prisma.recipe.findMany({
      where: { status: 'PUBLIC' },
      select: { recipeId: true },
      orderBy: { viewCount: 'desc' },
      take: 20,
    });
    const recipeIds = [...new Set(recipes.map((r) => r.recipeId))].slice(0, 5);
    if (recipeIds.length < 5) {
      throw new Error(`公开食谱不足 5 道，实际 ${recipeIds.length} 道`);
    }

    const pack = await packService.create({
      name: `【补发验证】尝鲜装 ${stamp}`,
      bagsPerRecipe: 2,
      packSpecG: 80,
      items: recipeIds.map((recipeId, index) => ({
        recipeId,
        sortOrder: index,
      })),
    });
    packId = pack.id;

    await stockService.stockIn({
      tastingPackId: packId,
      sets: 12,
      producedAt: new Date(),
      unitCost: 56,
      note: '补发验证脚本入库',
    });
    await packService.publish(packId);
    await configService.updateConfig({ enabled: true });

    console.log(`\n临时商品：${pack.code}（5 道菜 / ${pack.totalNetWeightG}g）\n`);

    /** 下一单、付款、发货，返回已发货的订单 */
    async function buyAndShip(sets: number, tag: string) {
      const quote = await packService.createPurchaseQuote({
        idOrCode: pack.code,
        sets,
        addressId: address.id,
        customerId,
      });
      const order = await orderService.createOrderDraft({
        customerId,
        type: OrderType.TASTING_PACK,
        snapshotId: quote.snapshotId,
        addressId: address.id,
      });
      await orderService.confirmOrder(order.id, 'customer', customerId);
      await orderService.confirmPaymentAdmin(order.id, 'admin');
      await orderService.shipOrder(
        order.id,
        `SF${String(stamp).slice(-8)}${sets}`,
        'SF',
        'admin-verify',
      );
      console.log(`（${tag}：买 ${sets} 套并已发货，可售 ${await available()} 套）`);
      return orderService.getOrderById(order.id);
    }

    // ==========================================================
    // ① 正常补发：0 元补发单 + 扣库存
    // ==========================================================
    const orderA = (await buyAndShip(2, 'A'))!;
    const beforeA = await available();

    const reshipA = await orderService.createReshipOrderFrom(
      orderA.id,
      'admin-verify',
      { sets: 1, reason: '到货已化冻' },
    );

    check(
      '补发单是 0 元的现货订单，且已付款（不需要顾客再付钱）',
      reshipA.type === OrderType.TASTING_PACK &&
        reshipA.status === OrderStatus.PAID &&
        reshipA.amountTotal === 0 &&
        reshipA.paymentStatus === 'SUCCESS' &&
        reshipA.paymentMethod === 'RESHIP',
      `type=${reshipA.type}, status=${reshipA.status}, 金额 ¥${reshipA.amountTotal}, 付款方式=${reshipA.paymentMethod}`,
    );
    check(
      '补发单记录了原单关系与原因（事后可追溯）',
      reshipA.reshipFromOrderId === orderA.id &&
        (reshipA.adminRemark ?? '').includes(orderA.orderNo ?? '') &&
        (reshipA.adminRemark ?? '').includes('到货已化冻'),
      reshipA.adminRemark ?? '',
    );
    check(
      '补发单不排产（现货没有制作日期）',
      reshipA.targetProductionDate === null,
      `targetProductionDate=${reshipA.targetProductionDate}`,
    );
    // 本商品是 5 道菜 × 每道 2 袋 = 每套 10 袋（每袋 80g）
    check(
      '补发 1 套 = 10 袋 × 80g（按原单的商品结构重算数量）',
      reshipA.items[0].packageCount === 10 &&
        reshipA.items[0].quantityG === 800 &&
        reshipA.items[0].tastingPackId === packId,
      `${reshipA.items[0].packageCount} 袋 / ${reshipA.items[0].quantityG}g`,
    );
    check(
      '补发必须真的扣成品库存（12-2-1 = 9 套）',
      (await available()) === beforeA - 1,
      `${beforeA} → ${await available()} 套`,
    );

    const reshipLedger = await prisma.tastingPackStockLedger.findMany({
      where: { orderId: reshipA.id },
    });
    check(
      '补发单在库存流水里留下了自己的占用记录（盘库能对得上）',
      reshipLedger.some(
        (row) => row.reason === 'ORDER_RESERVE' && row.delta === -1,
      ),
      reshipLedger.map((r) => `${r.reason} ${r.delta}`).join(' / ') || '无流水',
    );

    // ==========================================================
    // ② 防重复与数量上限
    // ==========================================================
    let duplicateBlocked = '';
    try {
      await orderService.createReshipOrderFrom(orderA.id, 'admin-verify');
    } catch (error) {
      duplicateBlocked = String((error as Error).message);
    }
    check(
      '同一张原单不能重复补发，并告诉客服已有补发单号',
      duplicateBlocked.includes('已补发过'),
      duplicateBlocked,
    );

    let overLimitBlocked = '';
    try {
      await orderService.createReshipOrderFrom(orderA.id, 'admin-verify', {
        sets: 3,
      });
    } catch (error) {
      overLimitBlocked = String((error as Error).message);
    }
    check(
      '补发套数不能超过原单套数（原单 2 套，填 3 套被拒）',
      overLimitBlocked.includes('不能超过原单套数'),
      overLimitBlocked,
    );

    // ==========================================================
    // ③ 补发单照常发货 → 收货；原单（不在售后中）不受影响
    // ==========================================================
    await orderService.shipOrder(
      reshipA.id,
      `SFR${String(stamp).slice(-7)}`,
      'SF',
      'admin-verify',
    );
    await orderService.completeOrder(reshipA.id, 'admin', 'admin-verify');

    const orderAAfter = (await orderService.getOrderById(orderA.id))!;
    const reshipAAfter = (await orderService.getOrderById(reshipA.id))!;
    check(
      '补发单能像普通现货单一样发货并完成',
      reshipAAfter.status === OrderStatus.COMPLETED,
      `补发单 status=${reshipAAfter.status}`,
    );
    check(
      '原单本来就不在售后中，补发不应该把它改状态',
      orderAAfter.status === OrderStatus.SHIPPED &&
        (orderAAfter.aftersaleType ?? null) === null,
      `原单 status=${orderAAfter.status}, aftersaleType=${orderAAfter.aftersaleType}`,
    );

    // ==========================================================
    // ④ 售后中的原单：补发即处理结果，补发送达后原单自动结案
    // ==========================================================
    const orderB = (await buyAndShip(1, 'B'))!;
    await orderService.applyForAftersale(
      orderB.id,
      customerId,
      AftersaleType.REFUND,
      '有一袋变质',
    );
    const orderBSale = (await orderService.getOrderById(orderB.id))!;
    check(
      '顾客申请售后后原单进入「售后中」',
      orderBSale.status === OrderStatus.AFTERSALE,
      `status=${orderBSale.status}`,
    );

    const beforeB = await available();
    const resolved = await orderService.resolveAftersale(
      orderB.id,
      'reshipped',
      'admin-verify',
      '核实后免费补发一份',
      'ADMIN',
      undefined,
      1,
    );
    const reshipB = (resolved as any).__reshipOrder;
    check(
      '后台选「免费补发」会新建补发单，并回传单号',
      !!reshipB?.id && !!reshipB?.orderNo,
      `补发单 ${reshipB?.orderNo}`,
    );
    check(
      '售后处理为补发：原单留在「售后中」等补发送达，处理方式标记为免费补发',
      resolved.status === OrderStatus.AFTERSALE &&
        resolved.aftersaleType === AftersaleType.RESHIP,
      `status=${resolved.status}, aftersaleType=${resolved.aftersaleType}`,
    );
    check(
      '售后补发同样要扣库存',
      (await available()) === beforeB - 1,
      `${beforeB} → ${await available()} 套`,
    );

    await orderService.shipOrder(
      reshipB.id,
      `SFB${String(stamp).slice(-7)}`,
      'SF',
      'admin-verify',
    );
    await orderService.completeOrder(reshipB.id, 'admin', 'admin-verify');

    const orderBAfter = (await orderService.getOrderById(orderB.id))!;
    check(
      '补发送达后，售后中的原单自动结案（不会永远挂在「售后中」）',
      orderBAfter.status === OrderStatus.COMPLETED,
      `原单 status=${orderBAfter.status}`,
    );

    // ==========================================================
    // ⑤ 取消补发单：库存退回，且原单可以重新补发
    // ==========================================================
    const orderC = (await buyAndShip(3, 'C'))!;
    const beforeC = await available();

    const reshipC = await orderService.createReshipOrderFrom(
      orderC.id,
      'admin-verify',
      { reason: '漏发一整套' },
    );
    check(
      '不传套数时按原单套数全额补发（3 套 = 30 袋）',
      reshipC.items[0].packageCount === 30,
      `${reshipC.items[0].packageCount} 袋`,
    );
    const afterReshipC = await available();
    check(
      '全额补发扣 3 套',
      afterReshipC === beforeC - 3,
      `${beforeC} → ${afterReshipC} 套`,
    );

    await orderService.cancelOrder(
      reshipC.id,
      '顾客改口说只要退款',
      'admin',
      'admin-verify',
    );
    check(
      '取消补发单后库存退回（货没寄出去，不该白扣）',
      (await available()) === beforeC,
      `${afterReshipC} → ${await available()} 套`,
    );

    const reshipC2 = await orderService.createReshipOrderFrom(
      orderC.id,
      'admin-verify',
      { reason: '顾客又要求补寄' },
    );
    check(
      '取消过的补发单不挡路：原单可以重新补发',
      !!reshipC2.id && reshipC2.id !== reshipC.id,
      `新补发单 ${reshipC2.orderNo ?? reshipC2.id}`,
    );

    // ==========================================================
    // ⑥ 库存不足：直接失败，不产生补发单，也不把库存扣成负数
    // ==========================================================
    const orderD = (await buyAndShip(1, 'D'))!;
    check(
      '把库存刚好用光（可售 0 套）',
      (await available()) === 0,
      `可售 ${await available()} 套`,
    );

    let soldOutBlocked = '';
    try {
      await orderService.createReshipOrderFrom(orderD.id, 'admin-verify');
    } catch (error) {
      soldOutBlocked = String((error as Error).message);
    }
    check(
      '没货时补发直接失败，并说清还差几套',
      soldOutBlocked.includes('库存不足'),
      soldOutBlocked,
    );
    check(
      '失败后没有留下补发单，库存也没被扣成负数',
      (await prisma.order.count({
        where: { reshipFromOrderId: orderD.id },
      })) === 0 && (await available()) === 0,
      `补发单 0 张，可售 ${await available()} 套`,
    );
  } finally {
    // ---------- 清理 ----------
    if (customerId) {
      // 自关联外键：先解开补发/重做指向，再让顾客级联删掉所有订单
      await prisma.order
        .updateMany({
          where: { customerId },
          data: { remakeFromOrderId: null, reshipFromOrderId: null },
        })
        .catch(() => {});
      await prisma.user.delete({ where: { id: customerId } }).catch(() => {});
    }
    if (packId) {
      // 库存批次与流水随商品级联删除
      await prisma.tastingPack.delete({ where: { id: packId } }).catch(() => {});
    }
    await configService
      .updateConfig({ enabled: originalEnabled })
      .catch(() => {});
    console.log('\n已清理临时顾客、商品、订单与库存流水');
    await app.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${'='.repeat(60)}\n通过 ${results.length - failed.length}/${results.length} 项`,
  );
  if (failed.length > 0) {
    console.log('失败项：');
    for (const item of failed) console.log(`  - ${item.name}`);
    process.exit(1);
  }
  console.log('全部通过 ✅');
}

main().catch((error) => {
  console.error('验证脚本异常：', error);
  process.exit(1);
});
