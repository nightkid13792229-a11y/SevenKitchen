/**
 * 食谱内容合规处置（一次性脚本）
 *
 * 背景：2026-09-17 的清理只删除了「健康标签」，**没有处理封面角标（coverTitle）与说明文案（description）**。
 * 结果同一批疾病名仍以更显眼的形式对外展示——封面角标出现在首页商品橱窗上。
 *
 * 违反的是《宠物饲料标签规定》（农业农村部公告第 20 号）第二十条第（一）项：
 *   「禁止对宠物饲料作具有预防或者治疗宠物疾病的说明或者宣传。」
 *
 * 实测命中（线上公开接口，2026-09-18）：
 *   · 兔里脊大米土豆   coverTitle=IBD          description 含 IBD / 肠胃敏感 / 胰腺炎 / 治疗 / 处方 …
 *   · 糙米西葫芦牛肉   coverTitle=草酸钙结石    description 含「延缓结石增大和防止复发」（预防性说明）
 *   · 小米山药猪肉     coverTitle=胆泥淤积      description 含 胆泥淤积 / 高脂血症 / 胰腺炎 / 肝衰竭
 *
 * 处置动作：
 *   1. 封面角标换成**可举证的成分事实**（原料添加量 ≥ 产品总重 4%，法规第二十条（三）3）
 *   2. 说明文案重写为配方事实 + 换食建议 + 免责提示，不含任何疾病名与功效/预防表述
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register prisma/apply-recipe-content-compliance.ts            # 预演
 *   npx ts-node -r tsconfig-paths/register prisma/apply-recipe-content-compliance.ts --apply    # 落库
 *
 * 幂等：可重复执行。已经合规的记录会被识别为"无需处理"。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

/**
 * 违规/高风险封面角标 → 合规替换。
 *
 * 三类依据：
 *   A. 疾病名（第二十条（一）明文禁止）—— 换成**成分事实**，原料添加量均 ≥4%（第二十条（三）3）
 *   B. 处方/功能暗示（附录 5 属处方产品专属）—— 同样换成成分事实
 *   C. 无依据或比较性表述 —— 用户已确认的替换口径
 *
 * 每条替换的原料占比均已核对线上配方（见注释）。
 */
const COVER_TITLE_FIXES: Record<string, string | null> = {
  // ── A 类：疾病名 ──
  IBD: '含兔肉', // 兔里脊 29.9%
  胆泥淤积: '含猪肉', // 猪里脊 31.2%
  草酸钙结石: '含牛肉', // 牛霖 24.0%
  低敏定制: '含马肉', // 马肉 23.9%

  // ── B 类：处方/功能暗示 ──
  体重管理: '含鸡胸', // 鸡胸 43.5%（附录 5「改善超重状态」属处方范畴）
  皮肤与毛发: '含鸭胸', // 鸭胸 17.1%（附录 5「改善皮肤炎症和过度脱毛」属处方范畴）
  '皮肤与毛发【幼犬】': '含鸭胸（幼犬）',
  '皮肤与毛发【成年犬】': '含鸭胸（成年犬）',

  // ── C 类：无依据 / 比较性表述（用户已确认）──
  '高适口性（幼犬）': '适口性优先（幼犬）',
  '高适口性（成年犬）': '适口性优先（成年犬）',
  均衡营养: '符合 FEDIAF 成犬维持',
  适合春季食用: null, // 无任何法规依据，直接移除
};

/** 仅作兜底：若出现未预期的违规角标，先清空而不是留着一个疾病名 */
const FORBIDDEN_COVER_WORDS = [
  // A/B 类：疾病名、器官名、处方专属与功能暗示
  'IBD', '结石', '胆泥', '淤积', '肠胃', '软便', '肾', '肝', '胆',
  '胰腺', '高脂血', '关节', '炎症', '抗炎', '低敏', '处方', '肿瘤',
  '体重管理', '皮肤', '毛发',
  // C 类：无依据或比较性表述
  '高适口性', '均衡营养', '春季',
];

/**
 * 说明文案里不允许出现的词（疾病名 / 症状 / 功效承诺 / 医疗行为）。
 *
 * ⚠️ 不要把「诊断」放进来：合规免责声明本身就含「如狗狗有明确诊断…请先咨询执业兽医」，
 * 加进来会让脚本把自己的输出判为违规，从而反复改写、失去幂等性。
 */
const FORBIDDEN_DESCRIPTION_WORDS = [
  'IBD', '结石', '胆泥', '淤积', '肠胃敏感', '软便', '腹泻', '呕吐',
  '肾病', '肝衰竭', '胰腺炎', '高脂血症', '抗炎', '低敏', '处方',
  '治疗', '预防', '改善', '炎症', '肿瘤', '疾病', '症状', '不耐受',
  '送医', '重症', '梗阻',
];

/**
 * 按食谱名给出重写后的说明文案。
 * 内容全部来自该食谱的实际配方（已逐条核对线上数据），只陈述配方事实与换食建议。
 */
const DESCRIPTION_REWRITES: Record<string, string> = {
  兔里脊大米土豆:
    '以兔里脊与鸭肝提供动物蛋白，大米与去皮土豆作为主要碳水来源，搭配少量南瓜与洋车前子壳粉。配方按 FEDIAF 犬营养标准设计，原料种类较少、烹饪方式温和。\n\n换食请循序渐进，建议在 2-4 周内观察粪便、食欲与体重变化。如狗狗有明确诊断或正在遵医嘱进行特殊饮食，请先咨询执业兽医。',
  糙米西葫芦牛肉:
    '以牛霖与牛肝为主要动物蛋白来源，糙米、燕麦搭配南瓜与西葫芦提供碳水与膳食纤维，另配鸡蛋、三文鱼、生蚝与蓝莓。配方按 FEDIAF 犬营养标准设计。\n\n换食请循序渐进，建议在 2-4 周内观察粪便、食欲与体重变化。如狗狗有明确诊断或正在遵医嘱进行特殊饮食，请先咨询执业兽医。',
  小米山药猪肉:
    '以猪里脊与猪肝为主要动物蛋白来源，小米与山药作为主要碳水，搭配青花鱼、生蚝与多种蔬菜。配方按 FEDIAF 犬营养标准设计。\n\n换食请循序渐进，建议在 2-4 周内观察粪便、食欲与体重变化。如狗狗有明确诊断或正在遵医嘱进行特殊饮食，请先咨询执业兽医。',
};

/** 兜底文案模板：只用该食谱自己的配方数据生成，不做任何营养/功效推断 */
function buildFallbackDescription(ingredientNames: string[]): string {
  const top = ingredientNames.slice(0, 3).filter(Boolean);
  const lead =
    top.length > 0
      ? `以${top.join('、')}等为主要原料，配方按 FEDIAF 犬营养标准设计。`
      : '本食谱按 FEDIAF 犬营养标准设计，具体原料与占比见上方配方表。';
  return `${lead}\n\n换食请循序渐进，建议在 2-4 周内观察粪便、食欲与体重变化。如狗狗有明确诊断或正在遵医嘱进行特殊饮食，请先咨询执业兽医。`;
}

function containsForbiddenCoverWord(value: string | null): boolean {
  if (!value) return false;
  return FORBIDDEN_COVER_WORDS.some((word) => value.includes(word));
}

function matchedDescriptionWords(value: string | null): string[] {
  if (!value) return [];
  return Array.from(
    new Set(FORBIDDEN_DESCRIPTION_WORDS.filter((word) => value.includes(word))),
  );
}

interface PlanRow {
  id: string;
  name: string;
  status: string;
  currentCoverTitle: string | null;
  nextCoverTitle: string | null;
  coverTitleChanged: boolean;
  nextDescription: string | null;
  descriptionChanged: boolean;
  matchedWords: string[];
}

async function buildPlan(): Promise<PlanRow[]> {
  const recipes = await prisma.recipe.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      coverTitle: true,
      description: true,
      items: {
        select: {
          ratioPercent: true,
          ingredient: { select: { name: true, type: true } },
        },
      },
    },
    orderBy: [{ name: 'asc' }],
  });

  const plan: PlanRow[] = [];

  for (const recipe of recipes) {
    const matchedWords = matchedDescriptionWords(recipe.description);
    const coverTitleViolates = containsForbiddenCoverWord(recipe.coverTitle);
    const descriptionViolates = matchedWords.length > 0;
    if (!coverTitleViolates && !descriptionViolates) continue;

    // 封面角标：优先用显式映射，映射缺失时清空（宁可没有角标，也不留疾病名）
    const nextCoverTitle = recipe.coverTitle
      ? COVER_TITLE_FIXES[recipe.coverTitle] ?? null
      : null;

    // 说明文案：手写版本优先（更自然），否则用该食谱自身配方自动生成
    const topIngredientNames = (recipe.items || [])
      .filter((item) => item.ingredient?.type === 'FOOD')
      .sort((a, b) => (b.ratioPercent ?? 0) - (a.ratioPercent ?? 0))
      .map((item) => item.ingredient?.name || '')
      .filter(Boolean);

    const nextDescription = descriptionViolates
      ? DESCRIPTION_REWRITES[recipe.name] ??
        buildFallbackDescription(topIngredientNames)
      : null;

    plan.push({
      id: recipe.id,
      name: recipe.name,
      status: recipe.status,
      currentCoverTitle: recipe.coverTitle,
      nextCoverTitle,
      coverTitleChanged: coverTitleViolates,
      nextDescription,
      descriptionChanged: descriptionViolates,
      matchedWords,
    });
  }

  return plan;
}

async function main() {
  console.log(`模式：${shouldApply ? '落库（--apply）' : '预演（不写库）'}\n`);

  const plan = await buildPlan();

  if (plan.length === 0) {
    console.log('✅ 未发现需要处理的食谱内容。');
    return;
  }

  console.log(`发现 ${plan.length} 条需要处理的食谱：\n`);
  for (const row of plan) {
    console.log(`· [${row.status}] ${row.name}  (${row.id})`);
    if (row.coverTitleChanged) {
      console.log(
        `    封面角标 "${row.currentCoverTitle}" → ${row.nextCoverTitle ?? '（清空）'}`,
      );
    }
    if (row.descriptionChanged) {
      console.log(`    说明文案命中：${row.matchedWords.join(' / ')}`);
      console.log(`    说明文案 → 重写为配方事实 + 换食建议 + 免责提示`);
    }
  }
  console.log('');

  if (!shouldApply) {
    console.log('这是预演。确认无误后加 --apply 落库。');
    return;
  }

  let updated = 0;
  for (const row of plan) {
    const data: { coverTitle?: string | null; description?: string | null } = {};
    if (row.coverTitleChanged) data.coverTitle = row.nextCoverTitle;
    if (row.descriptionChanged) data.description = row.nextDescription;
    if (Object.keys(data).length === 0) continue;

    await prisma.recipe.update({ where: { id: row.id }, data });
    updated += 1;
  }
  console.log(`✅ 已更新 ${updated} 条食谱。`);
}

main()
  .catch((error) => {
    console.error('执行失败：', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
