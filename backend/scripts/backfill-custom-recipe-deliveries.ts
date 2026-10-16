/**
 * 历史交付回填（一次性脚本，2026-10-16 食谱定制重构 批次 1.6.3）
 *
 * ## 这个脚本解决什么
 *
 * 在交付单这张表之前，"已交付"只体现为订单上的一个食谱编号 ——
 * **没有交付记录、没有内容留档**。所以历史上那些已经交付的定制单，
 * 在新系统里点进"查看定制食谱"会**找不到交付记录**。
 *
 * 这个脚本把老订单补上第 1 版交付记录。
 *
 * ## 安全设计（这是会动生产数据的脚本，四条都不能少）
 *
 * ① **默认只预演**：不加 `--apply` 时一行都不写，只打印将要做什么；
 * ② **幂等**：已经有交付记录的订单直接跳过 —— 跑十遍和跑一遍结果一样；
 * ③ **只碰该碰的**：只处理"状态是已交付/已完成 **且** 挂着食谱"的订单；
 * ④ **快照时间用原交付时间**（不是脚本运行时间），否则顾客看到的
 *    时间轴会全部变成"今天交付的"。
 *
 * ## 回填出来的快照与"以后真实交付"的差异（必须知道）
 *
 * 回填时**拿不到当时的喂食参数与采购清单**（那些数据当年根本没存），
 * 所以那两块是空的。这是**如实反映历史**，不是缺漏 ——
 * 硬凑一个数字出来才是错的。结构版本号与真实交付一致，读取端不用写分支。
 *
 * ## 用法
 *
 *   # ① 预演（默认，只读）
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-custom-recipe-deliveries.ts
 *
 *   # ② 人工核对输出后落库
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-custom-recipe-deliveries.ts --apply
 *
 *   # ③ 核对结果
 *   npx ts-node -r tsconfig-paths/register scripts/verify-custom-recipe-deliveries.ts
 */
import { CustomRecipeStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotRecipeItem,
} from '../src/domain/custom-recipe/custom-recipe.delivery';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

/** 回填用的系统操作者标识 —— 便于把"脚本补的"和"人交的"区分开 */
const BACKFILL_ACTOR = 'system:backfill';

/**
 * 写进 Json 列前的归一化。
 *
 * Prisma 的 `InputJsonValue` 要求对象带索引签名，而我们的快照是**具名接口**，
 * 直接传会被类型系统拒掉。走一遍 JSON 往返既符合项目里其它脚本的一致写法
 * （见 `apply-*-patches.ts`），也顺手保证快照里没有 `undefined`
 * —— `JSON.stringify` 会把 `undefined` 丢掉，但 Prisma 遇到它会报错。
 */
function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** 查询时连带取出的食谱形状（两处共用，避免字段漏取） */
const RECIPE_INCLUDE = {
  items: {
    include: { ingredient: true },
    orderBy: { sortOrder: 'asc' },
  },
} as const;

interface RecipeWithItems {
  id: string;
  recipeId: string;
  version: number;
  name: string;
  coverImageUrl: string | null;
  nutritionStandard: string | null;
  energyDensityKcalPerKg: unknown;
  items: Array<{
    ratioPercent: number | null;
    exampleWeight: number | null;
    preparationMethod: string | null;
    ingredient: { name: string; type: string } | null;
  }>;
}

/**
 * 把数据库里的食谱条目映射成快照结构。
 *
 * ⚠️ 字段名以 `schema.prisma` 为准（踩过一次）：
 *   · 制备方法叫 `preparationMethod`，不叫 `preparation`
 *   · 用量叫 `exampleWeight`，不叫 `weightG`
 *   · **没有** `isSupplement` 字段 —— 要从原料类型推（`SUPPLEMENT`）
 */
function toSnapshotItems(recipe: RecipeWithItems): SnapshotRecipeItem[] {
  return recipe.items.map((item) => ({
    name: item.ingredient?.name ?? '未知食材',
    preparation: item.preparationMethod ?? null,
    ratioPercent:
      item.ratioPercent === null || item.ratioPercent === undefined
        ? null
        : Number(item.ratioPercent),
    weightG:
      item.exampleWeight === null || item.exampleWeight === undefined
        ? null
        : Number(item.exampleWeight),
    isSupplement: item.ingredient?.type === 'SUPPLEMENT',
  }));
}

/**
 * 组装回填用的内容快照。
 *
 * 结构与真实交付**完全一致**（同一个 `schemaVersion`），
 * 只是内容上缺了当年没存的那几块 —— 读取端不用为此写分支。
 */
function buildBackfillSnapshot(recipe: RecipeWithItems, deliveredAt: Date) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    recipe: {
      recipeId: recipe.recipeId,
      name: recipe.name,
      coverImageUrl: recipe.coverImageUrl ?? null,
      internalId: recipe.id,
      items: toSnapshotItems(recipe),
    },
    // 当年没存喂食参数 —— 如实留空，不硬凑
    feeding: {
      dailyIntakeG: null,
      mealsPerDay: null,
      perMealG: null,
      cycleDays: null,
    },
    nutrition: {
      standard: recipe.nutritionStandard ?? null,
      energyDensityKcalPerKg:
        recipe.energyDensityKcalPerKg === null ||
        recipe.energyDensityKcalPerKg === undefined
          ? null
          : Number(recipe.energyDensityKcalPerKg),
      macros: null,
      plainConclusion: null,
    },
    // 当年没存采购清单 —— 如实留空
    shopping: { lines: [], totalNetG: 0, totalPurchaseG: 0, lossRate: 1 },
    supplements: [],
    steps: [],
    storage: null,
    /** ④ 原交付时间 —— 否则时间轴会全变成"今天" */
    generatedAt: deliveredAt.toISOString(),
    /** 标记来源，便于日后区分"脚本补的"与"人交的" */
    backfilled: true,
    backfilledAt: new Date().toISOString(),
  };
}

interface BackfillCandidate {
  orderId: string;
  orderNo: string;
  status: CustomRecipeStatus;
  recipe: RecipeWithItems;
  deliveredAt: Date;
}

async function findCandidates(): Promise<{
  candidates: BackfillCandidate[];
  skippedAlreadyHasDelivery: number;
  skippedNoRecipe: number;
}> {
  const orders = await prisma.customRecipeOrder.findMany({
    where: {
      status: {
        in: [CustomRecipeStatus.DELIVERED, CustomRecipeStatus.COMPLETED],
      },
      recipeId: { not: null },
    },
    include: {
      recipe: { include: RECIPE_INCLUDE },
      deliveries: { select: { id: true } },
    },
    orderBy: { deliveredAt: 'asc' },
  });

  const candidates: BackfillCandidate[] = [];
  let skippedAlreadyHasDelivery = 0;
  let skippedNoRecipe = 0;

  for (const order of orders) {
    // ② 幂等：已经有交付记录就不碰
    if (order.deliveries.length > 0) {
      skippedAlreadyHasDelivery += 1;
      continue;
    }
    // ③ 只碰"确实挂着食谱"的
    if (!order.recipe) {
      skippedNoRecipe += 1;
      continue;
    }

    candidates.push({
      orderId: order.id,
      orderNo: order.orderId,
      status: order.status,
      recipe: order.recipe as unknown as RecipeWithItems,
      /**
       * ④ 用**原交付时间**而不是现在。
       * 取不到就退回订单更新时间 —— 总比用运行时间好。
       */
      deliveredAt: order.deliveredAt ?? order.updatedAt,
    });
  }

  return { candidates, skippedAlreadyHasDelivery, skippedNoRecipe };
}

async function main() {
  console.log('定制单历史交付回填');
  console.log(
    `模式：${shouldApply ? '★ 落库（--apply）' : '预演（只读，不会写库）'}`,
  );
  console.log('');

  const { candidates, skippedAlreadyHasDelivery, skippedNoRecipe } =
    await findCandidates();

  console.log('=== 将要处理 ===');
  if (candidates.length === 0) {
    console.log('  没有需要回填的订单。');
  }
  for (const candidate of candidates) {
    console.log(
      `  ${candidate.orderNo}  ${candidate.status}  ` +
        `食谱「${candidate.recipe.name}」(${candidate.recipe.recipeId})  ` +
        `食材 ${candidate.recipe.items.length} 条  ` +
        `交付于 ${candidate.deliveredAt.toISOString().slice(0, 10)}`,
    );
  }
  console.log('');
  console.log('=== 跳过 ===');
  console.log(`  已有交付记录（幂等跳过）：${skippedAlreadyHasDelivery}`);
  console.log(`  没挂食谱（无处可回填）：${skippedNoRecipe}`);
  console.log('');

  if (!shouldApply) {
    console.log('以上是**预演**。核对无误后加 --apply 落库。');
    console.log('');
    console.log('⚠️ 回填快照与真实交付的差异（如实反映历史，不是缺漏）：');
    console.log('   · 喂食参数（每天吃多少、几餐）当年没存 → 为 null');
    console.log('   · 采购清单当年没存 → 为空');
    console.log('   · 快照生成时间用原交付时间，不是脚本运行时间');
    return;
  }

  if (candidates.length === 0) {
    console.log('没有需要写的数据。');
    return;
  }

  let written = 0;
  for (const candidate of candidates) {
    await prisma.customRecipeDelivery.create({
      data: {
        orderId: candidate.orderId,
        version: 1,
        recipeId: candidate.recipe.id,
        recipeVersion: candidate.recipe.version ?? 1,
        contentSnapshot: toJsonInput(
          buildBackfillSnapshot(candidate.recipe, candidate.deliveredAt),
        ),
        // 回填时不声明交付物清单：当年的"交付了什么"没有记录，
        // 硬填一个反而是在编造历史。具体内容以快照为准。
        items: toJsonInput([]),
        deliveredBy: BACKFILL_ACTOR,
        deliveredAt: candidate.deliveredAt,
        /**
         * 历史交付不补发通知 —— 顾客早就拿到过食谱了，
         * 再推一条"您的食谱已交付"只会让人困惑。
         */
        notifyStatus: 'SKIPPED_BACKFILL',
        notifiedAt: null,
        confirmChannel: null,
      },
    });
    written += 1;
    console.log(`  ✓ ${candidate.orderNo}`);
  }

  console.log('');
  console.log(`完成：写入 ${written} 条交付记录。`);
  console.log('接着跑校验：scripts/verify-custom-recipe-deliveries.ts');
}

main()
  .catch((error) => {
    console.error('回填失败：', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
