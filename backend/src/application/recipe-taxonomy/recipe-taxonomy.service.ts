import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type RecipeSeriesBusinessStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  buildTaxonomyTree,
  type TaxonomyKindView,
  type TaxonomyNodeRow,
} from '../../domain/recipe-taxonomy/taxonomy-tree';

interface TaxonomyNodeRef {
  id: string;
  kindId: string;
  name: string;
  status: string;
}

export interface ListTaxonomySeriesQuery {
  nodeId?: string;
  unclassified?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
  /** CATALOG=产品线（默认），ORDER=订单设计 */
  designMode?: 'CATALOG' | 'ORDER';
  /** DRAFT / PUBLIC / PRIVATE_CUSTOM；缺省时排除定制 */
  businessStatus?: RecipeSeriesBusinessStatus;
}

export interface TaxonomySeriesItem {
  id: string;
  name: string;
  businessStatus: string;
  referenceDogName: string | null;
  updatedAt: string;
  links: Array<{
    kindId: string;
    kindCode: string;
    kindName: string;
    nodeId: string;
    nodeName: string;
  }>;
  /** 还没有归属的分类 code，顺序与分类排序一致 */
  missingKindCodes: string[];
}

/**
 * 食谱需求分类（2026-10-26 第一阶段）。
 *
 * 只负责三张表的读写，不认识"食谱内容"——归属是独立关系表，
 * 所以菜的配方怎么改都不会影响这里的分类。
 */
@Injectable()
export class RecipeTaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  /** 完整分类树（含每个节点的直接归属数与含子孙的总数），计数口径与列表一致。 */
  async getTree(
    scope: {
      designMode?: 'CATALOG' | 'ORDER';
      businessStatus?: RecipeSeriesBusinessStatus;
    } = {},
  ): Promise<TaxonomyKindView[]> {
    const [kinds, nodes, grouped] = await Promise.all([
      this.prisma.recipeTaxonomyKind.findMany({ orderBy: { sort: 'asc' } }),
      this.prisma.recipeTaxonomyNode.findMany({ orderBy: { sort: 'asc' } }),
      this.prisma.recipeSeriesTaxonomy.groupBy({
        by: ['nodeId'],
        where: { series: this.buildScopeWhere(scope) },
        _count: { _all: true },
      }),
    ]);

    const directCounts: Record<string, number> = {};
    for (const row of grouped) {
      const count = (row as { _count?: { _all?: number } })._count;
      directCounts[row.nodeId] = count?._all ?? 0;
    }

    return buildTaxonomyTree(
      kinds.map((kind) => ({
        id: kind.id,
        code: kind.code,
        name: kind.name,
        sort: kind.sort,
      })),
      nodes.map<TaxonomyNodeRow>((node) => ({
        id: node.id,
        kindId: node.kindId,
        parentId: node.parentId,
        name: node.name,
        definition: node.definition,
        sort: node.sort,
        status: node.status as TaxonomyNodeRow['status'],
      })),
      directCounts,
    );
  }

  /**
   * 校验待归类的节点。四条规则缺一不可：
   * 存在、启用、叶子、同一分类只能一个。
   */
  private async validateNodes(nodeIds: string[]): Promise<TaxonomyNodeRef[]> {
    const unique = [...new Set(nodeIds)];
    if (unique.length === 0) return [];

    const nodes = await this.prisma.recipeTaxonomyNode.findMany({
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

    const childCount = await this.prisma.recipeTaxonomyNode.count({
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

  /**
   * 覆盖一个系列的归属。
   *
   * 语义：`nodeIds` 是这些分类的最终状态——未出现的分类不动；
   * **传空数组等于清空该系列的全部归属**。
   */
  async replaceSeriesLinks(
    seriesId: string,
    nodeIds: string[],
    actorId: string | null,
  ): Promise<void> {
    const nodes = await this.validateNodes(nodeIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operations: any[] = [];

    if (nodes.length === 0) {
      operations.push(
        this.prisma.recipeSeriesTaxonomy.deleteMany({ where: { seriesId } }),
      );
    } else {
      operations.push(
        this.prisma.recipeSeriesTaxonomy.deleteMany({
          where: {
            seriesId,
            kindId: { in: nodes.map((node) => node.kindId) },
          },
        }),
        this.prisma.recipeSeriesTaxonomy.createMany({
          data: nodes.map((node) => ({
            seriesId,
            kindId: node.kindId,
            nodeId: node.id,
            createdBy: actorId,
          })),
        }),
      );
    }

    await this.prisma.$transaction(operations);
  }

  /** 批量归类：同一批节点写到多个系列，语义与单道一致。 */
  async batchClassify(
    seriesIds: string[],
    nodeIds: string[],
    actorId: string | null,
  ): Promise<{ updated: number }> {
    if (seriesIds.length === 0) return { updated: 0 };

    const nodes = await this.validateNodes(nodeIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operations: any[] = [];

    if (nodes.length === 0) {
      operations.push(
        this.prisma.recipeSeriesTaxonomy.deleteMany({
          where: { seriesId: { in: seriesIds } },
        }),
      );
    } else {
      const kindIds = nodes.map((node) => node.kindId);
      operations.push(
        this.prisma.recipeSeriesTaxonomy.deleteMany({
          where: { seriesId: { in: seriesIds }, kindId: { in: kindIds } },
        }),
        this.prisma.recipeSeriesTaxonomy.createMany({
          data: seriesIds.flatMap((seriesId) =>
            nodes.map((node) => ({
              seriesId,
              kindId: node.kindId,
              nodeId: node.id,
              createdBy: actorId,
            })),
          ),
        }),
      );
    }

    await this.prisma.$transaction(operations);
    return { updated: seriesIds.length };
  }

  /**
   * 需求分类只服务产品线整理：默认排除「定制」与订单设计。
   * 定制食谱是某只狗的私有版本，不进货架，混进来只会把清单撑大。
   */
  private buildScopeWhere(query: {
    designMode?: 'CATALOG' | 'ORDER';
    businessStatus?: RecipeSeriesBusinessStatus;
  }): Prisma.RecipeSeriesWhereInput {
    return {
      deletedAt: null,
      designMode: query.designMode ?? undefined,
      businessStatus: query.businessStatus ?? { not: 'PRIVATE_CUSTOM' },
    };
  }

  /** 查某个节点时，把它的直接子节点一并算进来（分类树最多两层）。 */
  private async collectNodeAndChildren(nodeId: string): Promise<string[]> {
    const children = await this.prisma.recipeTaxonomyNode.findMany({
      where: { parentId: nodeId },
      select: { id: true },
    });
    return [nodeId, ...children.map((child) => child.id)];
  }

  /** 按节点或「未归类」查系列，并补齐每个系列的分类缺口。 */
  async listSeries(
    query: ListTaxonomySeriesQuery,
  ): Promise<{ items: TaxonomySeriesItem[]; total: number }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0 ? query.pageSize : 20;

    const kinds = await this.prisma.recipeTaxonomyKind.findMany({
      orderBy: { sort: 'asc' },
    });

    const where: Record<string, unknown> = this.buildScopeWhere(query);
    if (query.keyword?.trim()) {
      where.name = {
        contains: query.keyword.trim(),
        mode: 'insensitive',
      };
    }

    if (query.unclassified) {
      where.taxonomyLinks = { none: {} };
    } else if (query.nodeId) {
      const nodeIds = await this.collectNodeAndChildren(query.nodeId);
      where.taxonomyLinks = { some: { nodeId: { in: nodeIds } } };
    }

    const [rows, total] = await Promise.all([
      this.prisma.recipeSeries.findMany({
        where,
        include: {
          taxonomyLinks: { include: { node: { include: { kind: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.recipeSeries.count({ where }),
    ]);

    // 参考爱犬只用于列表上显示一个狗名，系列表里没有关系字段，单独查一次
    const dogIds = [
      ...new Set(rows.map((row: any) => row.referenceDogId).filter(Boolean)),
    ] as string[];
    const dogs = dogIds.length
      ? await this.prisma.dog.findMany({
          where: { id: { in: dogIds } },
          select: { id: true, name: true },
        })
      : [];
    const dogNameById = new Map(dogs.map((dog) => [dog.id, dog.name]));

    const items: TaxonomySeriesItem[] = rows.map((row: any) => {
      const links = (row.taxonomyLinks ?? []).map((link: any) => ({
        kindId: link.node.kindId,
        kindCode: link.node.kind.code,
        kindName: link.node.kind.name,
        nodeId: link.nodeId,
        nodeName: link.node.name,
      }));
      const linkedKindIds = new Set(
        links.map((link: { kindId: string }) => link.kindId),
      );

      return {
        id: row.id,
        name: row.name,
        businessStatus: row.businessStatus,
        referenceDogName: row.referenceDogId
          ? (dogNameById.get(row.referenceDogId) ?? null)
          : null,
        updatedAt: row.updatedAt.toISOString(),
        links,
        missingKindCodes: kinds
          .filter((kind) => !linkedKindIds.has(kind.id))
          .map((kind) => kind.code),
      };
    });

    return { items, total };
  }

  private assertDefinition(definition: string): string {
    const trimmed = definition.trim();
    if (!trimmed) {
      throw new BadRequestException('节点定义不能为空');
    }
    if (trimmed.length > 200) {
      throw new BadRequestException('节点定义不能超过 200 字');
    }
    return trimmed;
  }

  async createNode(input: {
    kindId: string;
    parentId?: string | null;
    name: string;
    definition: string;
    sort?: number;
  }) {
    const definition = this.assertDefinition(input.definition);

    const kind = await this.prisma.recipeTaxonomyKind.findUnique({
      where: { id: input.kindId },
    });
    if (!kind) {
      throw new NotFoundException('分类不存在');
    }

    return this.prisma.recipeTaxonomyNode.create({
      data: {
        kindId: input.kindId,
        parentId: input.parentId ?? null,
        name: input.name.trim(),
        definition,
        sort: input.sort ?? 0,
      },
    });
  }

  async updateNode(
    nodeId: string,
    input: {
      name?: string;
      definition?: string;
      sort?: number;
      status?: 'ACTIVE' | 'DISABLED';
    },
  ) {
    const existing = await this.prisma.recipeTaxonomyNode.findUnique({
      where: { id: nodeId },
    });
    if (!existing) {
      throw new NotFoundException('节点不存在');
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.definition !== undefined) {
      data.definition = this.assertDefinition(input.definition);
    }
    if (input.sort !== undefined) data.sort = input.sort;
    // 停用只改状态：已有归属继续保留，树里收起即可
    if (input.status !== undefined) data.status = input.status;

    return this.prisma.recipeTaxonomyNode.update({
      where: { id: nodeId },
      data,
    });
  }

  async deleteNode(nodeId: string): Promise<void> {
    const childCount = await this.prisma.recipeTaxonomyNode.count({
      where: { parentId: nodeId },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        `该节点下还有 ${childCount} 个子节点，请先处理子节点`,
      );
    }

    const linkCount = await this.prisma.recipeSeriesTaxonomy.count({
      where: { nodeId },
    });
    if (linkCount > 0) {
      throw new BadRequestException(
        `还有 ${linkCount} 道菜归在这里，请先移走再删除`,
      );
    }

    await this.prisma.recipeTaxonomyNode.delete({ where: { id: nodeId } });
  }
}
