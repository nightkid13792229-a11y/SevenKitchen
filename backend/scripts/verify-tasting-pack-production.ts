/**
 * 试吃装备货生产 · 真实数据库全链路验证
 *
 * 验证的是这条**原先不存在**的通路（系统过去只能从顾客订单生成生产）：
 *
 *   建备货单（算出每道菜做多少、每样原料买多少）
 *     → 生成采购清单（含原料库存抵扣）
 *     → 完成采购
 *     → 排产（生成备货生产批次，每道菜一锅）
 *     → 车间完工
 *     → 系统建议入库套数 → 确认入库 → 成品库存入账
 *
 * 全程用真实 Service，用完清理临时商品、备货单、批次与库存。
 *
 * 用法：cd backend && npx ts-node -r tsconfig-paths/register scripts/verify-tasting-pack-production.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma.service';
import { TastingPackService } from '../src/application/tasting-pack/tasting-pack.service';
import { TastingPackStockService } from '../src/application/tasting-pack/tasting-pack-stock.service';
import { TastingPackProductionService } from '../src/application/tasting-pack/tasting-pack-production.service';
import { TastingPackConfigService } from '../src/application/tasting-pack/tasting-pack-config.service';
import { StaffProductionService } from '../src/application/production/kitchen.service';
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
  const stockService = app.get(TastingPackStockService);
  const planService = app.get(TastingPackProductionService);
  const configService = app.get(TastingPackConfigService);
  const staffProduction = app.get(StaffProductionService);

  const stamp = Date.now();
  let packId = '';
  let planId = '';
  let purchaseListId = '';
  let batchId = '';
  const originalEnabled = (await configService.getConfig()).enabled;

  try {
    // ---------- 商品 ----------
    const recipes = await prisma.recipe.findMany({
      where: { status: 'PUBLIC' },
      select: { recipeId: true },
      take: 30,
      orderBy: { viewCount: 'desc' },
    });
    const recipeIds = [...new Set(recipes.map((r) => r.recipeId))].slice(0, 5);
    if (recipeIds.length < 5) throw new Error('公开食谱不足 5 道');

    const pack = await packService.create({
      name: `【验证脚本】备货尝鲜装 ${stamp}`,
      bagsPerRecipe: 2,
      packSpecG: 80,
      items: recipeIds.map((recipeId, index) => ({ recipeId, sortOrder: index })),
    });
    packId = pack.id;
    console.log(
      `\n临时商品：${pack.code}（5 道菜 / ${pack.totalNetWeightG}g 一套）\n`,
    );

    // ==========================================================
    // ① 建备货单：把"做几套"换算成用料
    // ==========================================================
    const plan = await planService.createPlan({
      tastingPackId: packId,
      sets: 10,
      plannedDate: new Date().toISOString().slice(0, 10),
      note: '验证脚本',
      createdById: ADMIN_USER_ID,
    });
    planId = plan.id;

    check(
      '备货单把"做 10 套"换算成每道菜做多少克',
      plan.dishes.length === 5 &&
        plan.dishes.every((d) => d.netWeightG === 1600),
      plan.dishes
        .map((d) => `${d.recipeName} ${d.netWeightG}g/${d.packageCount}袋`)
        .join('，'),
    );
    check(
      '备货单算出需要采购的原料种类与预估成本',
      plan.ingredientCount > 0 && plan.estimatedIngredientCost > 0,
      `${plan.ingredientCount} 种原料，预估 ¥${plan.estimatedIngredientCost}`,
    );
    check('备货单初始状态为「已建单」', plan.status === 'PLANNED', plan.status);

    // ==========================================================
    // ② 生成采购清单
    // ==========================================================
    const afterPurchase = await planService.generatePurchaseList(
      planId,
      ADMIN_USER_ID,
    );
    purchaseListId = afterPurchase.purchaseListId ?? '';
    check(
      '生成采购清单并关联回备货单',
      !!purchaseListId && afterPurchase.status === 'PURCHASING',
      `采购单 ${purchaseListId}`,
    );

    const purchaseItems = await prisma.purchaseItem.findMany({
      where: { purchaseListId },
      select: { ingredientName: true, quantityNeeded: true, quantityUnit: true },
      take: 5,
    });
    check(
      '采购清单里有具体原料与数量',
      purchaseItems.length > 0,
      purchaseItems
        .slice(0, 3)
        .map(
          (i) =>
            `${i.ingredientName} ${Number(i.quantityNeeded).toFixed(3)}${i.quantityUnit}`,
        )
        .join('，'),
    );

    const linkedPlanId = await prisma.purchaseList.findUnique({
      where: { id: purchaseListId },
      select: { sourceTastingPackPlanId: true, sourceOrderIds: true },
    });
    check(
      '采购清单能回溯到备货单，且没有假装成订单需求',
      linkedPlanId?.sourceTastingPackPlanId === planId &&
        (linkedPlanId?.sourceOrderIds?.length ?? 0) === 0,
      `来源备货单 ${linkedPlanId?.sourceTastingPackPlanId?.slice(0, 8)}…`,
    );

    // ==========================================================
    // ③ 未完成采购不能排产
    // ==========================================================
    let blocked = false;
    try {
      await planService.schedule(planId, {});
    } catch (error) {
      blocked = String((error as Error).message).includes('采购');
    }
    check('采购没完成时排产被拦住并说明原因', blocked);

    // ---------- 完成采购 ----------
    await prisma.purchaseList.update({
      where: { id: purchaseListId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    // ==========================================================
    // ④ 排产
    // ==========================================================
    const scheduled = await planService.schedule(planId, {});
    batchId = scheduled.productionBatchId ?? '';
    check(
      '排产生成备货生产批次',
      !!batchId && scheduled.status === 'SCHEDULED',
      `批次 ${batchId.slice(0, 8)}…`,
    );

    const batchRow = await prisma.productionBatch.findUnique({
      where: { id: batchId },
      select: {
        source: true,
        tastingPackProductionPlanId: true,
        packagingUnits: {
          select: {
            id: true,
            totalProductionG: true,
            stockPortionPlan: true,
            sourceOrderItemIds: true,
            recipeSnapshot: true,
          },
        },
      },
    });
    check(
      '批次来源标为备货，并关联回备货单',
      batchRow?.source === 'STOCK' &&
        batchRow?.tastingPackProductionPlanId === planId,
      `source=${batchRow?.source}`,
    );
    check(
      '每道菜一个分装单元，且没有假装有来源订单',
      batchRow?.packagingUnits.length === 5 &&
        batchRow.packagingUnits.every(
          (u) => (u.sourceOrderItemIds?.length ?? 0) === 0,
        ),
      `${batchRow?.packagingUnits.length} 锅`,
    );
    check(
      '分装单元带上了备货分装计划（每锅多少袋、每袋多少克）',
      batchRow?.packagingUnits.every(
        (u) =>
          ((u.stockPortionPlan as any)?.packageCount ?? 0) > 0 &&
          (u.stockPortionPlan as any)?.packageSpecG === 80,
      ) === true,
      JSON.stringify(batchRow?.packagingUnits[0]?.stockPortionPlan),
    );
    check(
      '配方快照带上了食材配比（车间录实际用量时要用）',
      batchRow?.packagingUnits.every((u) => {
        const items = (u.recipeSnapshot as any)?.items ?? [];
        const foodItems = items.filter(
          (i: any) => String(i.ingredient_type).toUpperCase() === 'FOOD',
        );
        // 补剂是按营养素目标定量、不是按比例，ratio 本来就可能是 0（与订单链路同口径）
        return foodItems.length > 0 && foodItems.every((i: any) => i.ratio > 0);
      }) === true,
      `第一锅 ${((batchRow?.packagingUnits[0]?.recipeSnapshot as any)?.items ?? []).filter((i: any) => String(i.ingredient_type).toUpperCase() === 'FOOD').length} 种食材带配比`,
    );

    // ==========================================================
    // ⑤ 车间完工
    // ==========================================================
    const completed = await staffProduction.getPackagingUnits({
      status: PackagingUnitStatus.PENDING,
      targetDate: scheduled.plannedDate,
      page: 1,
      pageSize: 50,
    });
    const myUnits = completed.list.filter((u) =>
      batchRow?.packagingUnits.some((bu) => bu.id === u.id),
    );
    check('车间能看到这批备货任务', myUnits.length === 5, `${myUnits.length} 个任务`);

    for (const unit of myUnits) {
      await staffProduction.startProductionTask(unit.id);
      await staffProduction.completeProductionTask(unit.id, {
        resultStatus: 'NORMAL',
      });
    }

    const planAfterWork = await planService.getPlan(planId);
    check(
      '五锅都完工后，备货单自动进入「已完工」',
      planAfterWork.status === 'COMPLETED',
      `status=${planAfterWork.status}`,
    );
    check(
      '系统按实际产出给出建议入库套数（10 套）',
      planAfterWork.suggestedStockInSets === 10,
      `建议 ${planAfterWork.suggestedStockInSets} 套`,
    );

    // ==========================================================
    // ⑥ 确认入库
    // ==========================================================
    const stocked = await planService.stockIn(planId, {
      unitCost: 56,
      note: '验证脚本入库',
      operatorId: ADMIN_USER_ID,
    });
    check(
      '确认入库后备货单完结',
      stocked.status === 'STOCKED' && stocked.stockedSets === 10,
      `入库 ${stocked.stockedSets} 套`,
    );

    const available = await stockService.getAvailableSets(packId);
    check('成品库存入账 10 套', available === 10, `可售 ${available} 套`);

    const batch = await prisma.tastingPackStockBatch.findFirst({
      where: { tastingPackId: packId },
      select: { batchNo: true, unitCost: true, productionPlanId: true },
    });
    check(
      '库存批次带单套成本并回溯到备货单（毛利才有得算）',
      Number(batch?.unitCost) === 56 && batch?.productionPlanId === planId,
      `批次 ${batch?.batchNo}，成本 ¥${batch?.unitCost}`,
    );

    // 重复入库必须被拦住
    let duplicated = false;
    try {
      await planService.stockIn(planId, { sets: 10 });
    } catch (error) {
      duplicated = String((error as Error).message).includes('已经入库');
    }
    check('同一张备货单不能重复入库', duplicated);
  } finally {
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
    await configService
      .updateConfig({ enabled: originalEnabled })
      .catch(() => {});
    console.log('\n已清理临时商品、备货单、生产批次与采购清单');
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
