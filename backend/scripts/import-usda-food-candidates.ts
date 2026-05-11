import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  IngredientType,
  NutritionCandidateStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import type {
  NutritionMatchReason,
  NutritionSourceInput,
} from '../src/domain/nutrition-governance/nutrition-governance.types';
import { getFoodStateMismatches } from '../src/domain/nutrition-governance/food-state-match';
import {
  buildNutritionSourceKey,
  classifyMatchConfidence,
  getSourcePriority,
  mapUsdaNutrientsToNutritionProfile,
} from '../src/domain/nutrition-governance/nutrition-governance.utils';

const USDA_SOURCE_TITLE = 'USDA FoodData Central';
const USDA_PROVIDER = 'USDA FoodData Central';
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_MAX_RESULTS = 2;
const DEFAULT_DELAY_MS = 250;
const MINIMUM_SELECTED_SCORE = 0.45;

export interface UsdaSearchNutrient {
  nutrientId?: number;
  nutrientName?: string;
  unitName?: string;
  value?: number;
  nutrient?: {
    id?: number;
    name?: string;
    unitName?: string;
  };
  amount?: number;
}

export interface UsdaSearchFood {
  fdcId?: string | number;
  description?: string;
  dataType?: string;
  foodCategory?: string | { description?: string };
  publishedDate?: string;
  foodNutrients?: UsdaSearchNutrient[];
}

export interface SelectedUsdaFood {
  food: UsdaSearchFood;
  score: number;
}

interface FoodIngredientRecord {
  id: string;
  name: string;
}

interface ImportReportRow {
  ingredientId: string;
  ingredientName: string;
  searchTerm: string;
  fdcId: string;
  description: string;
  dataType: string;
  category: string;
  score: number;
  status: string;
}

interface ImportCounters {
  scanned: number;
  sourceRecords: number;
  candidates: number;
  noSearchTerm: number;
  noMatch: number;
  errors: number;
}

interface ParsedArgs {
  apiKey: string;
  apply: boolean;
  limit: number | null;
  maxResults: number;
  pageSize: number;
  delayMs: number;
  outputPath: string;
  sourceJsonPaths: string[];
}

type ImportLogger = Pick<typeof console, 'error' | 'log'>;

const USDA_SEARCH_TERM_ALIASES: ReadonlyArray<{
  names: readonly string[];
  terms: readonly string[];
}> = [
  { names: ['丁香粉'], terms: ['cloves ground'] },
  { names: ['三文鱼', '鲑鱼'], terms: ['salmon raw'] },
  { names: ['上海青', '小白菜'], terms: ['bok choy raw'] },
  { names: ['亚麻籽'], terms: ['flaxseed'] },
  { names: ['亚麻籽油'], terms: ['flaxseed oil'] },
  { names: ['兔里脊'], terms: ['rabbit raw'] },
  { names: ['冬瓜'], terms: ['wax gourd raw'] },
  { names: ['南瓜'], terms: ['pumpkin raw'] },
  { names: ['卷心菜'], terms: ['cabbage raw'] },
  { names: ['口蘑'], terms: ['mushrooms white raw'] },
  { names: ['咖喱粉'], terms: ['curry powder'] },
  { names: ['土豆', '马铃薯'], terms: ['potatoes raw'] },
  { names: ['大米'], terms: ['rice white raw'] },
  { names: ['大豆'], terms: ['soybeans mature seeds raw'] },
  { names: ['奇亚籽'], terms: ['chia seeds dried'] },
  { names: ['姜粉'], terms: ['ginger ground'] },
  { names: ['姜黄粉'], terms: ['turmeric ground'] },
  { names: ['娃娃菜'], terms: ['chinese cabbage raw'] },
  { names: ['小米'], terms: ['millet raw'] },
  { names: ['小麦胚芽油'], terms: ['wheat germ oil'] },
  { names: ['山药'], terms: ['yam raw'] },
  { names: ['巴旦木'], terms: ['almonds'] },
  { names: ['巴西坚果'], terms: ['brazilnuts'] },
  { names: ['木瓜'], terms: ['papaya raw'] },
  { names: ['树莓'], terms: ['raspberries raw'] },
  { names: ['核桃'], terms: ['walnuts'] },
  { names: ['梨'], terms: ['pear raw'] },
  { names: ['橄榄油'], terms: ['olive oil'] },
  { names: ['比目鱼'], terms: ['flatfish raw'] },
  { names: ['沙丁鱼'], terms: ['sardine raw'] },
  { names: ['火鸡胸肉'], terms: ['turkey breast raw'] },
  { names: ['火麻籽'], terms: ['hemp seeds hulled'] },
  { names: ['燕麦'], terms: ['oats raw'] },
  { names: ['牛心'], terms: ['beef heart raw'] },
  { names: ['牛肝'], terms: ['beef liver raw'] },
  { names: ['牛脾'], terms: ['beef spleen raw'] },
  { names: ['牛霖'], terms: ['beef round raw'] },
  { names: ['狭鳕鱼柳'], terms: ['pollock raw'] },
  { names: ['猪心'], terms: ['pork heart raw'] },
  { names: ['猪肝'], terms: ['pork liver raw'] },
  { names: ['猪肾'], terms: ['pork kidney raw'] },
  { names: ['猪里脊'], terms: ['pork tenderloin raw'] },
  { names: ['玉米粒'], terms: ['corn sweet yellow raw'] },
  { names: ['生南瓜籽仁'], terms: ['pumpkin seeds'] },
  { names: ['生菜'], terms: ['lettuce raw'] },
  { names: ['生葵花籽仁'], terms: ['sunflower seed kernels'] },
  { names: ['生蚝'], terms: ['oyster raw'] },
  { names: ['白芝麻'], terms: ['sesame seeds'] },
  { names: ['白萝卜'], terms: ['radishes oriental raw'] },
  { names: ['秋葵'], terms: ['okra raw'] },
  { names: ['糙米'], terms: ['brown rice raw'] },
  { names: ['紫甘蓝'], terms: ['red cabbage raw'] },
  { names: ['紫薯', '红薯'], terms: ['sweet potato raw'] },
  { names: ['红小豆'], terms: ['adzuki beans raw'] },
  { names: ['红甜椒'], terms: ['red sweet pepper raw'] },
  { names: ['绿豆'], terms: ['mung beans raw'] },
  { names: ['绿豆芽'], terms: ['mung beans sprouted raw'] },
  { names: ['罗非鱼'], terms: ['tilapia raw'] },
  { names: ['羊里脊'], terms: ['lamb loin raw'] },
  { names: ['羽衣甘蓝'], terms: ['kale raw'] },
  { names: ['肉桂粉'], terms: ['cinnamon ground'] },
  { names: ['胡萝卜'], terms: ['carrot raw'] },
  { names: ['舞茸'], terms: ['maitake mushrooms raw'] },
  { names: ['芦笋'], terms: ['asparagus raw'] },
  { names: ['花椰菜'], terms: ['cauliflower raw'] },
  { names: ['芹菜', '西芹'], terms: ['celery raw'] },
  { names: ['苹果'], terms: ['apple raw'] },
  { names: ['茄子'], terms: ['eggplant raw'] },
  { names: ['菠菜'], terms: ['spinach raw'] },
  { names: ['菠萝'], terms: ['pineapple raw'] },
  { names: ['葵花籽油'], terms: ['sunflower oil'] },
  { names: ['蓝莓'], terms: ['blueberries raw'] },
  { names: ['薏仁米'], terms: ['pearl barley raw'] },
  { names: ['藜麦'], terms: ['quinoa uncooked'] },
  { names: ['西兰花'], terms: ['broccoli raw'] },
  { names: ['西红柿'], terms: ['tomato raw'] },
  { names: ['西葫芦'], terms: ['zucchini raw'] },
  { names: ['豆腐'], terms: ['tofu raw'] },
  { names: ['豌豆'], terms: ['peas green raw'] },
  { names: ['金针菇'], terms: ['enoki mushrooms raw'] },
  { names: ['青口贝'], terms: ['green lipped mussel raw'] },
  { names: ['青花鱼'], terms: ['mackerel raw'] },
  { names: ['食用盐'], terms: ['salt table'] },
  { names: ['香菇'], terms: ['shiitake mushrooms raw'] },
  { names: ['香菜'], terms: ['coriander leaves raw'] },
  { names: ['香蕉'], terms: ['banana raw'] },
  { names: ['鳕鱼'], terms: ['cod raw'] },
  { names: ['鸡心'], terms: ['chicken heart raw'] },
  { names: ['鸡肝'], terms: ['chicken liver raw'] },
  { names: ['鸡胗'], terms: ['chicken gizzard raw'] },
  { names: ['鸡胸', '鸡胸肉'], terms: ['chicken breast raw'] },
  { names: ['鸡腿肉'], terms: ['chicken thigh raw'] },
  { names: ['鸡蛋'], terms: ['egg whole raw'] },
  { names: ['鸭心'], terms: ['duck heart raw'] },
  { names: ['鸭肝'], terms: ['duck liver raw'] },
  { names: ['鸭胗'], terms: ['duck gizzard raw'] },
  { names: ['鸭胸'], terms: ['duck breast raw'] },
  { names: ['鸭蛋'], terms: ['duck egg'] },
  { names: ['鹅肝'], terms: ['goose liver raw'] },
  { names: ['鹅胸肉'], terms: ['goose meat raw'] },
  { names: ['鹌鹑蛋'], terms: ['quail egg'] },
  { names: ['鹿腿肉'], terms: ['venison raw'] },
  { names: ['黄瓜'], terms: ['cucumber raw'] },
  { names: ['黑木耳'], terms: ['cloud ears'] },
];

const DISTRACTION_TOKENS = [
  'babyfood',
  'breaded',
  'butter',
  'canned',
  'candies',
  'cereals ready to eat',
  'chocolate',
  'cooked',
  'fast foods',
  'fried',
  'lunchmeat',
  'nougat',
  'restaurant',
  'roasted',
  'sauce',
  'salted',
  'soup',
  'tahini',
  'with salt',
  'with almonds',
];

loadEnv({ path: process.env.ENV_FILE || '.env' });

export function getUsdaSearchTerms(ingredientName: string): string[] {
  const normalizedName = normalizeIngredientName(ingredientName);
  const exactMatch = USDA_SEARCH_TERM_ALIASES.find((entry) =>
    entry.names.some(
      (name) => normalizedName === normalizeIngredientName(name),
    ),
  );
  if (exactMatch) {
    return dedupe([...exactMatch.terms]);
  }

  const partialMatch = USDA_SEARCH_TERM_ALIASES.find((entry) =>
    entry.names.some((name) => {
      const alias = normalizeIngredientName(name);
      return alias.length > 1 && normalizedName.includes(alias);
    }),
  );
  if (partialMatch) {
    return dedupe([...partialMatch.terms]);
  }

  return dedupe([normalizedName || ingredientName]);
}

export function mapUsdaSearchFoodToSourceInput({
  food,
  searchTerm,
}: {
  food: UsdaSearchFood;
  searchTerm: string;
}): NutritionSourceInput {
  const externalId = `${food.fdcId ?? ''}`.trim();
  if (!externalId) {
    throw new Error('USDA search food is missing fdcId');
  }

  const description = food.description?.trim() || `USDA ${externalId}`;
  const profile = mapUsdaNutrientsToNutritionProfile(
    (food.foodNutrients ?? []).map((nutrient) => ({
      nutrient: {
        id: nutrient.nutrientId ?? nutrient.nutrient?.id,
        name: nutrient.nutrientName ?? nutrient.nutrient?.name,
        unitName: nutrient.unitName ?? nutrient.nutrient?.unitName,
      },
      amount: nutrient.value ?? nutrient.amount,
    })),
  );
  profile.meta.sourceTitle = USDA_SOURCE_TITLE;
  profile.meta.sourceProvider = USDA_PROVIDER;
  profile.meta.confidenceLevel = 'MEDIUM';
  profile.meta.versionNote = `Imported from USDA search term: ${searchTerm}`;

  return {
    sourceType: 'USDA',
    externalId,
    sourceTitle: USDA_SOURCE_TITLE,
    foodName: description,
    foodNameEn: description,
    dataType: food.dataType ?? null,
    category: getFoodCategoryDescription(food.foodCategory),
    sourceDetail: {
      fdcId: externalId,
      provider: USDA_PROVIDER,
      sourceProvider: USDA_PROVIDER,
      publishedDate: food.publishedDate ?? null,
      searchTerm,
      importMode: 'bulk-usda-food-candidates',
    },
    rawData: food as Record<string, unknown>,
    normalizedNutrition: profile,
  };
}

export function selectUsdaFoodsForIngredient({
  ingredientName,
  searchTerm,
  foods,
  maxResults,
}: {
  ingredientName: string;
  searchTerm: string;
  foods: UsdaSearchFood[];
  maxResults: number;
}): SelectedUsdaFood[] {
  return foods
    .filter(isUsdaSearchFood)
    .map((food) => ({
      food,
      score: scoreUsdaFood({ ingredientName, searchTerm, food }),
    }))
    .filter(
      (item) =>
        item.score >= MINIMUM_SELECTED_SCORE &&
        hasMinimumNutritionCoverage(item.food),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults);
}

export function buildUsdaCandidateMatch({
  searchTerm,
  score,
}: {
  ingredientName: string;
  searchTerm: string;
  foodDescription: string;
  score: number;
}): { score: number; reasons: NutritionMatchReason[] } {
  return {
    score,
    reasons: [
      {
        code: 'SOURCE_PRIORITY',
        label: 'USDA 优先来源',
        scoreDelta: 0.15,
      },
      {
        code: 'NAME_PARTIAL',
        label: `USDA 搜索词匹配: ${searchTerm}`,
        scoreDelta: roundScore(score - 0.15),
      },
    ],
  };
}

export async function runUsdaFoodCandidateImport({
  prisma,
  args,
  logger,
}: {
  prisma: PrismaClient;
  args: ParsedArgs;
  logger: ImportLogger;
}): Promise<ImportCounters> {
  const counters: ImportCounters = {
    scanned: 0,
    sourceRecords: 0,
    candidates: 0,
    noSearchTerm: 0,
    noMatch: 0,
    errors: 0,
  };
  const reportRows: ImportReportRow[] = [];
  const localFoods =
    args.sourceJsonPaths.length > 0
      ? await loadUsdaFoodsFromJsonFiles(args.sourceJsonPaths)
      : null;
  const ingredients = await prisma.ingredient.findMany({
    where: {
      type: IngredientType.FOOD,
      nutritionProfile: { equals: Prisma.AnyNull },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    ...(args.limit !== null ? { take: args.limit } : {}),
  });

  logger.log(
    args.apply
      ? 'Applying USDA food candidate import...'
      : 'Dry run: USDA food candidate import...',
  );
  logger.log(`Food ingredients to scan: ${ingredients.length}`);
  if (localFoods) {
    logger.log(`USDA local source foods loaded: ${localFoods.length}`);
  }

  for (const ingredient of ingredients) {
    counters.scanned += 1;
    const searchTerm = getUsdaSearchTerms(ingredient.name)[0];
    if (!searchTerm) {
      counters.noSearchTerm += 1;
      reportRows.push(buildReportRow(ingredient, '', null, 'NO_SEARCH_TERM'));
      continue;
    }

    try {
      const foods = await fetchUsdaSearchFoods({
        apiKey: args.apiKey,
        query: searchTerm,
        pageSize: args.pageSize,
        localFoods,
      });
      const selectedFoods = selectUsdaFoodsForIngredient({
        ingredientName: ingredient.name,
        searchTerm,
        foods,
        maxResults: args.maxResults,
      });

      if (selectedFoods.length === 0) {
        counters.noMatch += 1;
        reportRows.push(
          buildReportRow(ingredient, searchTerm, null, 'NO_MATCH'),
        );
      }

      for (const selected of selectedFoods) {
        reportRows.push(
          buildReportRow(ingredient, searchTerm, selected, 'CANDIDATE'),
        );
        if (!args.apply) {
          continue;
        }

        const sourceInput = mapUsdaSearchFoodToSourceInput({
          food: selected.food,
          searchTerm,
        });
        const sourceRecord = await upsertNutritionSourceRecord(
          prisma,
          sourceInput,
        );
        counters.sourceRecords += 1;
        const match = buildUsdaCandidateMatch({
          ingredientName: ingredient.name,
          searchTerm,
          foodDescription: selected.food.description ?? '',
          score: selected.score,
        });
        const candidate = await upsertIngredientNutritionCandidate({
          prisma,
          ingredient,
          sourceRecordId: sourceRecord.id,
          sourceType: sourceInput.sourceType,
          normalizedNutrition: sourceInput.normalizedNutrition,
          match,
        });
        if (candidate) {
          counters.candidates += 1;
        }
      }
    } catch (error) {
      counters.errors += 1;
      reportRows.push(
        buildReportRow(
          ingredient,
          searchTerm,
          null,
          `ERROR: ${error instanceof Error ? error.message : 'unknown error'}`,
        ),
      );
      logger.error(
        `[USDA] ${ingredient.name} failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    if (args.delayMs > 0) {
      await sleep(args.delayMs);
    }
  }

  await writeImportReport(args.outputPath, reportRows);

  logger.log('');
  logger.log('Summary');
  logger.log(`- scanned: ${counters.scanned}`);
  logger.log(`- sourceRecords: ${counters.sourceRecords}`);
  logger.log(`- candidates: ${counters.candidates}`);
  logger.log(`- noMatch: ${counters.noMatch}`);
  logger.log(`- errors: ${counters.errors}`);
  logger.log(`- report: ${args.outputPath}`);
  if (!args.apply) {
    logger.log('Dry run complete. Re-run with --apply to persist candidates.');
  }

  return counters;
}

function scoreUsdaFood({
  ingredientName,
  searchTerm,
  food,
}: {
  ingredientName: string;
  searchTerm: string;
  food: UsdaSearchFood;
}): number {
  const description = normalizeEnglishText(food.description ?? '');
  if (
    getFoodStateMismatches({
      ingredientName,
      foodDescription: food.description ?? '',
      foodCategory: getFoodCategoryDescription(food.foodCategory),
    }).length > 0
  ) {
    return 0;
  }

  const searchTokens = tokenizeEnglish(searchTerm);
  const coreTokens = searchTokens.filter(
    (token) => !['fresh', 'raw', 'uncooked'].includes(token),
  );
  const hasAllSearchTokens = searchTokens.every((token) =>
    description.includes(token),
  );
  const hasAllCoreTokens =
    coreTokens.length > 0 &&
    coreTokens.every((token) => description.includes(token));
  const hasAnyCoreToken =
    coreTokens.length === 1 &&
    coreTokens.some((token) => description.includes(token));
  let score = 0.15;

  if (hasAllSearchTokens) {
    score += 0.67;
  } else if (hasAllCoreTokens) {
    score += 0.55;
  } else if (hasAnyCoreToken) {
    score += 0.35;
  }

  if (food.dataType === 'Foundation') {
    score += 0.08;
  } else if (food.dataType === 'SR Legacy') {
    score += 0.05;
  }

  if (searchTokens.includes('raw') && description.includes('raw')) {
    score += 0.08;
  }

  if (coreTokens[0] && description.startsWith(`${coreTokens[0]} `)) {
    score += 0.1;
  }

  if (
    !isOilIngredient(ingredientName, searchTerm) &&
    description.includes('oil')
  ) {
    score -= 0.45;
  }

  if (
    !tokenizeEnglish(searchTerm).includes('sweet') &&
    description.includes('sweet potato')
  ) {
    score -= 0.45;
  }

  for (const token of DISTRACTION_TOKENS) {
    if (description.includes(token)) {
      score -= 0.25;
    }
  }

  return Math.max(0, Math.min(roundScore(score), 0.98));
}

function hasMinimumNutritionCoverage(food: UsdaSearchFood): boolean {
  const profile = mapUsdaSearchFoodToSourceInput({
    food,
    searchTerm: 'coverage-check',
  }).normalizedNutrition;
  return Boolean(
    profile &&
    hasFinite(profile.macros.energyKcal) &&
    hasFinite(profile.macros.crudeProtein) &&
    hasFinite(profile.macros.crudeFat),
  );
}

function normalizeIngredientName(name: string): string {
  return name
    .trim()
    .replace(/[（(].*?[）)]/gu, '')
    .replace(/\s+/gu, '');
}

function normalizeEnglishText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ');
}

function tokenizeEnglish(value: string): string[] {
  return normalizeEnglishText(value).split(/\s+/u).filter(Boolean);
}

function isOilIngredient(ingredientName: string, searchTerm: string): boolean {
  return (
    ingredientName.includes('油') || tokenizeEnglish(searchTerm).includes('oil')
  );
}

function hasFinite(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function dedupe(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

async function fetchUsdaSearchFoods({
  apiKey,
  query,
  pageSize,
  localFoods,
}: {
  apiKey: string;
  query: string;
  pageSize: number;
  localFoods: UsdaSearchFood[] | null;
}): Promise<UsdaSearchFood[]> {
  if (localFoods) {
    return findLocalUsdaFoods(localFoods, query);
  }

  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('dataType', 'Foundation,SR Legacy');

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`USDA API ${response.status}`);
  }

  const body = (await response.json()) as { foods?: UsdaSearchFood[] };
  return body.foods ?? [];
}

async function loadUsdaFoodsFromJsonFiles(
  paths: string[],
): Promise<UsdaSearchFood[]> {
  const foods: UsdaSearchFood[] = [];

  for (const path of paths) {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    foods.push(...extractUsdaFoods(parsed));
  }

  return foods;
}

function extractUsdaFoods(parsed: unknown): UsdaSearchFood[] {
  if (Array.isArray(parsed)) {
    return parsed as UsdaSearchFood[];
  }

  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const record = parsed as Record<string, unknown>;
  const candidates = [
    record.FoundationFoods,
    record.SRLegacyFoods,
    record.foods,
  ];
  const foods = candidates.find(Array.isArray);
  return ((foods ?? []) as unknown[]).filter(isUsdaSearchFood);
}

function findLocalUsdaFoods(
  foods: UsdaSearchFood[],
  searchTerm: string,
): UsdaSearchFood[] {
  const coreTokens = tokenizeEnglish(searchTerm).filter(
    (token) => !['fresh', 'raw', 'uncooked'].includes(token),
  );
  if (coreTokens.length === 0) {
    return [];
  }

  const allCoreMatches = foods.filter((food) => {
    if (!isUsdaSearchFood(food)) {
      return false;
    }
    const description = normalizeEnglishText(food.description ?? '');
    return coreTokens.every((token) => description.includes(token));
  });
  if (allCoreMatches.length > 0) {
    return allCoreMatches;
  }

  return foods.filter((food) => {
    if (!isUsdaSearchFood(food)) {
      return false;
    }
    const description = normalizeEnglishText(food.description ?? '');
    return coreTokens.some((token) => description.includes(token));
  });
}

function isUsdaSearchFood(value: unknown): value is UsdaSearchFood {
  return !!value && typeof value === 'object';
}

async function upsertNutritionSourceRecord(
  prisma: PrismaClient,
  input: NutritionSourceInput,
) {
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
    },
  });
}

async function upsertIngredientNutritionCandidate({
  prisma,
  ingredient,
  sourceRecordId,
  sourceType,
  normalizedNutrition,
  match,
}: {
  prisma: PrismaClient;
  ingredient: FoodIngredientRecord;
  sourceRecordId: string;
  sourceType: NutritionSourceInput['sourceType'];
  normalizedNutrition: NutritionProfileV2 | null | undefined;
  match: { score: number; reasons: NutritionMatchReason[] };
}) {
  if (!normalizedNutrition) return null;

  const where = {
    ingredientId_sourceRecordId: {
      ingredientId: ingredient.id,
      sourceRecordId,
    },
  };

  return prisma.ingredientNutritionCandidate.upsert({
    where,
    create: {
      ingredientId: ingredient.id,
      sourceRecordId,
      sourcePriority: getSourcePriority(sourceType),
      confidence: classifyMatchConfidence(match.score),
      score: match.score,
      matchReasons: toJsonInput(match.reasons),
      normalizedNutrition: toJsonInput(normalizedNutrition),
      status: NutritionCandidateStatus.CANDIDATE,
    },
    update: {
      sourcePriority: getSourcePriority(sourceType),
      confidence: classifyMatchConfidence(match.score),
      score: match.score,
      matchReasons: toJsonInput(match.reasons),
      normalizedNutrition: toJsonInput(normalizedNutrition),
      status: NutritionCandidateStatus.CANDIDATE,
    },
  });
}

function buildReportRow(
  ingredient: FoodIngredientRecord,
  searchTerm: string,
  selected: SelectedUsdaFood | null,
  status: string,
): ImportReportRow {
  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    searchTerm,
    fdcId: `${selected?.food.fdcId ?? ''}`,
    description: selected?.food.description ?? '',
    dataType: selected?.food.dataType ?? '',
    category: getFoodCategoryDescription(selected?.food.foodCategory) ?? '',
    score: selected?.score ?? 0,
    status,
  };
}

function getFoodCategoryDescription(
  foodCategory: UsdaSearchFood['foodCategory'] | undefined,
): string | null {
  if (!foodCategory) {
    return null;
  }
  if (typeof foodCategory === 'string') {
    return foodCategory;
  }

  return foodCategory.description ?? null;
}

async function writeImportReport(path: string, rows: ImportReportRow[]) {
  const headers = [
    '原料ID',
    '原料名称',
    'USDA搜索词',
    'FDC ID',
    'USDA描述',
    '数据类型',
    '类别',
    '匹配分',
    '状态',
  ];
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) =>
      [
        row.ingredientId,
        row.ingredientName,
        row.searchTerm,
        row.fdcId,
        row.description,
        row.dataType,
        row.category,
        row.score,
        row.status,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8');
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
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

function parseArgs(argv: string[]): ParsedArgs {
  const sourceJsonPaths = getArgValues(argv, '--source-json').map((path) =>
    resolve(process.cwd(), path),
  );
  const apiKey =
    getArgValue(argv, '--api-key') || process.env.USDA_API_KEY || '';
  if (!apiKey && sourceJsonPaths.length === 0) {
    throw new Error('USDA_API_KEY 未设置，也未传入 --api-key');
  }

  return {
    apiKey,
    apply: argv.includes('--apply'),
    limit: parseOptionalPositiveInt(getArgValue(argv, '--limit')),
    maxResults:
      parseOptionalPositiveInt(getArgValue(argv, '--max-results')) ??
      DEFAULT_MAX_RESULTS,
    pageSize:
      parseOptionalPositiveInt(getArgValue(argv, '--page-size')) ??
      DEFAULT_PAGE_SIZE,
    delayMs:
      parseOptionalNonNegativeInt(getArgValue(argv, '--delay-ms')) ??
      DEFAULT_DELAY_MS,
    outputPath: resolve(
      process.cwd(),
      getArgValue(argv, '--out') ||
        process.env.USDA_FOOD_CANDIDATE_IMPORT_REPORT ||
        'reports/usda-food-candidate-import.csv',
    ),
    sourceJsonPaths,
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

function getArgValues(argv: string[], name: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
      continue;
    }
    if (arg === name && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
    }
  }

  return values;
}

function parseOptionalPositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer, got ${value}`);
  }

  return parsed;
}

function parseOptionalNonNegativeInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected non-negative integer, got ${value}`);
  }

  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。示例: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen npm run import:usda-food-candidates -- --api-key DEMO_KEY',
    );
  }

  const prisma = new PrismaClient();
  try {
    await runUsdaFoodCandidateImport({
      prisma,
      args: parseArgs(process.argv.slice(2)),
      logger: console,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[USDA] Failed to import USDA food candidates:', error);
    process.exit(1);
  });
}
