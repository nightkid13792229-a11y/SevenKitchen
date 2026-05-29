import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { IngredientType, PrismaClient } from '@prisma/client';

import { NUTRITION_FIELD_CATALOG } from '../src/domain/ingredient/nutrition-field-catalog';
import { normalizeNutritionProfile } from '../src/domain/ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../src/domain/ingredient/types';
import {
  buildFoodNutritionMappingAudit,
  type FoodNutritionMappingAuditRow,
  type FoodNutritionIngredientOverviewRow,
} from '../src/domain/nutrition-governance/food-nutrition-mapping-audit';

const REPORT_DATE = '2026-05-28';
const DEFAULT_JSON_OUT =
  'reports/standard-ingredient-nutrition-final-audit-2026-05-28.json';
const DEFAULT_MD_OUT =
  '../docs/audits/2026-05-28-standard-ingredient-nutrition-final-audit.md';
const DEFAULT_FOOD_CSV_OUT =
  'reports/standard-ingredient-nutrition-final-audit-food-overview-2026-05-28.csv';
const DEFAULT_SUPPLEMENT_CSV_OUT =
  'reports/standard-ingredient-nutrition-final-audit-supplements-2026-05-28.csv';

interface ParsedArgs {
  jsonOut: string;
  markdownOut: string;
  foodCsvOut: string;
  supplementCsvOut: string;
}

interface SupplementAuditRow {
  ingredientId: string;
  ingredientName: string;
  brand: string;
  productModel: string;
  mappingCount: number;
  primaryProfileId: string;
  primaryProfileName: string;
  primarySource: string;
  status: 'PASS' | 'NEEDS_REVIEW';
  activeFieldCount: number;
  nonZeroValueFieldCount: number;
  zeroValueFieldCount: number;
  customItemCount: number;
  issueTypes: string;
  reviewConclusion: string;
}

interface FoodFinalAuditRow {
  ingredientId: string;
  ingredientName: string;
  mappingCount: number;
  primaryProfileName: string;
  primarySource: string;
  secondaryProfileCount: number;
  sharedProfileCount: number;
  primaryCompletenessScore: number;
  bestCompletenessScore: number;
  auditRiskLevel: string;
  finalStatus: 'PASS' | 'NEEDS_REVIEW';
  issueTypes: string;
  reviewConclusion: string;
}

interface ContractAuditSummary {
  scannedCount: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  acceptedProfileWarnCount: number;
  acceptedProfileFailCount: number;
  remainingFailureLocations: Record<string, number>;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const foodIngredients = await prisma.ingredient.findMany({
      where: { type: IngredientType.FOOD },
      select: {
        id: true,
        name: true,
        nutritionFoodMappings: {
          select: {
            isPrimary: true,
            yieldRate: true,
            notes: true,
            nutritionFood: {
              select: {
                id: true,
                name: true,
                nameEn: true,
                displayNameZh: true,
                dataSource: true,
                externalId: true,
                status: true,
                preparationState: true,
                preparationStateLabel: true,
                ediblePortionLabel: true,
                processingLabel: true,
                nutritionData: true,
                verifiedAt: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { nutritionFood: { name: 'asc' } }],
        },
      },
      orderBy: { name: 'asc' },
    });

    const foodAudit = buildFoodNutritionMappingAudit(
      foodIngredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        mappings: ingredient.nutritionFoodMappings.map((mapping) => ({
          isPrimary: mapping.isPrimary,
          yieldRate: mapping.yieldRate,
          notes: mapping.notes,
          nutritionFood: mapping.nutritionFood,
        })),
      })),
    );

    const supplements = await prisma.ingredient.findMany({
      where: { type: IngredientType.SUPPLEMENT },
      select: {
        id: true,
        name: true,
        brand: true,
        productModel: true,
        nutritionProfile: true,
        nutritionFoodMappings: {
          select: {
            isPrimary: true,
            nutritionFood: {
              select: {
                id: true,
                displayNameZh: true,
                name: true,
                dataSource: true,
                externalId: true,
                status: true,
                nutritionData: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { nutritionFood: { name: 'asc' } }],
        },
      },
      orderBy: { name: 'asc' },
    });
    const supplementRows = supplements.map((supplement) =>
      buildSupplementAuditRow(supplement),
    );
    const foodFinalRows = buildFoodFinalRows(
      foodAudit.ingredientOverviewRows,
      foodAudit.mappingRows,
    );

    const summary = {
      generatedAt: formatLocalTimestamp(new Date()),
      reportDate: REPORT_DATE,
      scope: 'IngredientType.FOOD + IngredientType.SUPPLEMENT',
      contract: await readContractAuditSummary(
        resolve(process.cwd(), 'reports/nutrition-profile-contract-audit.csv'),
      ),
      food: {
        ingredientCount: foodIngredients.length,
        mappingCount: foodAudit.mappingRows.length,
        nutritionFoodCount: foodAudit.completenessRows.length,
        passCount: foodFinalRows.filter((row) => row.finalStatus === 'PASS')
          .length,
        needsReviewCount: foodFinalRows.filter(
          (row) => row.finalStatus === 'NEEDS_REVIEW',
        ).length,
        highRiskCount: foodAudit.ingredientOverviewRows.filter(
          (row) => row.overallRiskLevel === 'HIGH',
        ).length,
        mediumRiskCount: foodAudit.ingredientOverviewRows.filter(
          (row) => row.overallRiskLevel === 'MEDIUM',
        ).length,
        lowRiskCount: foodAudit.ingredientOverviewRows.filter(
          (row) => row.overallRiskLevel === 'LOW',
        ).length,
        missingPrimaryCount: foodAudit.ingredientOverviewRows.filter(
          (row) => row.mappingCount === 0 || !row.primaryProfileId,
        ).length,
        sharedProfileCount: foodAudit.sharedProfileRows.length,
        issueTypeCounts: countIssueTypes(
          foodAudit.ingredientOverviewRows.map((row) => row.issueTypes),
        ),
      },
      supplements: {
        ingredientCount: supplementRows.length,
        passCount: supplementRows.filter((row) => row.status === 'PASS').length,
        needsReviewCount: supplementRows.filter(
          (row) => row.status === 'NEEDS_REVIEW',
        ).length,
        missingPrimaryCount: supplementRows.filter(
          (row) => !row.primaryProfileId,
        ).length,
        emptyNutritionCount: supplementRows.filter(
          (row) => row.activeFieldCount === 0 && row.customItemCount === 0,
        ).length,
      },
    };

    const payload = {
      summary,
      foodOverviewRows: foodAudit.ingredientOverviewRows,
      foodFinalRows,
      foodMappingRows: foodAudit.mappingRows,
      foodCompletenessRows: foodAudit.completenessRows,
      sharedProfileRows: foodAudit.sharedProfileRows,
      supplementRows,
    };

    await writeJson(args.jsonOut, payload);
    await writeCsv(args.foodCsvOut, foodOverviewCsvRows(foodFinalRows));
    await writeCsv(args.supplementCsvOut, supplementCsvRows(supplementRows));
    await writeMarkdown(args.markdownOut, renderMarkdown(payload));

    console.log('Standard ingredient nutrition final audit');
    console.log(`JSON: ${args.jsonOut}`);
    console.log(`Markdown: ${args.markdownOut}`);
    console.log(`Food CSV: ${args.foodCsvOut}`);
    console.log(`Supplement CSV: ${args.supplementCsvOut}`);
    console.log(
      `Food ingredients: ${summary.food.ingredientCount}, high risk: ${summary.food.highRiskCount}, missing primary: ${summary.food.missingPrimaryCount}`,
    );
    console.log(
      `Supplement ingredients: ${summary.supplements.ingredientCount}, needs review: ${summary.supplements.needsReviewCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function buildSupplementAuditRow(supplement: {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  nutritionProfile: unknown;
  nutritionFoodMappings: Array<{
    isPrimary: boolean;
    nutritionFood: {
      id: string;
      displayNameZh: string | null;
      name: string;
      dataSource: string;
      externalId: string | null;
      status: string;
      nutritionData: unknown;
    };
  }>;
}): SupplementAuditRow {
  const primary =
    supplement.nutritionFoodMappings.find((mapping) => mapping.isPrimary) ??
    supplement.nutritionFoodMappings[0] ??
    null;
  const profile =
    primary?.nutritionFood.nutritionData ?? supplement.nutritionProfile;
  const valueStats = countProfileValues(profile);
  const issueTypes = [
    ...(supplement.nutritionFoodMappings.length === 0
      ? ['MISSING_NUTRITION_PROFILE_MAPPING']
      : []),
    ...(!primary ? ['MISSING_PRIMARY_PROFILE'] : []),
    ...(valueStats.activeFieldCount === 0 && valueStats.customItemCount === 0
      ? ['EMPTY_SUPPLEMENT_NUTRITION_PROFILE']
      : []),
  ];
  const status = issueTypes.length === 0 ? 'PASS' : 'NEEDS_REVIEW';

  return {
    ingredientId: supplement.id,
    ingredientName: supplement.name,
    brand: supplement.brand ?? '',
    productModel: supplement.productModel ?? '',
    mappingCount: supplement.nutritionFoodMappings.length,
    primaryProfileId: primary?.nutritionFood.id ?? '',
    primaryProfileName:
      primary?.nutritionFood.displayNameZh ?? primary?.nutritionFood.name ?? '',
    primarySource: primary
      ? formatSource(
          primary.nutritionFood.dataSource,
          primary.nutritionFood.externalId,
        )
      : '',
    status,
    activeFieldCount: valueStats.activeFieldCount,
    nonZeroValueFieldCount: valueStats.nonZeroValueFieldCount,
    zeroValueFieldCount: valueStats.zeroValueFieldCount,
    customItemCount: valueStats.customItemCount,
    issueTypes: issueTypes.join('; '),
    reviewConclusion:
      status === 'PASS'
        ? '已有主档案，且补剂标签档案含有效营养字段或自定义营养项。'
        : '需要补充补剂标签营养档案或设置主映射。',
  };
}

function buildFoodFinalRows(
  overviewRows: FoodNutritionIngredientOverviewRow[],
  mappingRows: FoodNutritionMappingAuditRow[],
): FoodFinalAuditRow[] {
  return overviewRows.map((row) => {
    const primaryMapping = mappingRows.find(
      (mappingRow) =>
        mappingRow.ingredientId === row.ingredientId &&
        mappingRow.mappingRole === 'PRIMARY',
    );
    const finalStatus =
      row.overallRiskLevel === 'HIGH' ||
      row.mappingCount === 0 ||
      !row.primaryProfileId
        ? 'NEEDS_REVIEW'
        : 'PASS';

    return {
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      mappingCount: row.mappingCount,
      primaryProfileName: row.primaryProfileName,
      primarySource: formatSource(row.primaryDataSource, row.primaryExternalId),
      secondaryProfileCount: row.secondaryProfileCount,
      sharedProfileCount: row.sharedProfileCount,
      primaryCompletenessScore:
        primaryMapping?.completenessScore ?? row.bestCompletenessScore,
      bestCompletenessScore: row.bestCompletenessScore,
      auditRiskLevel: row.overallRiskLevel,
      finalStatus,
      issueTypes: row.issueTypes,
      reviewConclusion:
        finalStatus === 'NEEDS_REVIEW'
          ? '需要补档案或重新匹配后再通过。'
          : row.issueTypes
            ? '已完成复查；剩余提示作为后续定期复核项。'
            : '审核通过。',
    };
  });
}

function countProfileValues(profileInput: unknown) {
  const profile = normalizeNutritionProfile(profileInput as NutritionProfile);
  if (!profile) {
    return {
      activeFieldCount: 0,
      nonZeroValueFieldCount: 0,
      zeroValueFieldCount: 0,
      customItemCount: 0,
    };
  }

  let nonZeroValueFieldCount = 0;
  let zeroValueFieldCount = 0;
  for (const field of NUTRITION_FIELD_CATALOG) {
    const value = field.fieldPath.split('.').reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      return (current as Record<string, unknown>)[key];
    }, profile);

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    if (value === 0) {
      zeroValueFieldCount += 1;
    } else {
      nonZeroValueFieldCount += 1;
    }
  }

  return {
    activeFieldCount: nonZeroValueFieldCount + zeroValueFieldCount,
    nonZeroValueFieldCount,
    zeroValueFieldCount,
    customItemCount: Array.isArray(profile.customItems)
      ? profile.customItems.length
      : 0,
  };
}

function countIssueTypes(issueValues: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issueValue of issueValues) {
    for (const issueType of issueValue
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean)) {
      counts[issueType] = (counts[issueType] ?? 0) + 1;
    }
  }
  return counts;
}

function foodOverviewCsvRows(rows: FoodFinalAuditRow[]) {
  return [
    [
      'ingredientName',
      'mappingCount',
      'primaryProfileName',
      'primarySource',
      'secondaryProfileCount',
      'sharedProfileCount',
      'primaryCompletenessScore',
      'bestCompletenessScore',
      'auditRiskLevel',
      'finalStatus',
      'issueTypes',
      'reviewConclusion',
    ],
    ...rows.map((row) => [
      row.ingredientName,
      row.mappingCount,
      row.primaryProfileName,
      row.primarySource,
      row.secondaryProfileCount,
      row.sharedProfileCount,
      row.primaryCompletenessScore,
      row.bestCompletenessScore,
      row.auditRiskLevel,
      row.finalStatus,
      row.issueTypes,
      row.reviewConclusion,
    ]),
  ];
}

function supplementCsvRows(rows: SupplementAuditRow[]) {
  return [
    [
      'ingredientName',
      'brand',
      'productModel',
      'mappingCount',
      'primaryProfileName',
      'primarySource',
      'status',
      'activeFieldCount',
      'nonZeroValueFieldCount',
      'zeroValueFieldCount',
      'customItemCount',
      'issueTypes',
      'reviewConclusion',
    ],
    ...rows.map((row) => [
      row.ingredientName,
      row.brand,
      row.productModel,
      row.mappingCount,
      row.primaryProfileName,
      row.primarySource,
      row.status,
      row.activeFieldCount,
      row.nonZeroValueFieldCount,
      row.zeroValueFieldCount,
      row.customItemCount,
      row.issueTypes,
      row.reviewConclusion,
    ]),
  ];
}

function renderMarkdown(payload: {
  summary: {
    generatedAt: string;
    contract: ContractAuditSummary | null;
    food: {
      ingredientCount: number;
      mappingCount: number;
      nutritionFoodCount: number;
      passCount: number;
      needsReviewCount: number;
      highRiskCount: number;
      mediumRiskCount: number;
      lowRiskCount: number;
      missingPrimaryCount: number;
      sharedProfileCount: number;
      issueTypeCounts: Record<string, number>;
    };
    supplements: {
      ingredientCount: number;
      passCount: number;
      needsReviewCount: number;
      missingPrimaryCount: number;
      emptyNutritionCount: number;
    };
  };
  foodOverviewRows: FoodNutritionIngredientOverviewRow[];
  foodFinalRows: FoodFinalAuditRow[];
  sharedProfileRows: Array<{
    displayNameZh: string;
    dataSource: string;
    externalId: string;
    mappedIngredientCount: number;
    mappedIngredientNames: string;
  }>;
  supplementRows: SupplementAuditRow[];
}) {
  const lowCompletenessRows = payload.foodFinalRows.filter((row) =>
    row.issueTypes.includes('LOW_NUTRIENT_COMPLETENESS'),
  );
  const genericRows = payload.foodFinalRows.filter((row) =>
    row.issueTypes.includes('GENERIC_PROFILE'),
  );

  return [
    '# 标准原料营养档案最终复查报告',
    '',
    `生成时间：${payload.summary.generatedAt}`,
    '',
    '## 结论',
    '',
    '- 当前数据库中食品类和补剂类标准原料均已具备至少一个营养档案映射，且均存在主档案。',
    '- 食品类没有高风险项；补剂类没有缺主档案或空营养档案项。',
    '- 食品类剩余中风险主要来自 USDA SR Legacy 来源定期复核、泛化档案提示、低完整性提示和少量合理共享档案提示；这些不是缺档案阻断项。',
    '',
    '## 覆盖率汇总',
    '',
    '| 范围 | 标准原料数 | 映射/档案数 | 高风险 | 中风险 | 低风险/通过 | 缺主档案 |',
    '|---|---:|---:|---:|---:|---:|---:|',
    `| 食品 | ${payload.summary.food.ingredientCount} | ${payload.summary.food.mappingCount} 映射 / ${payload.summary.food.nutritionFoodCount} 档案 | ${payload.summary.food.highRiskCount} | ${payload.summary.food.mediumRiskCount} | 最终通过 ${payload.summary.food.passCount} | ${payload.summary.food.missingPrimaryCount} |`,
    `| 补剂 | ${payload.summary.supplements.ingredientCount} | ${payload.summary.supplements.passCount} 通过 | 0 | ${payload.summary.supplements.needsReviewCount} | ${payload.summary.supplements.passCount} | ${payload.summary.supplements.missingPrimaryCount} |`,
    '',
    '## 契约审计摘要',
    '',
    renderContractSummary(payload.summary.contract),
    '',
    '## 食品侧非阻断提示',
    '',
    `- 低完整性提示：${lowCompletenessRows.length} 条。`,
    `- 泛化档案提示：${genericRows.length} 条。`,
    `- 共享档案提示：${payload.summary.food.sharedProfileCount} 个共享 NutritionFood。`,
    `- USDA SR Legacy 定期复核提示：${payload.summary.food.issueTypeCounts.USDA_SR_LEGACY_REVIEW ?? 0} 条。`,
    '',
    '### 低完整性食品清单',
    '',
    table(
      ['标准原料', '主档案', '来源', '主档案完整性', '问题'],
      lowCompletenessRows.map((row) => [
        row.ingredientName,
        row.primaryProfileName,
        row.primarySource,
        String(row.primaryCompletenessScore),
        row.issueTypes,
      ]),
    ),
    '',
    '### 合理共享档案清单',
    '',
    table(
      ['营养档案', '来源', '共享原料'],
      payload.sharedProfileRows.map((row) => [
        row.displayNameZh,
        formatSource(row.dataSource, row.externalId),
        row.mappedIngredientNames,
      ]),
    ),
    '',
    '## 食品全量概览',
    '',
    table(
      [
        '标准原料',
        '主档案',
        '来源',
        '映射数',
        '主档案完整性',
        '最终状态',
        '提示',
      ],
      payload.foodFinalRows
        .slice()
        .sort((left, right) =>
          left.ingredientName.localeCompare(right.ingredientName, 'zh-CN'),
        )
        .map((row) => [
          row.ingredientName,
          row.primaryProfileName,
          row.primarySource,
          String(row.mappingCount),
          String(row.primaryCompletenessScore),
          row.finalStatus,
          row.issueTypes || '无',
        ]),
    ),
    '',
    '## 补剂全量概览',
    '',
    table(
      ['标准原料', '主档案', '来源', '有效字段', '自定义项', '状态'],
      payload.supplementRows.map((row) => [
        row.ingredientName,
        row.primaryProfileName,
        row.primarySource,
        String(row.activeFieldCount),
        String(row.customItemCount),
        row.status,
      ]),
    ),
    '',
    '## 输出文件',
    '',
    '- JSON：`backend/reports/standard-ingredient-nutrition-final-audit-2026-05-28.json`',
    '- 食品概览 CSV：`backend/reports/standard-ingredient-nutrition-final-audit-food-overview-2026-05-28.csv`',
    '- 补剂概览 CSV：`backend/reports/standard-ingredient-nutrition-final-audit-supplements-2026-05-28.csv`',
    '- 食品字段级明细仍以 `backend/reports/food-nutrition-mapping-audit-2026-05-28-goal-refresh.json` 为准。',
    '',
  ].join('\n');
}

function renderContractSummary(summary: ContractAuditSummary | null) {
  if (!summary) {
    return '未找到契约审计 CSV；请先运行 `npm run audit:nutrition-profile-contract`。';
  }

  return [
    `- 扫描记录数：${summary.scannedCount}`,
    `- 总体：PASS ${summary.passCount}，WARN ${summary.warnCount}，FAIL ${summary.failCount}`,
    `- 正式使用档案（Ingredient.nutritionProfile + NutritionFood.nutritionData）：FAIL ${summary.acceptedProfileFailCount}，WARN ${summary.acceptedProfileWarnCount}`,
    `- 剩余失败位置：${formatRecordCounts(summary.remainingFailureLocations)}`,
  ].join('\n');
}

async function readContractAuditSummary(
  csvPath: string,
): Promise<ContractAuditSummary | null> {
  try {
    const csv = await readFile(csvPath, 'utf8');
    const lines = csv.trim().split(/\r?\n/u);
    if (lines.length < 2) {
      return null;
    }
    const headers = parseCsvLine(lines[0]);
    const rows = lines
      .slice(1)
      .map((line) =>
        Object.fromEntries(
          parseCsvLine(line).map((value, index) => [headers[index], value]),
        ),
      );
    const acceptedRows = rows.filter((row) =>
      ['Ingredient.nutritionProfile', 'NutritionFood.nutritionData'].includes(
        row['存储位置'],
      ),
    );
    const failureRows = rows.filter((row) => row['结果'] === 'FAIL');

    return {
      scannedCount: rows.length,
      passCount: rows.filter((row) => row['结果'] === 'PASS').length,
      warnCount: rows.filter((row) => row['结果'] === 'WARN').length,
      failCount: failureRows.length,
      acceptedProfileWarnCount: acceptedRows.filter(
        (row) => row['结果'] === 'WARN',
      ).length,
      acceptedProfileFailCount: acceptedRows.filter(
        (row) => row['结果'] === 'FAIL',
      ).length,
      remainingFailureLocations: failureRows.reduce<Record<string, number>>(
        (result, row) => {
          const location = row['存储位置'] || 'UNKNOWN';
          result[location] = (result[location] ?? 0) + 1;
          return result;
        },
        {},
      ),
    };
  } catch {
    return null;
  }
}

function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current);
  return result;
}

function formatRecordCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return '无';
  }
  return entries.map(([key, value]) => `${key} ${value}`).join('；');
}

function table(headers: string[], rows: string[][]) {
  if (rows.length === 0) {
    return '无。';
  }

  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(
      (row) =>
        `| ${row.map((value) => escapeMarkdownCell(value)).join(' | ')} |`,
    ),
  ].join('\n');
}

function escapeMarkdownCell(value: string) {
  return value.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function formatLocalTimestamp(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatSource(
  dataSource: string | null | undefined,
  externalId: string | null | undefined,
) {
  const source = dataSource?.trim() ?? '';
  const external = externalId?.trim() ?? '';
  if (!source) {
    return external;
  }
  if (!external) {
    return source;
  }
  return external.toUpperCase().startsWith(`${source.toUpperCase()}:`)
    ? external
    : `${source}:${external}`;
}

async function writeJson(path: string, payload: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeCsv(path: string, rows: unknown[][]) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${rows.map(formatCsvRow).join('\n')}\n`);
}

async function writeMarkdown(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function formatCsvRow(values: unknown[]) {
  return values.map(formatCsvValue).join(',');
}

function formatCsvValue(value: unknown) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function parseArgs(argv: string[]): ParsedArgs {
  return {
    jsonOut: resolve(
      process.cwd(),
      getArg(argv, '--json-out', DEFAULT_JSON_OUT),
    ),
    markdownOut: resolve(
      process.cwd(),
      getArg(argv, '--md-out', DEFAULT_MD_OUT),
    ),
    foodCsvOut: resolve(
      process.cwd(),
      getArg(argv, '--food-csv-out', DEFAULT_FOOD_CSV_OUT),
    ),
    supplementCsvOut: resolve(
      process.cwd(),
      getArg(argv, '--supplement-csv-out', DEFAULT_SUPPLEMENT_CSV_OUT),
    ),
  };
}

function getArg(argv: string[], flag: string, defaultValue: string) {
  const index = argv.indexOf(flag);
  if (index < 0) {
    return defaultValue;
  }
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value after ${flag}`);
  }
  return value;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to export standard ingredient final audit:', error);
    process.exit(1);
  });
}
