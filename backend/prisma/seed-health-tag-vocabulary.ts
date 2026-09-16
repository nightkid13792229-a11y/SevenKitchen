/**
 * 合规标签词表 seed（一次性脚本）
 *
 * 依据 docs/plans/2026-09-17-ai-recipe-copywriting-design.md 第三节，
 * 按「四层卖点」建立结构化的合规标签树：
 *
 *   原料事实   → 含三文鱼 / 含鳕鱼 / … / 单一动物蛋白
 *   工艺特性   → 鲜肉现制 / 低温蒸煮 / 冷链配送 / 无防腐剂
 *   营养特性   → 低脂（须达标） / 易消化（须举证）
 *   适用对象   → 挑食友好
 *   标准背书   → 符合 FEDIAF 2021 / 符合 FEDIAF 2025
 *
 * 说明：
 * - 不建立「幼犬期/成犬维持/老年犬」标签——食谱已有独立的生命阶段字段与筛选器，
 *   重复建标签会导致筛选口径混乱。
 * - 幂等：按名称 upsert；已存在的标签（低脂/易消化/挑食友好）会被挂到对应父级下。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register prisma/seed-health-tag-vocabulary.ts           # 预演
 *   npx ts-node -r tsconfig-paths/register prisma/seed-health-tag-vocabulary.ts --apply   # 落库
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

interface Layer {
  name: string;
  color: string;
  children: string[];
}

const LAYERS: Layer[] = [
  {
    name: '原料事实',
    color: '#1e3a2f',
    children: [
      // 水产
      '含三文鱼',
      '含鳕鱼',
      '含青花鱼',
      '含青口贝',
      '含生蚝',
      // 畜禽
      '含牛肉',
      '含猪肉',
      '含鸡胸',
      '含鸭胸',
      '含火鸡',
      '含兔肉',
      '含鹿肉',
      '含羊肉',
      // 根茎
      '含红薯',
      '含南瓜',
      '含山药',
      '含土豆',
      '含芋头',
      // 谷物
      '含燕麦',
      '含糙米',
      '含小米',
      '含藜麦',
      // 蔬菜
      '含西兰花',
      '含胡萝卜',
      '含西葫芦',
      '含卷心菜',
      // 油脂与其他
      '含三文鱼油',
      '含小麦胚芽油',
      '单一动物蛋白',
    ],
  },
  {
    name: '工艺特性',
    color: '#2b5040',
    children: ['鲜肉现制', '低温蒸煮', '冷链配送', '无防腐剂'],
  },
  {
    name: '营养特性',
    color: '#b08d4f',
    children: ['低脂', '易消化'],
  },
  {
    name: '适用对象',
    color: '#8a6b33',
    children: ['挑食友好'],
  },
  {
    name: '标准背书',
    color: '#d8bc85',
    children: ['符合 FEDIAF 2021', '符合 FEDIAF 2025'],
  },
];

async function main() {
  console.log(
    `\n===== 合规标签词表 seed ${shouldApply ? '【落库模式】' : '【预演模式 · 未改动数据】'} =====\n`,
  );

  const existing = await prisma.recipeHealthTag.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const byName = new Map(existing.map((t) => [t.name, t]));
  console.log(`现有标签总数：${existing.length}\n`);

  let createParents = 0;
  let createChildren = 0;
  let attachExisting = 0;

  for (const layer of LAYERS) {
    const parent = byName.get(layer.name);
    console.log(`【${layer.name}】${parent ? '已存在' : '将新建'}`);
    if (!parent) createParents += 1;

    for (const [index, childName] of layer.children.entries()) {
      const child = byName.get(childName);
      if (!child) {
        createChildren += 1;
        console.log(`   + 新建 ${childName}`);
        continue;
      }
      const needsAttach = parent ? child.parentId !== parent.id : true;
      if (needsAttach) {
        attachExisting += 1;
        console.log(`   ~ 已存在，挂到该分组下：${childName}`);
      } else {
        console.log(`   = 已存在且已归位：${childName}`);
      }
      void index;
    }
    console.log('');
  }

  console.log('汇总：');
  console.log(`   新建分组：${createParents} 个`);
  console.log(`   新建标签：${createChildren} 个`);
  console.log(`   归位既有标签：${attachExisting} 个`);
  console.log(
    `   合计标签总数：${existing.length + createParents + createChildren} 个\n`,
  );

  if (!shouldApply) {
    console.log('===== 预演结束：未改动任何数据 =====');
    console.log('确认无误后追加 --apply 参数执行落库。\n');
    return;
  }

  console.log('===== 开始落库 =====');
  let createdParents = 0;
  let createdChildren = 0;
  let attached = 0;

  for (const [layerIndex, layer] of LAYERS.entries()) {
    let parentId: string;
    const existingParent = await prisma.recipeHealthTag.findFirst({
      where: { name: layer.name },
      select: { id: true },
    });
    if (existingParent) {
      parentId = existingParent.id;
      await prisma.recipeHealthTag.update({
        where: { id: parentId },
        data: { color: layer.color, sort: layerIndex * 100 },
      });
    } else {
      const created = await prisma.recipeHealthTag.create({
        data: {
          name: layer.name,
          color: layer.color,
          sort: layerIndex * 100,
          description: '合规卖点分组',
        },
      });
      parentId = created.id;
      createdParents += 1;
    }

    for (const [childIndex, childName] of layer.children.entries()) {
      const existingChild = await prisma.recipeHealthTag.findFirst({
        where: { name: childName },
        select: { id: true, parentId: true },
      });
      const sort = layerIndex * 100 + childIndex + 1;
      if (existingChild) {
        if (existingChild.parentId !== parentId) {
          await prisma.recipeHealthTag.update({
            where: { id: existingChild.id },
            data: { parentId, sort, color: layer.color },
          });
          attached += 1;
        }
      } else {
        await prisma.recipeHealthTag.create({
          data: { name: childName, parentId, sort, color: layer.color },
        });
        createdChildren += 1;
      }
    }
  }

  console.log(`✓ 新建分组：${createdParents} 个`);
  console.log(`✓ 新建标签：${createdChildren} 个`);
  console.log(`✓ 归位既有标签：${attached} 个`);

  const remaining = await prisma.recipeHealthTag.findMany({
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: { select: { assignments: true } },
    },
    orderBy: [{ sort: 'asc' }, { name: 'asc' }],
  });
  console.log(`\n落库后标签总数：${remaining.length}`);
  const roots = remaining.filter((t) => !t.parentId);
  for (const root of roots) {
    console.log(`   ${root.name}`);
    for (const child of remaining.filter((t) => t.parentId === root.id)) {
      console.log(`       - ${child.name}（关联 ${child._count.assignments}）`);
    }
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
