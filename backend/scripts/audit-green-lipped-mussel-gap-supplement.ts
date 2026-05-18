import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { mkdir } from 'fs/promises';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { USDA_NUTRIENT_MAP } from '../src/domain/nutrition-governance/usda-nutrient-map';
import {
  buildGreenLippedMusselSupplementPlan,
  GREEN_LIPPED_MUSSEL_SUPPLEMENT_TARGET_FIELDS,
  type GreenLippedMusselProfileSnapshot,
  type SupplementalSourceSnapshot,
} from '../src/domain/nutrition-governance/green-lipped-mussel-gap-supplement';

loadEnv();
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

const prisma = new PrismaClient();
const DEFAULT_USDA_DATA_DIR =
  '/Users/zhaochen/Documents/petrecipedesigner/data/downloads/usda';
const DEFAULT_CNF_DIR = '/tmp/cnf/extract';
const DEFAULT_OUTPUT_MD =
  '../docs/reports/2026-05-18-green-lipped-mussel-gap-supplement.md';
const DEFAULT_OUTPUT_CSV = 'reports/green-lipped-mussel-gap-supplement.csv';

interface Args {
  ingredientName: string;
  usdaDataDir: string;
  cnfDir: string;
  outputMd: string;
  outputCsv: string;
}

interface CsvFoodRow extends CsvRow {
  fdc_id: string;
  description: string;
}

interface CsvNutrientRow extends CsvRow {
  id: string;
  name: string;
  unit_name: string;
}

interface CsvFoodNutrientRow extends CsvRow {
  fdc_id: string;
  nutrient_id: string;
  amount: string;
}

type CsvRow = Record<string, string>;

const USDA_MUSSEL_FOODS = [
  {
    fdcId: '174216',
    stateLabel: '生',
    sourceKey: 'USDA:174216',
    compatibility: 'APPROXIMATE_SPECIES' as const,
    scientificName: 'Blue mussel; not Perna canaliculus',
  },
  {
    fdcId: '174217',
    stateLabel: '熟',
    sourceKey: 'USDA:174217',
    compatibility: 'APPROXIMATE_SPECIES' as const,
    scientificName: 'Blue mussel; not Perna canaliculus',
  },
] as const;

const CNF_MUSSEL_FOODS = [
  {
    foodId: '3115',
    stateLabel: '生',
    sourceKey: 'CNF:3115',
    compatibility: 'APPROXIMATE_SPECIES' as const,
  },
  {
    foodId: '3116',
    stateLabel: '熟',
    sourceKey: 'CNF:3116',
    compatibility: 'APPROXIMATE_SPECIES' as const,
  },
] as const;

const CNF_NUTRIENT_TO_FIELD: Record<string, string> = {
  PANT: 'vitamins.vitaminB5',
  CHOLN: 'vitamins.choline',
  TRP: 'aminoAcids.tryptophan',
  THR: 'aminoAcids.threonine',
  ISO: 'aminoAcids.isoleucine',
  LEU: 'aminoAcids.leucine',
  LYS: 'aminoAcids.lysine',
  MET: 'aminoAcids.methionine',
  CYS: 'aminoAcids.cystine',
  PHE: 'aminoAcids.phenylalanine',
  TYR: 'aminoAcids.tyrosine',
  VAL: 'aminoAcids.valine',
  ARG: 'aminoAcids.arginine',
  HIS: 'aminoAcids.histidine',
  GLU: 'aminoAcids.glutamicAcid',
  GLY: 'aminoAcids.glycine',
  PRO: 'aminoAcids.proline',
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    ingredientName: getArgValue(args, '--ingredient') ?? '青口贝',
    usdaDataDir: getArgValue(args, '--usda-data-dir') ?? DEFAULT_USDA_DATA_DIR,
    cnfDir: getArgValue(args, '--cnf-dir') ?? DEFAULT_CNF_DIR,
    outputMd: getArgValue(args, '--output-md') ?? DEFAULT_OUTPUT_MD,
    outputCsv: getArgValue(args, '--output-csv') ?? DEFAULT_OUTPUT_CSV,
  };
}

function getArgValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

async function main() {
  const args = parseArgs();
  const profiles = await loadGreenLippedMusselProfiles(args.ingredientName);
  const sources = [
    ...(await loadUsdaBlueMusselSources(args.usdaDataDir)),
    ...(await loadCnfBlueMusselSources(args.cnfDir)),
  ];
  const plan = buildGreenLippedMusselSupplementPlan({
    profiles,
    supplementalSources: sources,
  });

  await writeReportFiles({
    args,
    profiles,
    sources,
    plan,
  });

  console.log('Green-lipped mussel gap supplement audit');
  console.log(`- profiles: ${profiles.length}`);
  console.log(`- supplementalSources: ${sources.length}`);
  console.log(`- missingFieldRows: ${plan.summary.missingFieldCount}`);
  console.log(
    `- approximateCandidates: ${plan.summary.approximateCandidateCount}`,
  );
  console.log(`- unresolved: ${plan.summary.unresolvedCount}`);
  console.log(`- markdown: ${resolve(args.outputMd)}`);
  console.log(`- csv: ${resolve(args.outputCsv)}`);
}

async function loadGreenLippedMusselProfiles(
  ingredientName: string,
): Promise<GreenLippedMusselProfileSnapshot[]> {
  const ingredient = await prisma.ingredient.findFirst({
    where: { name: ingredientName },
    select: {
      id: true,
      name: true,
      nutritionFoodMappings: {
        where: {
          nutritionFood: {
            dataSource: 'NZFCD',
          },
        },
        include: {
          nutritionFood: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!ingredient) {
    throw new Error(`未找到标准原料：${ingredientName}`);
  }

  return ingredient.nutritionFoodMappings.map((mapping) => {
    const profile = mapping.nutritionFood.nutritionData as Record<
      string,
      unknown
    >;
    return {
      profileId: mapping.nutritionFood.externalId ?? mapping.nutritionFood.name,
      role: mapping.isPrimary ? 'PRIMARY' : 'SECONDARY',
      stateLabel:
        mapping.nutritionFood.preparationStateLabel ??
        mapping.nutritionFood.preparationState ??
        '待确认',
      foodName: mapping.nutritionFood.name,
      values: readTargetFieldValues(profile),
    };
  });
}

async function loadUsdaBlueMusselSources(
  usdaDataDir: string,
): Promise<SupplementalSourceSnapshot[]> {
  const foodPath = resolve(usdaDataDir, 'food.csv');
  const nutrientPath = resolve(usdaDataDir, 'nutrient.csv');
  const foodNutrientPath = resolve(usdaDataDir, 'food_nutrient.csv');
  if (
    !existsSync(foodPath) ||
    !existsSync(nutrientPath) ||
    !existsSync(foodNutrientPath)
  ) {
    return [];
  }

  const foods = await readCsv<CsvFoodRow>(foodPath);
  const nutrients = await readCsv<CsvNutrientRow>(nutrientPath);
  const foodNutrients = await readCsv<CsvFoodNutrientRow>(foodNutrientPath);
  const foodById = new Map(foods.map((food) => [food.fdc_id, food]));
  const nutrientById = new Map(
    nutrients.map((nutrient) => [nutrient.id, nutrient]),
  );
  const usdaMappingByNutrientId = new Map(
    USDA_NUTRIENT_MAP.map((mapping) => [String(mapping.nutrientId), mapping]),
  );

  return USDA_MUSSEL_FOODS.map((target) => {
    const values: Record<string, number> = {};
    for (const row of foodNutrients.filter(
      (item) => item.fdc_id === target.fdcId,
    )) {
      const mapping = usdaMappingByNutrientId.get(row.nutrient_id);
      const amount = Number(row.amount);
      if (!mapping || !Number.isFinite(amount)) continue;
      if (
        !GREEN_LIPPED_MUSSEL_SUPPLEMENT_TARGET_FIELDS.some(
          (field) => field.fieldPath === mapping.fieldPath,
        )
      ) {
        continue;
      }
      values[mapping.fieldPath] = amount * (mapping.amountMultiplier ?? 1);
    }

    const food = foodById.get(target.fdcId);
    const nutrientCount = Object.keys(values).length;
    return {
      sourceKey: target.sourceKey,
      sourceType: 'USDA',
      foodName: food?.description ?? target.sourceKey,
      scientificName: target.scientificName,
      stateLabel: target.stateLabel,
      compatibility: target.compatibility,
      values,
      sourceNote: `${nutrientCount} mapped target nutrient values from local USDA FoodData Central download.`,
    };
  });
}

async function loadCnfBlueMusselSources(
  cnfDir: string,
): Promise<SupplementalSourceSnapshot[]> {
  const foodPath = resolve(cnfDir, 'FOOD NAME.csv');
  const nutrientPath = resolve(cnfDir, 'NUTRIENT NAME.csv');
  const amountPath = resolve(cnfDir, 'NUTRIENT AMOUNT.csv');
  if (
    !existsSync(foodPath) ||
    !existsSync(nutrientPath) ||
    !existsSync(amountPath)
  ) {
    return [];
  }

  const foods = await readCsv<Record<string, string>>(foodPath);
  const nutrients = await readCsv<Record<string, string>>(nutrientPath);
  const amounts = await readCsv<Record<string, string>>(amountPath);
  const foodById = new Map(foods.map((food) => [food.FoodID, food]));
  const nutrientById = new Map(
    nutrients.map((nutrient) => [nutrient.NutrientID, nutrient]),
  );

  return CNF_MUSSEL_FOODS.map((target) => {
    const values: Record<string, number> = {};
    for (const row of amounts.filter((item) => item.FoodID === target.foodId)) {
      const nutrient = nutrientById.get(row.NutrientID);
      const fieldPath = nutrient
        ? CNF_NUTRIENT_TO_FIELD[nutrient.NutrientSymbol]
        : null;
      const amount = Number(row.NutrientValue);
      if (!fieldPath || !Number.isFinite(amount)) continue;
      values[fieldPath] = amount;
    }

    const food = foodById.get(target.foodId);
    return {
      sourceKey: target.sourceKey,
      sourceType: 'CNF',
      foodName: food?.FoodDescription ?? target.sourceKey,
      scientificName:
        food?.ScientificName || 'Blue mussel; not Perna canaliculus',
      stateLabel: target.stateLabel,
      compatibility: target.compatibility,
      values,
      sourceNote:
        'CNF 2015 blue mussel row; useful as an official cross-check, not same-species green-lipped mussel data.',
    };
  });
}

function readTargetFieldValues(
  profile: Record<string, unknown>,
): Record<string, number | null> {
  return Object.fromEntries(
    GREEN_LIPPED_MUSSEL_SUPPLEMENT_TARGET_FIELDS.map((field) => [
      field.fieldPath,
      readFieldPath(profile, field.fieldPath),
    ]),
  );
}

function readFieldPath(input: unknown, fieldPath: string): number | null {
  const value = fieldPath.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    return (current as Record<string, unknown>)[segment];
  }, input);

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function writeReportFiles(params: {
  args: Args;
  profiles: GreenLippedMusselProfileSnapshot[];
  sources: SupplementalSourceSnapshot[];
  plan: ReturnType<typeof buildGreenLippedMusselSupplementPlan>;
}) {
  const csvRows = [
    [
      'profileId',
      'role',
      'stateLabel',
      'fieldPath',
      'label',
      'unit',
      'recommendedAction',
      'bestSourceKey',
      'bestSourceType',
      'bestSourceFoodName',
      'bestSourceScientificName',
      'bestSourceValue',
      'compatibility',
      'reason',
    ],
    ...params.plan.rows.map((row) => [
      row.profileId,
      row.role,
      row.stateLabel,
      row.fieldPath,
      row.label,
      row.unit,
      row.recommendedAction,
      row.bestSourceKey ?? '',
      row.bestSourceType ?? '',
      row.bestSourceFoodName ?? '',
      row.bestSourceScientificName ?? '',
      row.bestSourceValue?.toString() ?? '',
      row.compatibility ?? '',
      row.reason,
    ]),
  ];

  const markdown = buildMarkdownReport(params);
  await mkdir(dirname(resolve(params.args.outputCsv)), { recursive: true });
  await mkdir(dirname(resolve(params.args.outputMd)), { recursive: true });
  await writeFile(resolve(params.args.outputCsv), stringifyCsv(csvRows));
  await writeFile(resolve(params.args.outputMd), markdown);
}

function buildMarkdownReport(params: {
  args: Args;
  profiles: GreenLippedMusselProfileSnapshot[];
  sources: SupplementalSourceSnapshot[];
  plan: ReturnType<typeof buildGreenLippedMusselSupplementPlan>;
}): string {
  const { plan } = params;
  const byAction = (action: string) =>
    plan.rows.filter((row) => row.recommendedAction === action);

  return [
    '# 青口贝缺失营养字段补源第一轮',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 结论',
    '',
    `- 同物种可直接补入候选：${plan.summary.directCandidateCount} 条`,
    `- 近似物种候选：${plan.summary.approximateCandidateCount} 条`,
    `- 仅参考来源：${plan.summary.referenceOnlyCount} 条`,
    `- 暂无可信原始值：${plan.summary.unresolvedCount} 条`,
    '',
    '本轮没有找到可直接补入青口贝 NZFCD 主/次档案的同物种缺失字段原始值。USDA 与 CNF 能补到维生素 B5、胆碱（仅生）、以及多数氨基酸，但对象是 blue mussel / common mussel，不是 Perna canaliculus，只能作为近似物种补源候选。',
    '',
    '## 当前 NZFCD 档案',
    '',
    '| 档案 | 角色 | 状态 | 食物名 |',
    '| --- | --- | --- | --- |',
    ...params.profiles.map(
      (profile) =>
        `| ${profile.profileId} | ${profile.role} | ${profile.stateLabel} | ${profile.foodName} |`,
    ),
    '',
    '## 近似物种候选',
    '',
    '| 档案 | 字段 | 候选来源 | 值 | 单位 | 说明 |',
    '| --- | --- | --- | ---: | --- | --- |',
    ...byAction('REVIEW_APPROXIMATE_SOURCE').map(
      (row) =>
        `| ${row.profileId} | ${row.label} (${row.fieldPath}) | ${row.bestSourceKey} / ${row.bestSourceFoodName} | ${row.bestSourceValue ?? ''} | ${row.unit} | ${row.reason} |`,
    ),
    '',
    '## 仍缺来源',
    '',
    '| 档案 | 字段 | 说明 |',
    '| --- | --- | --- |',
    ...byAction('NO_TRUSTED_SOURCE_FOUND').map(
      (row) =>
        `| ${row.profileId} | ${row.label} (${row.fieldPath}) | ${row.reason} |`,
    ),
    '',
    '## 来源判断',
    '',
    '- NZFCD T1024/T1026：同物种青口贝主来源，但不包含氯、B5、B7、胆碱、完整氨基酸谱。B1 是原始值 0，不是缺失。',
    '- USDA 174216/174217：官方食品成分库，blue mussel raw/cooked，可作为近似物种候选，不自动并入。',
    '- CNF 3115/3116：加拿大官方食品成分库，blue mussel raw/boiled-or-steamed；与 USDA 高度一致，更适合作为交叉核对，不是独立的青口贝同物种来源。',
    '- 产品粉、提取物、供应商页面：加工状态不同，只可作为 SKU/补剂或产品 COA 参考，不建议补入鲜/熟食材档案。',
    '',
    '## 建议',
    '',
    '1. 不自动把 USDA/CNF 的 blue mussel 数据写入青口贝主档案。',
    '2. 如果配方设计短期需要完整氨基酸谱，可以新增“近似物种补源”审核入口，由你确认后仅对缺失字段生效。',
    '3. 氯、B7、熟制胆碱、牛磺酸建议暂不补；后续优先找实验室检测、供应商 COA，或同物种 Perna canaliculus 原始研究数据。',
    '',
    '## 外部依据',
    '',
    '- NZFCD FOODfiles 2024：官方说明 2024 版包含 2,857 种食品，标准版 87 个组件，完整版最多 434 个组件，但并非每个食物都有所有组件。',
    '- USDA FoodData Central：本地下载数据中的 174216 / 174217。',
    '- Canadian Nutrient File 2015：官方 CSV 下载数据中的 3115 / 3116。',
    '',
  ].join('\n');
}

async function readCsv<T extends CsvRow>(path: string): Promise<T[]> {
  const content = await readFile(path, 'utf8');
  const lines = content.trim().split(/\r?\n/u);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    ) as T;
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
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
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function stringifyCsv(rows: string[][]): string {
  return `${rows
    .map((row) =>
      row
        .map((value) => {
          if (/[",\n\r]/u.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(','),
    )
    .join('\n')}\n`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
