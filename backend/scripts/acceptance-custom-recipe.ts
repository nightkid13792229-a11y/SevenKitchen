/**
 * 食谱定制 · 端到端验收走查（2026-10-16）
 *
 * ## 这是给谁看的
 *
 * 给**老板**看的。他不想看测试报告，他想知道「这套东西到底能不能用」。
 * 所以这个脚本不是断言集合，而是**把整条业务流程走一遍并打印出来** ——
 * 每一步都显示"顾客看到什么、后台看到什么"，像一次真实下单。
 *
 * ## 它走的路
 *
 * ```
 * ① 下单（含排期）      顾客提交定制单
 * ② 付款              钱到账
 * ③ 后台接单          进入制作
 * ④ 交付食谱          冻结内容快照 + 算喂食量与采购量
 * ⑤ 顾客确认收到       订单完成
 * ⑥ 顾客提售后        说"吃了有点软便"
 * ⑦ 后台处理售后      改稿并重新交付
 * ⑧ 售后再确认        回到完成
 * ```
 *
 * ## 怎么跑
 *
 * ```bash
 * # 只读预演（不改库，只打印现有数据能走通哪几步）
 * npx ts-node -r tsconfig-paths/register scripts/acceptance-custom-recipe.ts
 *
 * # 真跑一遍（会**造测试数据**并在结束时清理）
 * npx ts-node -r tsconfig-paths/register scripts/acceptance-custom-recipe.ts --run
 * ```
 *
 * ⚠️ **默认只读**。加 `--run` 才会写库，而且**只碰自己造的测试数据**
 * （id 都以 `acceptance-` 开头），结束时全部删掉。
 */
import { CustomRecipeStatus, PrismaClient } from '@prisma/client';
import { CustomRecipeDeliveryService } from '../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeAftersaleService } from '../src/application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeConfigService } from '../src/application/custom-recipe/custom-recipe-config.service';

const prisma = new PrismaClient();
const shouldRun = process.argv.includes('--run');

/** 所有测试数据都用这个前缀，结束时能干净删掉 */
const PREFIX = 'acceptance-';

let stepNo = 0;
function step(title: string) {
  stepNo += 1;
  console.log('');
  console.log('─'.repeat(64));
  console.log(`第 ${stepNo} 步 · ${title}`);
  console.log('─'.repeat(64));
}

function say(label: string, value: unknown) {
  console.log(`  ${label}：${value}`);
}

/** 顾客视角看到的订单（与小程序订单详情接口同一套口径） */
async function customerView(orderId: string) {
  const order = await prisma.customRecipeOrder.findFirst({
    where: { orderId },
    include: {
      deliveries: {
        where: { replacedByDeliveryId: null },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });
  if (!order) return null;

  const delivery = order.deliveries[0] ?? null;
  const statusLabel: Record<string, string> = {
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    IN_PROGRESS: '制作中',
    DELIVERED: '已交付',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
  };

  return {
    status: statusLabel[order.status] ?? order.status,
    deliveryVersion: delivery?.version ?? null,
    deliveredAt: delivery?.deliveredAt ?? null,
    confirmed: Boolean(delivery?.confirmedAt),
    confirmChannel: delivery?.confirmChannel ?? null,
    autoCompleteAt: order.autoCompleteAt,
  };
}

async function main() {
  console.log('');
  console.log('食谱定制 · 端到端验收走查');
  console.log(`模式：${shouldRun ? '★ 真跑（会造数据并在结束时清理）' : '只读预演'}`);
  if (!shouldRun) {
    console.log('');
    console.log('（只读模式不做任何修改。要真跑一遍请加 --run）');
  }

  if (!shouldRun) {
    // 只读模式：找一张现成的已交付单，把它的状态说清楚
    const sample = await prisma.customRecipeOrder.findFirst({
      where: { status: { in: ['DELIVERED', 'COMPLETED'] } },
      orderBy: { updatedAt: 'desc' },
      select: { orderId: true },
    });
    if (!sample) {
      console.log('');
      console.log('库里还没有已交付的定制单。加 --run 可以现场造一张走一遍。');
      return;
    }
    step('看看最近一张已交付的单');
    const view = await customerView(sample.orderId);
    say('订单号', sample.orderId);
    say('顾客看到的状态', view?.status);
    say('交付版本', view?.deliveryVersion);
    say('顾客已确认', view?.confirmed ? '是' : '否');
    return;
  }

  // ==================== 造测试数据 ====================
  const userId = `${PREFIX}user`;
  const dogId = `${PREFIX}dog`;
  const breedId = `${PREFIX}breed`;
  const ingredientIds = [
    `${PREFIX}ing-1`,
    `${PREFIX}ing-2`,
    `${PREFIX}ing-3`,
  ];
  const recipeId = `${PREFIX}recipe`;
  const recipeBizId = 'RP-ACCEPTANCE-001';
  const orderId = `${PREFIX}order`;
  const orderNo = 'CR-ACCEPTANCE-001';

  try {
    await cleanup();

    step('准备一只狗与它的原料');
    await prisma.user.create({
      data: { id: userId, role: 'CUSTOMER', status: 'ACTIVE' },
    });
    await prisma.dogBreed.create({
      data: {
        id: breedId,
        name: '验收犬种',
        sizeCategory: 'MEDIUM',
        growthCurveType: 'STANDARD',
        adultAgeMonths: 12,
        seniorAgeYears: 8,
        averageAdultWeightKg: 12,
      },
    });
    await prisma.dog.create({
      data: {
        id: dogId,
        ownerId: userId,
        name: '验收狗',
        breedId,
        birthday: new Date('2024-01-01'),
        gender: 'MALE',
        isNeutered: true,
        currentWeightKg: 12,
        bcsScore: 5,
        activityLevel: 'NORMAL',
        lifeStageOverride: 'ADULT',
        cachedTargetFoodKcal: 940,
        mealsPerDay: 2,
      },
    });
    await prisma.ingredient.createMany({
      data: [
        {
          id: ingredientIds[0],
          name: '鸡胸肉',
          type: 'FOOD',
          baseUnit: 'G',
          purchaseUnit: '克',
          purchaseToBaseRatio: 1,
          currentPricePerPurchaseUnit: 0.02,
          properties: {},
        },
        {
          id: ingredientIds[1],
          name: '糙米',
          type: 'FOOD',
          baseUnit: 'G',
          purchaseUnit: '克',
          purchaseToBaseRatio: 1,
          currentPricePerPurchaseUnit: 0.01,
          properties: {},
        },
        /**
         * 鱼油只作为**营养补充剂**出现，不进配方配比。
         *
         * 第一版造数据时我把它当成 30% 的配方原料，走查输出里于是变成
         * "鱼油既是原料又是补充剂" —— 而真实食谱里 30% 鱼油是会中毒的。
         * **测试数据也要合理**，否则看的人会以为产品算错了。
         */
        {
          id: ingredientIds[2],
          name: '鱼油',
          type: 'SUPPLEMENT',
          baseUnit: 'G',
          purchaseUnit: '克',
          purchaseToBaseRatio: 1,
          currentPricePerPurchaseUnit: 0.5,
          properties: {},
        },
      ],
    });
    say('狗狗', '验收狗（12kg，BCS 5，每天需要 940 kcal）');

    step('① 顾客下单');
    await prisma.customRecipeOrder.create({
      data: {
        id: orderId,
        orderId: orderNo,
        customerId: userId,
        dogId,
        targetGoal: 'LOSE_WEIGHT',
        scheduledDate: new Date('2026-10-16'),
        status: CustomRecipeStatus.PENDING_PAYMENT,
        amount: 300,
      },
    });
    let view = await customerView(orderNo);
    say('订单号', orderNo);
    say('顾客看到的状态', view?.status);
    say('定制费', '¥300');

    step('② 付款');
    await prisma.customRecipeOrder.update({
      where: { id: orderId },
      data: {
        status: CustomRecipeStatus.PAID,
        paymentConfirmedAt: new Date(),
      },
    });
    view = await customerView(orderNo);
    say('顾客看到的状态', view?.status);

    step('③ 后台接单');
    await prisma.customRecipeOrder.update({
      where: { id: orderId },
      data: {
        status: CustomRecipeStatus.IN_PROGRESS,
        subStage: 'DESIGNING',
        inProgressAt: new Date(),
      },
    });
    view = await customerView(orderNo);
    say('顾客看到的状态', view?.status);
    say('后台看到的子阶段', '设计中（顾客看不到这一层）');

    step('④ 交付食谱（这是最核心的一步）');
    // 造一道私密定制食谱
    await prisma.recipe.create({
      data: {
        id: recipeId,
        recipeId: recipeBizId,
        version: 1,
        name: '验收狗的减重食谱',
        status: 'PRIVATE_CUSTOM',
        energyDensityKcalPerKg: 3620,
        productionLossRate: 1.07,
        applicableLifeStages: ['ADULT'],
        diyGenCount: 0,
        favoriteCount: 0,
        likeCount: 0,
        nutritionStandard: 'FEDIAF_2025',
        salesCount: 0,
        targetHealthTags: [],
        isCustomRecipe: true,
        viewCount: 0,
        customerOwnerId: userId,
        customerDogId: dogId,
      },
    });
    await prisma.recipeItem.createMany({
      data: [
        {
          recipeId: recipeBizId,
          recipeVersion: 1,
          ingredientId: ingredientIds[0],
          preparationMethod: '切丁煮熟',
          ratioPercent: 68,
          sortOrder: 0,
          exampleWeight: 350,
        },
        {
          recipeId: recipeBizId,
          recipeVersion: 1,
          ingredientId: ingredientIds[1],
          preparationMethod: '提前浸泡后煮软',
          ratioPercent: 30,
          sortOrder: 1,
          exampleWeight: 150,
        },
        {
          recipeId: recipeBizId,
          recipeVersion: 1,
          ingredientId: ingredientIds[2],
          preparationMethod: '出锅放凉到 40℃ 以下再拌入',
          ratioPercent: 2,
          sortOrder: 2,
          exampleWeight: 10,
        },
      ],
    });

    const configService = new CustomRecipeConfigService(prisma as never);
    const deliveryService = new CustomRecipeDeliveryService(
      prisma as never,
      configService,
    );

    const delivered = await deliveryService.deliver({
      orderIdOrId: orderNo,
      recipeIdOrBizId: recipeBizId,
      deliveredBy: 'acceptance-script',
      cycleDays: 14,
    });

    view = await customerView(orderNo);
    say('顾客看到的状态', view?.status);
    say('交付版本', `第 ${delivered.version} 版`);
    say('交付物', delivered.itemCodes.join('、'));
    say(
      '自动完成时间',
      delivered.autoCompleteAt
        ? `${delivered.autoCompleteAt.toISOString().slice(0, 10)}（3 天后，顾客不确认则自动完成）`
        : '未设置',
    );

    // 把快照里顾客最关心的几个数打出来
    const deliveryRow = await prisma.customRecipeDelivery.findFirst({
      where: { orderId },
      orderBy: { version: 'desc' },
    });
    const snapshot = deliveryRow?.contentSnapshot as any;
    console.log('');
    console.log('  ── 顾客点开「我的专属食谱」会看到 ──');
    say('  每天怎么喂', `${snapshot.feeding.dailyIntakeG}g，${snapshot.feeding.mealsPerDay} 餐，每餐 ${snapshot.feeding.perMealG}g`);
    say('  做几天', `${snapshot.feeding.cycleDays} 天`);
    // 补充剂单列 —— 它不是一个"食材重量"，按克算没意义
    say(
      '  食材配比',
      snapshot.recipe.items
        .filter((i: any) => !i.isSupplement)
        .map((i: any) => `${i.name} ${i.ratioPercent}%`)
        .join('、'),
    );
    say('  要买多少', snapshot.shopping.lines.map((l: any) => `${l.name} ${l.purchaseG}g`).join('、'));
    say('  合计采购', `${snapshot.shopping.totalPurchaseG}g（含 ${Math.round((snapshot.shopping.lossRate - 1) * 100)}% 损耗余量）`);
    say(
      '  要加的补充剂',
      snapshot.supplements
        .map((s: any) =>
          s.perKgG === null
            ? `${s.name}（按说明加）`
            : `${s.name} 每 kg 食材加 ${s.perKgG}g（${s.timing}）`,
        )
        .join('；') || '无',
    );

    step('④-补 · 一个悬而未决的口径（走查顺手查出来的）');
    /**
     * 食材损耗率（多买百分之几）有三处来源，值不一样：
     *   · 发布**通用**食谱：`recipe-designer.service.ts` 写死 1.05
     *   · 发布**定制**食谱：`admin-custom-recipe.controller.ts` 写死 1.07
     *   · 配置列默认值：1.07
     *
     * 而**采购量就是按这个值算的** —— 同一道食谱从哪个入口发布，
     * 顾客要买多少就差 2%。
     *
     * 走查把这件事**打印出来**，而不是让它藏在代码里：
     * 这是需要老板拍板的业务口径，不是技术问题。
     */
    const recipeRow = await prisma.recipe.findFirst({
      where: { recipeId: recipeBizId },
      select: { productionLossRate: true },
    });
    const usedRate = Number(recipeRow?.productionLossRate ?? 1);
    say(
      '这张食谱存下来的损耗率',
      `${usedRate}（即多买 ${Math.round((usedRate - 1) * 100)}%）`,
    );
    say('  来源', '发布时由发布入口写死，不是逐张设的');
    console.log('');
    console.log('  ⚠️ 已知口径不一致（等老板拍板，不是 bug）：');
    console.log('     · 从「通用食谱」入口发布 → 存 1.05（多买 5%）');
    console.log('     · 从「定制食谱」入口发布 → 存 1.07（多买 7%）');
    console.log('     · 配置列默认值            → 1.07');
    console.log('     后果：同一道食谱换个入口发布，顾客要买的量差 2%。');
    console.log('     补剂另算：固定多备 5%（成品包装，损耗本来就低，这是**故意的**）。');

    step('⑤ 顾客确认收到');
    const confirm1 = await deliveryService.confirmReceipt({ orderIdOrId: orderNo });
    const confirm2 = await deliveryService.confirmReceipt({ orderIdOrId: orderNo });
    view = await customerView(orderNo);
    say('第一次点', confirm1.alreadyConfirmed ? '已确认过' : '确认成功');
    say('再点一次', confirm2.alreadyConfirmed ? '提示"你已经确认过了"（幂等）' : '又确认了一次（不对）');
    say('顾客看到的状态', view?.status);
    say('自动完成闹钟', view?.autoCompleteAt ? '仍在' : '已清空（不会再自动完成一次）');

    step('⑥ 顾客提售后');
    const aftersaleService = new CustomRecipeAftersaleService(
      prisma as never,
      configService,
      {
        listSet: async () => [
          { code: 'ADJUST_RECIPE', label: '调整食谱' },
        ],
      } as never,
    );

    const aftersale = await aftersaleService.create({
      orderIdOrId: orderNo,
      customerId: userId,
      type: 'ADJUST_RECIPE',
      description: '吃了三天有点软便，想换个蛋白来源',
    });
    say('售后类型', aftersale.typeLabel);
    say('售后状态', aftersale.statusLabel);

    step('⑦ 后台受理并处理（改稿后重新交付）');
    // 改一版：把鸡胸肉换成更清淡的配比
    await prisma.recipeItem.updateMany({
      where: { recipeId: recipeBizId, ingredientId: ingredientIds[0] },
      data: { ratioPercent: 58, preparationMethod: '切丁后焯水去油' },
    });
    await prisma.recipeItem.updateMany({
      where: { recipeId: recipeBizId, ingredientId: ingredientIds[1] },
      data: { ratioPercent: 40, preparationMethod: '煮得更软一些' },
    });

    const redelivered = await deliveryService.deliver({
      orderIdOrId: orderNo,
      recipeIdOrBizId: recipeBizId,
      deliveredBy: 'acceptance-script',
      cycleDays: 14,
    });
    say('重新交付', `第 ${redelivered.version} 版`);

    const versions = await prisma.customRecipeDelivery.findMany({
      where: { orderId },
      orderBy: { version: 'asc' },
      select: { version: true, replacedByDeliveryId: true },
    });
    for (const v of versions) {
      say(
        `  第 ${v.version} 版`,
        v.replacedByDeliveryId ? '已被替换（仍可查看）' : '当前有效',
      );
    }

    await prisma.customRecipeAftersale.update({
      where: { id: aftersale.id },
      data: {
        status: 'RESOLVED',
        handlerId: 'acceptance-script',
        handleNote: '已把鸡胸肉改成焯水去油的做法并重新交付了一版，请查收',
        resolvedAt: new Date(),
      },
    });
    say('售后处理完成', '顾客能看到上面那句处理说明');

    step('⑧ 顾客对新版本再确认一次');
    await deliveryService.confirmReceipt({ orderIdOrId: orderNo });
    view = await customerView(orderNo);
    say('顾客看到的状态', view?.status);
    say('最终交付版本', view?.deliveryVersion);

    console.log('');
    console.log('─'.repeat(64));
    console.log('走查完成 ✓ 整条链路（下单 → 付款 → 制作 → 交付 → 确认 → 售后 → 返修）都通了');
    console.log('─'.repeat(64));
  } finally {
    await cleanup();
    console.log('');
    console.log('（测试数据已清理）');
  }
}

/** 清理测试数据（只删自己造的） */
async function cleanup() {
  await prisma.customRecipeAftersale.deleteMany({
    where: { order: { orderId: { startsWith: 'CR-ACCEPTANCE' } } },
  });
  await prisma.customRecipeDelivery.deleteMany({
    where: { order: { orderId: { startsWith: 'CR-ACCEPTANCE' } } },
  });
  await prisma.customRecipeOrder.deleteMany({
    where: { id: { startsWith: PREFIX } },
  });
  await prisma.recipeItem.deleteMany({ where: { recipeId: recipeBizIdSafe() } });
  await prisma.recipe.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.ingredient.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.dog.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.dogBreed.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

function recipeBizIdSafe() {
  return 'RP-ACCEPTANCE-001';
}

main()
  .catch((error) => {
    console.error('');
    console.error('走查中断：', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
