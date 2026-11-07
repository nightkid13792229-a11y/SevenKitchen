/**
 * 历史交付快照 · 补「核心营养 8 项 + 宏量报告行 + 完整营养报告」（一次性脚本）
 *
 * 2026-11-08 扩展：老快照里没有 `nutrition.report`（报告整份冻结是这一版才加的），
 * 交付页因此不显示「营养报告」入口。这里按交付挂的那道食谱**当前**的报告回填一份，
 * 让老订单也能看到报告；新交付由交付端自己冻结，不依赖本脚本。
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
 * · 能补：8 项营养数字、宏量报告行、完整营养报告（库里都还在）。
 * · 补的是**食谱当前行**的营养数据 —— 快照里没有存过这些数字，
 *   所以做不到"交付那一刻的原值"。
 * · **对得上才补**：快照里若已冻结了 `reportRows`（交付当时的宏量表），
 *   就拿食谱当前行重算一份跟它比；对不上说明交付后改过配方 →
 *   跳过并记 `conflicts`，不把"改后的报告"当成交付那一刻的。
 * · **不覆盖已有值**：只填缺的键，跑十遍和跑一遍结果一样。
 * · ⚠️ **只补 v1 快照**：v2 起「有没有报告」是交付时的事实，
 *   `report: null` 表示当场就没有报告，不能再拿当前数据补（否则等于篡改）。
 *
 * ## 安全设计
 *
 * ① 默认**只预演**，不加 `--apply` 一行都不写；
 * ② **幂等**：目标键已存在（含显式 `null` 的老结构判断见上）就跳过；
 * ③ 只写 `content_snapshot.nutrition` 下缺的键，其余一律原样；
 * ④ 逐条打印"订单号 / 食谱 / 8 项数字 / 报告规模"，人工核对后再落库。
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
  readDeliveryNutritionReport,
  readDeliveryScenario,
  type SnapshotMacros,
} from '../src/domain/custom-recipe/delivery-nutrition';

/**
 * Prisma client **懒建**：测试只 import 核心函数，不该顺带建连接。
 * （`new PrismaClient()` 本身不连库，但把 .env 与实例绑在模块顶层会让单测难写。）
 */
let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) {
    loadEnv({ path: process.env.ENV_FILE || '.env' });
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

const shouldApply = process.argv.includes('--apply');

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export interface DeliveryNutritionBackfillCounters {
  scanned: number;
  /** 该补的都补上了（含"本来就没有报告"的 v2 快照） */
  alreadyComplete: number;
  /** 快照里没有 nutrition，或食谱没有营养数据 */
  noSourceData: number;
  /** 已经有 macros / reportRows，但**没有**冻结报告（数得出来才好核对） */
  missingReport: number;
  /** 交付后改过配方（当前数据与交付时冻结的宏量表对不上）→ 不补报告 */
  conflicts: number;
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

/**
 * 宏量表的比较口径：只比"是什么数值"，不比行顺序/多余键。
 * 任何一项对不上就说明这条食谱不是交付那一版了。
 */
function normalizeMacroRows(rows: unknown[]): string[] {
  return rows
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map((row) =>
      [
        String(row.key ?? ''),
        String(row.name ?? ''),
        String(row.dryMatterLabel ?? ''),
        String(row.energyPercentLabel ?? ''),
        String(row.weightPercentLabel ?? ''),
      ].join('|'),
    );
}

/** 预演日志里给一行"补进去的报告有多大"，人工核对才有东西可看 */
function describeReport(report: unknown): string {
  if (!isRecord(report)) return '空';
  const sections = isRecord(report.nutrientSections)
    ? Object.values(report.nutrientSections).filter((section) => isRecord(section))
    : [];
  const nutrientRows = sections.reduce((sum, section) => {
    const rows = (section as Record<string, unknown>).rows;
    return sum + (Array.isArray(rows) ? rows.length : 0);
  }, 0);
  const ingredientRows = Array.isArray(report.ingredientRows)
    ? report.ingredientRows.length
    : 0;
  return `${sections.length} 个分区 / ${nutrientRows} 行营养素 / ${ingredientRows} 行原料`;
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
    missingReport: 0,
    conflicts: 0,
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

      const has = (key: string) =>
        Object.prototype.hasOwnProperty.call(nutrition, key) &&
        nutrition[key] !== null &&
        nutrition[key] !== undefined;

      /**
       * 快照结构版本（2026-11-08 起为 2）。
       *
       * v2 的语义是「交付时的事实」：`report: null` 表示这单当场就没有报告，
       * **不能被回填成当前数据** —— 否则脚本会把一次性的历史修复
       * 变成永久性的"用活行覆盖冻结值"。
       */
      const schemaVersion =
        typeof (snapshot as Record<string, unknown>).schemaVersion === 'number'
          ? ((snapshot as Record<string, unknown>).schemaVersion as number)
          : 1;
      const isLegacySnapshot = schemaVersion < 2;

      const macros = readDeliveryMacros(target.recipe?.nutritionDetailedData);
      const reportRows = readDeliveryMacroRows(
        target.recipe?.nutritionDetailedData,
      );
      const report = readDeliveryNutritionReport(
        target.recipe?.nutritionDetailedData,
      );
      const scenario = readDeliveryScenario(
        target.recipe?.nutritionDetailedData,
      );

      /**
       * 「交付后改过配方」的判定：快照里已冻结了交付当时的宏量表，
       * 就拿食谱当前行重算一份跟它比。对不上 → 当前 ≠ 交付，
       * 不能把当前报告写进这份快照（同一页会出现两张自相矛盾的表）。
       */
      const frozenMacroSignature = Array.isArray(nutrition.reportRows)
        ? JSON.stringify(normalizeMacroRows(nutrition.reportRows))
        : '';
      const currentReportRows = readDeliveryMacroRows(
        target.recipe?.nutritionDetailedData,
      );
      const currentMacroSignature = currentReportRows?.length
        ? JSON.stringify(normalizeMacroRows(currentReportRows))
        : '';
      const recipeEditedAfterDelivery =
        isLegacySnapshot &&
        Boolean(frozenMacroSignature) &&
        Boolean(currentMacroSignature) &&
        frozenMacroSignature !== currentMacroSignature;

      if (recipeEditedAfterDelivery) {
        counters.conflicts += 1;
        logger.info(
          `- ⚠️ 跳过报告（交付后改过配方，宏量表对不上）: ${target.label} · ${
            target.recipe?.name ?? '食谱缺失'
          }`,
        );
      }

      /**
       * 只补**缺的且有源**的键：老快照缺 `report`、但食谱本来就没报告时
       * 一条都不写 —— 否则每跑一遍都会重写同一份快照，幂等性就没了。
       */
      const patches: Record<string, unknown> = {};
      if (!has('macros') && macros) patches.macros = macros;
      if (!has('reportRows') && reportRows) patches.reportRows = reportRows;
      if (
        isLegacySnapshot &&
        !recipeEditedAfterDelivery &&
        !has('report') &&
        report
      ) {
        patches.report = report;
      }
      if (
        isLegacySnapshot &&
        !recipeEditedAfterDelivery &&
        !has('scenario') &&
        scenario
      ) {
        patches.scenario = scenario;
      }

      if (Object.keys(patches).length === 0) {
        if (has('macros') || has('reportRows') || has('report')) {
          counters.alreadyComplete += 1;
          if (!has('report')) counters.missingReport += 1;
        } else {
          counters.noSourceData += 1;
          logger.info(
            `- 跳过（食谱没有营养数据）: ${target.label} · ${
              target.recipe?.name ?? '食谱缺失'
            }`,
          );
        }
        continue;
      }

      counters.eligible += 1;
      const nextNutrition = { ...nutrition, ...patches };
      const nextSnapshot = { ...(snapshot as Record<string, unknown>), nutrition: nextNutrition };

      logger.info(
        `- ${input.apply ? '补' : '将补'}: ${target.label} · ${
          target.recipe?.name ?? '食谱缺失'
        }${patches.macros ? `\n    ${formatMacros(patches.macros as SnapshotMacros)}` : ''}${
          patches.report
            ? `\n    + 完整营养报告（${describeReport(patches.report)}）`
            : ''
        }`,
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
    `Summary: scanned=${counters.scanned}, alreadyComplete=${counters.alreadyComplete}, noSourceData=${counters.noSourceData}, missingReport=${counters.missingReport}, conflicts=${counters.conflicts}, eligible=${counters.eligible}, applied=${counters.applied}, errors=${counters.errors}`,
  );
  return counters;
}

/**
 * 多份交付：快照在明细表 `custom_recipe_delivery_item`（每份食谱一条）。
 */
async function collectItemTargets(): Promise<SnapshotTarget[]> {
  const rows = await getPrisma().customRecipeDeliveryItem.findMany({
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
      getPrisma().customRecipeDeliveryItem.update({
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
  const rows = await getPrisma().customRecipeDelivery.findMany({
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
      getPrisma().customRecipeDelivery.update({
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
      await prismaClient?.$disconnect();
    });
}
