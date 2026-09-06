/**
 * Draft builder for the semi-automatic ingredient workflow.
 *
 * Takes the matcher output (match-local-nutrition.ts) plus a chosen
 * source record and basic business fields, and produces a complete
 * draft JSON ready for apply-production-ingredient.ts.
 *
 * Usage (from backend/):
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     ../skills/adding-standard-ingredients/scripts/build-draft-from-match.ts \
 *     --match ../.standard-ingredient-import/<slug>.match.json \
 *     --source-record-id <record id> \
 *     --name 去皮鸡腿肉 --type FOOD --category MEAT \
 *     --purchase-unit g --price 0.05 --purchase-channel 本地市场 \
 *     --out ../.standard-ingredient-import/<slug>.draft.json \
 *     [--overrides overrides.json]
 */

interface BuildDraftArgs {
  match?: string;
  sourceRecordId?: string;
  name?: string;
  nameEn?: string;
  type?: string;
  category?: string;
  state?: string;
  baseUnit?: string;
  purchaseUnit?: string;
  price?: string;
  purchaseChannel?: string;
  brand?: string;
  productModel?: string;
  out?: string;
  overrides?: string;
  help?: boolean;
}

const USAGE = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/build-draft-from-match.ts \
    --match <match.json> --source-record-id <record id> --name <中文名> \
    --type FOOD|SUPPLEMENT --category MEAT|ORGAN|SEAFOOD|VEGETABLE|FRUIT|GRAIN|DAIRY|EGG|OIL|SUPPLEMENT|OTHER \
    --purchase-unit g --price 0.05 [--purchase-channel 本地市场] [--brand ..] [--product-model ..] \
    --out <draft.json> [--overrides <partial draft json>]
`;

function parseArgs(): BuildDraftArgs {
  const args: BuildDraftArgs = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i += 1) {
    const flag = raw[i];
    if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else if (flag.startsWith('--')) {
      const key = flag
        .slice(2)
        .replace(/-([a-z])/g, (_m, c) => c.toUpperCase()) as keyof BuildDraftArgs;
      (args as Record<string, string | boolean | undefined>)[key] = raw[i + 1];
      i += 1;
    }
  }
  return args;
}

async function readJsonFile<T>(path: string): Promise<T> {
  const fs = require('fs') as typeof import('fs');
  return JSON.parse(await fs.promises.readFile(path, 'utf8')) as T;
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  const fs = require('fs') as typeof import('fs');
  await fs.promises.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function deepMerge(target: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function upper(value: string | undefined): string {
  return (value ?? '').toUpperCase();
}

const CATEGORY_ALIASES: Record<string, string> = {
  肉: 'MEAT',
  肉类: 'MEAT',
  猪肉: 'MEAT',
  牛肉: 'MEAT',
  羊肉: 'MEAT',
  鸡肉: 'MEAT',
  鸭肉: 'MEAT',
  禽肉: 'MEAT',
  内脏: 'ORGAN',
  器官: 'ORGAN',
  海鲜: 'SEAFOOD',
  水产: 'SEAFOOD',
  鱼: 'SEAFOOD',
  虾: 'SEAFOOD',
  贝类: 'SEAFOOD',
  蔬菜: 'VEGETABLE',
  水果: 'FRUIT',
  谷物: 'GRAIN',
  谷类: 'GRAIN',
  粮食: 'GRAIN',
  乳制品: 'DAIRY',
  奶制品: 'DAIRY',
  蛋: 'EGG',
  蛋类: 'EGG',
  油: 'OIL',
  油脂: 'OIL',
  补剂: 'SUPPLEMENT',
  补充剂: 'SUPPLEMENT',
  其他: 'OTHER',
  其它: 'OTHER',
};

function normalizeCategory(value: string | undefined): string {
  const text = (value ?? '').trim();
  return CATEGORY_ALIASES[text] ?? upper(text);
}

function normalizePreparationStateLabel(state: string | undefined): string {
  switch (state) {
    case 'raw':
      return '生重';
    case 'cooked':
      return '熟重';
    case 'dried':
      return '干制';
    default:
      return state ?? '生重';
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (
    args.help ||
    !args.match ||
    !args.sourceRecordId ||
    !args.name ||
    !args.type ||
    !args.category ||
    !args.out
  ) {
    console.error(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const type = upper(args.type);
  if (type !== 'FOOD' && type !== 'SUPPLEMENT') {
    throw new Error('--type 只能是 FOOD 或 SUPPLEMENT。');
  }
  const state = args.state ?? 'raw';

  const match = await readJsonFile<any>(args.match);
  const allCandidates = [...(match.ranked ?? []), ...(match.nearby ?? [])];
  const chosen = allCandidates.find(
    (c: any) => c.sourceRecordId === args.sourceRecordId,
  );
  if (!chosen) {
    throw new Error(
      `在 ${args.match} 中找不到 sourceRecordId=${args.sourceRecordId} 的候选。`,
    );
  }

  const path = require('path') as typeof import('path');
  const { PrismaClient } = require(path.join(
    process.cwd(),
    'node_modules/@prisma/client',
  )) as { PrismaClient: new () => any };
  const prisma = new PrismaClient();
  let record: any;
  try {
    record = await prisma.nutritionSourceRecord.findUnique({
      where: { id: args.sourceRecordId },
    });
  } finally {
    await prisma.$disconnect();
  }
  if (!record) {
    throw new Error(`本地营养库中不存在记录 ${args.sourceRecordId}。`);
  }

  const profile =
    record.normalizedNutrition &&
    typeof record.normalizedNutrition === 'object' &&
    record.normalizedNutrition.macros
      ? record.normalizedNutrition
      : null;

  const coveragePercent = chosen.coveragePercent ?? 0;
  const missingNutrients = chosen.missingNutrients ?? [];
  const nutritionPending = coveragePercent < 60;

  const price = args.price !== undefined ? Number(args.price) : 0;
  const purchaseUnit = args.purchaseUnit ?? 'g';
  const purchaseChannel = args.purchaseChannel ?? null;

  const draft: Record<string, any> = {
    version: 1,
    summary: {
      name: args.name,
      nameEn: args.nameEn ?? record.foodNameEn ?? record.foodName ?? null,
      type,
      state,
      coveragePercent,
      missingNutrients,
      evidenceNotes: `营养数据来源：本地营养库记录 ${record.id}（${record.sourceType}，${
        profile?.meta?.rawBasisType ?? 'PER_100_G'
      }）。`,
      notesForUser: null,
    },
    ingredient: {
      name: args.name,
      type,
      procurementStrategy: 'DAILY_PURCHASE',
      diyEnabled: false,
      procurementEnabled: type === 'FOOD',
      brand: args.brand ?? null,
      productModel: args.productModel ?? null,
      purchaseChannel,
      notes: null,
      baseUnit: upper(args.baseUnit ?? 'G'),
      baseUnitDisplayName: upper(args.baseUnit ?? 'G') === 'ML' ? '毫升' : '克',
      unitDisplayLabel: purchaseUnit,
      purchaseUnit,
      purchaseToBaseRatio: 1,
      currentPricePerPurchaseUnit: price,
      effectivePricePerPurchaseUnit: price,
      properties: {
        nutritionPending,
        nutritionCoveragePercent: coveragePercent,
        missingNutrients,
        nutritionSourceRecordId: record.id,
      },
    },
    nutritionFood:
      type === 'FOOD' && profile
        ? {
            name: args.name,
            nameEn: args.nameEn ?? record.foodNameEn ?? null,
            category: normalizeCategory(args.category),
            dataSource: record.sourceType,
            externalId:
              profile?.meta?.externalId ??
              record.sourceKey ??
              String(record.id),
            preparationState: upper(state),
            preparationStateLabel: normalizePreparationStateLabel(state),
            ediblePortionLabel: null,
            processingLabel: null,
            nutritionData: profile,
            notes: `来源：本地营养库记录 ${record.id}（${record.sourceType}）。`,
          }
        : null,
    mapping:
      type === 'FOOD' && profile
        ? { isPrimary: true, yieldRate: 1, notes: null }
        : null,
    procurementSku: null,
    tags: null,
  };

  const merged = args.overrides
    ? deepMerge(draft, await readJsonFile<Record<string, any>>(args.overrides))
    : draft;

  await writeJsonFile(args.out, merged);
  console.log(`✅ 草稿已生成：${args.out}`);
  console.log('');
  console.log(`名称：${merged.summary.name}（${merged.summary.type}，${state}）`);
  console.log(`营养来源：${record.sourceType}，覆盖率 ${coveragePercent}%${nutritionPending ? '（营养待补）' : ''}`);
  if (missingNutrients.length > 0) {
    console.log(`缺失营养素：${missingNutrients.join('、')}`);
  }
  console.log(`采购单位：${purchaseUnit}，参考价：${price}`);
  console.log('');
  console.log('请人工检查草稿并补充：采购 SKU、补剂包装依据、价格等业务信息，然后交给用户确认。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
