import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  IngredientType,
  NutritionFoodCategory,
  NutritionFoodStatus,
  NutritionGovernanceSourceType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import {
  attachUsdaFdcProfileMetadata,
  buildNutritionSourceKey,
  buildUsdaFdcSourceVersion,
  mapUsdaNutrientsToNutritionProfile,
} from '../src/domain/nutrition-governance/nutrition-governance.utils';

const USDA_SOURCE_TITLE = 'USDA FoodData Central';
const USDA_PROVIDER = 'USDA FoodData Central';
const DEFAULT_USDA_DATA_DIR =
  '/Users/zhaochen/Documents/petrecipedesigner/data/downloads/usda';
const DEFAULT_OUTPUT_PATH = 'reports/usda-raw-cooked-profile-import.csv';
const MINIMUM_DIRECT_IMPORT_SCORE = 0.82;

export interface UsdaLocalFoodRow {
  fdcId: string;
  description: string;
  dataType?: string | null;
  foodCategoryId?: string | null;
  publicationDate?: string | null;
}

interface UsdaNutrientDefinition {
  id: number;
  name: string;
  unitName: string;
}

interface UsdaFoodNutrient {
  nutrient: {
    id: number;
    name: string;
    unitName: string;
  };
  amount: number;
}

interface UsdaDataset {
  foods: UsdaLocalFoodRow[];
  nutrientsByFoodId: Map<string, UsdaFoodNutrient[]>;
}

type ProfileState = 'RAW' | 'COOKED' | 'DRIED' | 'POWDER' | 'OIL';
type MappingRole = 'PRIMARY' | 'SECONDARY';

interface UsdaProfileSearchPlan {
  state: ProfileState;
  role: MappingRole;
  searchTerms: string[];
  preparationStateLabel: string;
  ediblePortionLabel?: string;
  processingLabel?: string;
}

export interface SelectedUsdaProfileTarget {
  food: UsdaLocalFoodRow;
  state: ProfileState;
  role: MappingRole;
  searchTerm: string;
  score: number;
  reasons: string[];
  preparationStateLabel: string;
  ediblePortionLabel: string;
  processingLabel: string;
}

interface IngredientRecord {
  id: string;
  name: string;
}

interface ImportArgs {
  apply: boolean;
  limit: number | null;
  ingredientName: string | null;
  usdaDataDir: string;
  outputPath: string;
}

interface ReportRow {
  ingredientId: string;
  ingredientName: string;
  role: string;
  state: string;
  searchTerm: string;
  fdcId: string;
  description: string;
  score: string;
  action: string;
  reason: string;
}

interface ImportCounters {
  scanned: number;
  selectedTargets: number;
  importedMappings: number;
  primaryMappings: number;
  skippedNoPlan: number;
  skippedNoMatch: number;
  skippedNoNutrition: number;
  errors: number;
}

const EXACT_SEARCH_PLANS: ReadonlyArray<{
  names: readonly string[];
  raw?: readonly string[];
  cooked?: readonly string[];
  primaryState?: ProfileState;
  primaryRole?: MappingRole;
}> = [
  {
    names: ['丁香粉'],
    raw: ['spices cloves ground'],
    primaryState: 'POWDER',
  },
  {
    names: ['三文鱼'],
    raw: ['fish salmon atlantic farmed raw', 'fish salmon atlantic wild raw'],
    cooked: [
      'fish salmon atlantic farmed cooked',
      'fish salmon atlantic wild cooked',
    ],
  },
  {
    names: ['上海青', '小白菜'],
    raw: ['cabbage chinese pak choi raw'],
    cooked: ['cabbage chinese pak choi cooked'],
  },
  { names: ['亚麻籽'], raw: ['seeds flaxseed'], primaryState: 'DRIED' },
  { names: ['亚麻籽油'], raw: ['oil flaxseed'], primaryState: 'OIL' },
  { names: ['兔里脊'], raw: ['rabbit meat raw'], cooked: ['rabbit meat cooked'] },
  {
    names: ['冬瓜'],
    raw: ['waxgourd raw', 'wax gourd raw'],
    cooked: ['waxgourd cooked', 'wax gourd cooked'],
  },
  { names: ['南瓜'], raw: ['pumpkin raw'], cooked: ['pumpkin cooked'] },
  {
    names: ['卷心菜'],
    raw: ['cabbage common raw'],
    cooked: ['cabbage cooked'],
  },
  {
    names: ['咖喱粉'],
    raw: ['spices curry powder'],
    primaryState: 'POWDER',
  },
  {
    names: ['四季豆'],
    raw: ['beans snap green raw'],
    cooked: ['beans snap green cooked'],
  },
  {
    names: ['土豆'],
    raw: ['potatoes flesh skin raw'],
    cooked: ['potatoes boiled cooked in skin flesh without salt'],
  },
  {
    names: ['大米'],
    raw: ['rice white long grain regular raw unenriched'],
    cooked: ['rice white long grain regular cooked unenriched'],
  },
  {
    names: ['大豆'],
    raw: ['soybeans mature seeds raw'],
    cooked: ['soybeans mature seeds cooked'],
  },
  { names: ['奇亚籽'], raw: ['seeds chia dried'], primaryState: 'DRIED' },
  { names: ['姜粉'], raw: ['spices ginger ground'], primaryState: 'POWDER' },
  {
    names: ['姜黄粉'],
    raw: ['spices turmeric ground'],
    primaryState: 'POWDER',
  },
  {
    names: ['娃娃菜'],
    raw: ['cabbage chinese pe tsai raw'],
    cooked: ['cabbage chinese pe tsai cooked'],
  },
  { names: ['小米'], raw: ['millet raw'], cooked: ['millet cooked'] },
  { names: ['小麦胚芽油'], raw: ['oil wheat germ'], primaryState: 'OIL' },
  { names: ['山药'], raw: ['yam raw'], cooked: ['yam cooked'] },
  { names: ['巴旦木'], raw: ['nuts almonds'], primaryState: 'DRIED' },
  { names: ['巴西坚果'], raw: ['nuts brazilnuts'], primaryState: 'DRIED' },
  { names: ['木瓜'], raw: ['papaya raw'] },
  { names: ['树莓'], raw: ['raspberries raw'] },
  { names: ['核桃'], raw: ['nuts walnuts'], primaryState: 'DRIED' },
  { names: ['梨（鲜）', '梨'], raw: ['pears raw'] },
  { names: ['橄榄油'], raw: ['oil olive'], primaryState: 'OIL' },
  {
    names: ['比目鱼'],
    raw: ['fish flatfish raw'],
    cooked: ['fish flatfish cooked'],
  },
  {
    names: ['沙丁鱼'],
    raw: ['fish sardine raw'],
    cooked: ['fish sardine cooked'],
  },
  {
    names: ['火鸡胸', '火鸡胸肉'],
    raw: ['turkey breast meat only raw'],
    cooked: ['turkey breast meat only cooked'],
  },
  { names: ['火麻籽'], raw: ['seeds hemp hulled'], primaryState: 'DRIED' },
  {
    names: ['燕麦'],
    raw: ['cereals oats regular quick not fortified dry'],
    cooked: ['cereals oats regular quick cooked'],
    primaryState: 'DRIED',
  },
  { names: ['牛心'], raw: ['beef heart raw'], cooked: ['beef heart cooked'] },
  { names: ['牛肝'], raw: ['beef liver raw'], cooked: ['beef liver cooked'] },
  {
    names: ['牛脾'],
    raw: ['beef spleen raw'],
    cooked: ['beef spleen cooked'],
  },
  {
    names: ['牛里脊'],
    raw: ['beef loin tenderloin steak boneless separable lean fat all grades raw'],
    cooked: ['beef loin tenderloin steak boneless separable lean fat all grades cooked'],
  },
  { names: ['牛霖'], raw: ['beef round raw'], cooked: ['beef round cooked'] },
  {
    names: ['狭鳕鱼柳'],
    raw: ['fish pollock alaska raw', 'fish pollock raw'],
    cooked: ['fish pollock alaska cooked', 'fish pollock cooked'],
  },
  { names: ['猪心'], raw: ['pork heart raw'], cooked: ['pork heart cooked'] },
  { names: ['猪肝'], raw: ['pork liver raw'], cooked: ['pork liver cooked'] },
  {
    names: ['猪肾'],
    raw: ['pork kidney raw'],
    cooked: ['pork kidney cooked'],
  },
  {
    names: ['猪里脊'],
    raw: ['pork tenderloin raw'],
    cooked: ['pork tenderloin cooked'],
  },
  { names: ['玉米油'], raw: ['oil corn'], primaryState: 'OIL' },
  {
    names: ['玉米粒'],
    raw: ['corn sweet yellow raw'],
    cooked: ['corn sweet yellow cooked'],
  },
  {
    names: ['生南瓜籽仁'],
    raw: ['seeds pumpkin squash seed kernels dried'],
    primaryState: 'DRIED',
  },
  { names: ['生菜'], raw: ['lettuce green leaf raw'] },
  {
    names: ['生葵花籽仁'],
    raw: ['seeds sunflower seed kernels dried'],
    primaryState: 'DRIED',
  },
  {
    names: ['生蚝'],
    raw: [
      'mollusks oyster eastern farmed raw',
      'mollusks oyster pacific raw',
      'mollusks oyster raw',
    ],
    cooked: [
      'mollusks oyster eastern farmed cooked',
      'mollusks oyster pacific cooked',
      'mollusks oyster cooked',
    ],
  },
  { names: ['白芝麻'], raw: ['seeds sesame'], primaryState: 'DRIED' },
  {
    names: ['白萝卜'],
    raw: ['radishes oriental raw'],
    cooked: ['radishes oriental cooked'],
  },
  {
    names: ['白蘑菇', '口蘑'],
    raw: ['mushrooms white raw'],
    cooked: ['mushrooms white cooked'],
  },
  { names: ['秋葵'], raw: ['okra raw'], cooked: ['okra cooked'] },
  {
    names: ['糙米'],
    raw: ['rice brown long grain raw'],
    cooked: ['rice brown long grain cooked'],
  },
  { names: ['紫甘蓝'], raw: ['cabbage red raw'], cooked: ['cabbage red cooked'] },
  {
    names: ['紫薯', '红薯'],
    raw: ['sweet potato raw'],
    cooked: ['sweet potato cooked'],
  },
  {
    names: ['红小豆'],
    raw: ['beans adzuki mature seeds raw'],
    cooked: ['beans adzuki mature seeds cooked'],
  },
  {
    names: ['红甜椒'],
    raw: ['peppers sweet red raw'],
    cooked: ['peppers sweet red cooked'],
  },
  {
    names: ['绿豆'],
    raw: ['mung beans mature seeds raw'],
    cooked: ['mung beans mature seeds cooked'],
  },
  {
    names: ['绿豆芽'],
    raw: ['mung beans sprouted raw'],
    cooked: ['mung beans sprouted cooked'],
  },
  {
    names: ['罗非鱼'],
    raw: ['fish tilapia raw'],
    cooked: ['fish tilapia cooked'],
  },
  {
    names: ['羊肚菌（鲜）', '羊肚菌'],
    raw: ['mushrooms morel raw'],
    cooked: ['mushrooms morel cooked'],
  },
  {
    names: ['羊里脊'],
    raw: ['lamb loin raw'],
    cooked: ['lamb loin cooked'],
  },
  { names: ['羽衣甘蓝'], raw: ['kale raw'], cooked: ['kale cooked'] },
  {
    names: ['肉桂粉'],
    raw: ['spices cinnamon ground'],
    primaryState: 'POWDER',
  },
  { names: ['胡萝卜'], raw: ['carrots raw'], cooked: ['carrots cooked'] },
  {
    names: ['舞茸'],
    raw: ['mushrooms maitake raw'],
    cooked: ['mushrooms maitake cooked'],
  },
  { names: ['芋头'], raw: ['taro raw'], cooked: ['taro cooked'] },
  { names: ['芦笋'], raw: ['asparagus raw'], cooked: ['asparagus cooked'] },
  {
    names: ['花椰菜'],
    raw: ['cauliflower raw'],
    cooked: ['cauliflower cooked'],
  },
  { names: ['芹菜', '西芹'], raw: ['celery raw'], cooked: ['celery cooked'] },
  { names: ['苹果'], raw: ['apples raw with skin'] },
  { names: ['茄子'], raw: ['eggplant raw'], cooked: ['eggplant cooked'] },
  { names: ['菠菜'], raw: ['spinach raw'], cooked: ['spinach cooked'] },
  { names: ['菠萝'], raw: ['pineapple raw'] },
  { names: ['葵花籽油'], raw: ['oil sunflower'], primaryState: 'OIL' },
  { names: ['蓝莓'], raw: ['blueberries raw'] },
  { names: ['薏仁米'], raw: ['coix seed raw', 'job tears raw'] },
  { names: ['藜麦'], raw: ['quinoa uncooked'], cooked: ['quinoa cooked'] },
  { names: ['西兰花'], raw: ['broccoli raw'], cooked: ['broccoli cooked'] },
  { names: ['西红柿'], raw: ['tomatoes red ripe raw'], cooked: ['tomatoes red ripe cooked'] },
  { names: ['西葫芦'], raw: ['zucchini raw'], cooked: ['zucchini cooked'] },
  {
    names: ['豆腐'],
    raw: ['tofu raw regular calcium sulfate', 'tofu raw firm calcium sulfate'],
  },
  { names: ['豌豆'], raw: ['peas green raw'], cooked: ['peas green cooked'] },
  {
    names: ['金针菇'],
    raw: ['mushrooms enoki raw'],
    cooked: ['mushrooms enoki cooked'],
  },
  { names: ['青口贝'], raw: ['green lipped mussel raw'], cooked: ['green lipped mussel cooked'] },
  {
    names: ['青花鱼'],
    raw: ['fish mackerel raw'],
    cooked: ['fish mackerel cooked'],
  },
  { names: ['食用盐'], raw: ['salt table'], primaryState: 'DRIED' },
  { names: ['香菜'], raw: ['coriander cilantro leaves raw'] },
  { names: ['香蕉'], raw: ['bananas raw'] },
  {
    names: ['马肉'],
    raw: ['game meat horse raw'],
    cooked: ['game meat horse cooked'],
  },
  {
    names: ['鲜香菇', '香菇'],
    raw: ['mushrooms shiitake raw'],
    cooked: ['mushrooms shiitake cooked'],
  },
  {
    names: ['鳕鱼颈背肉'],
    raw: ['fish cod atlantic raw', 'fish cod raw'],
    cooked: ['fish cod atlantic cooked', 'fish cod cooked'],
  },
  {
    names: ['鸡心'],
    raw: ['chicken heart raw'],
    cooked: ['chicken heart cooked'],
  },
  {
    names: ['鸡肝'],
    raw: ['chicken liver raw'],
    cooked: ['chicken liver cooked'],
  },
  {
    names: ['鸡胗'],
    raw: ['chicken gizzard raw'],
    cooked: ['chicken gizzard cooked'],
  },
  {
    names: ['鸡胸', '鸡胸【有机】', '鸡胸肉'],
    raw: ['chicken breast skinless boneless meat only raw', 'chicken breast meat only raw'],
    cooked: [
      'chicken breast skinless boneless meat only cooked',
      'chicken breast meat only cooked',
    ],
  },
  {
    names: ['鸡腿肉'],
    raw: ['chicken thigh meat only raw'],
    cooked: ['chicken thigh meat only cooked'],
  },
  {
    names: ['鸡蛋'],
    raw: ['egg whole raw fresh'],
    cooked: ['egg whole cooked hard boiled'],
  },
  { names: ['鸭心'], raw: ['duck heart raw'], cooked: ['duck heart cooked'] },
  { names: ['鸭肝'], raw: ['duck liver raw'], cooked: ['duck liver cooked'] },
  {
    names: ['鸭胗'],
    raw: ['duck gizzard raw'],
    cooked: ['duck gizzard cooked'],
  },
  {
    names: ['鸭胸'],
    raw: ['duck domesticated meat only raw'],
    cooked: ['duck breast meat only cooked'],
  },
  { names: ['鸭蛋'], raw: ['egg duck whole raw'], cooked: ['egg duck whole cooked'] },
  { names: ['鹅肝'], raw: ['goose liver raw'], cooked: ['goose liver cooked'] },
  {
    names: ['鹅胸肉'],
    raw: ['goose domesticated meat only raw'],
    cooked: ['goose domesticated meat only cooked'],
  },
  { names: ['鹌鹑蛋'], raw: ['egg quail whole raw'], cooked: ['egg quail whole cooked'] },
  {
    names: ['鹿腿肉'],
    raw: ['game meat deer raw'],
    cooked: ['game meat deer cooked'],
  },
  {
    names: ['黄瓜'],
    raw: ['cucumber with peel raw', 'cucumber peeled raw'],
  },
  { names: ['黑木耳'], raw: ['jew ear raw', 'pepeao raw', 'cloud ears raw'] },
];

const STATELESS_CORE_STOP_WORDS = new Set([
  'fresh',
  'raw',
  'uncooked',
  'unprepared',
  'cooked',
  'boiled',
  'drained',
  'without',
  'salt',
  'roasted',
  'baked',
  'broiled',
  'grilled',
  'steamed',
  'stewed',
  'braised',
  'dry',
  'dried',
  'heat',
  'moist',
]);

const GENERAL_REJECT_PATTERNS: readonly RegExp[] = [
  /\bbabyfood\b/u,
  /\bfast foods?\b/u,
  /\brestaurant\b/u,
  /\bcanned\b/u,
  /\bsoup\b/u,
  /\bsauce\b/u,
  /\bbutter\b/u,
  /\bpaste\b/u,
  /\bdeli\b/u,
  /\bprepackaged\b/u,
  /\bluncheon\b/u,
  /\bnugget\b/u,
  /\badded solution\b/u,
  /\bseasoning\b/u,
  /\bbreaded\b/u,
  /\bfried\b/u,
  /\bsmoked\b/u,
  /\bsalted\b/u,
  /\bwith salt\b/u,
  /\bprepared with salt\b/u,
];

loadEnv({ path: process.env.ENV_FILE || '.env' });

export function buildUsdaProfileSearchPlans(
  ingredientName: string,
): UsdaProfileSearchPlan[] {
  const normalizedName = normalizeIngredientName(ingredientName);
  const matched = EXACT_SEARCH_PLANS.find((entry) =>
    entry.names.some((name) => normalizedName === normalizeIngredientName(name)),
  );
  if (!matched) {
    return [];
  }

  if (normalizedName === normalizeIngredientName('黄瓜')) {
    return [
      {
        state: 'RAW',
        role: 'PRIMARY',
        searchTerms: ['cucumber with peel raw'],
        preparationStateLabel: '生',
        ediblePortionLabel: '带皮',
        processingLabel: '未加工',
      },
      {
        state: 'RAW',
        role: 'SECONDARY',
        searchTerms: ['cucumber peeled raw'],
        preparationStateLabel: '生',
        ediblePortionLabel: '去皮',
        processingLabel: '未加工',
      },
    ];
  }

  const primaryState = matched.primaryState ?? 'RAW';
  const plans: UsdaProfileSearchPlan[] = [];
  if (matched.raw && matched.raw.length > 0) {
    plans.push({
      state: primaryState,
      role: matched.primaryRole ?? 'PRIMARY',
      searchTerms: [...matched.raw],
      preparationStateLabel: getPreparationStateLabel(primaryState),
      processingLabel: getProcessingLabel(primaryState),
    });
  }

  if (matched.cooked && matched.cooked.length > 0) {
    plans.push({
      state: 'COOKED',
      role: plans.length === 0 ? 'PRIMARY' : 'SECONDARY',
      searchTerms: [...matched.cooked],
      preparationStateLabel: getPreparationStateLabel('COOKED'),
      processingLabel: getProcessingLabel('COOKED'),
    });
  }

  return plans;
}

export function selectUsdaProfileTargetsForIngredient({
  ingredientName,
  foods,
}: {
  ingredientName: string;
  foods: UsdaLocalFoodRow[];
}): SelectedUsdaProfileTarget[] {
  const plans = buildUsdaProfileSearchPlans(ingredientName);
  const selected: SelectedUsdaProfileTarget[] = [];
  const selectedFoodIds = new Set<string>();

  for (const plan of plans) {
    const best = selectBestFoodForPlan({
      ingredientName,
      plan,
      foods,
      selectedFoodIds,
    });
    if (!best) continue;

    selected.push(best);
    selectedFoodIds.add(best.food.fdcId);
  }

  if (selected.length > 0 && !selected.some((item) => item.role === 'PRIMARY')) {
    selected[0] = { ...selected[0], role: 'PRIMARY' };
  }

  return selected;
}

export async function runUsdaRawCookedNutritionProfileImport({
  prisma,
  args,
  logger,
}: {
  prisma: PrismaClient;
  args: ImportArgs;
  logger: Pick<typeof console, 'error' | 'log'>;
}): Promise<ImportCounters> {
  const counters: ImportCounters = {
    scanned: 0,
    selectedTargets: 0,
    importedMappings: 0,
    primaryMappings: 0,
    skippedNoPlan: 0,
    skippedNoMatch: 0,
    skippedNoNutrition: 0,
    errors: 0,
  };
  const reportRows: ReportRow[] = [];

  logger.log(`Loading USDA local dataset: ${args.usdaDataDir}`);
  const dataset = await loadUsdaDataset(args.usdaDataDir);
  logger.log(
    `USDA foods: ${dataset.foods.length}; nutrient profiles: ${dataset.nutrientsByFoodId.size}`,
  );

  const ingredients = await prisma.ingredient.findMany({
    where: {
      type: IngredientType.FOOD,
      ...(args.ingredientName ? { name: args.ingredientName } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    ...(args.limit !== null ? { take: args.limit } : {}),
  });

  logger.log(
    args.apply
      ? `Applying USDA profile import for ${ingredients.length} food ingredients...`
      : `Dry run: USDA profile import for ${ingredients.length} food ingredients...`,
  );

  for (const ingredient of ingredients) {
    counters.scanned += 1;
    const plans = buildUsdaProfileSearchPlans(ingredient.name);
    if (plans.length === 0) {
      counters.skippedNoPlan += 1;
      reportRows.push(
        buildReportRow({
          ingredient,
          action: 'SKIP',
          reason: 'NO_SEARCH_PLAN',
        }),
      );
      continue;
    }

    const selectedTargets = selectUsdaProfileTargetsForIngredient({
      ingredientName: ingredient.name,
      foods: dataset.foods,
    });

    if (selectedTargets.length === 0) {
      counters.skippedNoMatch += 1;
      reportRows.push(
        buildReportRow({
          ingredient,
          action: 'SKIP',
          reason: `NO_HIGH_CONFIDENCE_MATCH: ${plans
            .flatMap((plan) => plan.searchTerms)
            .join(' | ')}`,
        }),
      );
      continue;
    }

    counters.selectedTargets += selectedTargets.length;

    try {
      const validTargets: Array<{
        target: SelectedUsdaProfileTarget;
        profile: NutritionProfileV2;
        nutrients: UsdaFoodNutrient[];
      }> = [];

      for (const target of selectedTargets) {
        const nutrients = dataset.nutrientsByFoodId.get(target.food.fdcId) ?? [];
        const profile = buildUsdaProfile({
          food: target.food,
          nutrients,
          target,
        });

        if (!hasMinimumFoodProfileCoverage(profile)) {
          counters.skippedNoNutrition += 1;
          reportRows.push(
            buildReportRow({
              ingredient,
              target,
              action: 'SKIP',
              reason: 'INSUFFICIENT_NUTRITION_COVERAGE',
            }),
          );
          continue;
        }

        validTargets.push({ target, profile, nutrients });
      }

      if (
        validTargets.length > 0 &&
        !validTargets.some((item) => item.target.role === 'PRIMARY')
      ) {
        const [first, ...rest] = validTargets;
        validTargets.splice(0, validTargets.length, {
          ...first,
          target: { ...first.target, role: 'PRIMARY' },
        }, ...rest);
      }

      for (const { target, profile, nutrients } of validTargets) {
        reportRows.push(
          buildReportRow({
            ingredient,
            target,
            action: args.apply ? 'APPLY' : 'WOULD_APPLY',
            reason: target.reasons.join('; '),
          }),
        );

        if (!args.apply) continue;

        await upsertNutritionProfileMapping({
          prisma,
          ingredient,
          target,
          profile,
          nutrients,
        });
        counters.importedMappings += 1;
        if (target.role === 'PRIMARY') {
          counters.primaryMappings += 1;
        }
      }
    } catch (error) {
      counters.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      reportRows.push(
        buildReportRow({
          ingredient,
          action: 'ERROR',
          reason: message,
        }),
      );
      logger.error(`[USDA] ${ingredient.name} failed: ${message}`);
    }
  }

  await writeReport(args.outputPath, reportRows);
  logger.log('');
  logger.log('Summary');
  logger.log(`- scanned: ${counters.scanned}`);
  logger.log(`- selectedTargets: ${counters.selectedTargets}`);
  logger.log(`- importedMappings: ${counters.importedMappings}`);
  logger.log(`- primaryMappings: ${counters.primaryMappings}`);
  logger.log(`- skippedNoPlan: ${counters.skippedNoPlan}`);
  logger.log(`- skippedNoMatch: ${counters.skippedNoMatch}`);
  logger.log(`- skippedNoNutrition: ${counters.skippedNoNutrition}`);
  logger.log(`- errors: ${counters.errors}`);
  logger.log(`- report: ${args.outputPath}`);
  if (!args.apply) {
    logger.log('Dry run complete. Re-run with --apply to write local DB.');
  }

  return counters;
}

function selectBestFoodForPlan({
  ingredientName,
  plan,
  foods,
  selectedFoodIds,
}: {
  ingredientName: string;
  plan: UsdaProfileSearchPlan;
  foods: UsdaLocalFoodRow[];
  selectedFoodIds: Set<string>;
}): SelectedUsdaProfileTarget | null {
  const scored: SelectedUsdaProfileTarget[] = [];

  for (const searchTerm of plan.searchTerms) {
    const coreTokens = tokenizeEnglish(searchTerm).filter(
      (token) => !STATELESS_CORE_STOP_WORDS.has(token),
    );
    if (coreTokens.length === 0) continue;

    for (const food of foods) {
      if (selectedFoodIds.has(food.fdcId)) continue;

      const candidate = scoreFoodCandidate({
        ingredientName,
        plan,
        searchTerm,
        coreTokens,
        food,
      });
      if (candidate) {
        scored.push(candidate);
      }
    }
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return Number(left.food.fdcId) - Number(right.food.fdcId);
  });

  return scored[0] ?? null;
}

function scoreFoodCandidate({
  ingredientName,
  plan,
  searchTerm,
  coreTokens,
  food,
}: {
  ingredientName: string;
  plan: UsdaProfileSearchPlan;
  searchTerm: string;
  coreTokens: string[];
  food: UsdaLocalFoodRow;
}): SelectedUsdaProfileTarget | null {
  const description = normalizeEnglishText(food.description);
  const rejectionReason = getRejectReason({
    ingredientName,
    description,
    plan,
    searchTerm,
  });
  if (rejectionReason) return null;

  const descriptionTokens = tokenizeEnglish(food.description);
  const matchedCoreTokens = coreTokens.filter((token) =>
    descriptionTokens.some((descriptionToken) =>
      englishTokenMatches(descriptionToken, token),
    ),
  );
  if (matchedCoreTokens.length !== coreTokens.length) {
    return null;
  }

  let score = 0.76;
  const reasons = [`核心词匹配: ${coreTokens.join(' + ')}`];

  if (matchesTargetState(description, plan.state)) {
    score += 0.1;
    reasons.push(`状态匹配: ${plan.preparationStateLabel}`);
  }

  const dataType = food.dataType?.toLowerCase() ?? '';
  if (dataType.includes('foundation')) {
    score += 0.04;
    reasons.push('USDA Foundation 数据');
  } else if (dataType.includes('sr_legacy') || dataType.includes('sr legacy')) {
    score += 0.03;
    reasons.push('USDA SR Legacy 数据');
  }

  score += getSpecificPreferenceDelta(ingredientName, description, searchTerm);
  score -= getSoftPenalty(ingredientName, description, plan);
  score = roundScore(Math.max(0, Math.min(0.98, score)));

  if (score < MINIMUM_DIRECT_IMPORT_SCORE) {
    return null;
  }

  return {
    food,
    state: plan.state,
    role: plan.role,
    searchTerm,
    score,
    reasons,
    preparationStateLabel: plan.preparationStateLabel,
    ediblePortionLabel:
      plan.ediblePortionLabel ?? inferEdiblePortionLabel(description),
    processingLabel:
      plan.processingLabel ?? inferProcessingLabel(description, plan.state),
  };
}

function getRejectReason({
  ingredientName,
  description,
  plan,
  searchTerm,
}: {
  ingredientName: string;
  description: string;
  plan: UsdaProfileSearchPlan;
  searchTerm: string;
}): string | null {
  if (!matchesTargetState(description, plan.state)) {
    return 'STATE_MISMATCH';
  }

  if (plan.state !== 'OIL' && /\boil\b/u.test(description)) {
    return 'OIL_DISTRACTION';
  }

  if (
    plan.state !== 'POWDER' &&
    /\b(ground|powder|flour|meal)\b/u.test(description) &&
    !isPowderIngredient(ingredientName)
  ) {
    return 'POWDER_DISTRACTION';
  }

  if (
    plan.state !== 'DRIED' &&
    /\b(dried|dehydrated)\b/u.test(description) &&
    !isDefaultDriedIngredient(ingredientName)
  ) {
    return 'DRIED_DISTRACTION';
  }

  if (
    /\b(frozen|refrigerated|hash brown|puffs|french fried)\b/u.test(
      description,
    )
  ) {
    return 'FROZEN_OR_PREPARED_DISTRACTION';
  }

  if (
    plan.state !== 'COOKED' &&
    /\b(roasted|toasted|glazed|honey roasted|oil roasted|dry roasted)\b/u.test(
      description,
    )
  ) {
    return 'ROASTED_DISTRACTION';
  }

  const oilRejection = getOilIngredientRejectReason(
    ingredientName,
    description,
  );
  if (oilRejection) return oilRejection;

  if (ingredientName !== '食用盐') {
    for (const pattern of GENERAL_REJECT_PATTERNS) {
      if (pattern.test(description)) return 'PREPARED_DISTRACTION';
    }
  }

  const normalizedName = normalizeIngredientName(ingredientName);

  if (normalizedName === '青口贝') {
    return description.includes('green') && description.includes('mussel')
      ? null
      : 'GREEN_LIPPED_MUSSEL_REQUIRED';
  }

  if (normalizedName === '卷心菜') {
    if (
      /\b(chinese|pak\s*choi|bok\s*choy|pe\s*tsai|napa|red|savoy)\b/u.test(
        description,
      )
    ) {
      return 'GENERIC_CABBAGE_VARIANT_MISMATCH';
    }
  }

  if (['上海青', '小白菜'].includes(normalizedName)) {
    if (!/\b(pak\s*choi|bok\s*choy)\b/u.test(description)) {
      return 'PAK_CHOI_REQUIRED';
    }
  }

  if (normalizedName === '娃娃菜') {
    if (!/\b(pe\s*tsai|napa)\b/u.test(description)) {
      return 'PE_TSAI_REQUIRED';
    }
  }

  if (normalizedName === '南瓜') {
    if (/\b(flowers?|seeds?|seed|fish|sunfish|leaves?)\b/u.test(description)) {
      return 'PUMPKIN_PLANT_PART_MISMATCH';
    }
  }

  if (normalizedName === '西兰花') {
    if (/\b(leaves?|stalks?|chinese|raab)\b/u.test(description)) {
      return 'BROCCOLI_VARIANT_MISMATCH';
    }
  }

  if (normalizedName === '芋头') {
    if (/\b(leaves?|shoots?)\b/u.test(description)) {
      return 'TARO_PLANT_PART_MISMATCH';
    }
  }

  if (normalizedName === '花椰菜' && description.includes('green')) {
    return 'CAULIFLOWER_VARIANT_MISMATCH';
  }

  if (normalizedName === '苹果') {
    if (/\b(rose apples|applesauce)\b/u.test(description)) {
      return 'APPLE_DISTRACTION';
    }
  }

  if (normalizedName === '香蕉' && !description.startsWith('bananas ')) {
    return 'BANANA_DISTRACTION';
  }

  if (normalizedName === '菠菜' && description.includes('mustard')) {
    return 'SPINACH_VARIANT_MISMATCH';
  }

  if (normalizedName === '菠菜' && description.includes('new zealand')) {
    return 'SPINACH_VARIANT_MISMATCH';
  }

  if (normalizedName === '胡萝卜' && description.includes('baby')) {
    return 'CARROT_VARIANT_MISMATCH';
  }

  if (normalizedName === '土豆' && description.includes('sweet potato')) {
    return 'POTATO_SWEET_POTATO_MISMATCH';
  }

  if (['红薯', '紫薯'].includes(normalizedName)) {
    if (!description.includes('sweet potato') || description.includes('leaves')) {
      return 'SWEET_POTATO_REQUIRED';
    }
  }

  if (
    ['大豆', '绿豆'].includes(normalizedName) &&
    description.includes('sprouted')
  ) {
    return 'BEAN_SPROUT_DISTRACTION';
  }

  if (
    ['大豆', '绿豆', '红小豆'].includes(normalizedName) &&
    description.includes('roasted')
  ) {
    return 'ROASTED_LEGUME_DISTRACTION';
  }

  if (normalizedName === '核桃' && description.includes('black')) {
    return 'ENGLISH_WALNUT_PREFERRED';
  }

  if (normalizedName.includes('梨')) {
    if (/\b(barley|pearled|prickly)\b/u.test(description)) {
      return 'PEAR_DISTRACTION';
    }
  }

  if (normalizedName === '薏仁米') {
    if (!/\b(coix|job)\b/u.test(description)) {
      return 'COIX_REQUIRED';
    }
  }

  if (normalizedName === '生蚝') {
    if (!description.includes('mollusks') || !description.includes('oyster')) {
      return 'OYSTER_MOLLUSK_REQUIRED';
    }
    if (description.includes('wild') && !/野生|wild/iu.test(ingredientName)) {
      return 'FARMED_OR_UNSPECIFIED_OYSTER_PREFERRED';
    }
  }

  if (['口蘑', '白蘑菇'].includes(normalizedName)) {
    if (/\b(ultraviolet|uv|exposed)\b/u.test(description)) {
      return 'UV_EXPOSED_MUSHROOM';
    }
  }

  if (normalizedName === '鸭胸' && description.includes('wild')) {
    return 'DOMESTIC_DUCK_REQUIRED';
  }

  if (normalizedName.includes('火鸡胸') && !description.includes('turkey')) {
    return 'TURKEY_REQUIRED';
  }

  if (
    normalizedName.includes('鸡胸') &&
    !normalizedName.includes('火鸡胸') &&
    !description.includes('chicken')
  ) {
    return 'CHICKEN_REQUIRED';
  }

  if (normalizedName.includes('胸') && !description.includes('breast')) {
    if (!normalizedName.includes('鹅胸') && !normalizedName.includes('鸭胸')) {
      return 'BREAST_CUT_REQUIRED';
    }
  }

  if (normalizedName === '玉米粒') {
    if (!description.includes('corn') || /\b(cornmeal|popcorn|flour)\b/u.test(description)) {
      return 'SWEET_CORN_REQUIRED';
    }
  }

  if (normalizedName === '生南瓜籽仁') {
    if (!description.includes('seed') || description.includes('flowers')) {
      return 'PUMPKIN_SEED_REQUIRED';
    }
  }

  if (searchTerm.includes('atlantic') && description.includes('pink')) {
    return 'SALMON_SPECIES_MISMATCH';
  }

  return null;
}

function matchesTargetState(
  normalizedDescription: string,
  state: ProfileState,
): boolean {
  switch (state) {
    case 'RAW':
      return (
        /\b(raw|uncooked|unprepared)\b/u.test(normalizedDescription) &&
        !isCookedDescription(normalizedDescription)
      );
    case 'COOKED':
      return isCookedDescription(normalizedDescription);
    case 'DRIED':
      return (
        /\b(dry|dried|dehydrated)\b/u.test(normalizedDescription) ||
        /^(nuts|seeds|spices)\b/u.test(normalizedDescription) ||
        normalizedDescription === 'salt table'
      );
    case 'POWDER':
      return /\b(ground|powder)\b/u.test(normalizedDescription);
    case 'OIL':
      return /\boil\b/u.test(normalizedDescription);
  }
}

function getOilIngredientRejectReason(
  ingredientName: string,
  normalizedDescription: string,
): string | null {
  if (!ingredientName.includes('油')) return null;
  const requiredOilToken = getRequiredOilToken(ingredientName);
  if (!requiredOilToken) return null;
  if (!normalizedDescription.startsWith('oil ')) return 'OIL_SOURCE_REQUIRED';
  if (!normalizedDescription.includes(requiredOilToken)) {
    return 'OIL_VARIANT_MISMATCH';
  }

  const otherOilTokens = [
    'canola',
    'corn',
    'peanut',
    'olive',
    'flaxseed',
    'sunflower',
    'wheat germ',
  ].filter((token) => token !== requiredOilToken);
  if (otherOilTokens.some((token) => normalizedDescription.includes(token))) {
    return 'BLENDED_OIL_DISTRACTION';
  }

  return null;
}

function getRequiredOilToken(ingredientName: string): string | null {
  if (ingredientName.includes('橄榄')) return 'olive';
  if (ingredientName.includes('亚麻籽')) return 'flaxseed';
  if (ingredientName.includes('葵花籽')) return 'sunflower';
  if (ingredientName.includes('小麦胚芽')) return 'wheat germ';
  if (ingredientName.includes('玉米')) return 'corn';
  return null;
}

function isCookedDescription(normalizedDescription: string): boolean {
  return /\b(cooked|boiled|roasted|baked|broiled|grilled|steamed|stewed|braised)\b/u.test(
    normalizedDescription,
  );
}

function getSpecificPreferenceDelta(
  ingredientName: string,
  normalizedDescription: string,
  searchTerm: string,
): number {
  const normalizedName = normalizeIngredientName(ingredientName);
  let delta = 0;

  if (
    normalizedName.includes('鸡胸') &&
    normalizedDescription.includes('skinless') &&
    normalizedDescription.includes('boneless')
  ) {
    delta += 0.04;
  }

  if (
    normalizedName === '黄瓜' &&
    searchTerm.includes('with peel') &&
    normalizedDescription.includes('with peel')
  ) {
    delta += 0.04;
  }

  if (
    normalizedName === '黄瓜' &&
    searchTerm.includes('peeled') &&
    normalizedDescription.includes('peeled')
  ) {
    delta += 0.04;
  }

  if (normalizedName === '燕麦' && normalizedDescription.includes('not fortified')) {
    delta += 0.04;
  }

  if (normalizedName === '三文鱼' && normalizedDescription.includes('farmed')) {
    delta += 0.03;
  }

  if (normalizedName === '卷心菜' && normalizedDescription.includes('common')) {
    delta += 0.04;
  }

  if (normalizedName.includes('梨') && normalizedDescription === 'pears raw') {
    delta += 0.05;
  }

  if (
    normalizedName === '蓝莓' &&
    normalizedDescription === 'blueberries raw'
  ) {
    delta += 0.05;
  }

  if (
    normalizedName === '苹果' &&
    normalizedDescription.startsWith('apples raw with skin')
  ) {
    delta += 0.05;
  }

  if (
    normalizedName === '西兰花' &&
    normalizedDescription === 'broccoli raw'
  ) {
    delta += 0.05;
  }

  if (normalizedName === '生蚝' && normalizedDescription.includes('farmed')) {
    delta += 0.05;
  }

  if (normalizedName === '山药' && normalizedDescription.startsWith('yam ')) {
    delta += 0.05;
  }

  return delta;
}

function getSoftPenalty(
  ingredientName: string,
  normalizedDescription: string,
  plan: UsdaProfileSearchPlan,
): number {
  let penalty = 0;
  const normalizedName = normalizeIngredientName(ingredientName);

  if (plan.state === 'RAW' && normalizedDescription.includes('with salt')) {
    penalty += 0.2;
  }

  if (normalizedName.includes('鸡蛋') && normalizedDescription.includes('dried')) {
    penalty += 0.2;
  }

  if (normalizedDescription.includes('includes foods for usda')) {
    penalty += 0.03;
  }

  return penalty;
}

function getPreparationStateLabel(state: ProfileState): string {
  switch (state) {
    case 'RAW':
      return '生';
    case 'COOKED':
      return '熟';
    case 'DRIED':
      return '干';
    case 'POWDER':
      return '粉';
    case 'OIL':
      return '油脂';
  }
}

function getProcessingLabel(state: ProfileState): string {
  switch (state) {
    case 'RAW':
    case 'DRIED':
    case 'OIL':
      return '未加工';
    case 'COOKED':
      return '熟制';
    case 'POWDER':
      return '粉碎';
  }
}

function inferEdiblePortionLabel(normalizedDescription: string): string {
  if (/\bwith (peel|skin)\b/u.test(normalizedDescription)) return '带皮';
  if (/\b(peeled|without skin|skinless)\b/u.test(normalizedDescription)) {
    return '去皮';
  }
  if (/\bmeat only\b/u.test(normalizedDescription)) {
    return '标准可食部';
  }
  if (/\bwhole\b/u.test(normalizedDescription)) return '整体';
  return '标准可食部';
}

function inferProcessingLabel(
  normalizedDescription: string,
  state: ProfileState,
): string {
  if (state === 'COOKED') return '熟制';
  if (state === 'POWDER') return '粉碎';
  if (normalizedDescription.includes('roasted')) return '烘烤';
  return getProcessingLabel(state);
}

function isPowderIngredient(ingredientName: string): boolean {
  return ingredientName.includes('粉');
}

function isDefaultDriedIngredient(ingredientName: string): boolean {
  return (
    ingredientName.includes('籽') ||
    ingredientName.includes('坚果') ||
    ingredientName.includes('核桃') ||
    ingredientName.includes('巴旦木') ||
    ingredientName.includes('芝麻') ||
    ingredientName.includes('燕麦') ||
    ingredientName.includes('盐')
  );
}

function buildUsdaProfile({
  food,
  nutrients,
  target,
}: {
  food: UsdaLocalFoodRow;
  nutrients: UsdaFoodNutrient[];
  target: SelectedUsdaProfileTarget;
}): NutritionProfileV2 {
  const profile = mapUsdaNutrientsToNutritionProfile(nutrients);
  attachUsdaFdcProfileMetadata(profile, {
    externalId: food.fdcId,
    sourceVersion: buildUsdaFdcSourceVersion(food.publicationDate),
    sourceTitle: USDA_SOURCE_TITLE,
    confidenceLevel: target.score >= 0.88 ? 'HIGH' : 'MEDIUM',
  });
  profile.meta.versionNote = `Direct local import from USDA ${food.fdcId}; search term: ${target.searchTerm}; role: ${target.role}.`;
  profile.meta.sampleState = toNutritionProfileSampleState(target.state);
  return profile;
}

function toNutritionProfileSampleState(
  state: ProfileState,
): NutritionProfileV2['meta']['sampleState'] {
  switch (state) {
    case 'RAW':
      return 'RAW';
    case 'COOKED':
      return 'COOKED';
    case 'DRIED':
      return 'AIR_DRIED';
    case 'POWDER':
      return 'POWDER';
    case 'OIL':
      return 'OIL';
  }
}

function hasMinimumFoodProfileCoverage(profile: NutritionProfileV2): boolean {
  return (
    hasFinite(profile.macros.energyKcal) &&
    hasFinite(profile.macros.crudeProtein) &&
    hasFinite(profile.macros.crudeFat) &&
    hasFinite(profile.minerals.calcium) &&
    hasFinite(profile.minerals.phosphorus)
  );
}

async function upsertNutritionProfileMapping({
  prisma,
  ingredient,
  target,
  profile,
  nutrients,
}: {
  prisma: PrismaClient;
  ingredient: IngredientRecord;
  target: SelectedUsdaProfileTarget;
  profile: NutritionProfileV2;
  nutrients: UsdaFoodNutrient[];
}): Promise<void> {
  const sourceKey = buildNutritionSourceKey(
    NutritionGovernanceSourceType.USDA,
    target.food.fdcId,
  );
  const sourceRecord = await prisma.nutritionSourceRecord.upsert({
    where: {
      sourceType_sourceKey: {
        sourceType: NutritionGovernanceSourceType.USDA,
        sourceKey,
      },
    },
    create: {
      sourceType: NutritionGovernanceSourceType.USDA,
      sourceKey,
      sourceTitle: USDA_SOURCE_TITLE,
      sourceDetail: toNullableJson({
        fdcId: target.food.fdcId,
        provider: USDA_PROVIDER,
        sourceProvider: USDA_PROVIDER,
        publicationDate: target.food.publicationDate ?? null,
        searchTerm: target.searchTerm,
        importMode: 'local-usda-raw-cooked-profile-import',
        directImportScore: target.score,
        mappingRole: target.role,
      }),
      foodName: target.food.description,
      foodNameEn: target.food.description,
      dataType: target.food.dataType ?? null,
      category: target.food.foodCategoryId ?? null,
      rawData: toJson({
        food: target.food,
        foodNutrients: nutrients,
      }),
      normalizedNutrition: toNullableJson(profile),
      status: 'ACTIVE',
    },
    update: {
      sourceTitle: USDA_SOURCE_TITLE,
      sourceDetail: toNullableJson({
        fdcId: target.food.fdcId,
        provider: USDA_PROVIDER,
        sourceProvider: USDA_PROVIDER,
        publicationDate: target.food.publicationDate ?? null,
        searchTerm: target.searchTerm,
        importMode: 'local-usda-raw-cooked-profile-import',
        directImportScore: target.score,
        mappingRole: target.role,
      }),
      foodName: target.food.description,
      foodNameEn: target.food.description,
      dataType: target.food.dataType ?? null,
      category: target.food.foodCategoryId ?? null,
      rawData: toJson({
        food: target.food,
        foodNutrients: nutrients,
      }),
      normalizedNutrition: toNullableJson(profile),
    },
  });

  const isPrimary = target.role === 'PRIMARY';
  if (isPrimary) {
    await prisma.ingredient.update({
      where: { id: ingredient.id },
      data: { nutritionProfile: toJson(profile) },
    });
  }

  const nutritionFood = await prisma.nutritionFood.upsert({
    where: {
      name_dataSource_version: {
        name: target.food.description,
        dataSource: NutritionGovernanceSourceType.USDA,
        version: 1,
      },
    },
    create: {
      name: target.food.description,
      nameEn: target.food.description,
      category: NutritionFoodCategory.OTHER,
      dataSource: NutritionGovernanceSourceType.USDA,
      externalId: sourceKey,
      version: 1,
      status: NutritionFoodStatus.VERIFIED,
      preparationState: target.state,
      preparationStateLabel: target.preparationStateLabel,
      ediblePortionLabel: target.ediblePortionLabel,
      processingLabel: target.processingLabel,
      nutritionData: toJson(profile),
      notes: `Direct imported for ${ingredient.name}; ${target.reasons.join('; ')}`,
      verifiedBy: 'system:usda-local-import',
      verifiedAt: new Date(),
    },
    update: {
      nameEn: target.food.description,
      category: NutritionFoodCategory.OTHER,
      externalId: sourceKey,
      status: NutritionFoodStatus.VERIFIED,
      preparationState: target.state,
      preparationStateLabel: target.preparationStateLabel,
      ediblePortionLabel: target.ediblePortionLabel,
      processingLabel: target.processingLabel,
      nutritionData: toJson(profile),
      notes: `Direct imported for ${ingredient.name}; ${target.reasons.join('; ')}`,
      verifiedBy: 'system:usda-local-import',
      verifiedAt: new Date(),
    },
  });

  if (isPrimary) {
    await prisma.nutritionFoodMapping.updateMany({
      where: {
        ingredientId: ingredient.id,
        isPrimary: true,
        NOT: { nutritionFoodId: nutritionFood.id },
      },
      data: { isPrimary: false },
    });
  }

  await prisma.nutritionFoodMapping.upsert({
    where: {
      nutritionFoodId_ingredientId: {
        nutritionFoodId: nutritionFood.id,
        ingredientId: ingredient.id,
      },
    },
    create: {
      nutritionFoodId: nutritionFood.id,
      ingredientId: ingredient.id,
      yieldRate: 1,
      isPrimary,
      notes: `${target.preparationStateLabel}/${target.ediblePortionLabel}/${target.processingLabel}; ${sourceRecord.sourceKey}`,
    },
    update: {
      isPrimary,
      notes: `${target.preparationStateLabel}/${target.ediblePortionLabel}/${target.processingLabel}; ${sourceRecord.sourceKey}`,
    },
  });
}

async function loadUsdaDataset(dataDir: string): Promise<UsdaDataset> {
  const foods = await loadUsdaFoods(resolve(dataDir, 'food.csv'));
  const nutrientDefinitions = await loadUsdaNutrients(
    resolve(dataDir, 'nutrient.csv'),
  );
  const nutrientsByFoodId = await loadUsdaFoodNutrients({
    path: resolve(dataDir, 'food_nutrient.csv'),
    nutrientDefinitions,
  });
  return { foods, nutrientsByFoodId };
}

async function loadUsdaFoods(path: string): Promise<UsdaLocalFoodRow[]> {
  const rows = await readCsv(path);
  const [header, ...records] = rows;
  const index = buildHeaderIndex(header ?? []);

  return records
    .map((row) => ({
      fdcId: row[index.fdc_id] ?? '',
      dataType: row[index.data_type] ?? null,
      description: row[index.description] ?? '',
      foodCategoryId: row[index.food_category_id] ?? null,
      publicationDate: row[index.publication_date] ?? null,
    }))
    .filter((row) => row.fdcId && row.description);
}

async function loadUsdaNutrients(
  path: string,
): Promise<Map<number, UsdaNutrientDefinition>> {
  const rows = await readCsv(path);
  const [header, ...records] = rows;
  const index = buildHeaderIndex(header ?? []);
  const definitions = new Map<number, UsdaNutrientDefinition>();

  for (const row of records) {
    const id = Number(row[index.id]);
    if (!Number.isFinite(id)) continue;
    definitions.set(id, {
      id,
      name: row[index.name] ?? `USDA nutrient ${id}`,
      unitName: row[index.unit_name] ?? '',
    });
  }

  return definitions;
}

async function loadUsdaFoodNutrients({
  path,
  nutrientDefinitions,
}: {
  path: string;
  nutrientDefinitions: Map<number, UsdaNutrientDefinition>;
}): Promise<Map<string, UsdaFoodNutrient[]>> {
  const rows = await readCsv(path);
  const [header, ...records] = rows;
  const index = buildHeaderIndex(header ?? []);
  const nutrientsByFoodId = new Map<string, UsdaFoodNutrient[]>();

  for (const row of records) {
    const fdcId = row[index.fdc_id];
    const nutrientId = Number(row[index.nutrient_id]);
    const amount = Number(row[index.amount]);
    const definition = nutrientDefinitions.get(nutrientId);
    if (!fdcId || !definition || !Number.isFinite(amount)) continue;

    const nutrients = nutrientsByFoodId.get(fdcId) ?? [];
    nutrients.push({
      nutrient: {
        id: definition.id,
        name: definition.name,
        unitName: definition.unitName,
      },
      amount,
    });
    nutrientsByFoodId.set(fdcId, nutrients);
  }

  return nutrientsByFoodId;
}

async function readCsv(path: string): Promise<string[][]> {
  const content = (await readFile(path, 'utf8')).replace(/^\uFEFF/u, '');
  return content
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map(parseCsvLine);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(cell);
      cell = '';
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells;
}

function buildHeaderIndex(header: string[]): Record<string, number> {
  return Object.fromEntries(header.map((name, index) => [name, index]));
}

function buildReportRow({
  ingredient,
  target,
  action,
  reason,
}: {
  ingredient: IngredientRecord;
  target?: SelectedUsdaProfileTarget;
  action: string;
  reason: string;
}): ReportRow {
  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    role: target?.role ?? '',
    state: target?.state ?? '',
    searchTerm: target?.searchTerm ?? '',
    fdcId: target?.food.fdcId ?? '',
    description: target?.food.description ?? '',
    score: target ? String(target.score) : '',
    action,
    reason,
  };
}

async function writeReport(path: string, rows: ReportRow[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const header = [
    'ingredientId',
    'ingredientName',
    'role',
    'state',
    'searchTerm',
    'fdcId',
    'description',
    'score',
    'action',
    'reason',
  ];
  const lines = [
    header.join(','),
    ...rows.map((row) => header.map((key) => csvEscape(row[key as keyof ReportRow])).join(',')),
  ];
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8');
}

function csvEscape(value: string): string {
  if (/[",\n\r]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

function parseArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = {
    apply: false,
    limit: null,
    ingredientName: null,
    usdaDataDir: process.env.USDA_LOCAL_DATA_DIR || DEFAULT_USDA_DATA_DIR,
    outputPath: DEFAULT_OUTPUT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--limit' && next) {
      args.limit = Number(next);
      index += 1;
    } else if (arg === '--ingredient' && next) {
      args.ingredientName = next;
      index += 1;
    } else if (arg === '--usda-dir' && next) {
      args.usdaDataDir = next;
      index += 1;
    } else if (arg === '--output' && next) {
      args.outputPath = next;
      index += 1;
    }
  }

  if (args.limit !== null && !Number.isFinite(args.limit)) {
    throw new Error('--limit must be a number');
  }

  return args;
}

function normalizeIngredientName(name: string): string {
  return name
    .trim()
    .replace(/[（(].*?[）)]/gu, '')
    .replace(/[【\[].*?[】\]]/gu, '')
    .replace(/\s+/gu, '');
}

function normalizeEnglishText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tokenizeEnglish(value: string): string[] {
  return normalizeEnglishText(value).split(/\s+/u).filter(Boolean);
}

function englishTokenMatches(descriptionToken: string, searchToken: string): boolean {
  if (descriptionToken === searchToken) return true;
  return singularizeEnglishToken(descriptionToken) === singularizeEnglishToken(searchToken);
}

function singularizeEnglishToken(token: string): string {
  if (token.endsWith('ies') && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith('es') && token.length > 3) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function hasFinite(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJson(
  value: unknown | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/sevenkitchen';
  }
  const prisma = new PrismaClient();
  runUsdaRawCookedNutritionProfileImport({
    prisma,
    args: parseArgs(process.argv.slice(2)),
    logger: console,
  })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
