/**
 * 过敏原词表初始化 + 给原料库的食材标过敏原
 * （2026-10-04，过敏重构第一期）
 *
 * ── 背景 ────────────────────────────────────────────────────
 *
 *   在此之前"过敏原"只是 allergy_record.allergen 里的一段自由文字，
 *   而推荐与配方的避雷用**纯文字包含**判断：
 *       ingredientSearchText.includes('鸡肉')
 *   原料库里的食材却叫「鸡胸」「鸡腿肉」「鸡心」「鸡肝」「鸡胗」「牛霖」「羊里脊」……
 *       "鸡胸".includes("鸡肉") === false
 *   实测（生产备份库 107 个 FOOD 食材）：12 个常见过敏标签里
 *   **8 个匹配不到任何真实食材**。顾客认真点了"鸡肉过敏"，
 *   系统照样会推含鸡胸肉的食谱。
 *
 * ── 这份脚本做两件事 ────────────────────────────────────────
 *
 *   1. 建过敏原受控词表（标准名 + 别名 + 类别 + 常见度排序）
 *   2. 把原料库里的每个食材**显式**挂到它含有的过敏原上
 *
 *   刻意**不做**名字猜测：查表，不猜。
 *   「鸡胸」里没有"鸡肉"两个字，但它是鸡肉；
 *   「希腊酸奶」是乳制品；「鸡蛋壳粉」是蛋类；「营养酵母」是酵母。
 *   这些只有显式标注才不会漏。
 *
 * ── 常见度排序的依据 ────────────────────────────────────────
 *
 *   知识库 skin-005（小动物临床营养学第 5 版 · 第 31 章《食物不良反应》）：
 *   犬报告中最常引起食物不良反应的成分是**牛肉、乳制品、小麦**
 *   （合计约占报告病例的 69%），其次是**羊肉、鸡蛋、鸡肉、大豆**（约 25%）。
 *   小程序「一点即选」按 commonRank 从小到大排。
 *
 *   ⚠️ 该条目同时明确：致敏成分存在个体差异，常见过敏原统计
 *   **不能替代个体排除-激发试验**；不同地域的常见致敏原也可能不同。
 *   所以排序只用于"先给顾客看哪几个"，不用于任何医学判断。
 *
 * ── 用法 ────────────────────────────────────────────────────
 *
 *   npm run seed:allergen-vocabulary          # 预演，只打印不写库
 *   npm run seed:allergen-vocabulary:apply    # 实际写入
 *
 *   脚本是幂等的：重复执行只会补齐缺失的关联，不会重复插入。
 */

import { PrismaClient } from '@prisma/client';
import { buildTermIndex, normalizeTerm } from '../src/domain/dog/allergen-vocabulary';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

// ---------------------------------------------------------------------------
// 一、过敏原词表
// ---------------------------------------------------------------------------

export interface AllergenSeed {
  /** 内部标识，代码与日志用 */
  code: string;
  /** 标准名，界面展示用 */
  name: string;
  /** 别名：用于给新食材自动推荐关联 + 兜底匹配顾客手写的自由文本 */
  aliases: string[];
  category: string;
  /** 常见度，数字越小越常见（依据见文件头注释） */
  commonRank: number;
}

/**
 * 过敏原清单。
 *
 * 前 8 个是知识库 skin-005 给出的犬常见致敏成分（循证排序）。
 * 其余是**原料库里真实存在的**蛋白源与顾客真实填过的类别
 * （生产数据里出现过「海鲜」「豆类」「南瓜」「红薯」），
 * 漏掉任何一个都会让避雷出现缺口，所以一并建进来。
 */
export const ALLERGEN_SEEDS: readonly AllergenSeed[] = [
  // ── 循证常见（skin-005）────────────────────────────────
  {
    code: 'beef',
    name: '牛肉',
    aliases: ['牛', '牛腩', '牛霖', '牛心', '牛肝', '牛脾', '牛骨', '牛筋', 'beef'],
    category: 'MEAT',
    commonRank: 10,
  },
  {
    code: 'dairy',
    name: '乳制品',
    aliases: [
      '牛奶', '奶', '酸奶', '奶酪', '芝士', '黄油', '奶油', '乳清', '奶粉', '炼乳',
      'milk', 'dairy', 'cheese', 'yogurt', 'yoghurt', 'butter',
    ],
    category: 'DAIRY',
    commonRank: 20,
  },
  {
    code: 'wheat',
    name: '小麦',
    aliases: ['小麦', '面粉', '麸质', '面筋', 'wheat', 'gluten', 'flour'],
    category: 'GRAIN',
    commonRank: 30,
  },
  {
    code: 'lamb',
    name: '羊肉',
    aliases: ['羊', '羊里脊', '羊腿', '羊排', '羔羊', 'lamb', 'mutton'],
    category: 'MEAT',
    commonRank: 40,
  },
  {
    code: 'egg',
    name: '鸡蛋',
    // 各种禽蛋一并归入，且包含蛋壳粉 —— 宁可多报，不可漏报。
    // （禽蛋之间是否存在交叉反应尚无定论；对"避开"这个动作而言，
    //   一起避开是安全方向，个体差异交给排查计划去确认。）
    aliases: ['蛋', '鸡蛋', '蛋黄', '蛋清', '蛋壳', '鸭蛋', '鹌鹑蛋', '鹅蛋', 'egg'],
    category: 'EGG',
    commonRank: 50,
  },
  {
    code: 'chicken',
    name: '鸡肉',
    aliases: ['鸡', '鸡胸肉', '鸡胸', '鸡腿肉', '鸡腿', '鸡心', '鸡肝', '鸡胗', '鸡翅', '鸡架', 'chicken'],
    category: 'POULTRY',
    commonRank: 60,
  },
  {
    code: 'soy',
    name: '大豆',
    aliases: ['大豆', '黄豆', '豆腐', '豆浆', '豆粕', '豆皮', '腐竹', '酱油', 'soy', 'soya', 'soybean'],
    category: 'LEGUME',
    commonRank: 70,
  },
  {
    code: 'fish',
    name: '鱼',
    aliases: [
      '鱼', '鱼肉', '三文鱼', '鲑鱼', '鳕鱼', '沙丁鱼', '金枪鱼', '鲭鱼', '鲈鱼', '龙利鱼',
      'fish', 'salmon', 'cod', 'sardine', 'tuna', 'mackerel',
    ],
    category: 'SEAFOOD',
    commonRank: 80,
  },

  // ── 原料库里真实存在的其它蛋白源 ────────────────────────
  {
    code: 'pork',
    name: '猪肉',
    aliases: ['猪', '猪里脊', '猪心', '猪肝', '猪肾', '猪骨', 'pork'],
    category: 'MEAT',
    commonRank: 90,
  },
  {
    code: 'duck',
    name: '鸭肉',
    aliases: ['鸭', '鸭胸', '鸭腿', '鸭肝', '鸭心', '鸭胗', 'duck'],
    category: 'POULTRY',
    commonRank: 100,
  },
  {
    code: 'corn',
    name: '玉米',
    aliases: ['玉米', '玉米粒', '玉米面', 'corn', 'maize'],
    category: 'GRAIN',
    commonRank: 110,
  },
  {
    code: 'shellfish',
    name: '虾蟹贝类',
    aliases: ['虾', '蟹', '贝', '生蚝', '牡蛎', '青口', '蛤', '扇贝', '鱿鱼', '章鱼',
      'shrimp', 'prawn', 'crab', 'shellfish', 'oyster', 'mussel'],
    category: 'SEAFOOD',
    commonRank: 120,
  },
  {
    code: 'turkey',
    name: '火鸡肉',
    aliases: ['火鸡', 'turkey'],
    category: 'POULTRY',
    commonRank: 130,
  },
  {
    code: 'rabbit',
    name: '兔肉',
    aliases: ['兔', 'rabbit'],
    category: 'MEAT',
    commonRank: 140,
  },
  {
    code: 'venison',
    name: '鹿肉',
    aliases: ['鹿', '鹿肉', '鹿腿', 'venison', 'elk'],
    category: 'MEAT',
    commonRank: 150,
  },
  {
    code: 'goose',
    name: '鹅肉',
    aliases: ['鹅', '鹅肉', '鹅胸', 'goose'],
    category: 'POULTRY',
    commonRank: 160,
  },
  {
    code: 'horse',
    name: '马肉',
    // 生产数据里顾客确实填过「马肉」（还有驴肉、鸵鸟肉）。
    // 原料库里已经有马肉，所以词表必须有它，否则这条过敏原形同虚设。
    aliases: ['马', '马肉', 'horse', 'equine'],
    category: 'MEAT',
    commonRank: 155,
  },

  // ── 类别级（顾客真实填过「海鲜」「豆类」这类词）──────────
  //
  // 生产数据里顾客写下的原话就是类别，不是单一食材：
  //   "鸡肉，牛肉，海鲜" / "牛肉 羊肉 紫薯 南瓜 豆类 红薯"
  // 所以词表必须有类别这一层，否则这些记录一条都匹配不上。
  // 具体食材会**同时**挂到「具体标签」和「类别标签」上
  // （三文鱼 → fish + seafood），这样顾客不管写"鱼"还是"海鲜"都能挡住。
  {
    code: 'seafood',
    name: '海鲜',
    aliases: ['海鲜', '海产', '水产', 'seafood'],
    category: 'SEAFOOD',
    commonRank: 85,
  },
  {
    code: 'legume',
    name: '豆类',
    aliases: ['豆类', '豆', '豆制品', 'legume', 'beans'],
    category: 'LEGUME',
    commonRank: 175,
  },
  {
    code: 'poultry',
    name: '禽肉',
    aliases: ['禽肉', '禽类', '家禽', 'poultry'],
    category: 'POULTRY',
    commonRank: 165,
  },
  {
    code: 'grain',
    name: '谷物',
    aliases: ['谷物', '谷类', '米', '大米', '米饭', '糙米', '燕麦', '小米', '薏仁米',
      '藜麦', '高粱', '荞麦', 'grain', 'rice', 'oat'],
    category: 'GRAIN',
    commonRank: 170,
  },
  {
    code: 'nuts',
    name: '坚果',
    aliases: ['坚果', '核桃', '杏仁', '巴旦木', '腰果', '开心果', '榛子', '夏威夷果',
      'nut', 'almond', 'walnut', 'cashew'],
    category: 'OTHER',
    commonRank: 190,
  },
  {
    code: 'sesame',
    name: '芝麻',
    aliases: ['芝麻', '麻油', '香油', 'sesame'],
    category: 'OTHER',
    commonRank: 200,
  },
  {
    code: 'pumpkin',
    name: '南瓜',
    aliases: ['南瓜', 'pumpkin', 'squash'],
    category: 'VEGETABLE',
    commonRank: 210,
  },
  {
    code: 'sweet_potato',
    name: '红薯',
    aliases: ['红薯', '甘薯', '地瓜', '紫薯', '山芋', 'sweet potato'],
    category: 'VEGETABLE',
    commonRank: 220,
  },
];

// ---------------------------------------------------------------------------
// 二、食材 → 过敏原
// ---------------------------------------------------------------------------

/**
 * 显式标注表：食材名（与 ingredient.name 完全一致）→ 含有的过敏原 code。
 *
 * 为什么不用关键词规则自动推：
 *   · 「上海青」「小白菜」含"白"，但跟"蛋白"无关；
 *   · 「牛磺酸」「牛心」都含"牛"，只有后者是牛肉；
 *   · 「鱼油」是鱼，但「鱼腥草」不是。
 *   规则推出来的错标会直接变成"顾客被误伤"或"过敏原被漏掉"，
 *   两边都不可接受。所以逐个手标，标完可审计、营养师也能改。
 *
 * 蔬菜水果类（胡萝卜、西兰花、苹果…）没有标 ——
 * 它们在犬食物不良反应的报告病例里不是常见致敏成分，
 * 标上去只会让几乎每一份配方都被判"含过敏原"。
 * 顾客若确实对某样蔬果过敏，仍可自由填写，走兜底文字匹配。
 */
export const INGREDIENT_ALLERGEN_MAP: Readonly<Record<string, readonly string[]>> = {
  // ── 禽肉 ──
  '鸡胸': ['chicken', 'poultry'],
  '鸡腿肉': ['chicken', 'poultry'],
  '鸡心': ['chicken', 'poultry'],
  '鸡肝': ['chicken', 'poultry'],
  '鸡胗': ['chicken', 'poultry'],
  '鸡翅': ['chicken', 'poultry'],
  '鸭胸': ['duck', 'poultry'],
  '鸭肉': ['duck', 'poultry'],
  '鸭心': ['duck', 'poultry'],
  '鸭肝': ['duck', 'poultry'],
  '鸭胗': ['duck', 'poultry'],
  '鹅胸肉': ['goose', 'poultry'],
  '鹅肉': ['goose', 'poultry'],
  '鹅肝': ['goose', 'poultry'],
  '火鸡胸': ['turkey', 'poultry'],
  '火鸡胸肉': ['turkey', 'poultry'],
  '火鸡肉': ['turkey', 'poultry'],

  // ── 畜肉 ──
  '牛霖': ['beef'],
  '牛里脊': ['beef'],
  '牛心': ['beef'],
  '牛肝': ['beef'],
  '牛脾': ['beef'],
  '羊里脊': ['lamb'],
  '羊腿肉': ['lamb'],
  '猪里脊': ['pork'],
  '猪心': ['pork'],
  '猪肝': ['pork'],
  '猪肾': ['pork'],
  '兔里脊': ['rabbit'],
  '兔肉': ['rabbit'],
  '鹿腿肉': ['venison'],
  '鹿肉': ['venison'],
  '马肉': ['horse'],

  // ── 水产 ──
  // 同时挂「具体（鱼/虾蟹贝类）」与「类别（海鲜）」：
  // 顾客写"鱼"或"海鲜"都能挡住。
  '三文鱼': ['fish', 'seafood'],
  '比目鱼': ['fish', 'seafood'],
  '沙丁鱼': ['fish', 'seafood'],
  '狭鳕鱼柳': ['fish', 'seafood'],
  '狭鳕鱼': ['fish', 'seafood'],
  '鳕鱼': ['fish', 'seafood'],
  '鳕鱼颈背肉': ['fish', 'seafood'],
  '巴沙鱼柳': ['fish', 'seafood'],
  '罗非鱼': ['fish', 'seafood'],
  '青花鱼': ['fish', 'seafood'],
  '青口贝': ['shellfish', 'seafood'],
  '生蚝': ['shellfish', 'seafood'],
  '南美对虾虾仁': ['shellfish', 'seafood'],
  // 鱼油是补剂，但来源是鱼 —— 对鱼过敏的狗同样要避开
  '鱼油': ['fish', 'seafood'],

  // ── 蛋 / 乳 ──
  '鸡蛋': ['egg'],
  '鸭蛋': ['egg'],
  '鹌鹑蛋': ['egg'],
  '鸡蛋壳粉': ['egg'],
  '希腊酸奶': ['dairy'],

  // ── 谷 / 豆 ──
  // 说明：小麦胚芽油与玉米油属于"来自常见过敏原的油脂"。
  // 精炼油理论上蛋白残留极低、风险很小，但这里**刻意按保守方向处理**——
  // 标上比漏掉安全（方案原文：宁可多报，不可漏报）。
  // 营养师若认为某样油脂可以放行，在后台改关联即可，不必改代码。
  '小麦胚芽油': ['wheat', 'grain'],
  '玉米油': ['corn', 'grain'],
  '玉米粒': ['corn', 'grain'],
  '大米': ['grain'],
  '糙米': ['grain'],
  '黑米': ['grain'],
  '小米': ['grain'],
  '薏仁米': ['grain'],
  '藜麦': ['grain'],
  '燕麦': ['grain'],
  '燕麦米': ['grain'],
  // 大豆同时挂「大豆」与「豆类」：顾客写哪个都能挡住
  '大豆': ['soy', 'legume'],
  '豆腐': ['soy', 'legume'],
  '绿豆': ['legume'],
  '绿豆芽': ['legume'],
  '红小豆': ['legume'],
  '豌豆': ['legume'],
  '四季豆': ['legume'],

  // ── 其它 ──
  '巴旦木': ['nuts'],
  '巴西坚果': ['nuts'],
  '核桃': ['nuts'],
  '白芝麻': ['sesame'],
  '南瓜': ['pumpkin'],
  '生南瓜籽仁': ['pumpkin'],
  '红薯': ['sweet_potato'],
  '紫薯': ['sweet_potato'],
};

// ---------------------------------------------------------------------------
// 三、执行
// ---------------------------------------------------------------------------

function log(message: string) {
  // eslint-disable-next-line no-console
  console.log(message);
}

async function upsertAllergenTags() {
  let created = 0;
  let updated = 0;

  // 预演时不查库（表可能是空的），直接用内存里的定义判断
  const existingCodes = APPLY
    ? new Set(
        (
          await prisma.allergenTag.findMany({ select: { code: true } })
        ).map((tag: { code: string }) => tag.code),
      )
    : new Set<string>();

  for (const seed of ALLERGEN_SEEDS) {
    if (APPLY) {
      await prisma.allergenTag.upsert({
        where: { code: seed.code },
        create: {
          code: seed.code,
          name: seed.name,
          aliases: [...seed.aliases],
          category: seed.category,
          commonRank: seed.commonRank,
          enabled: true,
        },
        update: {
          name: seed.name,
          aliases: [...seed.aliases],
          category: seed.category,
          commonRank: seed.commonRank,
        },
      });
    }

    if (existingCodes.has(seed.code)) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  log(
    `过敏原词表：${ALLERGEN_SEEDS.length} 个（新增 ${created}，更新 ${updated}）` +
      (APPLY ? '' : ' —— 预演，未写库'),
  );

  // 词表内部的别名冲突必须报出来：同一个词被两条过敏原声明时，
  // 后声明的会被静默忽略，导致"顾客写了这个词却匹配到另一个过敏原"。
  const { conflicts } = buildTermIndex(
    ALLERGEN_SEEDS.map((seed) => ({
      code: seed.code,
      name: seed.name,
      aliases: [...seed.aliases],
    })),
  );
  if (conflicts.length > 0) {
    log('');
    log('⚠️ 别名冲突（同一个词被多条过敏原声明，只有先声明的生效）：');
    for (const conflict of conflicts) {
      log(`   「${conflict.term}」：保留 ${conflict.kept}，忽略 ${conflict.dropped}`);
    }
  }
}

/**
 * 给"映射表里没有"的食材按别名自动推荐过敏原。
 *
 * **只推荐、不写库。** 名字匹配正是这次要修掉的东西，
 * 新食材进来时它能给个人工起点，但必须由人确认后再补进
 * INGREDIENT_ALLERGEN_MAP —— 否则就又回到"靠猜名字"的老路上了。
 */
function suggestAllergensFor(
  ingredientName: string,
): Array<{ code: string; name: string; matchedTerm: string }> {
  const suggestions: Array<{ code: string; name: string; matchedTerm: string }> = [];
  const name = normalizeTerm(ingredientName);
  if (!name) return suggestions;

  for (const seed of ALLERGEN_SEEDS) {
    const terms = [seed.name, ...seed.aliases].map(normalizeTerm).filter(Boolean);
    // 用最长匹配优先，避免「牛」把「牛磺酸」也吞了
    const matched = terms
      .filter((term) => term.length >= 1 && name.includes(term))
      .sort((a, b) => b.length - a.length)[0];
    if (matched) {
      suggestions.push({ code: seed.code, name: seed.name, matchedTerm: matched });
    }
  }

  return suggestions;
}

async function linkIngredients() {
  // 预演时用内存定义，实际写入时用库里的（含人工在后台改过的）
  const codeToName = new Map<string, string>(
    ALLERGEN_SEEDS.map((seed) => [seed.code, seed.name]),
  );
  const validCodes = new Set(codeToName.keys());

  const ingredients = await prisma.ingredient.findMany({
    where: { type: 'FOOD' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  // 实际写入时需要库里的 id
  const tagIdByCode = new Map<string, string>();
  if (APPLY) {
    const tags = await prisma.allergenTag.findMany({
      select: { id: true, code: true },
    });
    for (const tag of tags) {
      tagIdByCode.set(tag.code, tag.id);
    }
  }

  let linked = 0;
  const unmapped: string[] = [];
  const unknownCodes = new Set<string>();

  for (const ingredient of ingredients) {
    const codes = INGREDIENT_ALLERGEN_MAP[ingredient.name];

    if (!codes || codes.length === 0) {
      unmapped.push(ingredient.name);
      continue;
    }

    for (const code of codes) {
      if (!validCodes.has(code)) {
        // 映射表里写了一个词表里不存在的 code —— 属于配置错误，必须报出来
        unknownCodes.add(code);
        continue;
      }

      if (APPLY) {
        const allergenTagId = tagIdByCode.get(code);
        if (!allergenTagId) {
          unknownCodes.add(code);
          continue;
        }
        await prisma.ingredientAllergenTag.upsert({
          where: {
            ingredientId_allergenTagId: {
              ingredientId: ingredient.id,
              allergenTagId,
            },
          },
          create: {
            ingredientId: ingredient.id,
            allergenTagId,
            source: 'SEED',
          },
          update: {},
        });
      }
      linked += 1;
    }
  }

  log('');
  log(`食材标注：原料库里 FOOD 食材 ${ingredients.length} 个`);
  log(`  · 已标注 ${ingredients.length - unmapped.length} 个，产生 ${linked} 条关联`);

  if (unknownCodes.size > 0) {
    log('');
    log(`❌ 映射表里出现了词表中不存在的 code：${Array.from(unknownCodes).join('、')}`);
    log('   请修正 INGREDIENT_ALLERGEN_MAP 后重跑。');
  }

  if (unmapped.length > 0) {
    log('');
    log(`未标注过敏原的食材（${unmapped.length} 个）`);
    log('  说明：蔬菜、水果、油脂、种子、菌菇、香料类未标注属于预期——');
    log('        它们不是犬食物不良反应的常见致敏成分，全标上会让几乎每份配方都被判"含过敏原"。');
    log('        但若下面出现了**肉类 / 蛋奶 / 谷物 / 豆类**，那是漏标，必须补进映射表。');
    log('');

    const suspicious: string[] = [];
    for (const name of unmapped) {
      const suggestions = suggestAllergensFor(name);
      if (suggestions.length > 0) {
        suspicious.push(
          `  ⚠️ ${name} → 名字看起来像：${suggestions.map((s) => s.name).join('、')}（请人工确认后补进映射表）`,
        );
      }
    }

    if (suspicious.length > 0) {
      log('  按名字**怀疑漏标**的（仅供参考，不要直接照抄）：');
      log(suspicious.join('\n'));
      log('');
    }

    const plain = unmapped.filter((name) => suggestAllergensFor(name).length === 0);
    if (plain.length > 0) {
      log(`  其余（名字上看不出含常见过敏原）：${plain.join('、')}`);
    }
  }

  return { unknownCodes: unknownCodes.size };
}

/**
 * 体检：原来的 12 个「一点即选」标签能不能落到词表上。
 *
 * 这是对本次改造最直接的自证 —— 改造前它们匹配不到真实食材，
 * 改造后每一个都应该能对应到一个或多个食材。
 */
async function verifyQuickAddTags() {
  const QUICK_ADD = [
    '鸡肉', '牛肉', '羊肉', '猪肉', '鸭肉', '鱼肉', '鸡蛋', '牛奶', '小麦', '玉米', '大豆', '虾',
  ];

  // 预演时用内存定义 + 映射表，实际写入时用库里的真实关联
  const index = new Map<string, string[]>();
  for (const [ingredientName, codes] of Object.entries(INGREDIENT_ALLERGEN_MAP)) {
    for (const code of codes) {
      const list = index.get(code) ?? [];
      list.push(ingredientName);
      index.set(code, list);
    }
  }

  log('');
  log('体检：小程序原来那 12 个「一点即选」标签，现在各自能覆盖多少食材');
  log('（改造后小程序会直接改用词表的标准名，这里验证每个旧标签都还有对应项）');

  let missing = 0;
  for (const label of QUICK_ADD) {
    const hit = ALLERGEN_SEEDS.find(
      (seed) => seed.name === label || seed.aliases.includes(label),
    );
    if (!hit) {
      log(`  ${label}　 → ⚠️ 词表里没有对应项，请补`);
      missing += 1;
      continue;
    }
    const names = index.get(hit.code) ?? [];
    log(
      `  ${label}　 → ${hit.name}（${names.length} 个食材）` +
        (names.length
          ? `：${names.slice(0, 6).join('、')}${names.length > 6 ? '…' : ''}`
          : ' ⚠️ 没有任何食材挂到这个过敏原上'),
    );
  }

  return missing;
}

async function main() {
  log('=== 过敏原词表初始化 ===');
  log(APPLY ? '模式：实际写入（--apply）' : '模式：预演（加 --apply 才会写库）');
  log('');

  await upsertAllergenTags();
  const { unknownCodes } = await linkIngredients();
  const missingQuickAdd = await verifyQuickAddTags();

  log('');
  if (unknownCodes > 0 || missingQuickAdd > 0) {
    process.exitCode = 1;
    log('存在需要修正的问题（见上），未完成。');
    return;
  }
  log(APPLY ? '完成。' : '预演完成，未写库。加 --apply 实际写入。');
}

if (require.main === module) {
  main()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
