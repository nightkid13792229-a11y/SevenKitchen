/**
 * 补剂三口径只读体检（2026-11-15）
 *
 * 只读，不写库。回答四个问题：
 *   ① 哪些组「生产开」超过 2 个（门禁上限）；
 *   ② 哪些组一个已上架产品都没有（预分装池为空）；
 *   ③ 每组默认会落到哪一款预分装产品（按真实可用性算，不是只看上架）；
 *   ④ 哪些食谱在用、但所在组一个可生产产品都没有。
 *
 * 用法：cd backend && npx ts-node -r tsconfig-paths/register scripts/audit-supplement-channels.ts
 */
import { PrismaClient } from '@prisma/client';
import { SupplementDosageService } from '../src/application/supplement-shop/supplement-dosage.service';
import { SupplementPlanService } from '../src/application/supplement-shop/supplement-plan.service';

const prisma = new PrismaClient();
const dosage = new SupplementDosageService();
const plan = new SupplementPlanService(
  prisma as any,
  dosage,
  { batchFindActive: async () => ({}) } as any,
);

const PRODUCTION_LIMIT = 2;

interface GroupView {
  code: string;
  name: string;
  status: string;
  production: string[];
  repack: string[];
  defaultRepack: string | null;
  removable: number;
}

async function loadGroups(): Promise<GroupView[]> {
  const groups = await prisma.supplementEquivalenceGroup.findMany({
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
    // 用真实解析算可用性和默认值；目标取组要求的营养素、每公斤 1 个单位
    const pool = plan.buildRepackPool({
      reference: members[0],
      group: { ...group, ingredients: members },
      equivalenceEnabled: true,
      targets: [
        {
          fieldPath: group.nutrientKey,
          label: group.nutrientLabel,
          unit: group.nutrientUnit,
          targetValuePerKg: 1,
        },
      ],
      totalWeightG: 1000,
    });
    const available = pool.filter((option) => option.available);
    return {
      code: group.code,
      name: group.name,
      status: group.status,
      production,
      repack: available.map((option) => option.name),
      defaultRepack: available[0]?.name ?? null,
      removable: repackMembers.length - available.length,
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
    select: {
      id: true,
      name: true,
      procurementEnabled: true,
      equivalenceGroupId: true,
    },
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

  section('① 同组生产开超过 2 个（门禁会拦新增）');
  const overLimit = groups.filter(
    (group) => group.production.length > PRODUCTION_LIMIT,
  );
  if (overLimit.length === 0) console.log('无');
  for (const group of overLimit) {
    console.log(
      `- ${group.name}（${group.code}，${group.status}）：${group.production.length} 个 → ${group.production.join('、')}`,
    );
  }

  section('② 同组一个已上架产品都没有（预分装池为空）');
  const noRepack = groups.filter(
    (group) => group.repack.length === 0 && group.status === 'APPROVED',
  );
  if (noRepack.length === 0) console.log('无');
  for (const group of noRepack) {
    console.log(`- ${group.name}（${group.code}）`);
  }

  section('③ 默认预分装产品（按真实可用性，逐食谱可能不同）');
  for (const group of groups) {
    if (group.status !== 'APPROVED') continue;
    if (group.repack.length === 0) {
      console.log(`- ${group.name}：—（无可用）`);
      continue;
    }
    console.log(
      `- ${group.name}：默认「${group.defaultRepack}」；可用 ${group.repack.length} 个（${group.repack.join('、')}）${
        group.removable > 0 ? `；另有 ${group.removable} 个已上架但档案不可用` : ''
      }`,
    );
  }

  section('④ 食谱在用、但所在组没有可生产产品');
  const usageById = new Map(usage.map((item) => [item.ingredientId, item]));
  const usedIngredients = await prisma.ingredient.findMany({
    where: { id: { in: Array.from(usageById.keys()) } },
    select: {
      id: true,
      name: true,
      procurementEnabled: true,
      equivalenceGroupId: true,
    },
  });
  const productionByGroup = new Map<string, number>();
  const allMembers = await prisma.ingredient.findMany({
    where: { type: 'SUPPLEMENT', equivalenceGroupId: { not: null } },
    select: { equivalenceGroupId: true, procurementEnabled: true },
  });
  for (const member of allMembers) {
    if (member.procurementEnabled !== true) continue;
    const groupId = member.equivalenceGroupId as string;
    productionByGroup.set(groupId, (productionByGroup.get(groupId) || 0) + 1);
  }
  const noProduction = usedIngredients.filter((ingredient) => {
    if (ingredient.procurementEnabled === true) return false;
    if (!ingredient.equivalenceGroupId) return true;
    return (productionByGroup.get(ingredient.equivalenceGroupId) || 0) === 0;
  });
  if (noProduction.length === 0) console.log('无');
  for (const ingredient of noProduction) {
    console.log(
      `- ${ingredient.name}：被 ${usageById.get(ingredient.id)?.recipeCount ?? 0} 条食谱引用，所在组没有生产开的产品`,
    );
  }

  section('汇总');
  console.log(
    `组 ${groups.length} 个；超生产上限 ${overLimit.length} 个；已通过但无可用 ${noRepack.length} 个；被引用但无生产 ${noProduction.length} 个。`,
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
