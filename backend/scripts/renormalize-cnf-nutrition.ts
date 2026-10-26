/**
 * CNF (Canadian Nutrient File) 矿物质回填脚本。
 *
 * 背景：CNF 导入时 `usda-nutrient-nbr-to-fdc-id.json` 缺少矿物质编码
 * （301 钙 / 303 铁 / 315 硒…），于是 `normalizedNutrition.minerals` 全为空，
 * 但 `rawData.amounts` 里一直保留着原始值。这里用已有的 rawData 重新归一化，
 * 只把 `minerals` tab 与矿物质相关的 `meta.sourceForms` / `meta.conversionNotes`
 * 合并回现有 profile，其它字段（macros / vitamins / meta.sampleState…）原样保留。
 *
 * 默认 dry-run：只统计、不写库；显式 `--apply` 才 update。
 * 只更新 `normalizedNutrition` 一列，不碰 rawData / status / foodName 等。
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/renormalize-cnf-nutrition.ts \
 *     [--limit N] [--apply] [--report /tmp/cnf-renorm.json]
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { MINERAL_NUTRIENT_KEYS } from '../src/domain/ingredient/nutrition-profile.constants';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import {
  buildCnfNutritionProfile,
  mergeCnfMinerals,
} from '../src/domain/nutrition-governance/cnf-normalize';
import type {
  CnfCodeMapEntry,
  CnfRawAmount,
} from '../src/domain/nutrition-governance/cnf-normalize';

interface CliArgs {
  limit: number | null;
  apply: boolean;
  report: string | null;
  help: boolean;
}

interface RenormalizeReport {
  scanned: number;
  changed: number;
  mineralsBefore: number;
  mineralsAfter: number;
  skipped: Array<{ id: string; reason: string }>;
  samples: Array<{ id: string; name: string; calcium: number | null }>;
}

const USAGE = `
CNF 矿物质回填（默认 dry-run，不写库）

Usage:
  npx ts-node -r tsconfig-paths/register scripts/renormalize-cnf-nutrition.ts \\
    [--limit N] [--apply] [--report <path>]

Options:
  --limit N       只处理前 N 条 CNF 记录（按 id 升序）
  --apply         真正写库（只更新 normalizedNutrition 一列）；不传则 dry-run
  --report <path> 把 JSON 报告写到指定路径
  --help, -h      显示本帮助

报告字段：
  scanned         扫描记录数
  changed         existing 与 merged 的 JSON 不同的记录数
  mineralsBefore  现有 profile 里 minerals 至少有一个非空值的记录数
  mineralsAfter   合并后 profile 里 minerals 至少有一个非空值的记录数
  skipped         无法处理的记录及原因
  samples         最多 5 条合并后 calcium 有值的样本
`;

const SAMPLE_LIMIT = 5;
const PROGRESS_INTERVAL = 100;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    limit: null,
    apply: false,
    report: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else if (flag === '--apply') {
      args.apply = true;
    } else if (flag === '--limit') {
      const raw = argv[i + 1];
      const parsed = raw === undefined ? Number.NaN : Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--limit 需要一个正整数');
      }
      args.limit = parsed;
      i += 1;
    } else if (flag === '--report') {
      const path = argv[i + 1];
      if (!path) {
        throw new Error('--report 需要一个文件路径');
      }
      args.report = path;
      i += 1;
    } else {
      throw new Error(`未知参数：${flag}`);
    }
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
    isRecord(value.minerals)
  );
}

function extractCnfAmounts(rawData: unknown): {
  amounts?: CnfRawAmount[];
  reason?: string;
} {
  if (!isRecord(rawData)) {
    return { reason: 'rawData 不是对象' };
  }
  const rawAmounts = rawData.amounts;
  if (!Array.isArray(rawAmounts)) {
    return { reason: 'rawData.amounts 不是数组' };
  }
  if (rawAmounts.length === 0) {
    return { reason: 'rawData.amounts 为空' };
  }

  const amounts: CnfRawAmount[] = [];
  for (const item of rawAmounts) {
    if (!isRecord(item)) {
      continue;
    }
    const nutrientCode = item.nutrientCode;
    const value = item.value;
    if (typeof nutrientCode !== 'string' || nutrientCode.trim() === '') {
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    amounts.push({ nutrientCode, value });
  }

  if (amounts.length === 0) {
    return { reason: 'rawData.amounts 没有可用的营养素值' };
  }
  return { amounts };
}

function resolveFoodCode(
  rawData: unknown,
  existing: NutritionProfileV2 | null,
): string {
  const rawFood = isRecord(rawData) ? rawData.food : undefined;
  if (isRecord(rawFood)) {
    const code = rawFood.foodCode;
    if (typeof code === 'string' && code.trim() !== '') {
      return code.trim();
    }
    if (typeof code === 'number' && Number.isFinite(code)) {
      return String(code);
    }
  }

  const externalId = existing?.meta?.externalId;
  if (typeof externalId === 'string' && externalId.startsWith('CNF:')) {
    return externalId.slice('CNF:'.length);
  }
  return '';
}

/** 记录级判断：minerals tab 是否至少有一个非空值。 */
function hasMineralValue(profile: NutritionProfileV2 | null): boolean {
  if (!profile || !isRecord(profile.minerals)) {
    return false;
  }
  const minerals = profile.minerals as Record<string, unknown>;
  return MINERAL_NUTRIENT_KEYS.some(
    (key) => minerals[key] !== null && minerals[key] !== undefined,
  );
}

/**
 * 键排序后的 JSON 序列化，用于判断“内容是否真的变了”。
 *
 * Postgres jsonb 会重排对象键，直接 JSON.stringify 会把仅键顺序不同的两个
 * profile 判成 changed，导致第二次 --apply 报告 changed=5993。这里按键排序后
 * 再比较，语义仍是规格里的“JSON 是否不同”，但不受 jsonb 键顺序影响。
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

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

  const codeMap = JSON.parse(
    await readFile(
      resolve(
        process.cwd(),
        'scripts',
        'data',
        'usda-nutrient-nbr-to-fdc-id.json',
      ),
      'utf8',
    ),
  ) as Record<string, CnfCodeMapEntry>;

  const mode = args.apply ? 'apply' : 'dry-run';
  const report: RenormalizeReport = {
    scanned: 0,
    changed: 0,
    mineralsBefore: 0,
    mineralsAfter: 0,
    skipped: [],
    samples: [],
  };

  const prisma = new PrismaClient();
  try {
    const records = await prisma.nutritionSourceRecord.findMany({
      where: { sourceType: 'CNF' },
      select: {
        id: true,
        foodName: true,
        rawData: true,
        normalizedNutrition: true,
      },
      orderBy: { id: 'asc' },
      take: args.limit ?? undefined,
    });
    console.log(`CNF 记录：${records.length} 条（${mode}）。`);

    for (const record of records) {
      report.scanned += 1;
      if (report.scanned % PROGRESS_INTERVAL === 0) {
        console.log(
          `  进度 ${report.scanned}/${records.length}（changed ${report.changed}，skipped ${report.skipped.length}）`,
        );
      }

      let existing: NutritionProfileV2 | null;
      if (record.normalizedNutrition === null) {
        existing = null;
      } else if (isNutritionProfileV2(record.normalizedNutrition)) {
        existing = record.normalizedNutrition;
      } else {
        report.skipped.push({
          id: record.id,
          reason: 'normalizedNutrition 不是 NutritionProfileV2',
        });
        continue;
      }

      const parsed = extractCnfAmounts(record.rawData);
      if (!parsed.amounts) {
        report.skipped.push({
          id: record.id,
          reason: parsed.reason ?? 'rawData.amounts 解析失败',
        });
        continue;
      }

      let merged: NutritionProfileV2;
      try {
        const built = buildCnfNutritionProfile({
          amounts: parsed.amounts,
          codeMap,
          food: {
            foodCode: resolveFoodCode(record.rawData, existing),
            description: record.foodName,
          },
        });
        merged = mergeCnfMinerals(existing, built);
      } catch (error) {
        report.skipped.push({
          id: record.id,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (hasMineralValue(existing)) {
        report.mineralsBefore += 1;
      }
      if (hasMineralValue(merged)) {
        report.mineralsAfter += 1;
      }

      const changed = stableStringify(existing) !== stableStringify(merged);
      if (changed) {
        report.changed += 1;
      }

      if (
        report.samples.length < SAMPLE_LIMIT &&
        merged.minerals.calcium !== null
      ) {
        report.samples.push({
          id: record.id,
          name: record.foodName,
          calcium: merged.minerals.calcium,
        });
      }

      if (args.apply && changed) {
        await prisma.nutritionSourceRecord.update({
          where: { id: record.id },
          data: { normalizedNutrition: toJsonInput(merged) },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nCNF 矿物质回填（${mode}）`);
  console.log(`  扫描记录：${report.scanned}`);
  console.log(
    `  changed：${report.changed}${args.apply ? '（已写库）' : '（未写库）'}`,
  );
  console.log(
    `  矿物质有值记录：${report.mineralsBefore} → ${report.mineralsAfter}`,
  );
  console.log(`  跳过：${report.skipped.length}`);
  for (const item of report.skipped.slice(0, SAMPLE_LIMIT)) {
    console.log(`    - ${item.id}: ${item.reason}`);
  }
  for (const sample of report.samples) {
    console.log(
      `  样本 ${sample.id} ${sample.name}: calcium=${sample.calcium}`,
    );
  }

  if (args.report) {
    await writeFile(
      args.report,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    console.log(`报告已写入：${args.report}`);
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
});
