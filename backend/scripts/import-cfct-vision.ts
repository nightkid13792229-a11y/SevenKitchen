/**
 * 中国食物成分表（CFCT）标准版第 6 版第一册主表视觉提取数据导入脚本
 * （默认 dry-run，不写库）。
 *
 * 视觉提取 / OCR 校验 / 人工复核在离线阶段完成，本脚本只负责：
 * 读 `{foods}` JSON → 查重 → 生成 `NutritionProfileV2` → 写
 * `nutrition_source_record`。
 *
 * 口径：
 * - 默认不写库；只有显式 `--apply` 才创建记录；
 * - 只创建、绝不更新：已存在的 `sourceKey` 或同名食品一律跳过；
 * - `--limit` 在查库 / 写库之前截断，便于先小批量试跑；
 * - 查重名时去掉 `［］[]（）()、,，` 和空白后比较，避免全半角 / 别名括号
 *   造成的重复导入。
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/import-cfct-vision.ts \
 *     --json <path> [--limit N] [--apply] [--report <path>]
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
  buildCfctVisionProfile,
  CFCT_SOURCE_TITLE,
  CFCT_SOURCE_VERSION,
  CFCT_SOURCE_TYPE,
  type CfctVisionFood,
} from '../src/domain/nutrition-governance/cfct-vision-normalize';

loadEnv();
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

const SOURCE_TYPE = NutritionGovernanceSourceType.CFCT;
const DATA_TYPE = 'cfct_v6_vol1_vision';
const PROGRESS_INTERVAL = 100;
const REPORT_TOP_LIMIT = 20;
const SAMPLE_LIMIT = 5;

const USAGE = `
中国食物成分表 第6版 第一册（CFCT vol.1）视觉提取数据导入（默认 dry-run，不写库）

Usage:
  npx ts-node -r tsconfig-paths/register scripts/import-cfct-vision.ts \\
    --json <path> [--limit N] [--apply] [--report <path>]

Options:
  --json <path>   视觉提取结果 JSON（形如 {"foods":[...]}，必填）
  --limit N       只处理前 N 个食品（按文件顺序，在查库 / 写库之前截断）
  --apply         真正写库（只 create，绝不 update）；不传则 dry-run
  --report <path> 把 JSON 报告写到指定路径（目录不存在会自动创建）
  --help, -h      显示本帮助

跳过规则：
  existing_key   已有 sourceKey = CFCT:<code> 的记录
  existing_name  已有 CFCT 记录的 foodName 与其归一化名称相同
                 （去掉 ［］[]（）()、,， 和空白后比较）

报告字段：
  scanned  已扫描食品数
  created  dry-run 为预计值，--apply 时为实际创建数
  skipped  跳过的食品及原因
  samples  最多 5 个食品的主要营养值
`;

type CfctVisionSkipReason = 'existing_key' | 'existing_name';

interface CliArgs {
  jsonPath: string | null;
  apply: boolean;
  limit: number | null;
  reportPath: string | null;
  help: boolean;
}

interface CfctVisionSkip {
  code: string;
  name: string;
  reason: CfctVisionSkipReason;
}

interface CfctVisionExistingRecord {
  sourceKey: string;
  foodName: string;
}

interface CfctVisionSample {
  code: string;
  name: string;
  energyKcal: number | null;
  crudeProtein: number | null;
  calcium: number | null;
  selenium: number | null;
}

interface CfctVisionImportReport {
  scanned: number;
  created: number;
  skipped: CfctVisionSkip[];
  samples: CfctVisionSample[];
}

/**
 * 查重名用的归一化：只去掉全半角括号 / 顿号 / 逗号 / 空格，不做其它改写。
 * 例：`薏米［薏仁米,苡米］` → `薏米薏仁米苡米`。
 */
export function normalizeCfctVisionFoodName(name: string): string {
  return name.replace(/[［］[\]（）()、,，\s]/gu, '');
}

export function buildCfctVisionSourceKey(code: string): string {
  return `${CFCT_SOURCE_TYPE}:${code}`;
}

/**
 * 纯函数跳过判定（不碰数据库），便于脚本外单独验证查重口径。
 * 先判 key，再判名称；两者都不命中才返回 null。
 */
export function findCfctVisionSkipReason(
  food: CfctVisionFood,
  existingKeys: ReadonlySet<string>,
  existingNormalizedNames: ReadonlySet<string>,
): CfctVisionSkipReason | null {
  if (existingKeys.has(buildCfctVisionSourceKey(food.code))) {
    return 'existing_key';
  }

  const normalizedName = normalizeCfctVisionFoodName(food.name);
  if (normalizedName && existingNormalizedNames.has(normalizedName)) {
    return 'existing_name';
  }

  return null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    jsonPath: null,
    apply: false,
    limit: null,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCfctVisionDataset(parsed: unknown): CfctVisionFood[] {
  if (!isRecord(parsed) || !Array.isArray(parsed.foods)) {
    throw new Error('JSON 根节点必须是 {"foods":[...]}');
  }

  return parsed.foods.map((item, index) => {
    if (
      !isRecord(item) ||
      typeof item.code !== 'string' ||
      typeof item.name !== 'string' ||
      !isRecord(item.columns)
    ) {
      throw new Error(`foods[${index}] 缺少 code / name / columns`);
    }

    return {
      code: item.code,
      name: item.name,
      columns: item.columns as Record<string, number | null>,
      ...(Array.isArray(item.pages) ? { pages: item.pages as number[] } : {}),
    };
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildRawData(food: CfctVisionFood): Prisma.InputJsonValue {
  return toJson({
    food: {
      code: food.code,
      name: food.name,
      pages: food.pages,
    },
    columns: food.columns,
  });
}

function buildSample(
  food: CfctVisionFood,
  profile: NutritionProfileV2,
): CfctVisionSample {
  return {
    code: food.code,
    name: food.name,
    energyKcal: profile.macros.energyKcal,
    crudeProtein: profile.macros.crudeProtein,
    calcium: profile.minerals.calcium,
    selenium: profile.minerals.selenium,
  };
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
  const parsed = JSON.parse(await readFile(jsonPath, 'utf8')) as unknown;
  const allFoods = parseCfctVisionDataset(parsed);
  // --limit 在查库 / 写库之前截断。
  const foods = args.limit === null ? allFoods : allFoods.slice(0, args.limit);
  const mode = args.apply ? 'apply' : 'dry-run';

  const report: CfctVisionImportReport = {
    scanned: 0,
    created: 0,
    skipped: [],
    samples: [],
  };

  console.log(
    `CFCT vol.1 视觉数据导入开始（${mode}）：${foods.length} 个食品（文件共 ${allFoods.length} 个，${CFCT_SOURCE_VERSION}）。`,
  );

  const prisma = new PrismaClient();
  try {
    // 一次性读出已有 CFCT 记录，后续只做内存比对，不逐条查库。
    const existing = await prisma.nutritionSourceRecord.findMany({
      where: { sourceType: SOURCE_TYPE },
      select: { sourceKey: true, foodName: true },
    });
    const existingKeys = new Set(
      existing.map((record: CfctVisionExistingRecord) => record.sourceKey),
    );
    const existingNormalizedNames = new Set(
      existing
        .map((record: CfctVisionExistingRecord) =>
          normalizeCfctVisionFoodName(record.foodName),
        )
        .filter((name: string) => name.length > 0),
    );

    for (const food of foods) {
      report.scanned += 1;

      if (report.scanned % PROGRESS_INTERVAL === 0) {
        console.log(
          `  进度 ${report.scanned}/${foods.length}（created ${report.created}，skipped ${report.skipped.length}）`,
        );
      }

      const skipReason = findCfctVisionSkipReason(
        food,
        existingKeys,
        existingNormalizedNames,
      );
      if (skipReason) {
        report.skipped.push({
          code: food.code,
          name: food.name,
          reason: skipReason,
        });
        continue;
      }

      const profile = buildCfctVisionProfile(food);

      if (args.apply) {
        try {
          await prisma.nutritionSourceRecord.create({
            data: {
              sourceType: SOURCE_TYPE,
              sourceKey: buildCfctVisionSourceKey(food.code),
              sourceTitle: CFCT_SOURCE_TITLE,
              foodName: food.name,
              foodNameEn: null,
              dataType: DATA_TYPE,
              category: null,
              rawData: buildRawData(food),
              normalizedNutrition: toJson(profile),
              status: NutritionGovernanceRecordStatus.ACTIVE,
            },
          });
        } catch (error) {
          throw new Error(
            `写入 ${buildCfctVisionSourceKey(food.code)}（${food.name}）失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      report.created += 1;

      if (report.samples.length < SAMPLE_LIMIT) {
        report.samples.push(buildSample(food, profile));
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nCFCT vol.1 视觉数据导入（${mode}）`);
  console.log(`  JSON：${jsonPath}`);
  console.log(`  扫描食品：${report.scanned}`);
  console.log(
    `  新建：${report.created}${args.apply ? '' : '（dry-run 预计，未写库）'}`,
  );
  console.log(`  跳过：${report.skipped.length}`);
  for (const skipped of report.skipped.slice(0, REPORT_TOP_LIMIT)) {
    console.log(`    - ${skipped.code} ${skipped.name}: ${skipped.reason}`);
  }
  for (const sample of report.samples) {
    console.log(
      `  样本 ${sample.code} ${sample.name}: energyKcal=${sample.energyKcal}, ` +
        `crudeProtein=${sample.crudeProtein}, calcium=${sample.calcium}, ` +
        `selenium=${sample.selenium}`,
    );
  }

  if (args.reportPath) {
    await writeJsonReport(args.reportPath, report);
  }
}

// 只在直接执行时跑 main；被测试 / 工具 import 时保持纯函数可复用。
if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exitCode = 1;
  });
}
