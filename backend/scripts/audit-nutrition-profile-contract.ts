import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  IngredientType,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
  NUTRITION_PROFILE_FIELD_CONTRACT,
  hasNutritionProfileContractErrors,
  validateNutritionProfileContract,
  type NutritionProfileContractIssue,
  type NutritionProfileContractOptions,
} from '../src/domain/nutrition-governance/nutrition-profile-contract';

type AuditLocation =
  | 'Ingredient.nutritionProfile'
  | 'IngredientNutritionCandidate.normalizedNutrition'
  | 'NutritionSourceRecord.normalizedNutrition'
  | 'NutritionFood.nutritionData';

interface ProfileAuditInput {
  location: AuditLocation;
  recordId: string;
  ingredientId?: string;
  ingredientName?: string;
  ingredientType?: string;
  sourceType?: string;
  sourceKey?: string;
  status?: string;
  profile: unknown;
}

interface ProfileAuditRow {
  location: AuditLocation;
  recordId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientType: string;
  sourceType: string;
  sourceKey: string;
  status: string;
  result: 'PASS' | 'WARN' | 'FAIL';
  errorCount: number;
  warningCount: number;
  issueCodes: string;
  issueDetails: string;
  recommendedAction: string;
}

interface ParsedArgs {
  outputPath: string;
  summaryPath: string;
}

const FOOD_SOURCE_TYPES = new Set<string>([
  'USDA',
  'NZFCD',
  'NEVO',
  'TFDA',
  'CFCT',
]);

const DEFAULT_OUTPUT_PATH = 'reports/nutrition-profile-contract-audit.csv';
const DEFAULT_SUMMARY_PATH = 'reports/nutrition-profile-contract-summary.md';

async function main() {
  loadEnv({ path: process.env.ENV_FILE || '.env' });

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。示例: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen npm run audit:nutrition-profile-contract',
    );
  }

  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const inputs = await collectProfileAuditInputs(prisma);
    const rows = inputs.map(buildProfileAuditRow);
    const csv = profileAuditRowsToCsv(rows);
    const summary = profileAuditRowsToMarkdownSummary(rows);

    await mkdir(dirname(args.outputPath), { recursive: true });
    await mkdir(dirname(args.summaryPath), { recursive: true });
    await writeFile(args.outputPath, `${csv}\n`, 'utf8');
    await writeFile(args.summaryPath, `${summary}\n`, 'utf8');

    const failedCount = rows.filter((row) => row.result === 'FAIL').length;
    const warningCount = rows.filter((row) => row.result === 'WARN').length;
    const passedCount = rows.filter((row) => row.result === 'PASS').length;

    console.log('Nutrition profile contract audit');
    console.log(`扫描记录数: ${rows.length}`);
    console.log(`通过: ${passedCount}`);
    console.log(`警告: ${warningCount}`);
    console.log(`失败: ${failedCount}`);
    console.log(`CSV 报告: ${args.outputPath}`);
    console.log(`摘要报告: ${args.summaryPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function collectProfileAuditInputs(
  prisma: PrismaClient,
): Promise<ProfileAuditInput[]> {
  const inputs: ProfileAuditInput[] = [];

  const ingredients = await prisma.ingredient.findMany({
    where: {
      type: { in: [IngredientType.FOOD, IngredientType.SUPPLEMENT] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      nutritionProfile: true,
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  for (const ingredient of ingredients) {
    inputs.push({
      location: 'Ingredient.nutritionProfile',
      recordId: ingredient.id,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      ingredientType: ingredient.type,
      profile: ingredient.nutritionProfile,
    });
  }

  const candidates = await prisma.ingredientNutritionCandidate.findMany({
    select: {
      id: true,
      status: true,
      normalizedNutrition: true,
      ingredient: {
        select: { id: true, name: true, type: true },
      },
      sourceRecord: {
        select: { sourceType: true, sourceKey: true, foodName: true },
      },
    },
    orderBy: [{ status: 'asc' }, { score: 'desc' }],
  });
  for (const candidate of candidates) {
    inputs.push({
      location: 'IngredientNutritionCandidate.normalizedNutrition',
      recordId: candidate.id,
      ingredientId: candidate.ingredient.id,
      ingredientName: candidate.ingredient.name,
      ingredientType: candidate.ingredient.type,
      sourceType: candidate.sourceRecord.sourceType,
      sourceKey: candidate.sourceRecord.sourceKey,
      status: candidate.status,
      profile: candidate.normalizedNutrition,
    });
  }

  const sourceRecords = await prisma.nutritionSourceRecord.findMany({
    select: {
      id: true,
      sourceType: true,
      sourceKey: true,
      foodName: true,
      status: true,
      normalizedNutrition: true,
    },
    orderBy: [{ sourceType: 'asc' }, { foodName: 'asc' }],
  });
  for (const sourceRecord of sourceRecords) {
    inputs.push({
      location: 'NutritionSourceRecord.normalizedNutrition',
      recordId: sourceRecord.id,
      ingredientName: sourceRecord.foodName,
      sourceType: sourceRecord.sourceType,
      sourceKey: sourceRecord.sourceKey,
      status: sourceRecord.status,
      profile: sourceRecord.normalizedNutrition,
    });
  }

  const nutritionFoods = await prisma.nutritionFood.findMany({
    select: {
      id: true,
      name: true,
      dataSource: true,
      externalId: true,
      status: true,
      nutritionData: true,
    },
    orderBy: [{ dataSource: 'asc' }, { name: 'asc' }],
  });
  for (const nutritionFood of nutritionFoods) {
    inputs.push({
      location: 'NutritionFood.nutritionData',
      recordId: nutritionFood.id,
      ingredientName: nutritionFood.name,
      sourceType: nutritionFood.dataSource,
      sourceKey: nutritionFood.externalId ?? '',
      status: nutritionFood.status,
      profile: nutritionFood.nutritionData,
    });
  }

  return inputs;
}

function buildProfileAuditRow(input: ProfileAuditInput): ProfileAuditRow {
  const issues = validateNutritionProfileContract(
    input.profile,
    getContractOptions(input),
  );
  const errorCount = issues.filter(
    (issue) => issue.severity === 'ERROR',
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === 'WARNING',
  ).length;
  const result = errorCount > 0 ? 'FAIL' : warningCount > 0 ? 'WARN' : 'PASS';

  return {
    location: input.location,
    recordId: input.recordId,
    ingredientId: input.ingredientId ?? '',
    ingredientName: input.ingredientName ?? '',
    ingredientType: input.ingredientType ?? '',
    sourceType: input.sourceType ?? '',
    sourceKey: input.sourceKey ?? '',
    status: input.status ?? '',
    result,
    errorCount,
    warningCount,
    issueCodes: formatIssueCodes(issues),
    issueDetails: formatIssueDetails(issues),
    recommendedAction: getRecommendedAction(issues),
  };
}

function getContractOptions(
  input: ProfileAuditInput,
): NutritionProfileContractOptions {
  const isFoodIngredient = input.ingredientType === IngredientType.FOOD;
  const isFoodSource =
    input.sourceType &&
    FOOD_SOURCE_TYPES.has(input.sourceType);

  if (isFoodIngredient || isFoodSource) {
    return {
      requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
      allowedRawBasisTypes: ['PER_100_G'],
      requireSourceMeta: input.location !== 'Ingredient.nutritionProfile',
    };
  }

  return {};
}

export function getRecommendedAction(
  issues: readonly NutritionProfileContractIssue[],
): string {
  const codes = new Set(issues.map((issue) => issue.code));
  if (codes.has('MISSING_CONVERSION_EVIDENCE'))
    return '补充原始来源形式和单位换算说明后再确认';

  if (!hasNutritionProfileContractErrors(issues)) {
    return '可用于后续确认流程';
  }

  if (codes.has('MISSING_PROFILE')) return '补充或导入营养档案';
  if (codes.has('LEGACY_PROFILE'))
    return '先迁移旧 items[] 结构到 NutritionProfileV2';
  if (codes.has('RAW_SOURCE_FIELD_LEAK'))
    return '修正来源映射，禁止原始字段直写';
  if (codes.has('MISSING_REQUIRED_FIELD')) return '补齐食材确认关键字段';
  if (codes.has('INVALID_RAW_BASIS')) return '统一换算到 PER_100_G as-fed';
  if (codes.has('MISSING_SOURCE_META')) return '补齐来源元数据';
  return '人工复核并修正结构';
}

function formatIssueCodes(
  issues: readonly NutritionProfileContractIssue[],
): string {
  return Array.from(new Set(issues.map((issue) => issue.code))).join('; ');
}

function formatIssueDetails(
  issues: readonly NutritionProfileContractIssue[],
): string {
  return issues
    .map((issue) => `${issue.severity}:${issue.code}:${issue.fieldPath}`)
    .join(' | ');
}

function profileAuditRowsToCsv(rows: ProfileAuditRow[]): string {
  const headers: Array<{
    label: string;
    value: (row: ProfileAuditRow) => string | number;
  }> = [
    { label: '存储位置', value: (row) => row.location },
    { label: '记录ID', value: (row) => row.recordId },
    { label: '原料ID', value: (row) => row.ingredientId },
    { label: '原料名称', value: (row) => row.ingredientName },
    { label: '原料类型', value: (row) => row.ingredientType },
    { label: '来源类型', value: (row) => row.sourceType },
    { label: '来源Key', value: (row) => row.sourceKey },
    { label: '状态', value: (row) => row.status },
    { label: '结果', value: (row) => row.result },
    { label: '错误数', value: (row) => row.errorCount },
    { label: '警告数', value: (row) => row.warningCount },
    { label: '问题代码', value: (row) => row.issueCodes },
    { label: '问题详情', value: (row) => row.issueDetails },
    { label: '建议动作', value: (row) => row.recommendedAction },
  ];

  return [
    headers.map((header) => csvEscape(header.label)).join(','),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(header.value(row))).join(','),
    ),
  ].join('\n');
}

function profileAuditRowsToMarkdownSummary(rows: ProfileAuditRow[]): string {
  const byLocation = countBy(rows, (row) => row.location);
  const byResult = countBy(rows, (row) => row.result);
  const byIssueCode = countIssueCodes(rows);
  const failedRows = rows.filter((row) => row.result === 'FAIL');

  return [
    '# 营养档案结构与入库标准审计',
    '',
    `生成时间: ${new Date().toISOString()}`,
    '',
    '## 内部入库标准',
    '',
    '- `Ingredient.nutritionProfile`、`IngredientNutritionCandidate.normalizedNutrition`、`NutritionSourceRecord.normalizedNutrition`、`NutritionFood.nutritionData` 均应使用 `NutritionProfileV2`。',
    '- 食材确认数据使用 `meta.rawBasisType = PER_100_G`，即每 100g 可食部原样 as-fed。',
    '- 宏量营养素单位来自字段定义：能量 kcal/100g，水分/蛋白/脂肪/碳水/纤维 g/100g。',
    '- 矿物质按字段定义保存：多数为 mg/100g，硒和碘为 ug/100g。',
    '- 脂肪酸和氨基酸按字段定义保存；其中 EPA/DPA/DHA 当前字段定义为 mg/100g，其余脂肪酸和氨基酸多为 g/100g。',
    '- AAFCO/FEDIAF/NRC 不作为原料入库结构；它们应在配方合规层由 `NutritionProfileV2` 换算得到。',
    '',
    '## 食材确认前硬性字段',
    '',
    FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS.map((field) => `- ${field}`).join(
      '\n',
    ),
    '',
    '## 当前数据库审计汇总',
    '',
    `- 扫描记录数: ${rows.length}`,
    `- PASS: ${byResult.PASS ?? 0}`,
    `- WARN: ${byResult.WARN ?? 0}`,
    `- FAIL: ${byResult.FAIL ?? 0}`,
    '',
    '### 按存储位置',
    '',
    formatCountTable(byLocation),
    '',
    '### 按问题代码',
    '',
    formatCountTable(byIssueCode),
    '',
    '## 失败样例',
    '',
    formatFailedRows(failedRows),
    '',
    '## 字段与单位契约',
    '',
    '| 字段 | 中文名 | 单位 | 入库基准 |',
    '|---|---:|---:|---|',
    ...NUTRITION_PROFILE_FIELD_CONTRACT.map(
      (field) =>
        `| ${field.fieldPath} | ${field.label} | ${field.unit} | ${field.basis} |`,
    ),
  ].join('\n');
}

function countBy<T>(
  rows: readonly T[],
  getKey: (row: T) => string,
): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = getKey(row) || 'UNKNOWN';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function countIssueCodes(
  rows: readonly ProfileAuditRow[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const code of row.issueCodes.split('; ').filter(Boolean)) {
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  return counts;
}

function formatCountTable(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((left, right) => {
    return right[1] - left[1] || left[0].localeCompare(right[0]);
  });
  if (entries.length === 0) return '无';

  return [
    '| 项目 | 数量 |',
    '|---|---:|',
    ...entries.map(([key, value]) => `| ${key} | ${value} |`),
  ].join('\n');
}

function formatFailedRows(rows: readonly ProfileAuditRow[]): string {
  if (rows.length === 0) return '无失败记录。';

  return [
    '| 存储位置 | 名称 | 来源 | 问题 | 建议 |',
    '|---|---|---|---|---|',
    ...rows
      .slice(0, 20)
      .map(
        (row) =>
          `| ${row.location} | ${row.ingredientName || row.recordId} | ${
            row.sourceType || row.sourceKey || ''
          } | ${row.issueCodes} | ${row.recommendedAction} |`,
      ),
  ].join('\n');
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function parseArgs(argv: string[]): ParsedArgs {
  const outputPath =
    getArgValue(argv, '--out') ||
    process.env.NUTRITION_PROFILE_CONTRACT_AUDIT_REPORT ||
    DEFAULT_OUTPUT_PATH;
  const summaryPath =
    getArgValue(argv, '--summary-out') ||
    process.env.NUTRITION_PROFILE_CONTRACT_AUDIT_SUMMARY ||
    DEFAULT_SUMMARY_PATH;

  return {
    outputPath: resolve(process.cwd(), outputPath),
    summaryPath: resolve(process.cwd(), summaryPath),
  };
}

function getArgValue(argv: string[], name: string): string | null {
  const equalsArg = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) {
    return equalsArg.slice(name.length + 1);
  }

  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : null;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[nutrition-profile-contract] Audit failed:', error);
    process.exitCode = 1;
  });
}
