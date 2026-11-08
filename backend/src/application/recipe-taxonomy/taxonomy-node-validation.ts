import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../infrastructure/prisma.service';

/** 校验通过的分类节点（只带归类需要的字段）。 */
export interface ValidatedTaxonomyNode {
  id: string;
  kindId: string;
  name: string;
  status: string;
}

/**
 * 归类节点的统一校验（2026-11-08 抽公共）。
 *
 * 四条规则缺一不可：存在、启用、叶子、同一分类只能一个。
 *
 * 发布草稿（RecipeDesignerService）与归类页（RecipeTaxonomyService）都必须
 * 走这一份，否则「归类页点得动、草稿存不进去」或者反过来。
 */
export async function validateTaxonomyNodeSelection(
  prisma: Pick<PrismaService, 'recipeTaxonomyNode'>,
  nodeIds: string[],
): Promise<ValidatedTaxonomyNode[]> {
  const unique = [...new Set(nodeIds.map((id) => String(id).trim()))].filter(
    Boolean,
  );
  if (unique.length === 0) return [];

  const nodes = await prisma.recipeTaxonomyNode.findMany({
    where: { id: { in: unique } },
    select: { id: true, kindId: true, name: true, status: true },
  });

  if (nodes.length !== unique.length) {
    throw new BadRequestException('节点不存在，可能已被删除，请刷新后重试');
  }

  const disabled = nodes.filter((node) => node.status !== 'ACTIVE');
  if (disabled.length > 0) {
    throw new BadRequestException(
      `节点已停用，不能再归类：${disabled.map((node) => node.name).join('、')}`,
    );
  }

  const childCount = await prisma.recipeTaxonomyNode.count({
    where: { parentId: { in: unique } },
  });
  if (childCount > 0) {
    throw new BadRequestException('只能归到叶子节点，父节点只做汇总');
  }

  const kindIds = new Set(nodes.map((node) => node.kindId));
  if (kindIds.size !== nodes.length) {
    throw new BadRequestException('同一分类只能选一个节点');
  }

  return nodes;
}
