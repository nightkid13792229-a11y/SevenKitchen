/**
 * CNF（Canadian Nutrient File）全字段回填脚本（营养库验收项 4）。
 *
 * 背景：`scripts/data/usda-nutrient-nbr-to-fdc-id.json` 之前缺 205 碳水 /
 * 291 总膳食纤维 / 401 维生素 C / 417 叶酸 / 421 胆碱 / 606 饱和脂肪 /
 * 645 单不饱和脂肪 / 646 多不饱和脂肪 等编码，于是 `normalizedNutrition`
 * 里这些字段一直是 null，而 `rawData.amounts` 里原始值一直还在。这里用补全后的
 * 映射表重新归一化，再用 `mergeCnfProfile` 把 built 里“有值”的字段合并回现有
 * profile —— macros / minerals / vitamins / fattyAcids / aminoAcids 五个 tab 都会
 * 被检查，不再只补矿物质。
 *
 * 默认 dry-run：只统计、不写库；显式 `--apply` 才 update。
 * 只更新 `normalizedNutrition` 一列，不碰 rawData / status / foodName 等。
 * 幂等：第二次运行 `updated` 应为 0（built 完全由同一份 rawData 决定）。
 *
 * ⚠️ 内存约束（2026-10-28 生产 OOM 事故的教训）：
 * CNF 约 6,000 条、每条 rawData 都不小，必须按 id 键集分批读取
 * （`id > cursor` + `order by id`），一批处理完只保留下一批的 cursor；
 * 任何地方都不能把全部记录攒进数组。
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/renormalize-cnf-all-tabs.ts \
 *     [--limit N] [--batch-size N] [--apply] [--report /tmp/cnf-all-tabs.json]
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import {
  AMINO_ACID_NUTRIENT_KEYS,
  FATTY_ACID_NUTRIENT_KEYS,
  MACRO_NUTRIENT_KEYS,
  MINERAL_NUTRIENT_KEYS,
  VITAMIN_NUTRIENT_KEYS,
} from '../src/domain/ingredient/nutrition-profile.constants';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import type { NutritionFieldTab } from '../src/domain/ingredient/nutrition-field-catalog';
import {
  buildCnfNutritionProfile,
  type CnfCodeMapEntry,
  type CnfRawAmount,
} from '../src/domain/nutrition-governance/cnf-normalize';
import {
  diffCnfProfileFields,
  mergeCnfProfile,
} from '../src/domain/nutrition-governance/cnf-profile-merge';
import { USDA_NUTRIENT_MAP } from '../src/domain/nutrition-governance/usda-nutrient-map';

interface CliArgs {
  limit: number | null;
  batchSize: number;
  apply: boolean;
  report: string | null;
  help: boolean;
}

interface TargetCodeMapping {
  nutrientCode: string;
  fdcId: number;
  fieldPath: string;
}

interface TargetCodeReport extends TargetCodeMapping {
  gained: number;
}

interface RenormalizeAllTabsReport {
  scanned: number;
  updated: number;
  changedFields: number;
  perField: Record<string, number>;
  perFieldGained: Record<string, number>;
  coverageBefore: Record<string, number>;
  coverageAfter: Record<string, number>;
  targetCodes: TargetCodeReport[];
  skippedCount: number;
  skipped: Array<{ id: string; reason: string }>;
  samples: Array<{
    id: string;
    name: string;
    changedFields: string[];
    gained: Record<string, number>;
  }>;
}

const USAGE = `
CNF 全字段回填（默认 dry-run，不写库）

Usage:
  npx ts-node -r tsconfig-paths/register scripts/renormalize-cnf-all-tabs.ts \\
    [--limit N] [--batch-size N] [--apply] [--report <path>]

Options:
  --limit N       只处理前 N 条 CNF 记录（按 id 升序）
  --batch-size N  每批读取条数（默认 200，控制内存）
  --apply         真正写库（只更新 normalizedNutrition 一列）；不传则 dry-run
  --report <path> 把 JSON 报告写到指定路径
  --help, -h      显示本帮助

报告字段：
  scanned         扫描记录数
  updated         normalizedNutrition 有变化的记录数（apply 时为实际写库条数）
  changedFields   字段级变化总数（一条记录变 3 个字段算 3）
  perField        每个字段路径变化的记录数 { "macros.carbohydrate": 5993 }
  perFieldGained  每个字段路径“从空变有值”的记录数（验收项 4 的证据）
  coverageBefore  回填前每个字段有值的记录数（只计可解析记录）
  coverageAfter   回填后每个字段有值的记录数（只计可解析记录）
  targetCodes     验收项 4 补映射的 8 个编码各自补上多少条
  skipped         无法处理的记录（最多 5 条示例，计数见 skippedCount）
  samples         最多 5 条样本：变了哪些字段、补上来的值
`;

const SAMPLE_LIMIT = 5;
const SKIPPED_SAMPLE_LIMIT = 5;
const PROGRESS_INTERVAL = 100;
/** 单批上限：CNF rawData 不小，batch 太大就会重演 2026-10-28 的 OOM。 */
const MAX_BATCH_SIZE = 1000;

/**
 * 验收项 4 审计（2026-10-28，生产库）确认漏映射、本次补上的 CNF 编码。
 * 脚本启动时先校验这些编码在映射表里都存在且能落到 USDA_NUTRIENT_MAP 的字段上，
 * 否则直接失败 —— 少一条就说明跑的不是本次的映射表。
 */
const ITEM4_TARGET_CODES = [
  '205', // 碳水
  '291', // 总膳食纤维
  '401', // 维生素 C
  '417', // 叶酸
  '421', // 胆碱
  '606', // 饱和脂肪
  '645', // 单不饱和脂肪
  '646', // 多不饱和脂肪
] as const;

const FIELD_KEYS_BY_TAB: Record<NutritionFieldTab, readonly string[]> = {
  macros: MACRO_NUTRIENT_KEYS,
  minerals: MINERAL_NUTRIENT_KEYS,
  vitamins: VITAMIN_NUTRIENT_KEYS,
  fattyAcids: FATTY_ACID_NUTRIENT_KEYS,
  aminoAcids: AMINO_ACID_NUTRIENT_KEYS,
};

const ALL_FIELD_PATHS: string[] = (
  Object.keys(FIELD_KEYS_BY_TAB) as NutritionFieldTab[]
).flatMap((tabKey) =>
  FIELD_KEYS_BY_TAB[tabKey].map((fieldKey) => `${tabKey}.${fieldKey}`),
);

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    limit: null,
    batchSize: 200,
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
    } else if (flag === '--batch-size') {
      const raw = argv[i + 1];
      const parsed = raw === undefined ? Number.NaN : Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--batch-size 需要一个正整数');
      }
      if (parsed > MAX_BATCH_SIZE) {
        throw new Error(
          `--batch-size 上限 ${MAX_BATCH_SIZE}（2026-10-28 生产 OOM 事故守门，一批不要读太多）`,
        );
      }
      args.batchSize = parsed;
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
  existing: NutritionProfileV2,
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

  const externalId = existing.meta.externalId;
  if (typeof externalId === 'string' && externalId.startsWith('CNF:')) {
    return externalId.slice('CNF:'.length);
  }
  return '';
}

function readFieldValue(
  profile: NutritionProfileV2,
  fieldPath: string,
): number | null {
  const separator = fieldPath.indexOf('.');
  const tabKey = fieldPath.slice(0, separator) as NutritionFieldTab;
  const fieldKey = fieldPath.slice(separator + 1);
  const tab = profile[tabKey] as Record<string, number | null | undefined>;
  const value = tab[fieldKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 键排序后的 JSON 序列化，用于判断“内容是否真的变了”。
 *
 * Postgres jsonb 会重排对象键，直接 JSON.stringify 会把仅键顺序不同的两个
 * profile 判成 changed，导致第二次 --apply 又报一堆变化。这里按键排序后再比较。
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

function bump(counts: Record<string, number>, fieldPath: string): void {
  counts[fieldPath] = (counts[fieldPath] ?? 0) + 1;
}

function resolveTargetCodeMappings(
  codeMap: Record<string, CnfCodeMapEntry>,
): TargetCodeMapping[] {
  return ITEM4_TARGET_CODES.map((nutrientCode) => {
    const entry = codeMap[nutrientCode];
    if (!entry) {
      throw new Error(
        `映射表缺少验收项 4 的目标编码 ${nutrientCode}，请先更新 scripts/data/usda-nutrient-nbr-to-fdc-id.json`,
      );
    }
    const mapping = USDA_NUTRIENT_MAP.find(
      (item) => item.nutrientId === entry.fdcId,
    );
    if (!mapping) {
      throw new Error(
        `编码 ${nutrientCode} → fdcId ${entry.fdcId} 在 USDA_NUTRIENT_MAP 里没有对应字段`,
      );
    }
    return { nutrientCode, fdcId: entry.fdcId, fieldPath: mapping.fieldPath };
  });
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
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

  const codeMapPath = resolve(
    process.cwd(),
    'scripts',
    'data',
    'usda-nutrient-nbr-to-fdc-id.json',
  );
  const codeMap = JSON.parse(await readFile(codeMapPath, 'utf8')) as Record<
    string,
    CnfCodeMapEntry
  >;

  const mode = args.apply ? 'apply' : 'dry-run';
  // 先校验映射表（少一条就不该连库跑），再开 Prisma。
  const targetCodeMappings = resolveTargetCodeMappings(codeMap);
  const report: RenormalizeAllTabsReport = {
    scanned: 0,
    updated: 0,
    changedFields: 0,
    perField: {},
    perFieldGained: {},
    coverageBefore: Object.fromEntries(
      ALL_FIELD_PATHS.map((path) => [path, 0]),
    ),
    coverageAfter: Object.fromEntries(ALL_FIELD_PATHS.map((path) => [path, 0])),
    targetCodes: [],
    skippedCount: 0,
    skipped: [],
    samples: [],
  };

  console.log(`CNF 全字段回填（${mode}）`);
  console.log(`  映射表：${codeMapPath}`);

  const prisma = new PrismaClient();
  try {
    let lastId: string | null = null;
    let remaining = args.limit ?? Number.POSITIVE_INFINITY;
    while (remaining > 0) {
      const take = Math.min(args.batchSize, remaining);
      const records: Array<{
        id: string;
        foodName: string;
        rawData: unknown;
        normalizedNutrition: unknown;
      }> = await prisma.nutritionSourceRecord.findMany({
        where: {
          sourceType: 'CNF',
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        select: {
          id: true,
          foodName: true,
          rawData: true,
          normalizedNutrition: true,
        },
        orderBy: { id: 'asc' },
        take,
      });
      if (records.length === 0) {
        break;
      }

      // 本批的写库操作（PrismaPromise 是惰性的，攒到批尾一次性提交）。
      const pendingUpdates: Prisma.PrismaPromise<unknown>[] = [];

      for (const record of records) {
        report.scanned += 1;
        if (report.scanned % PROGRESS_INTERVAL === 0) {
          console.log(
            `  进度 ${report.scanned}（updated ${report.updated}，changedFields ${report.changedFields}，skipped ${report.skippedCount}）`,
          );
        }

        if (!isNutritionProfileV2(record.normalizedNutrition)) {
          report.skippedCount += 1;
          if (report.skipped.length < SKIPPED_SAMPLE_LIMIT) {
            report.skipped.push({
              id: record.id,
              reason: 'normalizedNutrition 不是 NutritionProfileV2',
            });
          }
          continue;
        }
        const existing = record.normalizedNutrition;

        const parsed = extractCnfAmounts(record.rawData);
        if (!parsed.amounts) {
          report.skippedCount += 1;
          if (report.skipped.length < SKIPPED_SAMPLE_LIMIT) {
            report.skipped.push({
              id: record.id,
              reason: parsed.reason ?? 'rawData.amounts 解析失败',
            });
          }
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
          merged = mergeCnfProfile(existing, built);
        } catch (error) {
          report.skippedCount += 1;
          if (report.skipped.length < SKIPPED_SAMPLE_LIMIT) {
            report.skipped.push({
              id: record.id,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
          continue;
        }

        for (const fieldPath of ALL_FIELD_PATHS) {
          if (readFieldValue(existing, fieldPath) !== null) {
            report.coverageBefore[fieldPath] += 1;
          }
          if (readFieldValue(merged, fieldPath) !== null) {
            report.coverageAfter[fieldPath] += 1;
          }
        }

        const diff = diffCnfProfileFields(existing, merged);
        report.changedFields += diff.changed.length;
        for (const fieldPath of diff.changed) {
          bump(report.perField, fieldPath);
        }
        for (const fieldPath of diff.gained) {
          bump(report.perFieldGained, fieldPath);
        }

        const changed = stableStringify(existing) !== stableStringify(merged);
        if (!changed) {
          continue;
        }

        report.updated += 1;

        if (report.samples.length < SAMPLE_LIMIT && diff.gained.length > 0) {
          const gainedValues: Record<string, number> = {};
          for (const fieldPath of diff.gained) {
            const value = readFieldValue(merged, fieldPath);
            if (value !== null) {
              gainedValues[fieldPath] = value;
            }
          }
          report.samples.push({
            id: record.id,
            name: record.foodName,
            changedFields: diff.changed,
            gained: gainedValues,
          });
        }

        if (args.apply) {
          pendingUpdates.push(
            prisma.nutritionSourceRecord.update({
              where: { id: record.id },
              data: { normalizedNutrition: toJsonInput(merged) },
            }),
          );
        }
      }

      if (pendingUpdates.length > 0) {
        await prisma.$transaction(pendingUpdates);
      }

      lastId = records[records.length - 1].id;
      remaining -= records.length;
      if (records.length < take) {
        break;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  report.targetCodes = targetCodeMappings.map((mapping) => ({
    ...mapping,
    gained: report.perFieldGained[mapping.fieldPath] ?? 0,
  }));

  const changedFieldPaths = Object.entries(report.perField).sort(
    ([pathA, countA], [pathB, countB]) =>
      countB - countA || pathA.localeCompare(pathB),
  );

  console.log(`\nCNF 全字段回填（${mode}）`);
  console.log(`  扫描记录：${formatCount(report.scanned)}`);
  console.log(
    `  updated：${formatCount(report.updated)}${args.apply ? '（已写库）' : '（未写库）'}`,
  );
  console.log(`  字段级变化：${formatCount(report.changedFields)}`);
  console.log(`  跳过：${formatCount(report.skippedCount)}`);
  for (const item of report.skipped) {
    console.log(`    - ${item.id}: ${item.reason}`);
  }

  console.log('\n  验收项 4 目标编码（本次补映射的 8 个）：');
  for (const target of report.targetCodes) {
    console.log(
      `    ${target.nutrientCode.padEnd(4)} → fdcId ${target.fdcId}  ${target.fieldPath.padEnd(42)} 新增有值 ${formatCount(target.gained)} 条`,
    );
  }

  console.log('\n  字段变化（按变化条数排序）：');
  if (changedFieldPaths.length === 0) {
    console.log('    （没有字段变化）');
  }
  for (const [fieldPath, count] of changedFieldPaths) {
    console.log(
      `    ${fieldPath.padEnd(42)} 变化 ${formatCount(count)} 条，新增有值 ${formatCount(report.perFieldGained[fieldPath] ?? 0)} 条（有值 ${formatCount(report.coverageBefore[fieldPath])} → ${formatCount(report.coverageAfter[fieldPath])}）`,
    );
  }

  for (const sample of report.samples) {
    console.log(`\n  样本 ${sample.id} ${sample.name}`);
    console.log(`    变化字段：${sample.changedFields.join(', ')}`);
    for (const [fieldPath, value] of Object.entries(sample.gained)) {
      console.log(`    补上 ${fieldPath} = ${value}`);
    }
  }

  if (args.report) {
    await writeFile(
      args.report,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    console.log(`\n报告已写入：${args.report}`);
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
});
