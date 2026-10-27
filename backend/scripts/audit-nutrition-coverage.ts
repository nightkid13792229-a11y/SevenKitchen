/**
 * 营养库覆盖率审计（只读）。
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
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  getNutritionSourceDefinition,
  normalizeLegacyNutritionSourceType,
} from '../src/domain/ingredient/nutrition-source-contract';
import { normalizeNutritionProfile } from '../src/domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfile,
  NutritionProfileV2,
} from '../src/domain/ingredient/types';
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

interface SourceAccumulator {
  records: number;
  uniqueKeys: Set<string>;
  energyRecords: number;
  proteinRecords: number;
  mineralRecords: number;
  vitaminRecords: number;
  resolvableSourceCodeRecords: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasAnyFiniteValue(group: object | undefined): boolean {
  return Object.values(group ?? {}).some(isFiniteNumber);
}

/**
 * `sourceCode` 是否可解析。
 *
 * 新导入写注册口径（USDA_FDC / JP_FOOD_TABLE / …）；旧导入可能写 legacy
 * 值（NZFCD / TFDA / KO_RDA）或干脆没写。这里先按 `getNutritionSourceDefinition`
 * 判，再用 `normalizeLegacyNutritionSourceType` 兜住 legacy 值；sourceCode 缺失时
 * 回落到登记表里该 sourceType 的注册口径。非空的未知值仍算不可解析。
 */
function isSourceCodeResolvable(
  sourceType: string,
  profile: NutritionProfileV2 | null,
): boolean {
  const profileSourceCode = profile?.meta.sourceCode?.trim();
  if (profileSourceCode) {
    return Boolean(
      getNutritionSourceDefinition(profileSourceCode) ??
      normalizeLegacyNutritionSourceType(profileSourceCode),
    );
  }

  const library = getNutritionLibrary(sourceType);
  return Boolean(getNutritionSourceDefinition(library?.sourceCode));
}

function toProfile(value: unknown): NutritionProfileV2 | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return normalizeNutritionProfile(value as NutritionProfile);
}

function accumulate(
  accumulators: Map<string, SourceAccumulator>,
  record: {
    sourceType: string;
    sourceKey: string;
    normalizedNutrition: unknown;
  },
): void {
  let accumulator = accumulators.get(record.sourceType);
  if (!accumulator) {
    accumulator = {
      records: 0,
      uniqueKeys: new Set<string>(),
      energyRecords: 0,
      proteinRecords: 0,
      mineralRecords: 0,
      vitaminRecords: 0,
      resolvableSourceCodeRecords: 0,
    };
    accumulators.set(record.sourceType, accumulator);
  }

  const profile = toProfile(record.normalizedNutrition);

  accumulator.records += 1;
  accumulator.uniqueKeys.add(record.sourceKey);
  if (isFiniteNumber(profile?.macros.energyKcal)) {
    accumulator.energyRecords += 1;
  }
  if (isFiniteNumber(profile?.macros.crudeProtein)) {
    accumulator.proteinRecords += 1;
  }
  if (hasAnyFiniteValue(profile?.minerals)) {
    accumulator.mineralRecords += 1;
  }
  if (hasAnyFiniteValue(profile?.vitamins)) {
    accumulator.vitaminRecords += 1;
  }
  if (isSourceCodeResolvable(record.sourceType, profile)) {
    accumulator.resolvableSourceCodeRecords += 1;
  }
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

function toSourceReport(
  sourceType: string,
  accumulator: SourceAccumulator,
): NutritionCoverageSourceReport {
  return {
    sourceType,
    records: accumulator.records,
    uniqueKeys: accumulator.uniqueKeys.size,
    energyRate: ratio(accumulator.energyRecords, accumulator.records),
    proteinRate: ratio(accumulator.proteinRecords, accumulator.records),
    mineralRate: ratio(accumulator.mineralRecords, accumulator.records),
    vitaminRate: ratio(accumulator.vitaminRecords, accumulator.records),
    resolvableSourceCodeRate: ratio(
      accumulator.resolvableSourceCodeRecords,
      accumulator.records,
    ),
  };
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

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。可使用 ENV_FILE=.env.production npm run audit:nutrition-coverage',
    );
  }

  const args = process.argv.slice(2);
  const shouldAssert = args.includes('--assert');
  const jsonPath = resolveJsonPath(args);

  // 不在 where 里写 sourceType in [...L1]：本地库若还没应用新的枚举迁移
  // （例如缺 KO_RDA），Postgres 会直接报 22P02。这里先扫 ACTIVE，再在 JS 里
  // 按登记表过滤；报告只列实际有记录的来源，缺失的 L1 由验收函数报出来。
  const records = (
    await prisma.nutritionSourceRecord.findMany({
      where: { status: 'ACTIVE' },
      select: {
        sourceType: true,
        sourceKey: true,
        normalizedNutrition: true,
      },
      orderBy: [{ sourceType: 'asc' }, { sourceKey: 'asc' }],
    })
  ).filter((record) => LOCAL_LIBRARY_SOURCE_TYPES.includes(record.sourceType));

  const accumulators = new Map<string, SourceAccumulator>();
  for (const record of records) {
    accumulate(accumulators, record);
  }

  const report: NutritionCoverageReport = {
    generatedAt: new Date().toISOString(),
    sources: LOCAL_LIBRARY_SOURCE_TYPES.flatMap((sourceType) => {
      const accumulator = accumulators.get(sourceType);
      return accumulator ? [toSourceReport(sourceType, accumulator)] : [];
    }),
  };
  const violations = evaluateNutritionCoverage(report);

  console.log('营养库覆盖率审计（只读）');
  console.log(`数据库: ${describeDatabase(process.env.DATABASE_URL)}`);
  console.log('状态过滤: ACTIVE；只统计登记表 L1 来源');
  console.log(`扫描记录: ${records.length}`);
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
