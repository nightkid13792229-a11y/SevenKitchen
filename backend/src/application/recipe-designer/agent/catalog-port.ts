/**
 * 需求分类（taxonomy）只读端口。
 *
 * 为什么单独一个端口：分类是"货架怎么摆"的信息，不属于当前这一份草稿，
 * 但"完善现有产品线"必须看得见它。所以单独给一个只读入口，不进 read_draft。
 *
 * 三层取数，每层有上限 —— 不做"一次全给"：
 *   1. 不带参数：有哪些分类、各自多少节点多少道
 *   2. 给 kind：这个分类下的节点，各自挂了几道
 *   3. 给 nodeId：这个节点下的食谱，最多 20 条
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma.service';

export interface TaxonomyOverview {
  kinds: Array<{
    code: string;
    name: string;
    nodeCount: number;
    seriesCount: number;
  }>;
}

export interface TaxonomyKindView {
  kind: { code: string; name: string };
  total: number;
  nodes: Array<{ id: string; path: string; seriesCount: number }>;
}

export interface TaxonomyMatchView {
  matches: Array<{ id: string; path: string }>;
}

export interface TaxonomyNodeView {
  node: { id: string; path: string };
  total: number;
  series: Array<{
    name: string;
    lifeStages: string[];
    status: string;
    healthTags: string[];
  }>;
}

const NODE_LIMIT = 60;
const SERIES_LIMIT = 20;

@Injectable()
export class RecipeCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  async read(input: {
    kind?: string;
    nodeId?: string;
    node?: string;
  }): Promise<
    TaxonomyOverview | TaxonomyKindView | TaxonomyMatchView | TaxonomyNodeView
  > {
    if (input.nodeId) {
      return this.readNode(input.nodeId);
    }
    if (input.node) {
      return this.readByName(input.node, input.kind);
    }
    if (input.kind) {
      return this.readKind(input.kind);
    }
    return this.readOverview();
  }

  private async readOverview(): Promise<TaxonomyOverview> {
    const [kinds, nodes, links] = await Promise.all([
      this.prisma.recipeTaxonomyKind.findMany({
        orderBy: { sort: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.recipeTaxonomyNode.groupBy({
        by: ['kindId'],
        _count: { _all: true },
      }),
      this.prisma.recipeSeriesTaxonomy.groupBy({
        by: ['kindId'],
        _count: { _all: true },
      }),
    ]);

    const nodeCount = new Map(
      nodes.map((row) => [row.kindId, row._count._all]),
    );
    const linkCount = new Map(
      links.map((row) => [row.kindId, row._count._all]),
    );

    return {
      kinds: kinds.map((kind) => ({
        code: kind.code,
        name: kind.name,
        nodeCount: nodeCount.get(kind.id) ?? 0,
        seriesCount: linkCount.get(kind.id) ?? 0,
      })),
    };
  }

  /**
   * 按名字找节点。模型经常把节点名（「肾脏泌尿」）当 id 传，
   * 所以这里必须能吃名字；命中多条就让它挑，别报一个看不懂的错。
   */
  private async readByName(
    name: string,
    kindCode?: string,
  ): Promise<TaxonomyMatchView | TaxonomyNodeView> {
    const keyword = name.trim();
    if (!keyword) {
      throw new Error('node 不能为空');
    }
    const kind = kindCode
      ? await this.prisma.recipeTaxonomyKind.findUnique({
          where: { code: kindCode },
          select: { id: true },
        })
      : null;

    const nodes = await this.prisma.recipeTaxonomyNode.findMany({
      where: {
        status: 'ACTIVE',
        ...(kind ? { kindId: kind.id } : {}),
        OR: [
          { name: { contains: keyword } },
          { definition: { contains: keyword } },
        ],
      },
      take: 10,
      select: {
        id: true,
        name: true,
        parent: { select: { name: true } },
      },
    });

    if (nodes.length === 0) {
      throw new Error(
        `没有找到名字含「${keyword}」的分类节点。可以先不带参数看分类，或给 kind 看该分类下的节点。`,
      );
    }
    if (nodes.length === 1) {
      return this.readNode(nodes[0].id);
    }
    return {
      matches: nodes.map((node) => ({
        id: node.id,
        path: node.parent ? `${node.parent.name} / ${node.name}` : node.name,
      })),
    };
  }

  private async readKind(code: string): Promise<TaxonomyKindView> {
    const kind = await this.prisma.recipeTaxonomyKind.findUnique({
      where: { code },
      select: { id: true, code: true, name: true },
    });
    if (!kind) {
      throw new Error(`没有这个分类：${code}`);
    }

    const [nodes, links] = await Promise.all([
      this.prisma.recipeTaxonomyNode.findMany({
        where: { kindId: kind.id, status: 'ACTIVE' },
        orderBy: [{ parentId: 'asc' }, { sort: 'asc' }],
        select: { id: true, name: true, parentId: true },
        take: NODE_LIMIT,
      }),
      this.prisma.recipeSeriesTaxonomy.groupBy({
        by: ['nodeId'],
        where: { kindId: kind.id },
        _count: { _all: true },
      }),
    ]);

    const countByNode = new Map(
      links.map((row) => [row.nodeId, row._count._all]),
    );
    const nameById = new Map(nodes.map((row) => [row.id, row.name]));
    const pathOf = (id: string, parentId: string | null): string => {
      const name = nameById.get(id) ?? '';
      if (!parentId) return name;
      const parentName = nameById.get(parentId);
      return parentName ? `${parentName} / ${name}` : name;
    };

    return {
      kind: { code: kind.code, name: kind.name },
      total: nodes.length,
      nodes: nodes.map((node) => ({
        id: node.id,
        path: pathOf(node.id, node.parentId),
        seriesCount: countByNode.get(node.id) ?? 0,
      })),
    };
  }

  private async readNode(nodeId: string): Promise<TaxonomyNodeView> {
    const node = await this.prisma.recipeTaxonomyNode.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        name: true,
        parent: { select: { name: true } },
      },
    });
    if (!node) {
      throw new Error(`没有这个分类节点：${nodeId}`);
    }

    const [total, links] = await Promise.all([
      this.prisma.recipeSeriesTaxonomy.count({ where: { nodeId } }),
      this.prisma.recipeSeriesTaxonomy.findMany({
        where: { nodeId },
        take: SERIES_LIMIT,
        include: {
          series: {
            select: {
              name: true,
              businessStatus: true,
              requiredLifeStages: true,
              targetHealthTags: true,
            },
          },
        },
      }),
    ]);

    return {
      node: {
        id: node.id,
        path: node.parent ? `${node.parent.name} / ${node.name}` : node.name,
      },
      total,
      series: links.map((link) => ({
        name: link.series.name,
        lifeStages: link.series.requiredLifeStages ?? [],
        status: String(link.series.businessStatus),
        healthTags: link.series.targetHealthTags ?? [],
      })),
    };
  }
}
