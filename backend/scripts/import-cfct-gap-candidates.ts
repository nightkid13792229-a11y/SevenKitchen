import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import {
  NutritionCandidateStatus,
  NutritionGovernanceSourceType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import {
  mapCfctRowToSourceInput,
  validateReviewedCfctRows,
  type ReviewedCfctRow,
} from '../prisma/import-cfct-private-source';
import {
  buildNutritionSourceKey,
  classifyMatchConfidence,
  getSourcePriority,
} from '../src/domain/nutrition-governance/nutrition-governance.utils';
import type { NutritionMatchReason } from '../src/domain/nutrition-governance/nutrition-governance.types';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const DEFAULT_LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';
const DEFAULT_CFCT_FULL_PATH = 'reports/cfct-full/cfct-v6-full-structured.json';
const DEFAULT_REPORT_CSV = 'reports/cfct-gap-supplement-round1.csv';
const DEFAULT_IMPORT_JSON = 'reports/cfct-gap-supplement-round1-auto-ready.json';
const DEFAULT_MARKDOWN = '../docs/reports/2026-05-18-cfct-gap-supplement-round1.md';

type CandidateMappingRole = 'PRIMARY' | 'SECONDARY';

interface CfctGapTarget {
  ingredientName: string;
  gapType: 'NO_PRIMARY_PROFILE' | 'MISSING_COOKED_PROFILE' | 'STATE_VARIANT';
  aliases: string[];
  rejectPatterns: RegExp[];
  autoImport: boolean;
  targetState: string | null;
  mappingRole: CandidateMappingRole;
  preparationState: string | null;
  preparationStateLabel: string | null;
  ediblePortionLabel: string | null;
  processingLabel: string | null;
  note: string;
}

export interface CfctGapStructuredRow extends ReviewedCfctRow {
  qualityFlags?: string[];
  reviewStatus?: string | null;
}

export interface CfctGapTargetPlan {
  target: CfctGapTarget;
  ingredientName: string;
  autoImportRows: CfctGapStructuredRow[];
  needsReviewRows: CfctGapStructuredRow[];
  rejectedRows: CfctGapStructuredRow[];
}

export interface CfctGapSupplementPlan {
  targets: CfctGapTargetPlan[];
  autoImportRows: Array<{
    target: CfctGapTarget;
    row: CfctGapStructuredRow;
  }>;
}

interface ImportArgs {
  apply: boolean;
  cfctFullPath: string;
  reportCsv: string;
  importJson: string;
  markdown: string;
}

interface ImportResult {
  sourceRecordsImported: number;
  candidatesCreatedOrUpdated: number;
  candidatesSkippedTerminal: number;
}

const TARGETS: CfctGapTarget[] = [
  {
    ingredientName: '青口贝',
    gapType: 'NO_PRIMARY_PROFILE',
    aliases: ['青口贝', '绿唇贻贝', '翡翠贻贝', '贻贝', '淡菜'],
    rejectPatterns: [],
    autoImport: false,
    targetState: '生/鲜',
    mappingRole: 'PRIMARY',
    preparationState: 'RAW',
    preparationStateLabel: '生',
    ediblePortionLabel: '标准可食部',
    processingLabel: '未加工',
    note:
      'CFCT 可先复核贻贝/翡翠贻贝；青口贝默认绿唇贻贝，未人工确认前不自动入库。',
  },
  {
    ingredientName: '沙丁鱼',
    gapType: 'NO_PRIMARY_PROFILE',
    aliases: ['沙丁鱼'],
    rejectPatterns: [/茄汁|盐水|油浸|罐/u],
    autoImport: false,
    targetState: '生/鲜',
    mappingRole: 'PRIMARY',
    preparationState: 'RAW',
    preparationStateLabel: '生',
    ediblePortionLabel: '标准可食部',
    processingLabel: '未加工',
    note: '只接受鲜/生沙丁鱼作为默认主档案；茄汁、盐水、油浸应作为单独加工档案。',
  },
  {
    ingredientName: '鸭心',
    gapType: 'NO_PRIMARY_PROFILE',
    aliases: ['鸭心'],
    rejectPatterns: [],
    autoImport: false,
    targetState: '生/鲜',
    mappingRole: 'PRIMARY',
    preparationState: 'RAW',
    preparationStateLabel: '生',
    ediblePortionLabel: '标准可食部',
    processingLabel: '未加工',
    note: 'CFCT 有鸭心行，但 OCR 质量标记要求人工复核后才能导入。',
  },
  {
    ingredientName: '鸭胗',
    gapType: 'NO_PRIMARY_PROFILE',
    aliases: ['鸭胗', '鸭肫'],
    rejectPatterns: [/公麻鸭|母麻鸭|滕鸭|勝鸭|腾鸭/u],
    autoImport: false,
    targetState: '生/鲜',
    mappingRole: 'PRIMARY',
    preparationState: 'RAW',
    preparationStateLabel: '生',
    ediblePortionLabel: '标准可食部',
    processingLabel: '未加工',
    note: '优先复核通用鸭肫；具体品种行不作为默认主档案。',
  },
  {
    ingredientName: '薏仁米',
    gapType: 'NO_PRIMARY_PROFILE',
    aliases: ['薏仁米', '薏米', '苡米', '薏苡仁'],
    rejectPatterns: [/面|米粉|营养米/u],
    autoImport: true,
    targetState: '干/生',
    mappingRole: 'PRIMARY',
    preparationState: 'DRIED',
    preparationStateLabel: '干',
    ediblePortionLabel: '标准可食部',
    processingLabel: '未加工',
    note: 'CFCT 自动结构化队列中有明确薏米［薏仁米,苡米］行，可生成待审候选。',
  },
  {
    ingredientName: '鹌鹑蛋',
    gapType: 'MISSING_COOKED_PROFILE',
    aliases: ['鹌鹑蛋'],
    rejectPatterns: [/五香|罐/u],
    autoImport: false,
    targetState: '熟',
    mappingRole: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '整体',
    processingLabel: '熟制',
    note: 'CFCT 未发现普通熟鹌鹑蛋；五香罐头不作为默认熟档案。',
  },
  {
    ingredientName: '豆腐',
    gapType: 'MISSING_COOKED_PROFILE',
    aliases: ['豆腐'],
    rejectPatterns: [/干|丝|皮|卷|油|卤|酱|臭|香|蒲包|花|脑|粉/u],
    autoImport: false,
    targetState: '熟',
    mappingRole: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '标准可食部',
    processingLabel: '熟制',
    note: 'CFCT 中豆腐多为具体豆制品类型；普通熟豆腐未直接出现，不硬补。',
  },
  {
    ingredientName: '鹅肝',
    gapType: 'MISSING_COOKED_PROFILE',
    aliases: ['鹅肝'],
    rejectPatterns: [],
    autoImport: false,
    targetState: '熟',
    mappingRole: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '标准可食部',
    processingLabel: '熟制',
    note: 'CFCT 有鹅肝来源行但不是熟制行；不作为熟档案补充。',
  },
  {
    ingredientName: '鸭蛋',
    gapType: 'MISSING_COOKED_PROFILE',
    aliases: ['鸭蛋'],
    rejectPatterns: [/咸|松花|皮蛋|茶色|黄|海/u],
    autoImport: false,
    targetState: '熟',
    mappingRole: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '整体',
    processingLabel: '熟制',
    note: 'CFCT 中有咸鸭蛋、松花蛋等加工项；普通熟鸭蛋未直接出现。',
  },
  {
    ingredientName: '鸭肝',
    gapType: 'MISSING_COOKED_PROFILE',
    aliases: ['鸭肝'],
    rejectPatterns: [/公麻鸭|母麻鸭/u],
    autoImport: false,
    targetState: '熟',
    mappingRole: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '标准可食部',
    processingLabel: '熟制',
    note: 'CFCT 有鸭肝来源行但不是熟制行；不作为熟档案补充。',
  },
  {
    ingredientName: '鸭胸',
    gapType: 'MISSING_COOKED_PROFILE',
    aliases: ['鸭胸', '鸭胸脯肉'],
    rejectPatterns: [/滕鸭|勝鸭|腾鸭/u],
    autoImport: false,
    targetState: '熟',
    mappingRole: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '标准可食部',
    processingLabel: '熟制',
    note: 'CFCT 有鸭胸脯肉来源行但不是熟制行；不作为熟档案补充。',
  },
  {
    ingredientName: '羊肚菌（鲜）',
    gapType: 'MISSING_COOKED_PROFILE',
    aliases: ['羊肚菌'],
    rejectPatterns: [/干/u],
    autoImport: false,
    targetState: '熟',
    mappingRole: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '标准可食部',
    processingLabel: '熟制',
    note: 'CFCT 当前只命中干羊肚菌，不作为鲜羊肚菌熟档案。',
  },
  {
    ingredientName: '金针菇',
    gapType: 'STATE_VARIANT',
    aliases: ['金针菇'],
    rejectPatterns: [/罐/u],
    autoImport: false,
    targetState: '熟',
    mappingRole: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '标准可食部',
    processingLabel: '熟制',
    note: 'CFCT 自动队列中有鲜金针菇和罐装金针菇；没有普通熟制金针菇。',
  },
  {
    ingredientName: '舞茸',
    gapType: 'STATE_VARIANT',
    aliases: ['舞茸', '灰树花'],
    rejectPatterns: [],
    autoImport: false,
    targetState: '熟',
    mappingRole: 'SECONDARY',
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    ediblePortionLabel: '标准可食部',
    processingLabel: '熟制',
    note: 'CFCT 当前未命中舞茸/灰树花。',
  },
  {
    ingredientName: '黑木耳',
    gapType: 'STATE_VARIANT',
    aliases: ['黑木耳', '木耳（水发）', '木耳（干）'],
    rejectPatterns: [/木耳菜|软浆菜|银耳|白木耳|海木耳|裙带菜|猴头菇/u],
    autoImport: false,
    targetState: '水发',
    mappingRole: 'SECONDARY',
    preparationState: 'SOAKED',
    preparationStateLabel: '水发',
    ediblePortionLabel: '标准可食部',
    processingLabel: '水发',
    note: '黑木耳标准原料按鲜木耳处理；CFCT 水发木耳可后续人工复核为次级档案。',
  },
];

export function buildCfctGapSupplementPlan(
  rows: CfctGapStructuredRow[],
  targets: CfctGapTarget[] = TARGETS,
): CfctGapSupplementPlan {
  const targetPlans = targets.map((target) => {
    const matchedRows = rows.filter((row) => rowMatchesTarget(row, target));
    const rejectedRows = rows.filter(
      (row) => rowMatchesAliases(row, target) && isRejectedByTarget(row, target),
    );
    const autoImportRows = target.autoImport
      ? matchedRows.filter(isAutoReadyRow).slice(0, 1)
      : [];
    const needsReviewRows = matchedRows
      .filter((row) => !isAutoReadyRow(row))
      .slice(0, 6);

    return {
      target,
      ingredientName: target.ingredientName,
      autoImportRows,
      needsReviewRows,
      rejectedRows: rejectedRows.slice(0, 8),
    };
  });

  return {
    targets: targetPlans,
    autoImportRows: targetPlans.flatMap((targetPlan) =>
      targetPlan.autoImportRows.map((row) => ({
        target: targetPlan.target,
        row,
      })),
    ),
  };
}

export async function runCfctGapCandidateImport({
  prisma,
  args,
}: {
  prisma: PrismaClient;
  args: ImportArgs;
}): Promise<ImportResult> {
  const rows = await readCfctRows(args.cfctFullPath);
  const plan = buildCfctGapSupplementPlan(rows);
  const importRows = dedupeRows(plan.autoImportRows.map((item) => item.row));

  await writeJson(args.importJson, { rows: importRows });
  await writeCsvReport(args.reportCsv, plan);
  await writeMarkdownReport(args.markdown, plan);

  const result: ImportResult = {
    sourceRecordsImported: 0,
    candidatesCreatedOrUpdated: 0,
    candidatesSkippedTerminal: 0,
  };

  if (!args.apply || plan.autoImportRows.length === 0) {
    return result;
  }

  validateReviewedCfctRows(importRows);

  for (const item of plan.autoImportRows) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { name: item.target.ingredientName, type: 'FOOD' },
      select: { id: true, name: true, type: true },
    });
    if (!ingredient) continue;

    const sourceRecord = await upsertCfctSourceRecord(prisma, item.row);
    result.sourceRecordsImported += 1;
    const candidateResult = await upsertCfctCandidate({
      prisma,
      ingredientId: ingredient.id,
      sourceRecord,
      target: item.target,
    });
    if (candidateResult === 'SKIPPED_TERMINAL') {
      result.candidatesSkippedTerminal += 1;
    } else {
      result.candidatesCreatedOrUpdated += 1;
    }
  }

  return result;
}

async function upsertCfctSourceRecord(
  prisma: PrismaClient,
  row: CfctGapStructuredRow,
) {
  const input = mapCfctRowToSourceInput(row);
  const sourceKey = buildNutritionSourceKey(input.sourceType, input.externalId);

  return prisma.nutritionSourceRecord.upsert({
    where: {
      sourceType_sourceKey: {
        sourceType: input.sourceType,
        sourceKey,
      },
    },
    create: {
      sourceType: input.sourceType,
      sourceKey,
      sourceTitle: input.sourceTitle,
      sourceDetail: toNullableJsonInput(input.sourceDetail),
      foodName: input.foodName,
      foodNameEn: input.foodNameEn ?? null,
      dataType: input.dataType ?? null,
      category: input.category ?? null,
      rawData: toJsonInput(input.rawData),
      normalizedNutrition: toNullableJsonInput(input.normalizedNutrition),
      status: 'ACTIVE',
    },
    update: {
      sourceTitle: input.sourceTitle,
      sourceDetail: toNullableJsonInput(input.sourceDetail),
      foodName: input.foodName,
      foodNameEn: input.foodNameEn ?? null,
      dataType: input.dataType ?? null,
      category: input.category ?? null,
      rawData: toJsonInput(input.rawData),
      normalizedNutrition: toNullableJsonInput(input.normalizedNutrition),
      status: 'ACTIVE',
    },
  });
}

async function upsertCfctCandidate({
  prisma,
  ingredientId,
  sourceRecord,
  target,
}: {
  prisma: PrismaClient;
  ingredientId: string;
  sourceRecord: {
    id: string;
    sourceType: NutritionGovernanceSourceType;
    normalizedNutrition: Prisma.JsonValue | null;
  };
  target: CfctGapTarget;
}): Promise<'UPSERTED' | 'SKIPPED_TERMINAL'> {
  if (!sourceRecord.normalizedNutrition) {
    return 'SKIPPED_TERMINAL';
  }

  const where = {
    ingredientId_sourceRecordId: {
      ingredientId,
      sourceRecordId: sourceRecord.id,
    },
  };
  const existing = await prisma.ingredientNutritionCandidate.findUnique({
    where,
    select: { status: true },
  });
  const terminalStatuses: NutritionCandidateStatus[] = [
    NutritionCandidateStatus.CONFIRMED,
    NutritionCandidateStatus.REJECTED,
    NutritionCandidateStatus.SKIPPED,
  ];
  if (existing && terminalStatuses.includes(existing.status)) {
    return 'SKIPPED_TERMINAL';
  }

  const score = 0.9;
  const matchReasons: NutritionMatchReason[] = [
    {
      code: 'NAME_PARTIAL',
      label: 'CFCT 中文名称/别名匹配缺失档案',
      scoreDelta: 0.75,
    },
    {
      code: 'SOURCE_PRIORITY',
      label: 'USDA 不可用时采用 CFCT 原始数据库来源',
      scoreDelta: 0.15,
    },
  ];

  await prisma.ingredientNutritionCandidate.upsert({
    where,
    create: {
      ingredientId,
      sourceRecordId: sourceRecord.id,
      sourcePriority: getSourcePriority(sourceRecord.sourceType),
      confidence: classifyMatchConfidence(score),
      score,
      matchReasons: toJsonInput(matchReasons),
      normalizedNutrition: toJsonInput(sourceRecord.normalizedNutrition),
      status: NutritionCandidateStatus.CANDIDATE,
      preparationState: target.preparationState,
      preparationStateLabel: target.preparationStateLabel,
      ediblePortionLabel: target.ediblePortionLabel,
      processingLabel: target.processingLabel,
      reviewNote: `CFCT 第一轮缺口补档：${target.note}`,
    },
    update: {
      sourcePriority: getSourcePriority(sourceRecord.sourceType),
      confidence: classifyMatchConfidence(score),
      score,
      matchReasons: toJsonInput(matchReasons),
      normalizedNutrition: toJsonInput(sourceRecord.normalizedNutrition),
      status: NutritionCandidateStatus.CANDIDATE,
      preparationState: target.preparationState,
      preparationStateLabel: target.preparationStateLabel,
      ediblePortionLabel: target.ediblePortionLabel,
      processingLabel: target.processingLabel,
      reviewNote: `CFCT 第一轮缺口补档：${target.note}`,
    },
  });

  return 'UPSERTED';
}

function rowMatchesTarget(row: CfctGapStructuredRow, target: CfctGapTarget) {
  return rowMatchesAliases(row, target) && !isRejectedByTarget(row, target);
}

function rowMatchesAliases(row: CfctGapStructuredRow, target: CfctGapTarget) {
  const foodName = row.foodName ?? '';
  return target.aliases.some((alias) => foodName.includes(alias));
}

function isRejectedByTarget(row: CfctGapStructuredRow, target: CfctGapTarget) {
  const foodName = row.foodName ?? '';
  return target.rejectPatterns.some((pattern) => pattern.test(foodName));
}

function isAutoReadyRow(row: CfctGapStructuredRow) {
  return (
    row.reviewStatus !== 'NEEDS_REVIEW' &&
    (!Array.isArray(row.qualityFlags) || row.qualityFlags.length === 0)
  );
}

async function readCfctRows(path: string): Promise<CfctGapStructuredRow[]> {
  const payload = JSON.parse(await readFile(resolve(path), 'utf8')) as {
    rows?: CfctGapStructuredRow[];
  };
  return Array.isArray(payload.rows) ? payload.rows : [];
}

function dedupeRows(rows: CfctGapStructuredRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.volume}|${row.page}|${row.row}|${row.foodName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function writeJson(path: string, value: unknown) {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeCsvReport(path: string, plan: CfctGapSupplementPlan) {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  const header = [
    'ingredientName',
    'gapType',
    'action',
    'volume',
    'page',
    'row',
    'foodCode',
    'foodName',
    'reviewStatus',
    'qualityFlags',
    'nutrientCount',
    'note',
  ];
  const lines = [header.join(',')];
  for (const target of plan.targets) {
    const rows = [
      ...target.autoImportRows.map((row) => ({ row, action: 'AUTO_CANDIDATE' })),
      ...target.needsReviewRows.map((row) => ({ row, action: 'NEEDS_CFCT_OCR_REVIEW' })),
      ...target.rejectedRows.map((row) => ({ row, action: 'REJECTED_BY_RULE' })),
    ];
    if (rows.length === 0) {
      lines.push(
        [
          target.ingredientName,
          target.target.gapType,
          'NO_CFCT_ROW_FOUND',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '0',
          target.target.note,
        ].map(csvEscape).join(','),
      );
      continue;
    }
    for (const item of rows) {
      lines.push(
        [
          target.ingredientName,
          target.target.gapType,
          item.action,
          item.row.volume,
          item.row.page,
          item.row.row,
          item.row.foodCode ?? '',
          item.row.foodName,
          item.row.reviewStatus ?? '',
          (item.row.qualityFlags ?? []).join('|'),
          String(Object.keys(item.row.nutrients ?? {}).length),
          target.target.note,
        ].map(csvEscape).join(','),
      );
    }
  }
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

async function writeMarkdownReport(path: string, plan: CfctGapSupplementPlan) {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  const autoRows = plan.targets.flatMap((target) =>
    target.autoImportRows.map((row) => ({ target, row })),
  );
  const reviewRows = plan.targets.flatMap((target) =>
    target.needsReviewRows.map((row) => ({ target, row })),
  );
  const noRows = plan.targets.filter(
    (target) =>
      target.autoImportRows.length === 0 &&
      target.needsReviewRows.length === 0 &&
      target.rejectedRows.length === 0,
  );

  const content = [
    '# CFCT 第一轮缺口补档',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 已生成待审候选',
    '',
    ...formatMarkdownTable(autoRows, 'AUTO_CANDIDATE'),
    '',
    '## 需要人工 OCR 复核后再入库',
    '',
    ...formatMarkdownTable(reviewRows, 'NEEDS_CFCT_OCR_REVIEW'),
    '',
    '## 本轮未找到可用 CFCT 行',
    '',
    ...(noRows.length
      ? noRows.map((target) => `- ${target.ingredientName}：${target.target.note}`)
      : ['- 无']),
    '',
    '## 原则',
    '',
    '- 只使用 CFCT 原始行数据，不使用 calculated 档案。',
    '- 带 OCR 质量标记或 `NEEDS_REVIEW` 的行只进入复核清单，不自动入库。',
    '- 加工品、罐头、盐渍、油浸、具体品种行不作为默认主档案，除非后续明确需要对应加工状态。',
    '',
  ].join('\n');
  await writeFile(outputPath, content, 'utf8');
}

function formatMarkdownTable(
  rows: Array<{ target: CfctGapTargetPlan; row: CfctGapStructuredRow }>,
  action: string,
): string[] {
  if (rows.length === 0) return ['暂无。'];
  return [
    '| 原料 | 动作 | CFCT 行 | 食物名称 | 质量标记 | 说明 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.slice(0, 80).map(({ target, row }) =>
      [
        target.ingredientName,
        action,
        `${row.volume} p${row.page} r${row.row}`,
        row.foodName,
        (row.qualityFlags ?? []).join('；') || '-',
        target.target.note,
      ]
        .map(markdownEscape)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    ),
  ];
}

function parseArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = {
    apply: false,
    cfctFullPath: DEFAULT_CFCT_FULL_PATH,
    reportCsv: DEFAULT_REPORT_CSV,
    importJson: DEFAULT_IMPORT_JSON,
    markdown: DEFAULT_MARKDOWN,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--cfct-full' && next) {
      args.cfctFullPath = next;
      index += 1;
    } else if (arg === '--report-csv' && next) {
      args.reportCsv = next;
      index += 1;
    } else if (arg === '--import-json' && next) {
      args.importJson = next;
      index += 1;
    } else if (arg === '--markdown' && next) {
      args.markdown = next;
      index += 1;
    }
  }
  return args;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }
  return toJsonInput(value);
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function markdownEscape(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\n/gu, ' ');
}

async function main() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const result = await runCfctGapCandidateImport({ prisma, args });
    console.log('CFCT gap supplement round 1');
    console.log(`- apply: ${args.apply ? 'yes' : 'no'}`);
    console.log(`- sourceRecordsImported: ${result.sourceRecordsImported}`);
    console.log(
      `- candidatesCreatedOrUpdated: ${result.candidatesCreatedOrUpdated}`,
    );
    console.log(
      `- candidatesSkippedTerminal: ${result.candidatesSkippedTerminal}`,
    );
    console.log(`- reportCsv: ${resolve(args.reportCsv)}`);
    console.log(`- importJson: ${resolve(args.importJson)}`);
    console.log(`- markdown: ${resolve(args.markdown)}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to import CFCT gap candidates:', error);
    process.exitCode = 1;
  });
}
