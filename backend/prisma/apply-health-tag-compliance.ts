/**
 * 健康标签合规处置（一次性脚本）
 *
 * 背景：生产库健康标签中存在疾病名与功效类表述，违反
 * 《宠物饲料标签规定》（农业农村部公告第 20 号）第二十条第（一）项：
 * 「禁止对宠物饲料作具有预防或者治疗宠物疾病的说明或者宣传。」
 *
 * 处置动作：
 *   1. 删除疾病名 / 医疗用语 / 功效类标签（级联清除与食谱的关联）
 *   2. 「肠胃友好」改名为「易消化」（原料/工艺特性，可举证）
 *   3. 「低脂」按法规数值门槛逐食谱核验，超标者移除该食谱的标签
 *      （犬：水分 <20% → 脂肪 ≤9%；20%~65% → ≤7%；>65% → ≤4%，均为湿基）
 *   4. 「挑食友好」保留
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register prisma/apply-health-tag-compliance.ts            # 预演
 *   npx ts-node -r tsconfig-paths/register prisma/apply-health-tag-compliance.ts --apply    # 落库
 *
 * 幂等：可重复执行；不存在的标签会被跳过并提示。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

/** ① 需删除的标签（疾病名 / 医疗用语 / 功效表述） */
const TAGS_TO_DELETE = [
  // 疾病名
  '肝脏损伤',
  'IBD',
  '预防肿瘤',
  '胆泥淤积',
  '高脂血症',
  '草酸钙结石',
  // 医疗用语 / 疾病相关
  '抗炎',
  '低敏',
  // 功效表述
  '抗氧化',
  // 无举证依据（用户已确认删除）
  '低钠',
  // 处方类概念
  '控磷',
  '低蛋白',
  '控铁',
  // 隐含皮肤/毛发功效（附录 5「改善皮肤炎症和过度脱毛」属处方粮范畴）
  '皮毛支持',
  // 隐含「改善超重状态」（附录 5 属处方粮范畴）
  '体重管理',
];

/** ② 改名：肠胃友好 → 易消化 */
const TAGS_TO_RENAME: Array<{ from: string; to: string }> = [
  { from: '肠胃友好', to: '易消化' },
];

/** ③ 需按数值门槛核验的内容声称标签 */
const LOW_FAT_TAG = '低脂';

interface NutritionSummary {
  moisture: number;
  fatDm: number;
}

function readNutritionSummary(json: unknown): NutritionSummary | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as Record<string, unknown>;
  const summary = (raw.summary ?? raw) as Record<string, unknown>;
  const moisture = Number(summary.moisture_pct);
  const fatDm = Number(summary.fat_dm_pct);
  if (!Number.isFinite(moisture) || !Number.isFinite(fatDm)) return null;
  // 0 视为缺失（多数食谱水分在 50% 以上）
  if (moisture <= 0) return null;
  return { moisture, fatDm };
}

/** 犬用「低脂肪」声称的湿基脂肪上限 */
function lowFatLimit(moisture: number): number {
  if (moisture < 20) return 9;
  if (moisture <= 65) return 7;
  return 4;
}

function fmt(n: number): string {
  return Number(n).toFixed(2);
}

async function main() {
  console.log(`\n===== 健康标签合规处置 ${shouldApply ? '【落库模式】' : '【预演模式 · 未改动数据】'} =====\n`);

  const allTags = await prisma.recipeHealthTag.findMany({
    select: { id: true, name: true },
  });
  const tagByName = new Map(allTags.map((t) => [t.name, t]));
  console.log(`现有标签总数：${allTags.length}`);

  // ---------- ① 删除 ----------
  console.log('\n① 待删除标签：');
  const deleteIds: string[] = [];
  for (const name of TAGS_TO_DELETE) {
    const tag = tagByName.get(name);
    if (!tag) {
      console.log(`   - ${name}：不存在，跳过`);
      continue;
    }
    const count = await prisma.recipeHealthTagAssignment.count({
      where: { healthTagId: tag.id },
    });
    console.log(`   - ${name}：将删除（连带解除 ${count} 条食谱关联）`);
    deleteIds.push(tag.id);
  }

  // ---------- ② 改名 ----------
  console.log('\n② 待改名标签：');
  const renameOps: Array<{ id: string; from: string; to: string }> = [];
  for (const { from, to } of TAGS_TO_RENAME) {
    const tag = tagByName.get(from);
    if (!tag) {
      console.log(`   - ${from} → ${to}：源标签不存在，跳过`);
      continue;
    }
    if (tagByName.has(to)) {
      console.log(`   - ${from} → ${to}：目标名已存在，跳过（需人工合并）`);
      continue;
    }
    const count = await prisma.recipeHealthTagAssignment.count({
      where: { healthTagId: tag.id },
    });
    console.log(`   - ${from} → ${to}：将改名（保留 ${count} 条食谱关联）`);
    renameOps.push({ id: tag.id, from, to });
  }

  // ---------- ③ 低脂核验 ----------
  console.log(`\n③「${LOW_FAT_TAG}」数值门槛核验（犬：湿基脂肪上限按水分档位 9% / 7% / 4%）：`);
  const lowFatTag = tagByName.get(LOW_FAT_TAG);
  const lowFatDetach: Array<{ assignmentId: string; recipe: string; detail: string }> = [];
  const lowFatKeep: string[] = [];
  const lowFatUnknown: Array<{ assignmentId: string; recipe: string }> = [];

  if (!lowFatTag) {
    console.log(`   - 标签不存在，跳过`);
  } else {
    const assignments = await prisma.recipeHealthTagAssignment.findMany({
      where: { healthTagId: lowFatTag.id },
      select: {
        id: true,
        recipe: { select: { id: true, name: true, nutritionDetailedData: true } },
      },
    });
    for (const a of assignments) {
      const summary = readNutritionSummary(a.recipe?.nutritionDetailedData);
      const recipeName = a.recipe?.name || a.recipe?.id || '(未命名)';
      if (!summary) {
        lowFatUnknown.push({ assignmentId: a.id, recipe: recipeName });
        continue;
      }
      const fatWet = summary.fatDm * (1 - summary.moisture / 100);
      const limit = lowFatLimit(summary.moisture);
      const detail = `水分 ${fmt(summary.moisture)}% / 脂肪 ${fmt(summary.fatDm)}%(DM) → 湿基 ${fmt(fatWet)}%（上限 ${limit}%）`;
      if (fatWet > limit) {
        lowFatDetach.push({ assignmentId: a.id, recipe: recipeName, detail });
      } else {
        lowFatKeep.push(`${recipeName}（${detail}）`);
      }
    }
    console.log(`   - 达标保留：${lowFatKeep.length} 个食谱`);
    console.log(`   - 超标移除标签：${lowFatDetach.length} 个食谱`);
    for (const d of lowFatDetach) console.log(`       ✗ ${d.recipe}：${d.detail}`);
    console.log(`   - 数据缺失无法核验：${lowFatUnknown.length} 个食谱`);
    for (const u of lowFatUnknown) console.log(`       ? ${u.recipe}`);
  }

  if (!shouldApply) {
    console.log('\n===== 预演结束：未改动任何数据 =====');
    console.log('确认无误后追加 --apply 参数执行落库。\n');
    return;
  }

  // ---------- 落库 ----------
  console.log('\n===== 开始落库 =====');
  let deleted = 0;
  for (const id of deleteIds) {
    await prisma.recipeHealthTag.delete({ where: { id } });
    deleted += 1;
  }
  let renamed = 0;
  for (const op of renameOps) {
    await prisma.recipeHealthTag.update({ where: { id: op.id }, data: { name: op.to } });
    renamed += 1;
  }
  let detached = 0;
  for (const d of lowFatDetach) {
    await prisma.recipeHealthTagAssignment.delete({ where: { id: d.assignmentId } });
    detached += 1;
  }
  // 数据缺失者按合规优先：移除声称（避免无法举证的宣称）
  let detachedUnknown = 0;
  for (const u of lowFatUnknown) {
    await prisma.recipeHealthTagAssignment.delete({ where: { id: u.assignmentId } });
    detachedUnknown += 1;
  }

  console.log(`✓ 删除标签：${deleted} 个`);
  console.log(`✓ 改名标签：${renamed} 个`);
  console.log(`✓ 移除超标食谱的「${LOW_FAT_TAG}」标签：${detached} 条`);
  console.log(`✓ 移除数据缺失食谱的「${LOW_FAT_TAG}」标签：${detachedUnknown} 条`);

  const remaining = await prisma.recipeHealthTag.findMany({
    select: { name: true, _count: { select: { assignments: true } } },
    orderBy: { name: 'asc' },
  });
  console.log('\n处置后剩余标签：');
  for (const t of remaining) {
    console.log(`   - ${t.name}（关联 ${t._count.assignments}）`);
  }
  console.log('\n===== 完成 =====\n');
}

main()
  .catch((error) => {
    console.error('执行失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
