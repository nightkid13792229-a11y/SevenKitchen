/**
 * 封面角标：从「版本级自由文本」迁移到「系列级词表引用」（一次性脚本）
 *
 * 背景：
 *   · 角标原先存在 Recipe.coverTitle（每个生命阶段版本各一份，自由文本、无校验）；
 *   · 新模型 `recipe_series_cover_badge` 把角标上移到系列层级，且只允许引用合规词表。
 *
 * 本脚本做两件事（都幂等）：
 *   1. 补齐词表中缺失的两个词：「适口性优先」（适用对象）、「含马肉」（原料事实）
 *      —— 这两个词是迁移现有角标所必需的，且均可用配方事实举证。
 *   2. 把各系列的 coverTitle 映射到系列角标（去掉生命阶段后缀）。
 *      迁移后**保留** Recipe.coverTitle 原值不动，作为兜底与回滚依据。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register prisma/migrate-cover-title-to-series-badges.ts            # 预演
 *   npx ts-node -r tsconfig-paths/register prisma/migrate-cover-title-to-series-badges.ts --apply    # 落库
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

/** 需要补齐的词表词：tag 名 → 所属分组名 */
const TAGS_TO_ENSURE: Array<{ name: string; group: string; reason: string }> = [
  {
    name: '适口性优先',
    group: '适用对象',
    reason: '现有角标「适口性优先（幼犬/成年犬）」去掉阶段后缀后的落点',
  },
  {
    name: '含马肉',
    group: '原料事实',
    reason: '「马肉兔肉白米土豆」含马肉 23.9%（≥4%，可作成分声称）',
  },
];

/**
 * 现有 coverTitle → 目标词表词。
 * 未列出的值会先尝试"按配方主料推导"，仍推导不出则跳过并报告。
 */
const COVER_TITLE_TO_TAG: Record<string, string> = {
  // 去掉生命阶段后缀（角标不带后缀是已确认的口径）
  '适口性优先（幼犬）': '适口性优先',
  '适口性优先（成年犬）': '适口性优先',
  '含鸭胸（幼犬）': '含鸭胸',
  '含鸭胸（成年犬）': '含鸭胸',
  // 直接对应
  含兔肉: '含兔肉',
  含猪肉: '含猪肉',
  含牛肉: '含牛肉',
  含鸭胸: '含鸭胸',
  含鸡胸: '含鸡胸',
  含马肉: '含马肉',
  // 「符合 FEDIAF 成犬维持」统一落到 FEDIAF 2025（食谱当前使用的标准）
  '符合 FEDIAF 成犬维持': '符合 FEDIAF 2025',
  // 该定制食谱无对应词表词，按其主料（鸡胸 14.2%）落到成分事实
  幼犬基础均衡: '含鸡胸',
};

interface SeriesPlan {
  seriesId: string;
  seriesName: string;
  currentCoverTitles: string[];
  tagNames: string[];
  unresolved: string[];
}

async function ensureVocabularyTags(): Promise<Map<string, string>> {
  const allTags = await prisma.recipeHealthTag.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const byName = new Map(allTags.map((t) => [t.name, t]));

  for (const spec of TAGS_TO_ENSURE) {
    if (byName.has(spec.name)) {
      console.log(`  · 词表已有「${spec.name}」，跳过`);
      continue;
    }

    const group = allTags.find((t) => t.name === spec.group && !t.parentId);
    if (!group) {
      console.log(`  ⚠️ 找不到分组「${spec.group}」，无法新增「${spec.name}」`);
      continue;
    }

    console.log(`  + 新增词「${spec.name}」→ 分组「${spec.group}」  (${spec.reason})`);
    if (!shouldApply) {
      // 预演：用空 id 占位登记，保证下面的迁移计划能完整展示（不写库）
      byName.set(spec.name, { id: '', name: spec.name, parentId: group.id });
      continue;
    }

    const created = await prisma.recipeHealthTag.create({
      data: { name: spec.name, parentId: group.id, sort: 900 },
    });
    byName.set(created.name, created);
  }

  return new Map([...byName.entries()].map(([name, tag]) => [name, tag.id]));
}

async function buildPlan(tagIdByName: Map<string, string>): Promise<SeriesPlan[]> {
  const recipes = await prisma.recipe.findMany({
    where: { coverTitle: { not: null }, seriesId: { not: null } },
    select: {
      coverTitle: true,
      seriesId: true,
      series: { select: { id: true, name: true } },
      items: {
        select: { ratioPercent: true, ingredient: { select: { name: true, type: true } } },
      },
    },
  });

  const bySeries = new Map<string, SeriesPlan>();

  for (const recipe of recipes) {
    const coverTitle = (recipe.coverTitle || '').trim();
    if (!coverTitle || !recipe.seriesId) continue;

    const entry: SeriesPlan =
      bySeries.get(recipe.seriesId) ??
      {
        seriesId: recipe.seriesId,
        seriesName: recipe.series?.name || '(未命名系列)',
        currentCoverTitles: [],
        tagNames: [],
        unresolved: [],
      };

    if (!entry.currentCoverTitles.includes(coverTitle)) {
      entry.currentCoverTitles.push(coverTitle);
    }

    const mapped = COVER_TITLE_TO_TAG[coverTitle] ?? deriveFromIngredients(recipe.items);
    if (mapped && !entry.tagNames.includes(mapped)) {
      entry.tagNames.push(mapped);
    }
    if (!mapped && !entry.unresolved.includes(coverTitle)) {
      entry.unresolved.push(coverTitle);
    }

    bySeries.set(recipe.seriesId, entry);
  }

  // 只保留确实能落库的系列；并按词表的 sort 稳定排序
  return [...bySeries.values()]
    .filter((entry) => entry.tagNames.length > 0 || entry.unresolved.length > 0)
    .sort((a, b) => a.seriesName.localeCompare(b.seriesName, 'zh-Hans-CN'));
}

/** 兜底：按配方主料推导「含××」成分事实（仅当词表里存在对应词时才采用） */
function deriveFromIngredients(
  items: Array<{ ratioPercent: number | null; ingredient: { name: string; type: string } | null }>,
): string | null {
  const top = items
    .filter((i) => i.ingredient?.type === 'FOOD' && (i.ratioPercent ?? 0) >= 4)
    .sort((a, b) => (b.ratioPercent ?? 0) - (a.ratioPercent ?? 0))[0];
  if (!top?.ingredient?.name) return null;
  return `含${top.ingredient.name}`;
}

async function main() {
  console.log(`模式：${shouldApply ? '落库（--apply）' : '预演（不写库）'}\n`);

  console.log('步骤 1 · 补齐词表');
  const tagIdByName = await ensureVocabularyTags();

  console.log('\n步骤 2 · 生成迁移计划');
  const plan = await buildPlan(tagIdByName);

  let written = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const entry of plan) {
    console.log(`\n· ${entry.seriesName}`);
    console.log(`    现有角标：${entry.currentCoverTitles.join(' / ')}`);

    if (entry.unresolved.length > 0) {
      console.log(`    ⚠️ 无法映射（需人工处理）：${entry.unresolved.join(' / ')}`);
      problems.push(`${entry.seriesName}: ${entry.unresolved.join(' / ')}`);
    }

    // 一个系列最多 2 个角标：超出时按 sort 取前两个并提示
    const resolved = entry.tagNames.filter((name) => tagIdByName.has(name));
    const kept = resolved.slice(0, 2);
    if (resolved.length > 2) {
      console.log(`    ⚠️ 解析出 ${resolved.length} 个角标，超上限，仅取前 2 个：${kept.join(' · ')}`);
    }
    if (kept.length === 0) {
      console.log('    （无可落库角标，跳过）');
      skipped += 1;
      continue;
    }

    console.log(`    → 系列角标：${kept.join(' · ')}`);

    if (!shouldApply) continue;

    await prisma.$transaction(async (tx) => {
      await tx.recipeSeriesCoverBadge.deleteMany({ where: { seriesId: entry.seriesId } });
      for (const [index, name] of kept.entries()) {
        const healthTagId = tagIdByName.get(name);
        if (!healthTagId) continue;
        await tx.recipeSeriesCoverBadge.create({
          data: { seriesId: entry.seriesId, healthTagId, sortOrder: index },
        });
      }
    });
    written += 1;
  }

  console.log('');
  if (!shouldApply) {
    console.log(`预演完成：将处理 ${plan.length} 个系列（其中 ${skipped} 个无可落库角标）。`);
    console.log('确认无误后加 --apply 落库。');
    return;
  }
  console.log(`✅ 已写入 ${written} 个系列角标。`);
  if (problems.length > 0) {
    console.log('\n以下需要人工确认：');
    problems.forEach((p) => console.log(`  - ${p}`));
  }
}

main()
  .catch((error) => {
    console.error('执行失败：', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
