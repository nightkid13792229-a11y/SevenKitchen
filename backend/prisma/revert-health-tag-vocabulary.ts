/**
 * 回滚「合规标签词表 seed」（一次性脚本）
 *
 * 原因：词表标签在 AI 打标功能上线前没有食谱关联，而顾客端筛选接口
 * 会返回全部标签（含 0 关联），导致线上出现大量点了没结果的空筛选项。
 *
 * 处理：删除本次 seed 新建的标签（先删子级、再删父级），
 * 保留 seed 之前就存在的 低脂 / 易消化 / 挑食友好。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register prisma/revert-health-tag-vocabulary.ts
 *   npx ts-node -r tsconfig-paths/register prisma/revert-health-tag-vocabulary.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

/** seed 之前就存在、需要保留的标签 */
const KEEP = new Set(['低脂', '易消化', '挑食友好']);

async function main() {
  console.log(
    `\n===== 回滚标签词表 ${shouldApply ? '【落库模式】' : '【预演模式 · 未改动数据】'} =====\n`,
  );

  const tags = await prisma.recipeHealthTag.findMany({
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: { select: { assignments: true, children: true } },
    },
  });

  // 只删除「无食谱关联」且不在保留名单里的标签；父级需等子级删完再删
  const removable = tags.filter(
    (t) => !KEEP.has(t.name) && t._count.assignments === 0,
  );
  const children = removable.filter((t) => t.parentId);
  // 顶层标签（分组）——不限是否有子级，只要无食谱关联即可删；子级先删以满足外键
  const parents = removable.filter((t) => !t.parentId);

  console.log(`现有标签：${tags.length} 个`);
  console.log(`待删除子标签：${children.length} 个`);
  console.log(`待删除分组：${parents.length} 个`);
  console.log(`保留：${[...KEEP].join(' / ')}`);

  const hasAssociations = tags.filter(
    (t) => !KEEP.has(t.name) && t._count.assignments > 0,
  );
  if (hasAssociations.length > 0) {
    console.log('\n⚠️ 以下标签有食谱关联，不会被删除（需人工确认）：');
    for (const t of hasAssociations) {
      console.log(`   - ${t.name}（关联 ${t._count.assignments}）`);
    }
  }

  if (!shouldApply) {
    console.log('\n===== 预演结束：未改动任何数据 =====');
    console.log('确认无误后追加 --apply 参数执行回滚。\n');
    return;
  }

  console.log('\n===== 开始回滚 =====');
  let removed = 0;
  for (const t of children) {
    await prisma.recipeHealthTag.delete({ where: { id: t.id } });
    removed += 1;
  }

  // 保留的标签（低脂/易消化/挑食友好）若仍挂在待删分组下，先解除父子关系
  const parentIds = new Set(parents.map((p) => p.id));
  let detached = 0;
  if (parentIds.size > 0) {
    const stillAttached = await prisma.recipeHealthTag.findMany({
      where: { parentId: { in: [...parentIds] } },
      select: { id: true },
    });
    for (const t of stillAttached) {
      await prisma.recipeHealthTag.update({
        where: { id: t.id },
        data: { parentId: null },
      });
      detached += 1;
    }
  }

  for (const t of parents) {
    await prisma.recipeHealthTag.delete({ where: { id: t.id } });
    removed += 1;
  }
  console.log(`✓ 已删除标签：${removed} 个`);
  if (detached > 0) console.log(`✓ 已解除父子关系：${detached} 个`);

  const remaining = await prisma.recipeHealthTag.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  console.log(`\n回滚后剩余标签（${remaining.length} 个）：`);
  for (const t of remaining) console.log(`   - ${t.name}`);
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
