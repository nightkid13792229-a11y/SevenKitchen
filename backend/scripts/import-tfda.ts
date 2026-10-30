/**
 * TFDA「食品營養成分資料集」导入脚本（默认 dry-run）。
 *
 * 官方 CSV 是 63MB 长表（每食品约 104 行营养素），解析与归一化分别在
 * `src/domain/nutrition-governance/tfda-csv.ts` 与 `tfda-normalize.ts`。
 * 本脚本只负责：读文件 → 按食品聚合 → 单位校验 → upsert `nutrition_source_record`。
 *
 * 口径：
 * - 默认不写库；只有显式 `--apply` 才 upsert；
 * - 缺失的 `每100克含量`（空 / Tr / - / 非数字）在解析层就丢弃，不补 0；
 * - 映射表的单位与行内单位不一致时，**该行不参与归一化**（仍保留在 rawData，
 *   便于以后重算），并在报告里计数；
 * - 映射不上的营养素名只忽略、不静默：报告按名称计数（top 20）。
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/import-tfda.ts \
 *     --csv <path> [--parse-only] [--limit N] [--apply] [--report <path>]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  NutritionGovernanceRecordStatus,
  NutritionGovernanceSourceType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import {
  parseTfdaCsvWithStats,
  type TfdaCsvFood,
  type TfdaCsvParseStats,
} from '../src/domain/nutrition-governance/tfda-csv';
import {
  buildTfdaNutritionProfile,
  TFDA_NUTRIENT_MAP,
  TFDA_SOURCE_PROVIDER,
  TFDA_SOURCE_TITLE,
  TFDA_SOURCE_VERSION,
  type TfdaNutrientMapping,
  type TfdaNutrientRow,
} from '../src/domain/nutrition-governance/tfda-normalize';
import { buildNutritionSourceKey } from '../src/domain/nutrition-governance/nutrition-governance.utils';

loadEnv();
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

const SOURCE_TYPE = NutritionGovernanceSourceType.TFDA;

/** 官方授权：政府资料开放授权条款，必须署名。 */
const LICENSE_NOTE =
  'OGDL 1.0 (Taiwan Government Open Data License); attribution required';

const PROGRESS_INTERVAL = 200;
const REPORT_TOP_LIMIT = 20;
const SAMPLE_LIMIT = 5;

const USAGE = `
TFDA「食品營養成分資料集」导入（默认 dry-run，不写库）

Usage:
  npx ts-node -r tsconfig-paths/register scripts/import-tfda.ts \\
    --csv <path> [--parse-only] [--limit N] [--apply] [--report <path>]

Options:
  --csv <path>    官方 20_2.csv 的路径（必填）
  --parse-only    只解析并打印统计，完全跳过数据库
  --limit N       只处理前 N 个食品（按文件中首次出现顺序）
  --apply         真正写库（upsert nutrition_source_record）；不传则 dry-run
  --report <path> 把 JSON 报告写到指定路径（目录不存在会自动创建）
  --help, -h      显示本帮助

报告字段：
  scanned         已扫描食品数
  created/updated dry-run 为预计值，--apply 时为实际写入结果
  skipped         无法导入的食品及原因
  unmapped        映射不上的营养素名（按出现行数降序，top 20）
  unitMismatches  行内单位与映射表 sourceUnit 不一致的营养素（top 20）
  samples         最多 5 个食品的中文名 / 英文名 / 蛋白质 / 钙 / 精氨酸
  totalRows       已扫描食品参与聚合的营养素行数
  droppedRows     解析时丢弃的行数（空白 / Tr / - / 非数字 / 无效整合編號）

--parse-only 输出：
  { foods, totalRows, unmappedNutrientNames, unitMismatches }
`;

interface CliArgs {
  csvPath: string | null;
  apply: boolean;
  limit: number | null;
  reportPath: string | null;
  parseOnly: boolean;
  help: boolean;
}

interface UnitMismatchCount {
  name: string;
  expected: string;
  actual: string;
  count: number;
}

interface ImportSample {
  foodCode: string;
  name: string;
  nameEn: string | null;
  category: string | null;
  refuseRate: number | null;
  dataType: string | null;
  energyKcal: number | null;
  crudeProtein: number | null;
  calcium: number | null;
  arginine: number | null;
}

interface ParseOnlySummary {
  foods: number;
  totalRows: number;
  unmappedNutrientNames: Array<{ name: string; count: number }>;
  unitMismatches: UnitMismatchCount[];
}

interface ImportReport {
  scanned: number;
  created: number;
  updated: number;
  skipped: Array<{ foodCode: string; reason: string }>;
  unmapped: Array<{ name: string; count: number }>;
  unitMismatches: UnitMismatchCount[];
  samples: ImportSample[];
  totalRows: number;
  droppedRows: TfdaCsvParseStats;
}

const NUTRIENT_MAP_BY_NAME: ReadonlyMap<string, TfdaNutrientMapping> = new Map(
  TFDA_NUTRIENT_MAP.map((mapping) => [mapping.match, mapping]),
);

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    csvPath: null,
    apply: false,
    limit: null,
    reportPath: null,
    parseOnly: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];

    if (flag === '--help' || flag === '-h') {
      args.help = true;
      continue;
    }
    if (flag === '--apply') {
      args.apply = true;
      continue;
    }
    if (flag === '--parse-only') {
      args.parseOnly = true;
      continue;
    }
    if (flag === '--csv') {
      if (!next || next.startsWith('--')) {
        throw new Error('--csv 需要一个文件路径');
      }
      args.csvPath = next;
      index += 1;
      continue;
    }
    if (flag === '--report') {
      if (!next || next.startsWith('--')) {
        throw new Error('--report 需要一个文件路径');
      }
      args.reportPath = next;
      index += 1;
      continue;
    }
    if (flag === '--limit') {
      const parsed = next === undefined ? Number.NaN : Number(next);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--limit 需要一个正整数');
      }
      args.limit = parsed;
      index += 1;
      continue;
    }

    throw new Error(`未知参数：${flag}`);
  }

  return args;
}

/**
 * `µg` / `μg` / `ug` 统一成 `μg`；`I.U.` / `IU` 统一成 `IU`。
 *
 * 官方文件的维生素 A/D 总量单位实际写作 `I.U.`，而映射表声明 `IU`；
 * 不归一化会把 2,488 个合法值误判成单位错位（2026-10 文件实测）。
 */
function normalizeUnit(unit: string): string {
  const compact = unit.trim().replace(/\s+/gu, '');
  if (/^(µg|μg|ug)$/iu.test(compact)) {
    return 'μg';
  }
  if (/^i\.?u\.?$/iu.test(compact)) {
    return 'IU';
  }
  return compact;
}

function unitsMatch(expected: string, actual: string): boolean {
  return normalizeUnit(expected) === normalizeUnit(actual);
}

/**
 * 拆出可以参与归一化的行；映射不上 / 单位不一致的行计入统计后丢弃。
 *
 * 注意：单位不一致只影响 `normalizedNutrition`，`rawData` 仍保存全部行，
 * 以后修正映射或单位后可直接重算，不必重新下载 63MB。
 */
function splitRowsForNormalization(
  rows: readonly TfdaNutrientRow[],
  unmappedCounts: Map<string, number>,
  unitMismatchCounts: Map<string, UnitMismatchCount>,
): TfdaNutrientRow[] {
  const normalizable: TfdaNutrientRow[] = [];

  for (const row of rows) {
    const name = row.name.trim();
    const mapping = NUTRIENT_MAP_BY_NAME.get(name);

    if (!mapping) {
      unmappedCounts.set(name, (unmappedCounts.get(name) ?? 0) + 1);
      continue;
    }

    if (!unitsMatch(mapping.sourceUnit, row.unit)) {
      const key = `${name}\u0000${mapping.sourceUnit}\u0000${row.unit}`;
      const existing = unitMismatchCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        unitMismatchCounts.set(key, {
          name,
          expected: mapping.sourceUnit,
          actual: row.unit,
          count: 1,
        });
      }
      continue;
    }

    normalizable.push(row);
  }

  return normalizable;
}

function topUnmapped(
  counts: ReadonlyMap<string, number>,
): Array<{ name: string; count: number }> {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || compareText(left[0], right[0]))
    .slice(0, REPORT_TOP_LIMIT)
    .map(([name, count]) => ({ name, count }));
}

function topUnitMismatches(
  counts: ReadonlyMap<string, UnitMismatchCount>,
): UnitMismatchCount[] {
  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        compareText(left.name, right.name) ||
        compareText(left.expected, right.expected) ||
        compareText(left.actual, right.actual),
    )
    .slice(0, REPORT_TOP_LIMIT);
}

/** 不依赖 locale 的稳定排序（中英文都按码点比较）。 */
function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/**
 * 食品级 `dataType`：官方每个食品只出现一种 `資料類別`；若混用则记 MIXED。
 *
 * 数据集版本放在 `sourceDetail.datasetVersion`，这里保留行级语义。
 */
function resolveFoodDataType(rows: readonly TfdaNutrientRow[]): string | null {
  const dataTypes = [
    ...new Set(rows.map((row) => row.dataType.trim()).filter(Boolean)),
  ];

  if (dataTypes.length === 0) {
    return null;
  }
  if (dataTypes.length === 1) {
    return dataTypes[0];
  }
  return 'MIXED';
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildRawData(food: TfdaCsvFood): Prisma.InputJsonValue {
  return toJson({
    food: {
      foodCode: food.foodCode,
      name: food.name,
      nameEn: food.nameEn,
      category: food.category,
      refuseRate: food.refuseRate,
      ...(food.description ? { description: food.description } : {}),
    },
    // 全部数值行原样保存，normalizedNutrition 只是其中可映射、单位一致的部分。
    nutrients: food.rows,
  });
}

function buildSourceDetail(food: TfdaCsvFood): Prisma.InputJsonValue {
  return toJson({
    licenseNote: LICENSE_NOTE,
    datasetVersion: TFDA_SOURCE_VERSION,
    foodCategory: food.category,
    refuseRate: food.refuseRate,
    sourceProvider: TFDA_SOURCE_PROVIDER,
  });
}

function buildSample(
  food: TfdaCsvFood,
  profile: NutritionProfileV2,
): ImportSample {
  return {
    foodCode: food.foodCode,
    name: food.name,
    nameEn: food.nameEn,
    category: food.category,
    refuseRate: food.refuseRate,
    dataType: resolveFoodDataType(food.rows),
    energyKcal: profile.macros.energyKcal,
    crudeProtein: profile.macros.crudeProtein,
    calcium: profile.minerals.calcium,
    arginine: profile.aminoAcids.arginine,
  };
}

async function writeJsonReport(path: string, value: unknown): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`报告已写入：${absolutePath}`);
}

function printDroppedRows(stats: TfdaCsvParseStats): void {
  console.log(
    `解析丢弃行：空白 ${stats.blankRows}，Tr ${stats.traceRows}，` +
      `- ${stats.dashRows}，非数字 ${stats.nonNumericRows}（如 P/M/S 比值），` +
      `空分析項 ${stats.emptyNutrientNameRows}，无效整合編號 ${stats.invalidFoodRows}`,
  );
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    console.log(USAGE);
    return;
  }

  if (!args.csvPath) {
    console.error('缺少必需参数：--csv <path>');
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const csvPath = resolve(args.csvPath);
  const text = await readFile(csvPath, 'utf8');
  const parsed = parseTfdaCsvWithStats(text);
  const foods =
    args.limit === null ? parsed.foods : parsed.foods.slice(0, args.limit);
  const unmappedCounts = new Map<string, number>();
  const unitMismatchCounts = new Map<string, UnitMismatchCount>();

  if (args.parseOnly) {
    let totalRows = 0;
    for (const food of foods) {
      totalRows += food.rows.length;
      splitRowsForNormalization(food.rows, unmappedCounts, unitMismatchCounts);
    }

    const summary: ParseOnlySummary = {
      foods: foods.length,
      totalRows,
      unmappedNutrientNames: topUnmapped(unmappedCounts),
      unitMismatches: topUnitMismatches(unitMismatchCounts),
    };

    console.log(JSON.stringify(summary, null, 2));
    printDroppedRows(parsed.stats);

    if (args.reportPath) {
      await writeJsonReport(args.reportPath, summary);
    }
    return;
  }

  const mode = args.apply ? 'apply' : 'dry-run';
  const report: ImportReport = {
    scanned: 0,
    created: 0,
    updated: 0,
    skipped: [],
    unmapped: [],
    unitMismatches: [],
    samples: [],
    totalRows: 0,
    droppedRows: parsed.stats,
  };

  console.log(
    `TFDA 导入开始（${mode}）：${foods.length} 个食品（文件共 ${parsed.foods.length} 个）。`,
  );

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.nutritionSourceRecord.findMany({
      where: { sourceType: SOURCE_TYPE },
      select: { sourceKey: true },
    });
    const existingKeys = new Set(existing.map((record) => record.sourceKey));

    for (const food of foods) {
      report.scanned += 1;
      report.totalRows += food.rows.length;

      if (report.scanned % PROGRESS_INTERVAL === 0) {
        console.log(
          `  进度 ${report.scanned}/${foods.length}（created ${report.created}，updated ${report.updated}，skipped ${report.skipped.length}）`,
        );
      }

      const normalizableRows = splitRowsForNormalization(
        food.rows,
        unmappedCounts,
        unitMismatchCounts,
      );

      if (!food.name) {
        report.skipped.push({
          foodCode: food.foodCode,
          reason: '缺少樣品名稱',
        });
        continue;
      }
      if (food.rows.length === 0) {
        report.skipped.push({
          foodCode: food.foodCode,
          reason: '没有数值型每100克含量',
        });
        continue;
      }
      if (normalizableRows.length === 0) {
        report.skipped.push({
          foodCode: food.foodCode,
          reason: '单位校验/映射后没有可用营养素行',
        });
        continue;
      }

      const profile = buildTfdaNutritionProfile({
        ...food,
        rows: normalizableRows,
      });
      const sourceKey = buildNutritionSourceKey(SOURCE_TYPE, food.foodCode);
      const data = {
        sourceTitle: TFDA_SOURCE_TITLE,
        sourceDetail: buildSourceDetail(food),
        foodName: food.name,
        foodNameEn: food.nameEn,
        dataType: resolveFoodDataType(food.rows),
        category: food.category,
        rawData: buildRawData(food),
        normalizedNutrition: toJson(profile),
        status: NutritionGovernanceRecordStatus.ACTIVE,
      } satisfies Prisma.NutritionSourceRecordUpdateInput;

      if (args.apply) {
        try {
          await prisma.nutritionSourceRecord.upsert({
            where: {
              sourceType_sourceKey: {
                sourceType: SOURCE_TYPE,
                sourceKey,
              },
            },
            create: {
              sourceType: SOURCE_TYPE,
              sourceKey,
              ...data,
            },
            update: data,
          });
        } catch (error) {
          report.skipped.push({
            foodCode: food.foodCode,
            reason: `写库失败：${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }
      }

      if (existingKeys.has(sourceKey)) {
        report.updated += 1;
      } else {
        report.created += 1;
      }

      if (report.samples.length < SAMPLE_LIMIT) {
        report.samples.push(buildSample(food, profile));
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  report.unmapped = topUnmapped(unmappedCounts);
  report.unitMismatches = topUnitMismatches(unitMismatchCounts);

  console.log(`\nTFDA 导入（${mode}）`);
  console.log(`  CSV：${csvPath}`);
  console.log(`  扫描食品：${report.scanned}`);
  console.log(
    `  新建：${report.created}${args.apply ? '' : '（dry-run 预计，未写库）'}`,
  );
  console.log(
    `  更新：${report.updated}${args.apply ? '' : '（dry-run 预计，未写库）'}`,
  );
  console.log(`  跳过：${report.skipped.length}`);
  for (const skipped of report.skipped.slice(0, REPORT_TOP_LIMIT)) {
    console.log(`    - ${skipped.foodCode}: ${skipped.reason}`);
  }
  printDroppedRows(parsed.stats);
  console.log(
    `  未映射营养素（top ${report.unmapped.length}/${unmappedCounts.size}）：`,
  );
  for (const item of report.unmapped) {
    console.log(`    - ${item.name}: ${item.count}`);
  }
  console.log(
    `  单位不一致（top ${report.unitMismatches.length}/${unitMismatchCounts.size}）：`,
  );
  for (const item of report.unitMismatches) {
    console.log(
      `    - ${item.name}: expected=${item.expected} actual=${item.actual} count=${item.count}`,
    );
  }
  for (const sample of report.samples) {
    console.log(
      `  样本 ${sample.foodCode} ${sample.name} / ${sample.nameEn ?? 'null'}: ` +
        `protein=${sample.crudeProtein}, calcium=${sample.calcium}, arginine=${sample.arginine}`,
    );
  }

  if (args.reportPath) {
    await writeJsonReport(args.reportPath, report);
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
});
