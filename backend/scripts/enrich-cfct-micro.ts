/**
 * CFCT（中国食物成分表 第 6 版）微量成分回填脚本。
 *
 * 背景：CFCT 主表导入时还没有解析胆碱 / 生物素 / 泛酸表；这三列已离线抽成
 * `{"foods":[{"code","name","micro":{"choline","biotin","pantothenicAcid"}}]}`。
 * 本脚本按 `CFCT:<code>` 找到 `nutrition_source_record`，把落在 3 字段目录内的
 * 微量成分合并进 `normalizedNutrition.vitamins`。
 *
 * 口径：
 * - 数据抽取阶段已是每 100g：胆碱 mg、生物素 μg、泛酸 mg，与营养目录单位
 *   一致，本脚本只写入、不再换算；
 * - 默认 dry-run，只统计、不写库；显式 `--apply` 才 update；
 * - 只更新 `normalizedNutrition` 一列，不碰 rawData / status / foodName 等；
 * - `--limit` 在查库 / 写库之前截断；
 * - 找不到的 code 记 `not_found`，不影响其它记录。
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/enrich-cfct-micro.ts \
 *     --json <path> [--limit N] [--apply] [--report <path>]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  NutritionGovernanceSourceType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import { mergeCfctMicro } from '../src/domain/nutrition-governance/cfct-micro-enrich';

loadEnv({ quiet: true });
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

const SOURCE_TYPE = NutritionGovernanceSourceType.CFCT;
const PROGRESS_INTERVAL = 100;
const SAMPLE_LIMIT = 5;
const REPORT_TOP_LIMIT = 20;

const USAGE = `
CFCT 微量成分回填（默认 dry-run，不写库）

Usage:
  npx ts-node -r tsconfig-paths/register scripts/enrich-cfct-micro.ts \\
    --json <path> [--limit N] [--apply] [--report <path>]

Options:
  --json <path>   微量成分 JSON（形如 {"foods":[{"code","name","micro"}]}，必填）
  --limit N       只处理前 N 个食品（按文件顺序，在查库 / 写库之前截断）
  --apply         真正写库（只更新 normalizedNutrition 一列）；不传则 dry-run
  --report <path> 把 JSON 报告写到指定路径（目录不存在会自动创建）
  --help, -h      显示本帮助

写入范围：
  - 只写目录收录的 3 个维生素字段：
    choline（胆碱，mg/100g）→ vitamins.choline；
    biotin（生物素，μg/100g）→ vitamins.vitaminB7；
    pantothenicAcid（泛酸，mg/100g）→ vitamins.vitaminB5；
  - 原始值保留在 meta.sourceForms，profile 里存同样的目录单位数值；
  - 表里没有的项不补、不造 0；目录外的 key 只跳过、不写 profile。

报告字段：
  scanned       已扫描食品数
  matched       在库里找到 CFCT 记录的食品数
  wouldUpdate   dry-run 为预计更新数；--apply 时为实际更新数
  filledFields  合并写出的维生素字段值总数（跨记录累加）
  skipped       跳过项及原因（not_found / missing_normalized_nutrition /
                invalid_normalized_nutrition / no_usable_micro_values）
  samples       最多 5 条样本（code / name / 写入的字段）
`;

interface CliArgs {
  jsonPath: string | null;
  limit: number | null;
  apply: boolean;
  reportPath: string | null;
  help: boolean;
}

interface CfctMicroFood {
  code: string;
  name: string;
  micro: Record<string, number | null>;
}

interface CfctMicroSkipped {
  code: string;
  reason: string;
}

interface CfctMicroSample {
  code: string;
  name: string;
  fields: string[];
}

interface CfctMicroReport {
  scanned: number;
  matched: number;
  wouldUpdate: number;
  filledFields: number;
  skipped: CfctMicroSkipped[];
  samples: CfctMicroSample[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    jsonPath: null,
    limit: null,
    apply: false,
    reportPath: null,
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
    if (flag === '--json') {
      if (!next || next.startsWith('--')) {
        throw new Error('--json 需要一个文件路径');
      }
      args.jsonPath = next;
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
    if (flag === '--report') {
      if (!next || next.startsWith('--')) {
        throw new Error('--report 需要一个文件路径');
      }
      args.reportPath = next;
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${flag}`);
  }

  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNutritionProfileV2(value: unknown): value is NutritionProfileV2 {
  return (
    isRecord(value) &&
    isRecord(value.meta) &&
    isRecord(value.macros) &&
    isRecord(value.minerals) &&
    isRecord(value.vitamins)
  );
}

function parseCfctMicroDataset(parsed: unknown): CfctMicroFood[] {
  if (!isRecord(parsed) || !Array.isArray(parsed.foods)) {
    throw new Error('JSON 根节点必须是 {"foods":[...]}');
  }

  return parsed.foods.map((item, index) => {
    if (
      !isRecord(item) ||
      typeof item.code !== 'string' ||
      item.code.trim() === '' ||
      !isRecord(item.micro)
    ) {
      throw new Error(`foods[${index}] 缺少 code / micro`);
    }

    return {
      code: item.code.trim(),
      name: typeof item.name === 'string' ? item.name : item.code.trim(),
      micro: item.micro as Record<string, number | null>,
    };
  });
}

function buildSourceKey(code: string): string {
  return `CFCT:${code}`;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * 键排序后的 JSON 序列化，用于判断 profile 内容是否真的变了。
 * Postgres jsonb 会重排对象键；直接 JSON.stringify 会误报 changed。
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 'undefined' : serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

async function writeJsonReport(path: string, value: unknown): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`报告已写入：${absolutePath}`);
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

  if (!args.jsonPath) {
    console.error('缺少必需参数：--json <path>');
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const jsonPath = resolve(args.jsonPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(jsonPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `读取或解析微量成分 JSON 失败：${jsonPath}（${
        error instanceof Error ? error.message : String(error)
      }）`,
    );
  }
  const allFoods = parseCfctMicroDataset(parsed);
  // --limit 在查库 / 写库之前截断。
  const foods = args.limit === null ? allFoods : allFoods.slice(0, args.limit);
  const mode = args.apply ? 'apply' : 'dry-run';

  const report: CfctMicroReport = {
    scanned: 0,
    matched: 0,
    wouldUpdate: 0,
    filledFields: 0,
    skipped: [],
    samples: [],
  };

  console.log(
    `CFCT 微量成分回填开始（${mode}）：${foods.length} 个食品（文件共 ${allFoods.length} 个）。`,
  );

  const prisma = new PrismaClient();
  try {
    // 一次性按 sourceKey IN (...) 读出匹配记录，后续只在内存里合并。
    const records: Array<{
      id: string;
      sourceKey: string;
      foodName: string;
      normalizedNutrition: unknown;
    }> = await prisma.nutritionSourceRecord.findMany({
      where: {
        sourceType: SOURCE_TYPE,
        sourceKey: { in: foods.map((food) => buildSourceKey(food.code)) },
      },
      select: {
        id: true,
        sourceKey: true,
        foodName: true,
        normalizedNutrition: true,
      },
    });
    const recordBySourceKey = new Map(
      records.map((record) => [record.sourceKey, record] as const),
    );

    for (const food of foods) {
      report.scanned += 1;
      if (report.scanned % PROGRESS_INTERVAL === 0) {
        console.log(
          `  进度 ${report.scanned}/${foods.length}（wouldUpdate ${report.wouldUpdate}，skipped ${report.skipped.length}）`,
        );
      }

      const record = recordBySourceKey.get(buildSourceKey(food.code));
      if (!record) {
        report.skipped.push({ code: food.code, reason: 'not_found' });
        continue;
      }
      report.matched += 1;

      const existing = record.normalizedNutrition;
      if (existing === null || existing === undefined) {
        report.skipped.push({
          code: food.code,
          reason: 'missing_normalized_nutrition',
        });
        continue;
      }
      if (!isNutritionProfileV2(existing)) {
        report.skipped.push({
          code: food.code,
          reason: 'invalid_normalized_nutrition',
        });
        continue;
      }

      const { profile, filled } = mergeCfctMicro(
        existing,
        food.micro as Record<string, number>,
      );
      if (filled.length === 0) {
        report.skipped.push({
          code: food.code,
          reason: 'no_usable_micro_values',
        });
        continue;
      }
      report.filledFields += filled.length;

      const changed = stableStringify(existing) !== stableStringify(profile);
      if (!changed) {
        continue;
      }
      report.wouldUpdate += 1;

      if (report.samples.length < SAMPLE_LIMIT) {
        report.samples.push({
          code: food.code,
          name: record.foodName,
          fields: filled,
        });
      }

      if (args.apply) {
        await prisma.nutritionSourceRecord.update({
          where: { id: record.id },
          data: { normalizedNutrition: toJson(profile) },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nCFCT 微量成分回填（${mode}）`);
  console.log(`  JSON：${jsonPath}`);
  console.log(`  扫描食品：${report.scanned}`);
  console.log(`  匹配记录：${report.matched}`);
  console.log(
    `  wouldUpdate：${report.wouldUpdate}${args.apply ? '（已写库）' : '（未写库）'}`,
  );
  console.log(`  填充字段值：${report.filledFields}`);
  console.log(`  跳过：${report.skipped.length}`);
  for (const skipped of report.skipped.slice(0, REPORT_TOP_LIMIT)) {
    console.log(`    - ${skipped.code}: ${skipped.reason}`);
  }
  for (const sample of report.samples) {
    console.log(
      `  样本 ${sample.code} ${sample.name}: ${sample.fields.join(', ')}`,
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
