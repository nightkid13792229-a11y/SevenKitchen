/**
 * 营养库覆盖率审计（只读）。
 *
 * **聚合在 SQL 完成；绝不把 normalizedNutrition 整列 / 27k 份 profile 读进 Node。**
 * 2026-10-28 生产 OOM 事故的根因就是 `findMany` 全量 profile；这里只允许两条
 * 聚合查询（per-source 计数 + sourceCode 分布），任何查询返回整列 profile 都会
 * 被 `assertNoFullProfiles` 直接拒绝。
 *
 * 按 L1 来源输出：记录数、唯一 sourceKey 数、能量 / 蛋白 / 至少一种矿物质 /
 * 至少一种维生素覆盖率、`sourceCode` 可解析比例；并调用
 * `evaluateNutritionCoverage` 给出验收违规项。
 *
 * 不写数据库。默认只看 `status = ACTIVE`，与候选检索口径一致。
 * `--assert` 时有违规就 exit 1；`--json <path>` 可另存一份报告。
 *
 * 用法：
 *   npm run audit:nutrition-coverage
 *   npm run audit:nutrition-coverage -- --assert
 *   npm run audit:nutrition-coverage -- --json reports/nutrition-coverage.json
 *   ENV_FILE=.env.production npm run audit:nutrition-coverage -- --assert
 */

import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  getNutritionSourceDefinition,
  normalizeLegacyNutritionSourceType,
} from '../src/domain/ingredient/nutrition-source-contract';
import {
  evaluateNutritionCoverage,
  type NutritionCoverageReport,
  type NutritionCoverageSourceReport,
} from '../src/domain/nutrition-governance/nutrition-coverage-thresholds';
import {
  getNutritionLibrary,
  LOCAL_LIBRARY_SOURCE_TYPES,
} from '../src/domain/nutrition-governance/nutrition-source-registry';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

interface PerSourceAggregateRow {
  sourceType: string;
  records: number;
  uniqueKeys: number;
  energy: number;
  protein: number;
  mineral: number;
  vitamin: number;
}

interface SourceCodeAggregateRow {
  sourceType: string;
  code: string;
  n: number;
}

/**
 * OOM 守门：两条查询都只允许返回计数列。
 *
 * 如果哪天有人把 `normalized_nutrition` 整列加进 SELECT，结果行里就会出现
 * `normalizedNutrition` / 营养档案对象；这里立刻报错，避免再走一遍
 * 「27k profiles 进 Node」。
 */
function assertNoFullProfiles<T extends object>(
  queryName: string,
  rows: readonly T[],
): void {
  for (const row of rows) {
    if ('normalizedNutrition' in row || 'normalized_nutrition' in row) {
      throw new Error(
        `${queryName}: aggregate query returned full normalizedNutrition rows; refusing to continue (OOM risk)`,
      );
    }

    // 不依赖列名：任何看起来像 NutritionProfile 的对象都不允许被聚合查询带回来。
    for (const value of Object.values(row as Record<string, unknown>)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        ('macros' in value || 'minerals' in value || 'vitamins' in value)
      ) {
        throw new Error(
          `${queryName}: aggregate query returned nutrition profile payloads; refusing to continue (OOM risk)`,
        );
      }
    }
  }
}

/**
 * `sourceCode` 是否可解析。
 *
 * 新导入写注册口径（USDA_FDC / JP_FOOD_TABLE / …）；旧导入可能写 legacy
 * 值（NZFCD / TFDA / KO_RDA）或干脆没写。这里先按 `getNutritionSourceDefinition`
 * 判，再用 `normalizeLegacyNutritionSourceType` 兜住 legacy 值；sourceCode 缺失时
 * 回落到登记表里该 sourceType 的注册口径。非空的未知值仍算不可解析。
 */
function isSourceCodeResolvable(sourceType: string, code: string): boolean {
  const sourceCode = code.trim();
  if (sourceCode) {
    return Boolean(
      getNutritionSourceDefinition(sourceCode) ??
      normalizeLegacyNutritionSourceType(sourceCode),
    );
  }

  const library = getNutritionLibrary(sourceType);
  return Boolean(getNutritionSourceDefinition(library?.sourceCode));
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatCell(value: string, width: number): string {
  return value.padEnd(width, ' ');
}

function printTable(report: NutritionCoverageReport): void {
  console.log(
    [
      formatCell('source', 10),
      formatCell('records', 9),
      formatCell('unique', 9),
      formatCell('energy', 9),
      formatCell('protein', 9),
      formatCell('mineral', 9),
      formatCell('vitamin', 9),
      formatCell('sourceCode', 11),
    ].join(' '),
  );

  for (const source of report.sources) {
    console.log(
      [
        formatCell(source.sourceType, 10),
        formatCell(String(source.records), 9),
        formatCell(String(source.uniqueKeys), 9),
        formatCell(formatRate(source.energyRate), 9),
        formatCell(formatRate(source.proteinRate), 9),
        formatCell(formatRate(source.mineralRate), 9),
        formatCell(formatRate(source.vitaminRate), 9),
        formatCell(formatRate(source.resolvableSourceCodeRate), 11),
      ].join(' '),
    );
  }

  const reported = new Set(report.sources.map((source) => source.sourceType));
  const missing = LOCAL_LIBRARY_SOURCE_TYPES.filter(
    (sourceType) => !reported.has(sourceType),
  );
  if (missing.length > 0) {
    console.log(`(本地没有记录: ${missing.join(', ')})`);
  }
}

/** 只取 host:port/db，绝不打印带密码的完整 DATABASE_URL。 */
function describeDatabase(url: string | undefined): string {
  if (!url) {
    return '(DATABASE_URL 未设置)';
  }
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return '(DATABASE_URL 无法解析)';
  }
}

/** `--json <path>` 或 `--json=<path>`；没传返回 null。 */
function resolveJsonPath(args: readonly string[]): string | null {
  const inline = args.find((arg) => arg.startsWith('--json='));
  if (inline) {
    const value = inline.slice('--json='.length).trim();
    if (!value) {
      throw new Error(
        '--json 需要文件路径，例如 --json reports/nutrition-coverage.json',
      );
    }
    return value;
  }

  const index = args.indexOf('--json');
  if (index < 0) {
    return null;
  }
  const value = args[index + 1]?.trim();
  if (!value || value.startsWith('--')) {
    throw new Error(
      '--json 需要文件路径，例如 --json reports/nutrition-coverage.json',
    );
  }
  return value;
}

/**
 * 两条聚合查询：per-source 计数 + sourceCode 分布。
 *
 * `source_type::text IN (...)` 而不是直接 `IN (enum)`：本地库可能还没应用
 * KO_RDA 枚举迁移，直接按枚举比较会 22P02；转 text 后生产与本地都能跑。
 */
async function loadAggregates() {
  const sourceTypeList = Prisma.join([...LOCAL_LIBRARY_SOURCE_TYPES]);

  const perSourceRows = await prisma.$queryRaw<PerSourceAggregateRow[]>(
    Prisma.sql`
      SELECT source_type::text AS "sourceType",
             count(*)::int AS "records",
             count(DISTINCT source_key)::int AS "uniqueKeys",
             count(*) FILTER (
               WHERE normalized_nutrition->'macros'->>'energyKcal' IS NOT NULL
             )::int AS "energy",
             count(*) FILTER (
               WHERE normalized_nutrition->'macros'->>'crudeProtein' IS NOT NULL
             )::int AS "protein",
             count(*) FILTER (
               WHERE (normalized_nutrition->'minerals'->>'calcium') IS NOT NULL
                  OR (normalized_nutrition->'minerals'->>'iron') IS NOT NULL
                  OR (normalized_nutrition->'minerals'->>'zinc') IS NOT NULL
                  OR (normalized_nutrition->'minerals'->>'selenium') IS NOT NULL
             )::int AS "mineral",
             count(*) FILTER (
               WHERE (normalized_nutrition->'vitamins'->>'vitaminB1') IS NOT NULL
                  OR (normalized_nutrition->'vitamins'->>'vitaminB2') IS NOT NULL
                  OR (normalized_nutrition->'vitamins'->>'vitaminC') IS NOT NULL
             )::int AS "vitamin"
      FROM nutrition_source_record
      WHERE status = 'ACTIVE'
        AND source_type::text IN (${sourceTypeList})
      GROUP BY source_type
      ORDER BY source_type
    `,
  );
  assertNoFullProfiles('per-source aggregates', perSourceRows);

  const sourceCodeRows = await prisma.$queryRaw<SourceCodeAggregateRow[]>(
    Prisma.sql`
      SELECT source_type::text AS "sourceType",
             COALESCE(
               normalized_nutrition->'meta'->>'sourceCode',
               ''
             ) AS "code",
             count(*)::int AS "n"
      FROM nutrition_source_record
      WHERE status = 'ACTIVE'
        AND source_type::text IN (${sourceTypeList})
      GROUP BY 1, 2
      ORDER BY 1, 2
    `,
  );
  assertNoFullProfiles('source-code aggregates', sourceCodeRows);

  return { perSourceRows, sourceCodeRows };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。可使用 ENV_FILE=.env.production npm run audit:nutrition-coverage',
    );
  }

  const args = process.argv.slice(2);
  const shouldAssert = args.includes('--assert');
  const jsonPath = resolveJsonPath(args);

  const { perSourceRows, sourceCodeRows } = await loadAggregates();

  const resolvableBySourceType = new Map<string, number>();
  for (const row of sourceCodeRows) {
    if (!isSourceCodeResolvable(row.sourceType, row.code)) {
      continue;
    }
    resolvableBySourceType.set(
      row.sourceType,
      (resolvableBySourceType.get(row.sourceType) ?? 0) + row.n,
    );
  }

  const aggregateBySourceType = new Map(
    perSourceRows.map((row) => [row.sourceType, row]),
  );
  const sources = LOCAL_LIBRARY_SOURCE_TYPES.flatMap(
    (sourceType): NutritionCoverageSourceReport[] => {
      const aggregate = aggregateBySourceType.get(sourceType);
      if (!aggregate) {
        return [];
      }

      return [
        {
          sourceType,
          records: aggregate.records,
          uniqueKeys: aggregate.uniqueKeys,
          energyRate: ratio(aggregate.energy, aggregate.records),
          proteinRate: ratio(aggregate.protein, aggregate.records),
          mineralRate: ratio(aggregate.mineral, aggregate.records),
          vitaminRate: ratio(aggregate.vitamin, aggregate.records),
          resolvableSourceCodeRate: ratio(
            resolvableBySourceType.get(sourceType) ?? 0,
            aggregate.records,
          ),
        },
      ];
    },
  );
  const report: NutritionCoverageReport = {
    generatedAt: new Date().toISOString(),
    sources,
  };
  const violations = evaluateNutritionCoverage(report);

  console.log('营养库覆盖率审计（只读，SQL 聚合）');
  console.log(`数据库: ${describeDatabase(process.env.DATABASE_URL)}`);
  console.log('状态过滤: ACTIVE；只统计登记表 L1 来源');
  console.log(
    `聚合查询行数: per-source=${perSourceRows.length} / source-code=${sourceCodeRows.length}`,
  );
  console.log(
    `扫描记录: ${sources.reduce((sum, source) => sum + source.records, 0)}`,
  );
  console.log('');
  printTable(report);
  console.log('');

  if (violations.length === 0) {
    console.log('基线验收: 通过');
  } else {
    console.log(`基线违规: ${violations.length} 项`);
    for (const violation of violations) {
      console.log(`  - ${violation}`);
    }
  }

  if (jsonPath) {
    const outputPath = resolve(process.cwd(), jsonPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`JSON 报告已写入: ${outputPath}`);
  }

  if (shouldAssert && violations.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('[audit] 营养库覆盖率审计失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
