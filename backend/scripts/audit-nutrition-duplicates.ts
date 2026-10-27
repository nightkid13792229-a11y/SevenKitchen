/**
 * 营养库同名审计（只读）。
 *
 * 输出：
 * - 同库同名（同一 sourceType + 同一归一化 foodName）重复组数；
 * - 跨库同名（同一归一化 foodName 出现在 ≥2 个 L1 来源）组数；
 * - 候选折叠前后条数（`collapseCandidateNames` 的同一套规则）；
 * - 每类前 10 组示例；`--json <path>` 可另存一份 JSON 报告。
 *
 * 不写数据库。默认只看 `status = ACTIVE`，与候选检索（`listNutritionNames`）
 * 的口径一致；归一化规则也复用 `normalizeCandidateName`，审计数字与线上折叠
 * 结果不会各算一套。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register scripts/audit-nutrition-duplicates.ts
 *   npx ts-node -r tsconfig-paths/register scripts/audit-nutrition-duplicates.ts --json reports/nutrition-duplicates.json
 *   ENV_FILE=.env.production npx ts-node -r tsconfig-paths/register scripts/audit-nutrition-duplicates.ts
 */

import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  collapseCandidateNames,
  normalizeCandidateName,
} from '../src/domain/nutrition-governance/candidate-name-dedup';
import { LOCAL_LIBRARY_SOURCE_TYPES } from '../src/domain/nutrition-governance/nutrition-source-registry';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

/** 打印与 JSON 都只留前 10 组，避免 677 组刷屏；完整数字仍在 summary 里。 */
const TOP_EXAMPLE_LIMIT = 10;

/** 每组示例里最多列 3 条原始名字，够看清是什么差异即可。 */
const SAMPLE_NAME_LIMIT = 3;

interface AuditedRecord {
  id: string;
  sourceType: string;
  foodName: string;
}

interface DuplicateExample {
  normalizedName: string;
  sources: string[];
  recordCount: number;
  samples: Array<{
    id: string;
    sourceType: string;
    name: string;
  }>;
}

interface DuplicateSection {
  /** 有 ≥2 条记录的组数。 */
  groupCount: number;
  /** 这些组一共覆盖多少条记录（不是「多出来的条数」）。 */
  recordsInGroups: number;
  examples: DuplicateExample[];
}

interface DuplicateAuditReport {
  generatedAt: string;
  database: string;
  statusFilter: 'ACTIVE';
  sourceTypes: string[];
  /** 本次实际扫到记录的 L1 来源（本地库可能还没应用某个枚举迁移）。 */
  scannedSourceTypes: string[];
  scannedRecords: number;
  emptyNameRecords: number;
  sameSource: DuplicateSection;
  crossSource: DuplicateSection;
  collapse: {
    before: number;
    after: number;
    collapsedAway: number;
    /** 折叠后仍带 alsoIn（即跨库同名）的候选数。 */
    withAlsoIn: number;
  };
}

const SOURCE_ORDER: ReadonlyMap<string, number> = new Map(
  LOCAL_LIBRARY_SOURCE_TYPES.map((sourceType, index) => [sourceType, index]),
);

function compareSourceTypes(left: string, right: string): number {
  const rankDelta =
    (SOURCE_ORDER.get(left) ?? SOURCE_ORDER.size) -
    (SOURCE_ORDER.get(right) ?? SOURCE_ORDER.size);
  return rankDelta !== 0 ? rankDelta : left.localeCompare(right);
}

function compareExamples(
  left: DuplicateExample,
  right: DuplicateExample,
): number {
  return (
    right.recordCount - left.recordCount ||
    left.normalizedName.localeCompare(right.normalizedName) ||
    left.sources.join(',').localeCompare(right.sources.join(','))
  );
}

/** 一组原始记录 → 审计示例；sources 按登记表顺序，samples 保留前 3 条。 */
function toExample(rows: readonly AuditedRecord[]): DuplicateExample {
  return {
    normalizedName: normalizeCandidateName(rows[0].foodName),
    sources: [...new Set(rows.map((row) => row.sourceType))].sort(
      compareSourceTypes,
    ),
    recordCount: rows.length,
    samples: rows.slice(0, SAMPLE_NAME_LIMIT).map((row) => ({
      id: row.id,
      sourceType: row.sourceType,
      name: row.foodName,
    })),
  };
}

function buildSection(
  groups: ReadonlyArray<readonly AuditedRecord[]>,
): DuplicateSection {
  return {
    groupCount: groups.length,
    recordsInGroups: groups.reduce((sum, rows) => sum + rows.length, 0),
    examples: groups
      .map(toExample)
      .sort(compareExamples)
      .slice(0, TOP_EXAMPLE_LIMIT),
  };
}

function auditRecords(records: readonly AuditedRecord[]): DuplicateAuditReport {
  const sameSourceGroups = new Map<string, AuditedRecord[]>();
  const byNormalizedName = new Map<string, AuditedRecord[]>();
  let emptyNameRecords = 0;

  for (const record of records) {
    const normalized = normalizeCandidateName(record.foodName);
    if (normalized === '') {
      emptyNameRecords += 1;
      continue;
    }

    const sameSourceKey = `${record.sourceType}\u0000${normalized}`;
    const sameSourceRows = sameSourceGroups.get(sameSourceKey);
    if (sameSourceRows) {
      sameSourceRows.push(record);
    } else {
      sameSourceGroups.set(sameSourceKey, [record]);
    }

    const crossSourceRows = byNormalizedName.get(normalized);
    if (crossSourceRows) {
      crossSourceRows.push(record);
    } else {
      byNormalizedName.set(normalized, [record]);
    }
  }

  const sameSource = buildSection(
    [...sameSourceGroups.values()].filter((rows) => rows.length > 1),
  );
  const crossSource = buildSection(
    [...byNormalizedName.values()].filter(
      (rows) => new Set(rows.map((row) => row.sourceType)).size > 1,
    ),
  );

  const collapsed = collapseCandidateNames(
    records.map((record) => ({
      id: record.id,
      name: record.foodName,
      sourceType: record.sourceType,
    })),
  );

  return {
    generatedAt: new Date().toISOString(),
    database: describeDatabase(process.env.DATABASE_URL),
    statusFilter: 'ACTIVE',
    sourceTypes: [...LOCAL_LIBRARY_SOURCE_TYPES],
    scannedSourceTypes: [
      ...new Set(records.map((record) => record.sourceType)),
    ].sort(compareSourceTypes),
    scannedRecords: records.length,
    emptyNameRecords,
    sameSource,
    crossSource,
    collapse: {
      before: records.length,
      after: collapsed.length,
      collapsedAway: records.length - collapsed.length,
      withAlsoIn: collapsed.filter((row) => (row.alsoIn?.length ?? 0) > 0)
        .length,
    },
  };
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

function formatPercent(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function formatSamples(example: DuplicateExample): string {
  return example.samples
    .map((sample) => `[${sample.sourceType}] ${sample.name}`)
    .join(' | ');
}

function printSection(
  title: string,
  section: DuplicateSection,
  scannedRecords: number,
): void {
  console.log(`${title}: ${section.groupCount}`);
  console.log(
    `  涉及记录: ${section.recordsInGroups}（占扫描记录 ${formatPercent(
      section.recordsInGroups,
      scannedRecords,
    )}）`,
  );
  if (section.examples.length === 0) {
    console.log('  示例: （无）');
    return;
  }
  console.log(`  前 ${section.examples.length} 组示例:`);
  section.examples.forEach((example, index) => {
    console.log(
      `    ${String(index + 1).padStart(2, ' ')}. [${example.sources.join(
        ', ',
      )}] 归一化名「${example.normalizedName}」· ${example.recordCount} 条`,
    );
    console.log(`        示例: ${formatSamples(example)}`);
  });
}

function printReport(report: DuplicateAuditReport): void {
  console.log('营养库同名审计（只读）');
  console.log(`数据库: ${report.database}`);
  console.log('状态过滤: ACTIVE（与候选检索一致）');
  console.log(`L1 来源（登记表）: ${report.sourceTypes.join(', ')}`);
  console.log(
    `实际扫到的 L1 来源: ${report.scannedSourceTypes.join(', ') || '（无）'}`,
  );
  const missingSourceTypes = report.sourceTypes.filter(
    (sourceType) => !report.scannedSourceTypes.includes(sourceType),
  );
  if (missingSourceTypes.length > 0) {
    console.log(
      `⚠ 本地库没有这些 L1 来源的记录: ${missingSourceTypes.join(', ')}`,
    );
  }
  console.log(`扫描记录: ${report.scannedRecords}`);
  console.log(
    `空 / 归一化后为空的词条名: ${report.emptyNameRecords}（不参与同名分组）`,
  );
  console.log('');
  printSection(
    '同库同名组（同一来源 + 同一归一化名）',
    report.sameSource,
    report.scannedRecords,
  );
  console.log('');
  printSection(
    '跨库同名组（同一归一化名出现在 ≥2 个来源）',
    report.crossSource,
    report.scannedRecords,
  );
  console.log('');
  console.log(
    `折叠前后: ${report.collapse.before} → ${report.collapse.after}（折叠掉 ${report.collapse.collapsedAway} 条）`,
  );
  console.log(`折叠后仍带 alsoIn 的候选: ${report.collapse.withAlsoIn}`);
}

/** `--json <path>` 或 `--json=<path>`；没传返回 null。 */
function resolveJsonPath(args: readonly string[]): string | null {
  const inline = args.find((arg) => arg.startsWith('--json='));
  if (inline) {
    const value = inline.slice('--json='.length).trim();
    if (!value) {
      throw new Error(
        '--json 需要文件路径，例如 --json reports/nutrition-duplicates.json',
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
      '--json 需要文件路径，例如 --json reports/nutrition-duplicates.json',
    );
  }
  return value;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。可使用 ENV_FILE=.env.production npm run audit:nutrition-duplicates',
    );
  }

  const jsonPath = resolveJsonPath(process.argv.slice(2));
  // 不在 where 里写 sourceType in [...L1]：本地库若还没应用新的枚举迁移
  // （例如缺 KO_RDA），Postgres 会直接报 22P02。这里先扫 ACTIVE，再在 JS 里
  // 按登记表过滤；实际扫到哪些 L1 来源会写进报告，方便发现「库缺了一整个来源」。
  const records = (
    await prisma.nutritionSourceRecord.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        sourceType: true,
        foodName: true,
      },
      orderBy: [{ sourceType: 'asc' }, { foodName: 'asc' }, { id: 'asc' }],
    })
  ).filter((record) => LOCAL_LIBRARY_SOURCE_TYPES.includes(record.sourceType));

  const report = auditRecords(records);
  printReport(report);

  if (jsonPath) {
    const outputPath = resolve(process.cwd(), jsonPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`JSON 报告已写入: ${outputPath}`);
  }
}

main()
  .catch((error) => {
    console.error('[audit] 营养库同名审计失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
