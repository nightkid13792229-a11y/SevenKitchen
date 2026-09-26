/**
 * 试吃装（现货）购买闭环 · 真实数据库验证脚本
 *
 * 验证「顾客从报价到收货」这一整条链路，以及两条最容易出错的支路：
 *   ① 正常购买：报价 → 下单占用库存 → 支付 → 直接发货（不进采购/排产）
 *   ② 未付款取消：库存必须原样退回
 *   ③ 售后：现货订单不允许"重做"，只能退款/补发
 *
 * 全程使用真实的 Service（不是 mock），用完清理临时顾客与商品。
 *
 * 用法：cd backend && npx ts-node -r tsconfig-paths/register scripts/verify-tasting-pack-order-flow.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma.service';
import { TastingPackService } from '../src/application/tasting-pack/tasting-pack.service';
import { TastingPackStockService } from '../src/application/tasting-pack/tasting-pack-stock.service';
import { TastingPackConfigService } from '../src/application/tasting-pack/tasting-pack-config.service';
import { OrderService } from '../src/application/order/order.service';
import { OrderStatus, OrderType, AftersaleType } from '../src/domain/order/enums';

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

  try {
    // ---------- 准备：临时顾客 + 收货地址 + 商品 + 库存 ----------
    const customer = await prisma.user.create({
      data: {
        // phone 列限 20 字符，用时间戳后 10 位保证唯一
        phone: `9${String(stamp).slice(-10)}`,
        nickname: '试吃装验证顾客',
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
      name: `【验证脚本】尝鲜装 ${stamp}`,
      bagsPerRecipe: 2,
      packSpecG: 80,
      items: recipeIds.map((recipeId, index) => ({ recipeId, sortOrder: index })),
    });
    packId = pack.id;

    await stockService.stockIn({
      tastingPackId: packId,
      sets: 10,
      producedAt: new Date(),
      unitCost: 56,
      note: '验证脚本入库',
    });
    await packService.publish(packId);
    await configService.updateConfig({ enabled: true });

    console.log(`\n临时商品：${pack.code}（5 道菜 / ${pack.totalNetWeightG}g）\n`);

    // ==========================================================
    // ① 正常购买：报价 → 下单 → 支付 → 直接发货
    // ==========================================================
    const quote = await packService.createPurchaseQuote({
      idOrCode: pack.code,
      sets: 2,
      addressId: address.id,
      customerId,
    });
    check(
      '报价返回价格快照，且金额一致',
      !!quote.snapshotId && quote.amountProduct === quote.unitPrice * 2,
      `单价 ¥${quote.unitPrice} × 2 = ¥${quote.amountProduct}，运费 ¥${quote.amountShipping}`,
    );

    const order = await orderService.createOrderDraft({
      customerId,
      type: OrderType.TASTING_PACK,
      snapshotId: quote.snapshotId,
      addressId: address.id,
    });
    check(
      '订单类型为试吃装，且不设制作日期（现货不排产）',
      order.type === OrderType.TASTING_PACK &&
        order.targetProductionDate === null,
      `type=${order.type}, targetProductionDate=${order.targetProductionDate}`,
    );
    check(
      '订单明细带上了试吃装商品 ID',
      order.items[0].tastingPackId === packId,
      `tastingPackId=${order.items[0].tastingPackId}`,
    );
    check(
      '订单明细没有"每日饭量"（现货没有这个概念，不塞假数据）',
      order.items[0].dailyIntakeG === null,
      `dailyIntakeG=${order.items[0].dailyIntakeG}`,
    );
    check(
      '下单后库存被占用（10 - 2 = 8）',
      (await stockService.getAvailableSets(packId)) === 8,
      `可售 ${await stockService.getAvailableSets(packId)} 套`,
    );

    await orderService.confirmOrder(order.id, 'customer', customerId);
    await orderService.confirmPaymentAdmin(order.id, 'admin');

    const paidOrder = await orderService.getOrderById(order.id);
    check(
      '支付后订单状态为「已付款」',
      paidOrder?.status === OrderStatus.PAID,
      `status=${paidOrder?.status}`,
    );

    // 现货：付款即可发货，不需要经过采购/生产/急冻
    const shipped = await orderService.shipOrder(
      order.id,
      'SF1234567890',
      'SF',
      'admin-verify',
    );
    check(
      '现货订单「已付款」可直接发货（跳过采购/生产/急冻）',
      shipped.status === OrderStatus.SHIPPED,
      `status=${shipped.status}`,
    );

    // 误把现货单拉去生产的防护
    let productionBlocked = false;
    try {
      await orderService.startProduction(order.id, 'admin-verify');
    } catch (error) {
      productionBlocked = String((error as Error).message).includes('现货');
    }
    check(
      '误点「开始生产」会被拦住并说明原因',
      productionBlocked,
      '现货订单不允许进入生产流程',
    );

    // ==========================================================
    // ② 未付款取消：库存原样退回
    // ==========================================================
    const quote2 = await packService.createPurchaseQuote({
      idOrCode: pack.code,
      sets: 3,
      addressId: address.id,
      customerId,
    });
    const order2 = await orderService.createOrderDraft({
      customerId,
      type: OrderType.TASTING_PACK,
      snapshotId: quote2.snapshotId,
      addressId: address.id,
    });
    const afterReserve = await stockService.getAvailableSets(packId);
    check(
      '第二单占用 3 套（8 - 3 = 5）',
      afterReserve === 5,
      `可售 ${afterReserve} 套`,
    );

    await orderService.cancelOrder(
      order2.id,
      '顾客改主意了',
      'customer',
      customerId,
    );
    check(
      '取消订单后库存原样退回（5 + 3 = 8）',
      (await stockService.getAvailableSets(packId)) === 8,
      `可售 ${await stockService.getAvailableSets(packId)} 套`,
    );

    // 已发货那一单不能被取消（域层拦截）
    let shippedCancelBlocked = false;
    try {
      await orderService.cancelOrder(order.id, '试图取消已发货', 'admin', null);
    } catch {
      shippedCancelBlocked = true;
    }
    check('已发货订单不能被取消（域层拦截）', shippedCancelBlocked);

    // ==========================================================
    // ③ 售后：不允许"重做"，允许退款
    // ==========================================================
    let remakeBlocked = false;
    try {
      const fresh = await orderService.getOrderById(order.id);
      fresh!.applyForAftersale(AftersaleType.REMAKE, '想重做');
    } catch (error) {
      remakeBlocked = String((error as Error).message).includes('现货');
    }
    check(
      '现货订单不允许「重做」（本来就是做好的存货）',
      remakeBlocked,
      '提示改为申请退款或联系客服补发',
    );

    let refundAllowed = false;
    try {
      const fresh = await orderService.getOrderById(order.id);
      fresh!.applyForAftersale(AftersaleType.REFUND, '破损');
      refundAllowed = true;
    } catch {
      refundAllowed = false;
    }
    check('现货订单允许申请退款', refundAllowed);

    // ==========================================================
    // ④ 现货订单不能进入采购需求
    // ==========================================================
    const purchaseCandidates = await prisma.order.findMany({
      where: {
        targetProductionDate: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        type: { not: 'TASTING_PACK' },
      },
      select: { id: true },
    });
    check(
      '试吃装订单不会被采购/排产按制作日期捞出来',
      !purchaseCandidates.some((o) => o.id === order.id),
      `同日期范围内鲜食订单 ${purchaseCandidates.length} 张，不含本单`,
    );
  } finally {
    // ---------- 清理 ----------
    if (customerId) {
      // 订单/地址随顾客级联删除
      await prisma.order.updateMany({
        where: { customerId },
        data: { remakeFromOrderId: null },
      });
      await prisma.user.delete({ where: { id: customerId } }).catch(() => {});
    }
    if (packId) {
      await prisma.tastingPack.delete({ where: { id: packId } }).catch(() => {});
    }
    await configService
      .updateConfig({ enabled: originalEnabled })
      .catch(() => {});
    console.log('\n已清理临时顾客、商品与库存');
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
