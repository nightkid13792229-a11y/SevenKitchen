/**
 * 补剂三口径只读体检（2026-11-15）
 *
 * 只读，不写库。回答四个问题：
 *   ① 哪些组「生产开」超过 2 个（门禁上限）；
 *   ② 哪些组一个已上架产品都没有（预分装池为空）；
 *   ③ 每组默认会落到哪一款预分装产品（开跨产品后顾客会看到谁）；
 *   ④ 哪些食谱在用、但对应补剂没有可生产产品。
 *
 * 用法：cd backend && npx ts-node -r tsconfig-paths/register scripts/audit-supplement-channels.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRODUCTION_LIMIT = 2;

interface GroupView {
  code: string;
  name: string;
  production: string[];
  repack: string[];
  defaultRepack: string | null;
}

async function loadGroups(): Promise<GroupView[]> {
  const groups = await prisma.supplementEquivalenceGroup.findMany({
    where: { status: 'APPROVED', isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    include: {
      ingredients: {
        orderBy: [{ equivalencePriority: 'asc' }, { name: 'asc' }],
      },
    },
  });

  return groups.map((group) => {
    const members = group.ingredients || [];
    const production = members
      .filter((member) => member.procurementEnabled === true)
      .map((member) => member.name);
    const repackMembers = members.filter(
      (member) => member.supplementRetailEnabled === true,
    );
    return {
      code: group.code,
      name: group.name,
      production,
      repack: repackMembers.map((member) => member.name),
      defaultRepack: repackMembers[0]?.name ?? null,
    };
  });
}

async function loadRecipeUsage(): Promise<
  Array<{ ingredientId: string; name: string; recipeCount: number }>
> {
  const items = await prisma.recipeItem.findMany({
    where: { recipe: { status: 'PUBLIC' } } as any,
    select: { ingredientId: true },
  });
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.ingredientId, (counts.get(item.ingredientId) || 0) + 1);
  }
  const ids = Array.from(counts.keys());
  if (ids.length === 0) return [];
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: ids }, type: 'SUPPLEMENT' },
    select: { id: true, name: true, procurementEnabled: true },
  });
  return ingredients.map((ingredient) => ({
    ingredientId: ingredient.id,
    name: ingredient.name,
    recipeCount: counts.get(ingredient.id) || 0,
  }));
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

async function main(): Promise<void> {
  const [groups, usage] = await Promise.all([loadGroups(), loadRecipeUsage()]);

  section('① 同组生产开超过 2 个（门禁会拦）');
  const overLimit = groups.filter(
    (group) => group.production.length > PRODUCTION_LIMIT,
  );
  if (overLimit.length === 0) {
    console.log('无');
  } else {
    for (const group of overLimit) {
      console.log(
        `- ${group.name}（${group.code}）：${group.production.length} 个 → ${group.production.join('、')}`,
      );
    }
  }

  section('② 同组一个已上架产品都没有（预分装池为空）');
  const noRepack = groups.filter((group) => group.repack.length === 0);
  if (noRepack.length === 0) {
    console.log('无');
  } else {
    for (const group of noRepack) {
      console.log(`- ${group.name}（${group.code}）`);
    }
  }

  section('③ 默认预分装产品（开跨产品后顾客会看到谁）');
  for (const group of groups) {
    if (group.repack.length === 0) {
      console.log(`- ${group.name}：—（无在售）`);
      continue;
    }
    console.log(
      `- ${group.name}：默认「${group.defaultRepack}」；可换 ${group.repack.length} 个（${group.repack.join('、')}）`,
    );
  }

  section('④ 食谱在用、但没有可生产开关的补剂');
  const missingProduction = usage.filter((item) => item.recipeCount > 0);
  const productionFlags = await prisma.ingredient.findMany({
    where: { id: { in: missingProduction.map((item) => item.ingredientId) } },
    select: { id: true, procurementEnabled: true },
  });
  const flagMap = new Map(
    productionFlags.map((item) => [item.id, item.procurementEnabled]),
  );
  const noProduction = missingProduction.filter(
    (item) => flagMap.get(item.ingredientId) !== true,
  );
  if (noProduction.length === 0) {
    console.log('无');
  } else {
    for (const item of noProduction) {
      console.log(`- ${item.name}：被 ${item.recipeCount} 条食谱引用，生产关`);
    }
  }

  section('汇总');
  console.log(
    `组 ${groups.length} 个；超生产上限 ${overLimit.length} 个；无在售 ${noRepack.length} 个；被引用但生产关 ${noProduction.length} 个。`,
  );
}

main()
  .catch((error) => {
    console.error('体检失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
