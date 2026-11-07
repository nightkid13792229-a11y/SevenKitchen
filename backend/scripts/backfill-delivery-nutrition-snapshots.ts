/**
 * 历史交付快照 · 补「核心营养 8 项 + 宏量报告行」（一次性脚本，2026-11-07）
 *
 * ## 为什么需要它
 *
 * 交付写快照时按 **camelCase**（`proteinPercent`）去 `Recipe.nutritionDetailedData`
 * 里取，而库里存的是 **snake_case**（`protein_dm_pct`）—— 8 项全落空，
 * 每份快照的 `nutrition.macros` 都被写成 `null`。
 * 前端按"没算出来就不显示"的规则把整块数字藏了，交付页只剩标题。
 *
 * 光修交付端只能救**以后**的交付；已经发到顾客手机上的 19 份仍然是空的。
 * 这个脚本按**交付那一刻挂的那道食谱**的营养数据，把缺的字段补回快照。
 *
 * ## 能补什么、补不了什么（必须知道）
 *
 * · 能补：8 项营养数字、宏量报告行（库里都还在）。
 * · 补的是**食谱当前行**的营养数据 —— 快照里没有存过这些数字，
 *   所以做不到"交付那一刻的原值"。定制食谱是交付后基本不再改的私密行，
 *   这次涉及的 19 份当前都可对上；将来若发现改过，以这条为已知差异。
 * · **不覆盖已有值**：只填 `null`/缺失，跑十遍和跑一遍结果一样。
 *
 * ## 安全设计
 *
 * ① 默认**只预演**，不加 `--apply` 一行都不写；
 * ② **幂等**：已有 `macros` 与 `reportRows` 的记录直接跳过；
 * ③ 只写 `content_snapshot.nutrition` 下缺的两个键，其余一律原样；
 * ④ 逐条打印"订单号 / 食谱 / 8 项数字"，人工核对后再落库。
 *
 * ## 用法
 *
 *   # ① 预演（默认，只读）
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-delivery-nutrition-snapshots.ts
 *
 *   # ② 人工核对输出后落库
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-delivery-nutrition-snapshots.ts --apply
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  readDeliveryMacroRows,
  readDeliveryMacros,
  type SnapshotMacros,
} from '../src/domain/custom-recipe/delivery-nutrition';

/** 先读 `.env` 再建 client（Prisma 连接时才取 DATABASE_URL，顺序仍按稳妥写法放前面） */
loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export interface DeliveryNutritionBackfillCounters {
  scanned: number;
  alreadyComplete: number;
  noSourceData: number;
  eligible: number;
  applied: number;
  errors: number;
}

/** 写 Json 列前的归一化（`undefined` 会让 Prisma 报错，先走一遍 JSON 往返） */
function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function formatMacros(macros: SnapshotMacros): string {
  const pairs: Array<[string, number | null]> = [
    ['蛋白质', macros.proteinPercent],
    ['脂肪', macros.fatPercent],
    ['灰分', macros.ashPercent],
    ['含水量', macros.moisturePercent],
    ['纤维', macros.crudeFiberPercent],
    ['碳水', macros.carbohydratePercent],
    ['能量kcal/kg', macros.energyDensityKcalPerKg],
    ['钙磷比', macros.calciumPhosphorusRatio],
  ];
  return pairs
    .map(([label, value]) => `${label}=${value === null ? '—' : value}`)
    .join(' ');
}

interface SnapshotTarget {
  /** 便于日志：订单号 + 第几版 */
  label: string;
  contentSnapshot: unknown;
  /** 这道交付挂的食谱（营养数据来源） */
  recipe: {
    name: string;
    nutritionDetailedData: unknown;
  } | null;
  save: (nextSnapshot: unknown) => Promise<unknown>;
}

export async function runDeliveryNutritionBackfill(input: {
  targets: SnapshotTarget[];
  apply: boolean;
  logger?: Logger;
}): Promise<DeliveryNutritionBackfillCounters> {
  const logger = input.logger ?? console;
  const counters: DeliveryNutritionBackfillCounters = {
    scanned: 0,
    alreadyComplete: 0,
    noSourceData: 0,
    eligible: 0,
    applied: 0,
    errors: 0,
  };

  for (const target of input.targets) {
    counters.scanned += 1;

    try {
      const snapshot = target.contentSnapshot;
      const nutrition = isRecord(snapshot) ? snapshot.nutrition : null;
      if (!isRecord(nutrition)) {
        counters.noSourceData += 1;
        logger.info(`- 跳过（快照里没有 nutrition）: ${target.label}`);
        continue;
      }

      const hasMacros = Object.prototype.hasOwnProperty.call(
        nutrition,
        'macros',
      )
        ? nutrition.macros !== null && nutrition.macros !== undefined
        : false;
      const hasReportRows = Object.prototype.hasOwnProperty.call(
        nutrition,
        'reportRows',
      )
        ? nutrition.reportRows !== null && nutrition.reportRows !== undefined
        : false;
      if (hasMacros && hasReportRows) {
        counters.alreadyComplete += 1;
        continue;
      }

      const macros = readDeliveryMacros(target.recipe?.nutritionDetailedData);
      const reportRows = readDeliveryMacroRows(
        target.recipe?.nutritionDetailedData,
      );
      if (!macros && !reportRows) {
        counters.noSourceData += 1;
        logger.info(
          `- 跳过（食谱没有营养数据）: ${target.label} · ${
            target.recipe?.name ?? '食谱缺失'
          }`,
        );
        continue;
      }

      counters.eligible += 1;
      const nextNutrition = {
        ...nutrition,
        ...(hasMacros ? {} : { macros }),
        ...(hasReportRows ? {} : { reportRows }),
      };
      const nextSnapshot = { ...(snapshot as Record<string, unknown>), nutrition: nextNutrition };

      logger.info(
        `- ${input.apply ? '补' : '将补'}: ${target.label} · ${
          target.recipe?.name ?? '食谱缺失'
        }${macros ? `\n    ${formatMacros(macros)}` : ''}`,
      );

      if (input.apply) {
        await target.save(nextSnapshot);
        counters.applied += 1;
      }
    } catch (error) {
      counters.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`✗ ${target.label} 失败: ${message}`);
    }
  }

  logger.info(
    `Summary: scanned=${counters.scanned}, alreadyComplete=${counters.alreadyComplete}, noSourceData=${counters.noSourceData}, eligible=${counters.eligible}, applied=${counters.applied}, errors=${counters.errors}`,
  );
  return counters;
}

/**
 * 多份交付：快照在明细表 `custom_recipe_delivery_item`（每份食谱一条）。
 */
async function collectItemTargets(): Promise<SnapshotTarget[]> {
  const rows = await prisma.customRecipeDeliveryItem.findMany({
    select: {
      id: true,
      contentSnapshot: true,
      recipe: {
        select: { name: true, nutritionDetailedData: true },
      },
      batch: {
        select: { orderId: true, version: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map((row) => ({
    label: `订单 ${row.batch.orderId} 第 ${row.batch.version} 版 · 明细 ${row.id}`,
    contentSnapshot: row.contentSnapshot,
    recipe: row.recipe,
    save: (nextSnapshot) =>
      prisma.customRecipeDeliveryItem.update({
        where: { id: row.id },
        data: { contentSnapshot: toJsonInput(nextSnapshot) },
      }),
  }));
}

/**
 * 老的单份交付表 `custom_recipe_delivery`：现在生产上已经没有行，
 * 但历史/别库可能有，一并按同一口径补。
 */
async function collectLegacyTargets(): Promise<SnapshotTarget[]> {
  const rows = await prisma.customRecipeDelivery.findMany({
    select: {
      id: true,
      orderId: true,
      version: true,
      contentSnapshot: true,
      recipe: {
        select: { name: true, nutritionDetailedData: true },
      },
    },
    orderBy: { deliveredAt: 'asc' },
  });

  return rows.map((row) => ({
    label: `订单 ${row.orderId} 第 ${row.version} 版（单份交付 ${row.id}）`,
    contentSnapshot: row.contentSnapshot,
    recipe: row.recipe,
    save: (nextSnapshot) =>
      prisma.customRecipeDelivery.update({
        where: { id: row.id },
        data: { contentSnapshot: toJsonInput(nextSnapshot) },
      }),
  }));
}

async function main() {
  const targets = [
    ...(await collectItemTargets()),
    ...(await collectLegacyTargets()),
  ];

  console.log(
    `交付快照核心营养回填 · ${shouldApply ? '落库模式 (--apply)' : '预演模式（只读）'} · 共 ${targets.length} 条`,
  );

  const counters = await runDeliveryNutritionBackfill({
    targets,
    apply: shouldApply,
    logger: console,
  });

  if (!shouldApply && counters.eligible > 0) {
    console.log('\n预演结束，未写库。核对上面数字后加 --apply 落库：');
    console.log(
      '  npx ts-node -r tsconfig-paths/register scripts/backfill-delivery-nutrition-snapshots.ts --apply',
    );
  }

  if (counters.errors > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
