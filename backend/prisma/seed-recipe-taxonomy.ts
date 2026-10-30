/**
 * 需求分类节点词典 · 灌入脚本（2026-10-26）
 *
 * ## 干什么
 *
 * 把 `src/domain/recipe-taxonomy/taxonomy-seed.data.ts` 里的 5 个分类、82 个节点
 * 写进数据库。**幂等**：分类按 `code` 匹配，节点按 `(kindId, parentId, name)` 匹配，
 * 已存在的节点**一律不动**（只补缺失，不覆盖运营改过的定义与排序）。
 *
 * 为什么"不删除"：运营可能在后台调整过节点（改名、停用）。脚本的职责是把词典
 * 的**新增内容**补齐，不是把数据库重置成词典的样子。
 *
 * ## 用法
 *
 *   npm run seed:recipe-taxonomy          # 预演，只读，不写库
 *   npm run seed:recipe-taxonomy:apply    # 真正写入
 */

import { PrismaClient } from '@prisma/client';
import {
  TAXONOMY_SEED,
  type TaxonomySeedNode,
} from '../src/domain/recipe-taxonomy/taxonomy-seed.data';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

interface Summary {
  kinds: { created: number; skipped: number };
  nodes: { created: number; skipped: number };
}

const summary: Summary = {
  kinds: { created: 0, skipped: 0 },
  nodes: { created: 0, skipped: 0 },
};

async function upsertNode(
  node: TaxonomySeedNode,
  kindId: string,
  parentId: string | null,
): Promise<void> {
  const existing = await prisma.recipeTaxonomyNode.findFirst({
    where: { kindId, parentId, name: node.name },
  });
  let nodeId = existing?.id ?? null;

  if (!existing) {
    summary.nodes.created += 1;
    if (APPLY) {
      const created = await prisma.recipeTaxonomyNode.create({
        data: {
          kindId,
          parentId,
          name: node.name,
          definition: node.definition,
          sort: node.sort,
        },
      });
      nodeId = created.id;
    }
  } else if (
    existing.definition !== node.definition ||
    existing.sort !== node.sort
  ) {
    // 已存在的节点**只补不改**：运营可能在后台改过定义或排序，
    // 部署时覆盖等于把人的判断冲掉。要改词典内容，走一次显式的人工操作。
    summary.nodes.skipped += 1;
  }

  for (const child of node.children ?? []) {
    if (!nodeId) {
      // 预演且父节点还没落库：子树只能按"将创建"计数
      summary.nodes.created += 1;
      continue;
    }
    await upsertNode(child, kindId, nodeId);
  }
}

async function main(): Promise<void> {
  for (const kindSeed of TAXONOMY_SEED) {
    let kind = await prisma.recipeTaxonomyKind.findUnique({
      where: { code: kindSeed.code },
    });

    if (!kind) {
      summary.kinds.created += 1;
      if (APPLY) {
        kind = await prisma.recipeTaxonomyKind.create({
          data: {
            code: kindSeed.code,
            name: kindSeed.name,
            sort: kindSeed.sort,
          },
        });
      }
    } else if (
      kind.name !== kindSeed.name ||
      kind.sort !== kindSeed.sort
    ) {
      summary.kinds.skipped += 1;
    }

    for (const node of kindSeed.nodes) {
      if (!kind) {
        // 预演且分类不存在：整棵子树按"将创建"计
        summary.nodes.created += 1 + (node.children?.length ?? 0);
        continue;
      }
      await upsertNode(node, kind.id, null);
    }
  }

  const total =
    summary.nodes.created + summary.kinds.created;

  console.log(`\n需求分类词典型: ${APPLY ? '已写入' : '预演（不写库）'}`);
  console.log(
    `  分类：新建 ${summary.kinds.created}，跳过 ${summary.kinds.skipped}（已存在且与词典不同）`,
  );
  console.log(
    `  节点：新建 ${summary.nodes.created}，跳过 ${summary.nodes.skipped}（已存在且与词典不同）`,
  );
  if (total === 0) {
    console.log('  Nothing changed. 数据库已与词典一致。');
  }
  if (!APPLY) {
    console.log('\n  加 --apply 才会真正写入：npm run seed:recipe-taxonomy:apply');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
