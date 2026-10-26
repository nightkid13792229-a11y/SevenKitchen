/**
 * 韩国农村振兴厅「국가표준식품성분 DB 10.4」导入脚本（默认 dry-run）。
 *
 * Excel → JSONL 的转换在 `scripts/data/prepare-korea-xlsx.py`；JSONL 解析在
 * `src/domain/nutrition-governance/korea-jsonl.ts`，归一化在
 * `korea-normalize.ts`。本脚本只负责：读 JSONL → 单位校验 → upsert
 * `nutrition_source_record`。
 *
 * 口径（见 plan 2026-10-27-korea-rda-nutrition-import）：
 * - 默认不写库；只有显式 `--apply` 才 upsert；
 * - 单位与 `KOREA_NUTRIENT_MAP.sourceUnit` 不一致时，该营养素不参与
 *   `normalizedNutrition`（仍保留在 `rawData`），并计入报告；
 * - 映射不上的营养素名只忽略、不静默：报告按名称计数；
 * - 许可：공공누리 제1유형（KOGL Type 1，出处标注即可商用）。
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/import-korea.ts \
 *     --jsonl <path> [--parse-only] [--limit N] [--apply] [--report <path>]
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
  parseKoreaJsonl,
  type KoreaJsonlRecord,
} from '../src/domain/nutrition-governance/korea-jsonl';
import {
  buildKoreaNutritionProfile,
  KOREA_NUTRIENT_MAP,
  KOREA_SOURCE_TITLE,
  KOREA_SOURCE_VERSION,
  type KoreaNutrientMapping,
  type KoreaNutrientValue,
} from '../src/domain/nutrition-governance/korea-normalize';
import { buildNutritionSourceKey } from '../src/domain/nutrition-governance/nutrition-governance.utils';

loadEnv();
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

const SOURCE_TYPE = NutritionGovernanceSourceType.KO_RDA;

/** 官方授权：공공누리 제1유형（KOGL Type 1），必须标注出处。 */
const LICENSE_NOTE =
  'KOGL Type 1 (attribution required) — Rural Development Administration, Republic of Korea';

const PROGRESS_INTERVAL = 500;
const REPORT_TOP_LIMIT = 20;
const SAMPLE_LIMIT = 5;

const USAGE = `
韩国 RDA「국가표준식품성분 DB 10.4」导入（默认 dry-run，不写库）

Usage:
  npx ts-node -r tsconfig-paths/register scripts/import-korea.ts \\
    --jsonl <path> [--parse-only] [--limit N] [--apply] [--report <path>]

Options:
  --jsonl <path>  prepare-korea-xlsx.py 生成的 JSONL 路径（必填）
  --parse-only    只解析并打印统计，完全跳过数据库（优先于 --apply）
  --limit N       只处理前 N 个食品（按文件顺序）
  --apply         真正写库（upsert nutrition_source_record）；不传则 dry-run
  --report <path> 把 JSON 报告写到指定路径（目录不存在会自动创建）
  --help, -h      显示本帮助

报告字段：
  scanned         已扫描食品数
  created/updated dry-run 为预计值，--apply 时为实际写入结果
  skipped         无法导入的食品及原因
  unitMismatches  行内单位与映射表 sourceUnit 不一致的营养素（top 20）
  unmapped        映射不上的营养素名（按出现食品数降序，top 20）
  samples         最多 5 个食品的中文名 / 英文名 / 蛋白质 / 钙 / 硒 / 碘 /
                  牛磺酸 / 可溶纤维 / 亚油酸

--parse-only 输出：
  { foods, numericCells, unmapped, unitMismatches, samples }
`;

interface CliArgs {
  jsonlPath: string | null;
  apply: boolean;
  limit: number | null;
  reportPath: string | null;
  parseOnly: boolean;
  help: boolean;
}

interface UnitMismatchCount {
  header: string;
  expected: string;
  actual: string;
  count: number;
}

interface UnmappedCount {
  header: string;
  count: number;
}

interface ImportSample {
  code: string;
  nameKo: string;
  nameEn: string | null;
  foodGroup: string | null;
  refuseRate: number | null;
  energyKcal: number | null;
  crudeProtein: number | null;
  calcium: number | null;
  selenium: number | null;
  iodine: number | null;
  taurine: number | null;
  solubleFiber: number | null;
  linoleicAcid: number | null;
}

interface ParseOnlySummary {
  foods: number;
  numericCells: number;
  unmapped: UnmappedCount[];
  unitMismatches: UnitMismatchCount[];
  samples: ImportSample[];
}

interface ImportReport {
  scanned: number;
  created: number;
  updated: number;
  skipped: Array<{ code: string; reason: string }>;
  unitMismatches: UnitMismatchCount[];
  unmapped: UnmappedCount[];
  samples: ImportSample[];
}

const MAPPING_BY_HEADER: ReadonlyMap<string, KoreaNutrientMapping> = new Map(
  KOREA_NUTRIENT_MAP.map((mapping) => [mapping.header, mapping]),
);

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    jsonlPath: null,
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
    if (flag === '--jsonl') {
      if (!next || next.startsWith('--')) {
        throw new Error('--jsonl 需要一个文件路径');
      }
      args.jsonlPath = next;
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

/** Excel / 映射表里的 `µg`（U+00B5）、`μg`（U+03BC）、`ug` 都是同一个单位。 */
function normalizeUnit(unit: string): string {
  const compact = unit.trim().replace(/\s+/gu, '');
  if (/^(µg|μg|ug)$/iu.test(compact)) {
    return 'μg';
  }
  return compact;
}

function unitsMatch(expected: string, actual: string): boolean {
  return normalizeUnit(expected) === normalizeUnit(actual);
}

/**
 * 拆出可以参与归一化的营养素；映射不上 / 单位不一致的只计数，不进入 profile。
 *
 * `rawData` 仍保存全部营养素，以后修正映射或单位后可直接重算，不必重新转 Excel。
 */
function splitNutrientsForNormalization(
  record: KoreaJsonlRecord,
  unmappedCounts: Map<string, number>,
  unitMismatchCounts: Map<string, UnitMismatchCount>,
): Record<string, KoreaNutrientValue> {
  const normalizable: Record<string, KoreaNutrientValue> = {};

  for (const [header, nutrient] of Object.entries(record.nutrients)) {
    const mapping = MAPPING_BY_HEADER.get(header);

    if (!mapping) {
      unmappedCounts.set(header, (unmappedCounts.get(header) ?? 0) + 1);
      continue;
    }

    if (!unitsMatch(mapping.sourceUnit, nutrient.unit)) {
      const key = `${header}\u0000${mapping.sourceUnit}\u0000${nutrient.unit}`;
      const existing = unitMismatchCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        unitMismatchCounts.set(key, {
          header,
          expected: mapping.sourceUnit,
          actual: nutrient.unit,
          count: 1,
        });
      }
      continue;
    }

    normalizable[header] = nutrient;
  }

  return normalizable;
}

/** 不依赖 locale 的稳定排序（韩文/英文都按码点比较）。 */
function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function topUnmapped(counts: ReadonlyMap<string, number>): UnmappedCount[] {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || compareText(left[0], right[0]))
    .slice(0, REPORT_TOP_LIMIT)
    .map(([header, count]) => ({ header, count }));
}

function topUnitMismatches(
  counts: ReadonlyMap<string, UnitMismatchCount>,
): UnitMismatchCount[] {
  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        compareText(left.header, right.header) ||
        compareText(left.expected, right.expected) ||
        compareText(left.actual, right.actual),
    )
    .slice(0, REPORT_TOP_LIMIT);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildRawData(record: KoreaJsonlRecord): Prisma.InputJsonValue {
  return toJson({
    food: {
      index: record.index,
      code: record.code,
      nameKo: record.nameKo,
      nameEn: record.nameEn,
      scientificName: record.scientificName,
      foodGroup: record.foodGroup,
      source: record.source,
      refuseRate: record.refuseRate,
    },
    // 全部营养素原样保存；normalizedNutrition 只是映射上且单位一致的部分。
    nutrients: record.nutrients,
  });
}

function buildSourceDetail(record: KoreaJsonlRecord): Prisma.InputJsonValue {
  return toJson({
    licenseNote: LICENSE_NOTE,
    datasetVersion: KOREA_SOURCE_VERSION,
    foodGroup: record.foodGroup,
    refuseRate: record.refuseRate,
  });
}

function buildSample(
  record: KoreaJsonlRecord,
  profile: NutritionProfileV2,
): ImportSample {
  return {
    code: record.code,
    nameKo: record.nameKo,
    nameEn: record.nameEn,
    foodGroup: record.foodGroup,
    refuseRate: record.refuseRate,
    energyKcal: profile.macros.energyKcal,
    crudeProtein: profile.macros.crudeProtein,
    calcium: profile.minerals.calcium,
    selenium: profile.minerals.selenium,
    iodine: profile.minerals.iodine,
    taurine: profile.aminoAcids.taurine,
    solubleFiber: profile.macros.solubleFiber,
    linoleicAcid: profile.fattyAcids.linoleicAcid,
  };
}

async function writeJsonReport(path: string, value: unknown): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`报告已写入：${absolutePath}`);
}

function printUnitMismatches(
  mismatches: readonly UnitMismatchCount[],
  total: number,
): void {
  console.log(`  单位不一致（top ${mismatches.length}/${total}）：`);
  for (const item of mismatches) {
    console.log(
      `    - ${item.header}: expected=${item.expected} actual=${item.actual} count=${item.count}`,
    );
  }
}

function printUnmapped(
  unmapped: readonly UnmappedCount[],
  total: number,
): void {
  console.log(`  未映射营养素（top ${unmapped.length}/${total}）：`);
  for (const item of unmapped) {
    console.log(`    - ${item.header}: ${item.count}`);
  }
}

function printSamples(samples: readonly ImportSample[]): void {
  for (const sample of samples) {
    console.log(
      `  样本 ${sample.code} ${sample.nameKo} / ${sample.nameEn ?? 'null'}: ` +
        `protein=${sample.crudeProtein}, calcium=${sample.calcium}, ` +
        `selenium=${sample.selenium}, iodine=${sample.iodine}, ` +
        `taurine=${sample.taurine}, solubleFiber=${sample.solubleFiber}, ` +
        `linoleicAcid=${sample.linoleicAcid}`,
    );
  }
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

  if (!args.jsonlPath) {
    console.error('缺少必需参数：--jsonl <path>');
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const jsonlPath = resolve(args.jsonlPath);
  const text = await readFile(jsonlPath, 'utf8');
  const records = parseKoreaJsonl(text);
  const foods = args.limit === null ? records : records.slice(0, args.limit);
  const unmappedCounts = new Map<string, number>();
  const unitMismatchCounts = new Map<string, UnitMismatchCount>();

  if (args.parseOnly) {
    let numericCells = 0;
    const samples: ImportSample[] = [];

    for (const record of foods) {
      numericCells += Object.keys(record.nutrients).length;
      const normalizable = splitNutrientsForNormalization(
        record,
        unmappedCounts,
        unitMismatchCounts,
      );

      if (samples.length < SAMPLE_LIMIT) {
        samples.push(
          buildSample(
            record,
            buildKoreaNutritionProfile({ ...record, nutrients: normalizable }),
          ),
        );
      }
    }

    const summary: ParseOnlySummary = {
      foods: foods.length,
      numericCells,
      unmapped: topUnmapped(unmappedCounts),
      unitMismatches: topUnitMismatches(unitMismatchCounts),
      samples,
    };

    console.log(JSON.stringify(summary, null, 2));
    console.log(
      `未映射营养素名：${unmappedCounts.size} 个；单位不一致：${unitMismatchCounts.size} 个。`,
    );

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
    unitMismatches: [],
    unmapped: [],
    samples: [],
  };
  const seenSourceKeys = new Set<string>();

  console.log(
    `韩国 RDA 导入开始（${mode}）：${foods.length} 个食品（文件共 ${records.length} 个）。`,
  );

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.nutritionSourceRecord.findMany({
      where: { sourceType: SOURCE_TYPE },
      select: { sourceKey: true },
    });
    const existingKeys = new Set(existing.map((record) => record.sourceKey));

    for (const record of foods) {
      report.scanned += 1;

      if (report.scanned % PROGRESS_INTERVAL === 0) {
        console.log(
          `  进度 ${report.scanned}/${foods.length}（created ${report.created}，updated ${report.updated}，skipped ${report.skipped.length}）`,
        );
      }

      const normalizable = splitNutrientsForNormalization(
        record,
        unmappedCounts,
        unitMismatchCounts,
      );

      const sourceKey = buildNutritionSourceKey(SOURCE_TYPE, record.code);
      if (seenSourceKeys.has(sourceKey)) {
        report.skipped.push({
          code: record.code,
          reason: '食品代码重复（同一 sourceKey 出现了多次）',
        });
        continue;
      }
      seenSourceKeys.add(sourceKey);

      if (Object.keys(record.nutrients).length === 0) {
        report.skipped.push({
          code: record.code,
          reason: '没有数值型营养素',
        });
        continue;
      }
      if (Object.keys(normalizable).length === 0) {
        report.skipped.push({
          code: record.code,
          reason: '单位校验/映射后没有可用营养素',
        });
        continue;
      }

      const profile = buildKoreaNutritionProfile({
        ...record,
        nutrients: normalizable,
      });
      const data = {
        sourceTitle: KOREA_SOURCE_TITLE,
        sourceDetail: buildSourceDetail(record),
        foodName: record.nameKo,
        foodNameEn: record.nameEn,
        dataType: null,
        category: record.foodGroup,
        rawData: buildRawData(record),
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
            code: record.code,
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
        report.samples.push(buildSample(record, profile));
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  report.unmapped = topUnmapped(unmappedCounts);
  report.unitMismatches = topUnitMismatches(unitMismatchCounts);

  console.log(`\n韩国 RDA 导入（${mode}）`);
  console.log(`  JSONL：${jsonlPath}`);
  console.log(`  扫描食品：${report.scanned}`);
  console.log(
    `  新建：${report.created}${args.apply ? '' : '（dry-run 预计，未写库）'}`,
  );
  console.log(
    `  更新：${report.updated}${args.apply ? '' : '（dry-run 预计，未写库）'}`,
  );
  console.log(`  跳过：${report.skipped.length}`);
  for (const skipped of report.skipped.slice(0, REPORT_TOP_LIMIT)) {
    console.log(`    - ${skipped.code}: ${skipped.reason}`);
  }
  printUnmapped(report.unmapped, unmappedCounts.size);
  printUnitMismatches(report.unitMismatches, unitMismatchCounts.size);
  printSamples(report.samples);

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
