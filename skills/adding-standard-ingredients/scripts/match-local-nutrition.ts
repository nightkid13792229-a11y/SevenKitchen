/**
 * Local nutrition source matcher for the semi-automatic ingredient workflow.
 *
 * Input: ingredient name (Chinese/English) + requested preparation state.
 * Output: ranked candidates from the local `nutrition_source_record` table,
 * with FEDIAF 2025 essential-nutrient coverage computed by the existing
 * backend audit module. No network access needed.
 *
 * Usage (from backend/):
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     ../skills/adding-standard-ingredients/scripts/match-local-nutrition.ts \
 *     --name 苋菜 --state raw \
 *     --out ../.standard-ingredient-import/amaranth.match.json
 */
import type {
  NutritionImportAuditInput,
  NutritionImportNutrientValue,
} from '../../../backend/src/application/standard-ingredient-import/nutrition-audit';
import type { NutritionProfileV2 } from '../../../backend/src/domain/ingredient/types';
import type { NutritionStateTag } from '../../../backend/src/application/standard-ingredient-import/source-policy';

const {
  auditNutritionProfileForImport,
} = require('../../../backend/src/application/standard-ingredient-import');
const {
  rankNutritionSourceCandidates,
} = require('../../../backend/src/application/standard-ingredient-import/source-policy');
const {
  scoreIngredientSourceNameMatch,
  mapUsdaNutrientsToNutritionProfile,
} = require('../../../backend/src/domain/nutrition-governance/nutrition-governance.utils');
const {
  NUTRITION_FIELD_CATALOG,
} = require('../../../backend/src/domain/ingredient/nutrition-field-catalog');
const path = require('path') as typeof import('path');
// Scripts run from backend/ (see usage); resolve the Prisma client from the
// backend node_modules so this skill script stays runnable from the backend dir.
interface MatcherPrismaClient {
  nutritionSourceRecord: {
    findMany(args: { where?: Record<string, unknown>; orderBy?: Record<string, string> }): Promise<any[]>;
  };
  $disconnect(): Promise<void>;
}
const prismaClientModule = require(path.join(
  process.cwd(),
  'node_modules/@prisma/client',
)) as { PrismaClient: new () => MatcherPrismaClient };
const PrismaClient = prismaClientModule.PrismaClient;

interface MatchCliArgs {
  name?: string;
  nameEn?: string;
  state?: string;
  out?: string;
  limit?: string;
  minNameScore?: string;
  sourceType?: string;
  help?: boolean;
}

const USAGE = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/match-local-nutrition.ts \
    --name <ingredient name> [--name-en <english name>] [--state raw|cooked|dried|powder|oil] \
    [--limit 10] [--min-name-score 0.5] [--source-type USDA] [--out <output.json>]
`;

const STATE_TAGS: NutritionStateTag[] = [
  'raw',
  'cooked',
  'dried',
  'peeled',
  'unpeeled',
  'oil',
  'powder',
  'prepared',
];

/**
 * 中文食材名 → 日语候选名（用于匹配 MEXT 日本食品标准成分表）。
 * MEXT 库内为日语食品名，中文查询词无法直接命中，这里维护常用食材的
 * 中→日别名。列表可随使用持续扩充。
 */
const CHINESE_JAPANESE_FOOD_ALIASES: Record<string, string[]> = {
  冬瓜: ['とうがん'],
  白萝卜: ['だいこん'],
  萝卜: ['だいこん'],
  青萝卜: ['だいこん'],
  燕麦: ['えんばく', 'オートミール', 'オート麦'],
  燕麦片: ['えんばく', 'オートミール'],
  山药: ['やまのいも', 'ながいも', 'じねんじょ'],
  长山药: ['ながいも'],
  铁棍山药: ['ながいも', 'やまのいも'],
  芋头: ['さといも'],
  香芋: ['さといも'],
  薏米: ['はとむぎ'],
  薏仁米: ['はとむぎ'],
  小白菜: ['こまつな', 'しろな', 'チンゲンサイ'],
  上海青: ['チンゲンサイ'],
  油菜: ['あぶらな', 'こまつな'],
  苋菜: ['ひゆ'],
  空心菜: ['ようさい', 'エンサイ'],
  茼蒿: ['しゅんぎく'],
  西蓝花: ['ブロッコリー'],
  西兰花: ['ブロッコリー'],
  菜花: ['カリフラワー'],
  卷心菜: ['キャベツ'],
  包菜: ['キャベツ'],
  生菜: ['レタス'],
  芹菜: ['セロリ'],
  胡萝卜: ['にんじん'],
  玉米: ['とうもろこし', 'スイートコーン'],
  红薯: ['さつまいも'],
  地瓜: ['さつまいも'],
  紫薯: ['さつまいも'],
  土豆: ['じゃがいも', 'ばれいしょ'],
  马铃薯: ['ばれいしょ'],
  莲藕: ['れんこん'],
  南瓜: ['かぼちゃ'],
  贝贝南瓜: ['かぼちゃ'],
  菠菜: ['ほうれんそう'],
  韭菜: ['にら'],
  大葱: ['ねぎ'],
  洋葱: ['たまねぎ', '玉ねぎ'],
  大蒜: ['にんにく'],
  蒜头: ['にんにく'],
  生姜: ['しょうが'],
  香菜: ['コリアンダー', 'パクチー'],
  芦笋: ['アスパラガス'],
  秋葵: ['オクラ'],
  青椒: ['ピーマン', 'たまな'],
  彩椒: ['パプリカ'],
  番茄: ['トマト'],
  西红柿: ['トマト'],
  黄瓜: ['きゅうり'],
  茄子: ['なす'],
  毛豆: ['えだまめ', 'だいず'],
  黄豆: ['だいず'],
  大豆: ['だいず'],
  绿豆: ['りょくとう'],
  红豆: ['あずき'],
  黑豆: ['くろだいず'],
  鹰嘴豆: ['ひよこまめ'],
  豌豆: ['えんどう'],
  青豆: ['グリンピース', 'えんどう'],
  猪肉: ['ぶたにく', '豚肉'],
  猪里脊: ['ぶたヒレ', 'ぶたロース'],
  猪肝: ['ぶたレバー', '豚レバー'],
  猪心: ['ぶたハツ', '豚心臓'],
  猪肚: ['ぶた胃', '豚胃'],
  牛肉: ['ぎゅうにく', '牛肉'],
  牛里脊: ['牛ヒレ', '牛ロース'],
  牛肝: ['牛レバー'],
  牛心: ['牛ハツ', '牛心臓'],
  牛肚: ['牛胃'],
  羊肉: ['マトン', 'ラム', 'めんよう'],
  羊肝: ['めんようレバー'],
  鸡肉: ['にわとり', '鶏肉'],
  鸡胸肉: ['鶏むね肉', '鶏胸肉'],
  鸡腿肉: ['鶏もも肉', '鶏もも'],
  鸡肝: ['鶏レバー', 'にわとりレバー'],
  鸡心: ['鶏ハツ', '鶏心臓'],
  鸡胗: ['鶏砂肝', '鶏砂ずり'],
  鸭肉: ['あひる', 'かも'],
  鸭肝: ['あひるレバー'],
  鸭心: ['あひるハツ'],
  三文鱼: ['さけ', 'サーモン'],
  鲑鱼: ['さけ'],
  金枪鱼: ['まぐろ'],
  鳕鱼: ['たら'],
  真鳕: ['まだら'],
  鲈鱼: ['すずき'],
  带鱼: ['たちうお'],
  黄花鱼: ['きぐち', 'いしもち'],
  鲫鱼: ['ふな'],
  鲤鱼: ['こい'],
  虾: ['えび'],
  南美白虾: ['ばなめいえび', 'えび'],
  虾仁: ['えび', 'むきえび'],
  青虾: ['くるまえび', 'えび'],
  基围虾: ['くるまえび', 'えび'],
  螃蟹: ['かに', 'ずわいがに'],
  扇贝: ['ほたてがい'],
  蛤蜊: ['あさり', 'はまぐり'],
  生蚝: ['かき'],
  牡蛎: ['かき'],
  鱿鱼: ['するめいか', 'いか'],
  章鱼: ['たこ'],
  海带: ['こんぶ', '昆布'],
  紫菜: ['のり', 'あまのり'],
  海苔: ['のり'],
  裙带菜: ['わかめ'],
  香菇: ['しいたけ', '干ししいたけ'],
  金针菇: ['えのきたけ'],
  杏鲍菇: ['エリンギ'],
  口蘑: ['マッシュルーム'],
  平菇: ['ひらたけ'],
  木耳: ['きくらげ'],
  银耳: ['しろきくらげ'],
  猴头菇: ['やまぶしたけ'],
  羊肚菌: ['アミガサタケ'],
  苹果: ['りんご'],
  香蕉: ['バナナ'],
  蓝莓: ['ブルーベリー'],
  草莓: ['いちご'],
  西瓜: ['すいか'],
  芒果: ['マンゴー'],
  牛油果: ['アボカド'],
  猕猴桃: ['キウイフルーツ'],
  橙子: ['オレンジ'],
  柚子: ['ゆず', 'グレープフルーツ'],
  柠檬: ['レモン'],
  椰子: ['ココナッツ'],
  大米: ['こめ', '精白米'],
  米饭: ['こめ', 'めし'],
  糙米: ['げんまい'],
  黑米: ['くろまい', '黒米'],
  小米: ['あわ'],
  面粉: ['こむぎこ', '小麦粉'],
  全麦粉: ['ぜんりゅうふん', '全粒粉'],
  荞麦: ['そば'],
  豆腐: ['とうふ'],
  豆干: ['豆腐干', 'あつあげ'],
  豆浆: ['豆乳'],
  鸡蛋: ['鶏卵', 'たまご'],
  鸭蛋: ['あひる卵'],
  鹌鹑蛋: ['うずら卵'],
  牛奶: ['牛乳', 'ぎゅうにゅう'],
  酸奶: ['ヨーグルト'],
  奶酪: ['チーズ'],
  黄油: ['バター'],
  蜂蜜: ['はちみつ'],
  芝麻: ['ごま'],
  亚麻籽: ['あまに'],
  奇亚籽: ['チアシード'],
  核桃: ['くるみ'],
  杏仁: ['アーモンド'],
  腰果: ['カシューナッツ'],
  花生: ['ピーナッツ', 'らっかせい'],
  莲子: ['はすのみ', 'れんし'],
  百合: ['ゆりね'],
  枸杞: ['クコ', 'クコの実'],
  红枣: ['なつめ'],
  桂圆: ['りゅうがん'],
};

const TAB_KEYS = ['macros', 'minerals', 'vitamins', 'fattyAcids', 'aminoAcids'] as const;

const SOURCE_CODE_BY_TYPE: Record<string, string> = {
  USDA: 'USDA_FDC',
  NZFCD: 'NZFCD',
  NEVO: 'NEVO',
  MEXT: 'MEXT',
  AFCD: 'AFCD',
  AUSNUT: 'AUSNUT',
  CNF: 'CNF',
  COFID: 'COFID',
  CIQUAL: 'CIQUAL',
  CFCT: 'CFCT',
};

function parseArgs(): MatchCliArgs {
  const args: MatchCliArgs = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i += 1) {
    const flag = raw[i];
    if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else if (flag.startsWith('--')) {
      const key = flag
        .slice(2)
        .replace(/-([a-z])/g, (_m, c) => c.toUpperCase()) as keyof MatchCliArgs;
      (args as Record<string, string | boolean | undefined>)[key] = raw[i + 1];
      i += 1;
    }
  }
  return args;
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await require('fs').promises.writeFile(
    path,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function inferStateTags(foodName: string, profile: NutritionProfileV2 | null): NutritionStateTag[] {
  const tags = new Set<NutritionStateTag>();
  const sampleState = profile?.meta?.sampleState?.toUpperCase?.() ?? '';
  if (sampleState === 'RAW') tags.add('raw');
  if (sampleState === 'COOKED') tags.add('cooked');
  if (sampleState === 'DRIED' || sampleState === 'DRY') tags.add('dried');

  const text = `${foodName ?? ''}`.toLowerCase();
  if (/\braw\b|\buncooked\b|\bunheated\b/.test(text)) tags.add('raw');
  if (/(^|[\s　])生($|[\s　])/.test(foodName ?? '')) tags.add('raw');
  if (/\bcooked\b|\bboiled\b|\bbaked\b|\broasted\b|\bgrilled\b/.test(text)) {
    tags.add('cooked');
  }
  if (/ゆで|ゆでた|蒸し|焼き|ロースト|グリル|フライ|炒め/.test(foodName ?? '')) {
    tags.add('cooked');
  }
  if (/\bdried\b|\bdehydrated\b/.test(text) || /干/.test(foodName ?? '')) {
    tags.add('dried');
  }
  if (/干し|乾燥|ほし|フリーズドライ/.test(foodName ?? '')) tags.add('dried');
  if (/\boil\b/.test(text)) tags.add('oil');
  if (/油/.test(foodName ?? '') && !/油炒め/.test(foodName ?? '')) tags.add('oil');
  if (/\bpowder\b|\bflour\b/.test(text) || /粉/.test(foodName ?? '')) {
    tags.add('powder');
  }
  if (/缶詰|瓶詰|レトルト|水煮/.test(foodName ?? '')) tags.add('prepared');
  return [...tags];
}

function profileToFlatAuditInput(
  profile: NutritionProfileV2,
  profileName: string,
): NutritionImportAuditInput {
  const nutrients: Record<string, NutritionImportNutrientValue> = {};
  const sourceForms: Record<
    string,
    Record<string, string | number | boolean | null | undefined>
  > = {};

  for (const tabKey of TAB_KEYS) {
    const tab = (profile as unknown as Record<string, Record<string, number | null>>)[tabKey] ?? {};
    for (const [fieldKey, value] of Object.entries(tab)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }
      const definition = NUTRITION_FIELD_CATALOG.find(
        (field: { tabKey: string; fieldKey: string }) =>
          field.tabKey === tabKey && field.fieldKey === fieldKey,
      );
      if (!definition) {
        continue;
      }
      nutrients[fieldKey] = { value, unit: definition.unit };
      const sourceForm = profile.meta?.sourceForms?.[`${tabKey}.${fieldKey}`];
      if (sourceForm) {
        sourceForms[fieldKey] = sourceForm;
      }
    }
  }

  return { profileName, nutrients, sourceForms };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help || (!args.name && !args.nameEn)) {
    console.error(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const requestedState = STATE_TAGS.includes(args.state as NutritionStateTag)
    ? (args.state as NutritionStateTag)
    : 'raw';
  const limit = args.limit ? Number(args.limit) : 10;
  const minNameScore = args.minNameScore ? Number(args.minNameScore) : 0.5;

  const prisma = new PrismaClient();
  try {
    const records = await prisma.nutritionSourceRecord.findMany({
      where: args.sourceType ? { sourceType: args.sourceType } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    interface ScoredRecord {
      record: Record<string, any>;
      nameScore: number;
      bestName: string;
      profile: NutritionProfileV2 | null;
      stateTags: NutritionStateTag[];
      coveragePercent: number;
      missingNutrients: string[];
      blockingIssueCodes: string[];
      reviewIssueCodes: string[];
      sourceCode: string | undefined;
    }

    const scored: ScoredRecord[] = [];
    for (const record of records) {
      let nameScore = 0;
      let bestName = record.foodName ?? '';
      const baseCandidates = [args.name, args.nameEn].filter(Boolean) as string[];
      const japaneseAliases =
        record.sourceType === 'MEXT'
          ? (args.name ? (CHINESE_JAPANESE_FOOD_ALIASES[args.name] ?? []) : [])
          : [];
      const candidatesForScore = [...baseCandidates, ...japaneseAliases];
      for (const inputName of candidatesForScore) {
        for (const recordName of [record.foodName, record.foodNameEn].filter(Boolean) as string[]) {
          try {
            const result = scoreIngredientSourceNameMatch({
              ingredientName: inputName,
              sourceFoodName: recordName,
              sourceType: record.sourceType,
            });
            if (result.score > nameScore) {
              nameScore = result.score;
              bestName = recordName;
            }
          } catch {
            // ignore scoring failures for exotic values
          }
        }
      }
      if (nameScore < minNameScore) {
        continue;
      }

      let profile: NutritionProfileV2 | null = null;
      const normalized = record.normalizedNutrition as NutritionProfileV2 | null;
      if (normalized && typeof normalized === 'object' && normalized.macros) {
        profile = normalized;
      } else if (
        record.sourceType === 'USDA' &&
        Array.isArray((record.rawData as any)?.foodNutrients)
      ) {
        profile = mapUsdaNutrientsToNutritionProfile(
          (record.rawData as any).foodNutrients,
        ) as NutritionProfileV2;
      }
      if (!profile) {
        continue;
      }

      const auditInput = profileToFlatAuditInput(profile, bestName);
      const audit = auditNutritionProfileForImport(auditInput);
      scored.push({
        record,
        nameScore,
        bestName,
        profile,
        stateTags: inferStateTags(record.foodName ?? '', profile),
        coveragePercent: roundPercent(audit.essentialCoveragePercent),
        missingNutrients: audit.missingEssentialNutrients,
        blockingIssueCodes: audit.blockingIssues.map((i: any) => i.code),
        reviewIssueCodes: audit.reviewIssues.map((i: any) => i.code),
        sourceCode: SOURCE_CODE_BY_TYPE[record.sourceType],
      });
    }

    const rankable = scored
      .filter((s) => s.sourceCode && s.stateTags.length > 0)
      .map((s) => ({
        source: s.sourceCode as string,
        matchedName: s.bestName,
        stateTags: s.stateTags,
        essentialCoveragePercent: s.coveragePercent,
      }));
    const ranked =
      rankable.length > 0
        ? rankNutritionSourceCandidates({ requestedState, candidates: rankable })
        : [];
    const rankedByBestName = new Map(
      (ranked as any[]).map((r: any) => [`${r.source}|${r.matchedName}`, r]),
    );

    const rankedResults = scored
      .filter((s) => rankedByBestName.has(`${s.sourceCode}|${s.bestName}`))
      .sort((a, b) => b.coveragePercent - a.coveragePercent)
      .map((s) => ({
        ...toResultRow(s),
        rank: (rankedByBestName.get(`${s.sourceCode}|${s.bestName}`) as any)?.score,
      }));
    const nearbyResults = scored
      .filter((s) => !rankedByBestName.has(`${s.sourceCode}|${s.bestName}`))
      .sort((a, b) => b.nameScore - a.nameScore || b.coveragePercent - a.coveragePercent)
      .slice(0, limit)
      .map((s) => toResultRow(s));

    const output = {
      query: {
        name: args.name ?? null,
        nameEn: args.nameEn ?? null,
        requestedState,
        minNameScore,
      },
      scannedRecords: records.length,
      matchedRecords: scored.length,
      ranked: rankedResults.slice(0, limit),
      nearby: nearbyResults,
    };

    if (args.out) {
      await writeJsonFile(args.out, output);
    }

    console.log(
      `匹配完成：扫描 ${records.length} 条本地营养记录，名称命中 ${scored.length} 条，状态符合 ${rankedResults.length} 条。`,
    );
    console.log('');
    console.log('—— 状态符合的候选（按覆盖率排序）——');
    for (const row of output.ranked.slice(0, limit)) {
      console.log(
        `• ${row.bestName} [${row.source}] 状态=${(row.stateTags ?? []).join('/')} 覆盖率=${row.coveragePercent}% 名称匹配=${row.nameScore}`,
      );
    }
    if (output.ranked.length === 0) {
      console.log('（无。下方为名称接近但状态不符的候选，可人工参考）');
    }
    if (output.nearby.length > 0) {
      console.log('');
      console.log('—— 名称接近的其他候选 ——');
      for (const row of output.nearby) {
        console.log(
          `• ${row.bestName} [${row.source}] 状态=${(row.stateTags ?? []).join('/') || '未知'} 覆盖率=${row.coveragePercent}% 名称匹配=${row.nameScore}`,
        );
      }
    }
    if (args.out) {
      console.log('');
      console.log(`结果已写入：${args.out}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function toResultRow(s: {
  record: Record<string, any>;
  nameScore: number;
  bestName: string;
  stateTags: NutritionStateTag[];
  coveragePercent: number;
  missingNutrients: string[];
  blockingIssueCodes: string[];
  reviewIssueCodes: string[];
  sourceCode: string | undefined;
}) {
  return {
    sourceRecordId: s.record.id,
    source: s.sourceCode ?? s.record.sourceType,
    sourceType: s.record.sourceType,
    externalId: s.record.sourceKey ?? null,
    bestName: s.bestName,
    foodName: s.record.foodName,
    foodNameEn: s.record.foodNameEn ?? null,
    nameScore: Math.round(s.nameScore * 100) / 100,
    stateTags: s.stateTags,
    coveragePercent: s.coveragePercent,
    missingNutrients: s.missingNutrients,
    blockingIssueCodes: s.blockingIssueCodes,
    reviewIssueCodes: s.reviewIssueCodes,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
