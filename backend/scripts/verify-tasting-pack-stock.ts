/**
 * 试吃装成品库存 · 真实数据库验证脚本
 *
 * 为什么必须是真库：这个功能唯一不能出错的地方是「不超卖」，
 * 而它靠的是数据库的条件更新（`quantity_remaining >= n`）。
 * 用 mock 测等于自问自答 —— 只有真的并发打上去才知道会不会卖重。
 *
 * 本脚本会：
 *   ① 建一个临时试吃装商品并入库
 *   ② **5 个请求同时抢最后 1 套**，断言只有 1 个成功
 *   ③ 断言释放后库存原样回来，且重复释放不会多还
 *   ④ 断言先到期先出（FIFO）
 *   ⑤ 清理现场（删除临时商品，级联清掉批次与流水）
 *
 * 用法：cd backend && npx ts-node -r tsconfig-paths/register scripts/verify-tasting-pack-stock.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma.service';
import { TastingPackStockService } from '../src/application/tasting-pack/tasting-pack-stock.service';

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
  const stockService = app.get(TastingPackStockService);

  const stamp = Date.now();
  let packId = '';

  try {
    // ---- 建一个临时商品 ----
    const pack = await prisma.tastingPack.create({
      data: {
        code: `TPVERIFY${String(stamp).slice(-6)}`,
        name: `【验证脚本】试吃装 ${stamp}`,
        status: 'ACTIVE',
        bagsPerRecipe: 2,
        packSpecG: 80,
      },
    });
    packId = pack.id;
    console.log(`\n临时商品：${pack.code} (${pack.id})\n`);

    // ==========================================================
    // ① 不超卖：5 个请求同时抢最后 1 套
    // ==========================================================
    await stockService.stockIn({
      tastingPackId: packId,
      sets: 1,
      producedAt: new Date(),
      unitCost: 50,
      note: '验证脚本入库',
    });

    const contenders = Array.from({ length: 5 }, (_, i) => `verify-order-${stamp}-${i}`);
    const outcomes = await Promise.allSettled(
      contenders.map((orderId) =>
        stockService.reserveForOrder({
          tastingPackId: packId,
          sets: 1,
          orderId,
        }),
      ),
    );

    const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
    const failed = outcomes.filter((o) => o.status === 'rejected');

    check(
      '5 个请求同时抢最后 1 套：只有 1 个成功',
      succeeded.length === 1,
      `成功 ${succeeded.length} 个 / 失败 ${failed.length} 个`,
    );
    check(
      '剩余库存为 0（没有被扣成负数）',
      (await stockService.getAvailableSets(packId)) === 0,
      `可售 ${await stockService.getAvailableSets(packId)} 套`,
    );
    check(
      '失败方收到的是「库存不足」而不是别的错',
      failed.every(
        (o) =>
          o.status === 'rejected' &&
          String((o as PromiseRejectedResult).reason?.message ?? '').includes(
            '库存不足',
          ),
      ),
      failed.length > 0
        ? String((failed[0] as PromiseRejectedResult).reason?.message)
        : '',
    );

    // ==========================================================
    // ② 释放：库存原样回补，且重复释放不会多还
    // ==========================================================
    const winner = succeeded[0] as PromiseFulfilledResult<any>;
    const winnerOrderId = winner.value.allocations ? winner.value.packId : '';
    const winningOrderId =
      contenders[
        outcomes.findIndex((o) => o.status === 'fulfilled')
      ];

    const first = await stockService.releaseForOrder({ orderId: winningOrderId });
    check('取消订单后库存回补 1 套', first.released === 1, `回补 ${first.released} 套`);
    check(
      '回补后可售恢复为 1',
      (await stockService.getAvailableSets(packId)) === 1,
      `可售 ${await stockService.getAvailableSets(packId)} 套`,
    );

    const second = await stockService.releaseForOrder({ orderId: winningOrderId });
    check(
      '重复释放不会多还（幂等）',
      second.released === 0,
      `第二次回补 ${second.released} 套`,
    );
    check(
      '重复释放后可售仍是 1，没有变成 2',
      (await stockService.getAvailableSets(packId)) === 1,
      `可售 ${await stockService.getAvailableSets(packId)} 套`,
    );

    // ==========================================================
    // ③ 先到期先出
    // ==========================================================
    await prisma.tastingPackStockBatch.deleteMany({ where: { tastingPackId: packId } });
    await prisma.tastingPackStockLedger.deleteMany({ where: { tastingPackId: packId } });

    const laterExpiry = await stockService.stockIn({
      tastingPackId: packId,
      sets: 10,
      producedAt: new Date(),
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      unitCost: 80,
      note: '后到期',
    });
    const soonerExpiry = await stockService.stockIn({
      tastingPackId: packId,
      sets: 10,
      producedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      unitCost: 40,
      note: '先到期',
    });

    const fifo = await stockService.reserveForOrder({
      tastingPackId: packId,
      sets: 3,
      orderId: `verify-fifo-${stamp}`,
    });
    check(
      '先到期先出：3 套全部从"先到期"那批扣',
      fifo.allocations.length === 1 &&
        fifo.allocations[0].batchId === soonerExpiry.id,
      `扣了 ${fifo.allocations.length} 个批次`,
    );

    const fifoCost = await stockService.getWeightedUnitCost(packId);
    check(
      '加权成本按剩余批次算（先到期那批成本更低，加权后应低于 80）',
      fifoCost !== null && fifoCost < 80,
      `加权成本 ¥${fifoCost}`,
    );

    // ==========================================================
    // ④ 过期批次不计入可售
    // ==========================================================
    await stockService.stockIn({
      tastingPackId: packId,
      sets: 5,
      producedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      unitCost: 30,
      note: '已过期',
    });
    const beforeSweep = await stockService.getAvailableSets(packId);
    const sweep = await stockService.runExpirySweep();
    const afterSweep = await stockService.getAvailableSets(packId);

    check(
      '过期批次不计入可售',
      beforeSweep === afterSweep,
      `下账前 ${beforeSweep} 套 / 下账后 ${afterSweep} 套`,
    );
    check('过期下账写入流水', sweep.expired >= 1, `下账 ${sweep.expired} 个批次`);

    void laterExpiry;
    void winnerOrderId;
  } finally {
    if (packId) {
      await prisma.tastingPack.delete({ where: { id: packId } }).catch(() => {});
      console.log(`\n已清理临时商品 ${packId}`);
    }
    await app.close();
  }

  const failedChecks = results.filter((r) => !r.ok);
  console.log(
    `\n${'='.repeat(60)}\n通过 ${results.length - failedChecks.length}/${results.length} 项`,
  );
  if (failedChecks.length > 0) {
    console.log('失败项：');
    for (const item of failedChecks) console.log(`  - ${item.name}`);
    process.exit(1);
  }
  console.log('全部通过 ✅');
}

main().catch((error) => {
  console.error('验证脚本异常：', error);
  process.exit(1);
});
