/**
 * 批量补齐「一句话卖点」（一次性脚本）
 *
 * 背景：`sellingPoint` 字段、公开接口、详情页与订购页展示位都已就绪，
 * 但线上 92 道 PUBLIC 食谱**一条卖点都没有**——价值主张这一块砖是空的。
 *
 * 合规约束（《宠物饲料标签规定》第二十条）：
 *   · 不得出现疾病名、症状名、功效/预防/治疗表述（这些词一律不用）；
 *   · 声称必须可举证 —— 因此本脚本只用**该食谱自己的配方事实**（原料名）
 *     与**设计依据**（nutritionStandard）生成，不编造任何没有数据支撑的说法。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register prisma/backfill-recipe-selling-points.ts            # 预演
 *   npx ts-node -r tsconfig-paths/register prisma/backfill-recipe-selling-points.ts --apply    # 落库
 *   npx ts-node -r tsconfig-paths/register prisma/backfill-recipe-selling-points.ts --apply --overwrite
 *
 * 幂等：默认只补空值；已存在卖点的记录会被跳过（除非显式传 --overwrite）。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');
const shouldOverwrite = process.argv.includes('--overwrite');

/** 生命阶段 → 原子标签（一个阶段可能同时代表多个，如"低活动成犬或老年犬"） */
const LIFE_STAGE_TOKENS: Record<string, string[]> = {
  PUPPY_UNDER_14_WEEKS: ['幼犬'],
  PUPPY_14_WEEKS_PLUS: ['幼犬'],
  PUPPY: ['幼犬'],
  ADULT: ['成犬'],
  HIGH_ACTIVITY_ADULT: ['成犬'],
  LOW_ACTIVITY_ADULT_OR_SENIOR: ['成犬', '老年犬'],
  SENIOR: ['老年犬'],
  PREGNANCY: ['妊娠期'],
  LACTATION: ['哺乳期'],
  REPRODUCTION: ['繁育期'],
};

/** 拼接顺序：越靠前越有区分度 */
const LIFE_STAGE_ORDER = ['幼犬', '成犬', '老年犬', '妊娠期', '哺乳期', '繁育期'];

/** 常见水产/贝类：作为"搭配"出现时更有卖点感 */
const SEAFOOD_KEYWORDS = ['三文鱼', '青花鱼', '鳕鱼', '鲈鱼', '青口贝', '生蚝', '虾'];

/**
 * 动物性原料关键词。
 * 这里没有现成的"肉类"分类字段可用，因此用名称特征判断，
 * 目的只是让卖点以**动物蛋白**打头（鲜食的卖点感所在），判错也不会产生错误声称。
 */
const ANIMAL_KEYWORDS = [
  '肉', '里脊', '胸', '腿', '肝', '心', '胗', '舌', '骨', '皮',
  '鱼', '鳕', '三文鱼', '青花鱼', '鲈鱼', '生蚝', '青口贝', '虾', '贝',
  '蛋', '鹌鹑', '牛', '猪', '鸡', '鸭', '鹅', '兔', '羊', '鹿', '马', '火鸡', '鸽',
];

interface FoodItem {
  name: string;
  ratio: number;
}

function resolveLifeStageText(stages: unknown): string {
  const list = Array.isArray(stages) ? (stages as string[]) : [];
  const tokens = new Set<string>();
  for (const stage of list) {
    for (const token of LIFE_STAGE_TOKENS[stage] || []) tokens.add(token);
  }
  if (tokens.size === 0) return '全阶段';
  const ordered = LIFE_STAGE_ORDER.filter((token) => tokens.has(token));
  return ordered.slice(0, 2).join('与');
}

function isSeafood(name: string): boolean {
  return SEAFOOD_KEYWORDS.some((keyword) => name.includes(keyword));
}

function isAnimalSource(name: string): boolean {
  return ANIMAL_KEYWORDS.some((keyword) => name.includes(keyword));
}

/**
 * 卖点模板：主语是"这袋里有什么"，而不是"能治什么"。
 * 形如：以兔里脊为主，搭配大米、土豆与三文鱼，成犬与老年犬日常鲜食。
 *
 * 以**动物蛋白**打头：这是鲜食最直接的卖点感来源，也让"里面有什么"一眼可读。
 */
function buildSellingPoint(foodItems: FoodItem[], stages: unknown): string {
  if (foodItems.length === 0) return '';

  const sorted = [...foodItems].sort((a, b) => b.ratio - a.ratio);
  const animalItems = sorted.filter((item) => isAnimalSource(item.name));
  const primary = (animalItems[0] ?? sorted[0]).name;

  const rest = sorted.filter((item) => item.name !== primary);
  // 优先把水产放进搭配里：它是最有感知的卖点原料
  const seafood = rest.find((item) => isSeafood(item.name));
  const others = rest.filter((item) => item !== seafood).slice(0, 2);
  const companions = seafood ? [...others, seafood] : others;

  const companionText = companions.map((item) => item.name).join('、');
  const stageText = resolveLifeStageText(stages);

  if (!companionText) {
    return `以${primary}为主，${stageText}日常鲜食。`;
  }
  return `以${primary}为主，搭配${companionText}，${stageText}日常鲜食。`;
}

async function main() {
  console.log(
    `模式：${shouldApply ? '落库（--apply）' : '预演（不写库）'}${
      shouldOverwrite ? ' · 覆盖已有卖点' : ''
    }\n`,
  );

  const recipes = await prisma.recipe.findMany({
    where: {
      status: 'PUBLIC',
      ...(shouldOverwrite ? {} : { sellingPoint: null }),
    },
    select: {
      id: true,
      name: true,
      status: true,
      sellingPoint: true,
      applicableLifeStages: true,
      items: {
        select: {
          ratioPercent: true,
          ingredient: { select: { name: true, type: true } },
        },
      },
    },
    orderBy: [{ name: 'asc' }],
  });

  if (recipes.length === 0) {
    console.log('✅ 没有需要补卖点的食谱。');
    return;
  }

  const updates: Array<{ id: string; name: string; sellingPoint: string }> = [];
  let skipped = 0;

  for (const recipe of recipes) {
    const foodItems: FoodItem[] = (recipe.items || [])
      .filter((item) => item.ingredient?.type === 'FOOD' && item.ingredient?.name)
      .map((item) => ({
        name: item.ingredient!.name,
        ratio: item.ratioPercent ?? 0,
      }));

    const sellingPoint = buildSellingPoint(foodItems, recipe.applicableLifeStages);
    if (!sellingPoint) {
      skipped += 1;
      continue;
    }
    updates.push({ id: recipe.id, name: recipe.name, sellingPoint });
  }

  console.log(`待更新 ${updates.length} 条${skipped ? `，跳过 ${skipped} 条（无配方数据）` : ''}\n`);
  console.log('样例（前 8 条）：');
  for (const row of updates.slice(0, 8)) {
    console.log(`  ${row.name}\n    → ${row.sellingPoint}`);
  }
  console.log('');

  if (!shouldApply) {
    console.log('这是预演。确认无误后加 --apply 落库。');
    return;
  }

  let done = 0;
  for (const row of updates) {
    await prisma.recipe.update({
      where: { id: row.id },
      data: { sellingPoint: row.sellingPoint },
    });
    done += 1;
  }
  console.log(`✅ 已为 ${done} 道食谱写入卖点。`);
}

main()
  .catch((error) => {
    console.error('执行失败：', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
