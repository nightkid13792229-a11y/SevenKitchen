/**
 * 车间完工 → 原料库存扣减 · 真实数据库验证
 *
 * 验证这条**原先断掉的链路**：
 *   车间点「完成」→ 生成原料用量快照 → （开关打开时）扣减原料库存
 *
 * 过去：小程序车间端完工那条路既不生成快照、也不扣库存，
 * 唯一会扣的路径小程序没在用，且它要求快照存在 —— 于是原料库存只增不减。
 *
 * 本脚本分两段验证：
 *   ① 开关关闭：快照照常生成（后台随时可手工补扣），但**不扣库存**
 *   ② 开关打开：扣减发生，且扣减量等于按配方算出的应投量
 *
 * 用法：cd backend && npx ts-node -r tsconfig-paths/register scripts/verify-production-inventory-deduction.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma.service';
import { TastingPackService } from '../src/application/tasting-pack/tasting-pack.service';
import { TastingPackProductionService } from '../src/application/tasting-pack/tasting-pack-production.service';
import { TastingPackConfigService } from '../src/application/tasting-pack/tasting-pack-config.service';
import { StaffProductionService } from '../src/application/production/kitchen.service';
import { GlobalConfigService } from '../src/application/config/global-config.service';
import { calculateProductionUsage } from '../src/application/production/production-ingredient-usage';
import { PackagingUnitStatus } from '../src/domain/production/enums';

const ADMIN_USER_ID =
  process.env.VERIFY_ADMIN_ID || '7e5960f1-297e-4b94-91be-5607eafd4cdf';

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
  const planService = app.get(TastingPackProductionService);
  const packConfig = app.get(TastingPackConfigService);
  const staffProduction = app.get(StaffProductionService);
  const globalConfigService = app.get(GlobalConfigService);

  const stamp = Date.now();
  let packId = '';
  /** 本次验证扣减过的锅次：库存流水不随批次级联删除，必须单独清 */
  const reservedUnitIds: string[] = [];
  let batchId = '';
  let purchaseListId = '';
  const originalPackEnabled = (await packConfig.getConfig()).enabled;
  const originalDeduct = (await globalConfigService.getGlobalConfig())
    .autoDeductInventoryOnProduction;

  try {
    // ---------- 准备：商品 → 备货单 → 采购 → 排产 ----------
    const recipes = await prisma.recipe.findMany({
      where: { status: 'PUBLIC' },
      select: { recipeId: true },
      take: 30,
      orderBy: { viewCount: 'desc' },
    });
    const recipeIds = [...new Set(recipes.map((r) => r.recipeId))].slice(0, 5);
    if (recipeIds.length < 5) throw new Error('公开食谱不足 5 道');

    const pack = await packService.create({
      name: `【验证脚本】扣减链路 ${stamp}`,
      bagsPerRecipe: 2,
      packSpecG: 80,
      items: recipeIds.map((recipeId, index) => ({ recipeId, sortOrder: index })),
    });
    packId = pack.id;
    await packService.publish(packId);
    await packConfig.updateConfig({ enabled: true });

    const plan = await planService.createPlan({
      tastingPackId: packId,
      sets: 4,
      plannedDate: new Date().toISOString().slice(0, 10),
      createdById: ADMIN_USER_ID,
    });
    const withPurchase = await planService.generatePurchaseList(
      plan.id,
      ADMIN_USER_ID,
    );
    purchaseListId = withPurchase.purchaseListId ?? '';
    await prisma.purchaseList.update({
      where: { id: purchaseListId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    const scheduled = await planService.schedule(plan.id, {});
    batchId = scheduled.productionBatchId ?? '';
    console.log(`\n临时批次：${batchId.slice(0, 8)}…（4 套 → 5 锅）\n`);

    const units = await prisma.packagingUnit.findMany({
      where: { productionBatchId: batchId },
      select: { id: true, totalProductionG: true, recipeSnapshot: true },
    });
    check('备货批次生成了 5 锅（每道菜一锅）', units.length === 5, `${units.length} 锅`);

    const target = units[0];

    // ==========================================================
    // ① 开关关闭：生成快照，但不扣库存
    // ==========================================================
    await globalConfigService.updateGlobalConfig({
      autoDeductInventoryOnProduction: false,
    });
    const ledgerBefore = await prisma.inventoryLedgerEntry.count();

    await staffProduction.startProductionTask(target.id);
    await staffProduction.completeProductionTask(target.id, {
      resultStatus: 'NORMAL',
    });

    const afterOff = await prisma.packagingUnit.findUnique({
      where: { id: target.id },
      select: { status: true, ingredientsUsageSnapshot: true },
    });
    const snapshot = (afterOff?.ingredientsUsageSnapshot ?? {}) as Record<
      string,
      { required_g: number; actual_g: number }
    >;
    const snapshotCount = Object.keys(snapshot).length;

    check(
      '完工时生成了原料用量快照（这是后台手工补扣的前提）',
      snapshotCount > 0,
      `${snapshotCount} 种原料`,
    );
    check(
      '快照里每样原料的应投量都大于 0（实体层硬要求）',
      Object.values(snapshot).every((entry) => entry.required_g > 0),
    );
    check(
      '开关关闭时不扣库存',
      (await prisma.inventoryLedgerEntry.count()) === ledgerBefore,
      `流水条数仍为 ${ledgerBefore}`,
    );

    // 快照里的数字必须等于按配方算出来的数字
    const expected = calculateProductionUsage({
      recipeSnapshot: target.recipeSnapshot as any,
      totalProductionG: target.totalProductionG,
      supplementLossRate: (await globalConfigService.getGlobalConfig())
        .supplementLossRate,
    });
    const mismatch = expected.items.filter((item) => {
      const actual = snapshot[item.ingredientId]?.required_g;
      return actual === undefined || Math.abs(actual - item.requiredAmount) > 1e-6;
    });
    check(
      '快照与「按配方算出的应投量」逐样一致',
      mismatch.length === 0,
      mismatch.length === 0
        ? `${expected.items.length} 种原料全部一致`
        : `不一致：${mismatch.map((m) => m.name).join('、')}`,
    );

    // ==========================================================
    // ② 开关打开：扣减发生
    // ==========================================================
    await globalConfigService.updateGlobalConfig({
      autoDeductInventoryOnProduction: true,
    });

    const second = units[1];
    reservedUnitIds.push(target.id, second.id);
    await staffProduction.startProductionTask(second.id);
    await staffProduction.completeProductionTask(second.id, {
      resultStatus: 'NORMAL',
    });

    const newEntries = await prisma.inventoryLedgerEntry.findMany({
      where: { sourceType: 'KITCHEN_TASK', sourceId: second.id },
      select: { ingredientId: true, deltaG: true },
    });
    check(
      '开关打开后，完工触发了原料库存扣减',
      newEntries.length > 0,
      `${newEntries.length} 条扣减流水`,
    );
    check(
      '扣减都是负数（出库）',
      newEntries.every((entry) => entry.deltaG < 0),
    );

    const secondSnapshot = ((
      await prisma.packagingUnit.findUnique({
        where: { id: second.id },
        select: { ingredientsUsageSnapshot: true },
      })
    )?.ingredientsUsageSnapshot ?? {}) as Record<
      string,
      { required_g: number; actual_g: number }
    >;

    const amountMismatch = newEntries.filter((entry) => {
      const expectedAmount = secondSnapshot[entry.ingredientId]?.required_g;
      return (
        expectedAmount === undefined ||
        Math.abs(Math.abs(entry.deltaG) - expectedAmount) > 1e-6
      );
    });
    check(
      '扣减量 = 快照里的应投量（一分不差）',
      amountMismatch.length === 0,
      amountMismatch.length === 0
        ? `${newEntries.length} 条全部吻合`
        : `${amountMismatch.length} 条不吻合`,
    );

    // 重复完工不该重复扣（幂等）
    const before = await prisma.inventoryLedgerEntry.count();
    await prisma.$executeRawUnsafe(
      `UPDATE packaging_unit SET status = 'IN_PROGRESS' WHERE id = $1`,
      second.id,
    );
    await staffProduction.completeProductionTask(second.id, {
      resultStatus: 'NORMAL',
    });
    check(
      '同一锅重复扣减不会重复记账（按来源幂等）',
      (await prisma.inventoryLedgerEntry.count()) === before,
      `流水条数仍为 ${before}`,
    );

    // ==========================================================
    // ③ 可读性：把实际扣了什么打出来，方便人工核对量纲
    // ==========================================================
    const names = await prisma.ingredient.findMany({
      where: { id: { in: newEntries.map((e) => e.ingredientId) } },
      select: { id: true, name: true, baseUnit: true, unitDisplayLabel: true },
    });
    const nameById = new Map(names.map((n) => [n.id, n]));
    console.log('\n这一锅实际扣掉的原料（前 8 条，用于人工核对量纲）：');
    for (const entry of newEntries.slice(0, 8)) {
      const meta = nameById.get(entry.ingredientId);
      const unit = meta?.unitDisplayLabel || meta?.baseUnit || '';
      console.log(
        `   ${meta?.name ?? entry.ingredientId}  ${Math.abs(entry.deltaG).toFixed(4)} ${unit}`,
      );
    }
  } finally {
    // 库存流水不随生产批次级联删除（它挂在原料上），必须显式清掉 ——
    // 否则验证会**永久扣掉**这些原料的库存，属于污染真实数据
    if (reservedUnitIds.length > 0) {
      const removed = await prisma.inventoryLedgerEntry
        .deleteMany({ where: { sourceId: { in: reservedUnitIds } } })
        .catch(() => ({ count: 0 }));
      if (removed.count > 0) {
        console.log(`已回滚验证产生的 ${removed.count} 条库存扣减流水`);
      }
    }
    if (packId) {
      await prisma.tastingPack.delete({ where: { id: packId } }).catch(() => {});
    }
    if (batchId) {
      await prisma.productionBatch
        .delete({ where: { id: batchId } })
        .catch(() => {});
    }
    if (purchaseListId) {
      await prisma.purchaseList
        .delete({ where: { id: purchaseListId } })
        .catch(() => {});
    }
    await globalConfigService
      .updateGlobalConfig({ autoDeductInventoryOnProduction: originalDeduct })
      .catch(() => {});
    await packConfig
      .updateConfig({ enabled: originalPackEnabled })
      .catch(() => {});
    console.log('\n已清理临时商品、批次与采购清单，并复位开关');
    await app.close();
  }

  const failed = results.filter((item) => !item.ok);
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
