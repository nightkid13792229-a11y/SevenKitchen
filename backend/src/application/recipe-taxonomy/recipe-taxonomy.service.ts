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
import {
  mergeSeriesReleaseDraft,
  parseSeriesReleaseDraft,
  type SeriesReleaseDraftPayload,
  type SeriesReleaseDraftTaxonomyLink,
} from '../../domain/recipe-designer/series-release-draft';
import {
  loadSeriesReleaseDraftContext,
  persistSeriesReleaseDraft,
} from '../recipe-designer/series-release-draft.store';
import {
  validateTaxonomyNodeSelection,
  type ValidatedTaxonomyNode,
} from './taxonomy-node-validation';

type TaxonomyNodeRef = ValidatedTaxonomyNode;

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
  /** 归类改在草稿里、还没发布（2026-11-08） */
  hasDraftTaxonomy: boolean;
}

/**
 * 食谱需求分类（2026-10-26 第一阶段）。
 *
 * 只负责三张表的读写，不认识"食谱内容"——归属是独立关系表，
 * 所以菜的配方怎么改都不会影响这里的分类。
 */

const taxonomySignature = (links: SeriesReleaseDraftTaxonomyLink[]): string =>
  links
    .map((link) => `${link.kindId}:${link.nodeId}`)
    .sort()
    .join('|');

/**
 * 把一次归类选择合并进发布草稿。
 *
 * - `replace`：本次选择就是最终状态（归类弹窗勾的是全量）；
 * - `merge`：只改本次涉及的分类，其余分类保持「草稿 ?? 线上」。
 */
function mergeTaxonomyIntoDraft(
  context: Awaited<ReturnType<typeof loadSeriesReleaseDraftContext>>,
  taxonomy: SeriesReleaseDraftTaxonomyLink[],
  mode: 'replace' | 'merge',
): SeriesReleaseDraftPayload {
  const kindIds = new Set(taxonomy.map((link) => link.kindId));
  // 空数组 = 清空全部归属（与旧接口语义一致），不能当成「没选任何分类」。
  const next =
    mode === 'replace' || taxonomy.length === 0
      ? [...taxonomy]
      : [
          ...context.effective.taxonomy.filter(
            (link) => !kindIds.has(link.kindId),
          ),
          ...taxonomy,
        ];
  return mergeSeriesReleaseDraft(
    context.draft,
    { taxonomy: next },
    context.live,
  );
}

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
   * 校验待归类的节点。四条规则缺一不可：存在、启用、叶子、同一分类只能一个。
   *
   * 实现抽到 `taxonomy-node-validation.ts`，发布草稿保存也走同一份。
   */
  private async validateNodes(nodeIds: string[]): Promise<TaxonomyNodeRef[]> {
    return validateTaxonomyNodeSelection(this.prisma, nodeIds);
  }

  /**
   * 覆盖一个系列的归属（2026-11-08 起写发布草稿）。
   *
   * 语义：`nodeIds` 是这些分类的最终状态，**传空数组等于清空该系列的全部归属**。
   * 顾客端继续看线上归类，点「发布这一版」才生效。
   *
   * 订单定制系列不进分类页，仍沿用直接写线上的旧行为（避免影响交付流程）。
   */
  async replaceSeriesLinks(
    seriesId: string,
    nodeIds: string[],
    actorId: string | null,
  ): Promise<void> {
    const nodes = await this.validateNodes(nodeIds);
    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: seriesId },
      select: {
        id: true,
        name: true,
        status: true,
        deletedAt: true,
        designMode: true,
        coverImageUrl: true,
        coverTitle: true,
        sellingPoint: true,
        targetHealthTags: true,
        releaseDraft: true,
        releaseDraftUpdatedAt: true,
      },
    });
    if (!series || series.deletedAt || series.status !== 'ACTIVE') {
      throw new NotFoundException('食谱系列不存在');
    }
    if (series.designMode === 'ORDER') {
      await this.writeLiveLinks(seriesId, nodes, actorId, 'replace');
      return;
    }

    const context = await loadSeriesReleaseDraftContext(
      this.prisma,
      series as any,
    );
    const taxonomy = nodes.map((node) => ({
      kindId: node.kindId,
      nodeId: node.id,
    }));
    const merged = mergeTaxonomyIntoDraft(context, taxonomy, 'replace');
    await persistSeriesReleaseDraft(
      this.prisma,
      seriesId,
      merged,
      context.live,
      actorId,
      series.releaseDraftUpdatedAt ?? null,
    );
  }

  /**
   * 批量归类：同一批节点写到多个系列，语义与单道一致。
   *
   * 草稿模式下按分类合并：只覆盖本次选中的分类，其它分类保持原值。
   */
  async batchClassify(
    seriesIds: string[],
    nodeIds: string[],
    actorId: string | null,
  ): Promise<{ updated: number }> {
    if (seriesIds.length === 0) return { updated: 0 };

    const nodes = await this.validateNodes(nodeIds);
    const seriesRows = await this.prisma.recipeSeries.findMany({
      where: { id: { in: seriesIds } },
      select: {
        id: true,
        name: true,
        status: true,
        deletedAt: true,
        designMode: true,
        coverImageUrl: true,
        coverTitle: true,
        sellingPoint: true,
        targetHealthTags: true,
        releaseDraft: true,
        releaseDraftUpdatedAt: true,
      },
    });
    const liveSeriesIds: string[] = [];
    for (const series of seriesRows) {
      if (series.designMode === 'ORDER') {
        liveSeriesIds.push(series.id);
        continue;
      }
      const context = await loadSeriesReleaseDraftContext(
        this.prisma,
        series as any,
      );
      const taxonomy = nodes.map((node) => ({
        kindId: node.kindId,
        nodeId: node.id,
      }));
      const merged = mergeTaxonomyIntoDraft(context, taxonomy, 'merge');
      await persistSeriesReleaseDraft(
        this.prisma,
        series.id,
        merged,
        context.live,
        actorId,
        series.releaseDraftUpdatedAt ?? null,
      );
    }
    if (liveSeriesIds.length > 0) {
      await this.writeLiveLinks(liveSeriesIds, nodes, actorId, 'merge');
    }
    return { updated: seriesIds.length };
  }

  /** 旧的直接写线上路径：只留给订单定制系列 / 历史调用。 */
  private async writeLiveLinks(
    seriesIdOrIds: string | string[],
    nodes: TaxonomyNodeRef[],
    actorId: string | null,
    mode: 'replace' | 'merge',
  ): Promise<void> {
    const seriesIds = Array.isArray(seriesIdOrIds)
      ? seriesIdOrIds
      : [seriesIdOrIds];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operations: any[] = [];
    if (nodes.length === 0) {
      operations.push(
        this.prisma.recipeSeriesTaxonomy.deleteMany({
          where: { seriesId: { in: seriesIds } },
        }),
      );
    } else {
      operations.push(
        this.prisma.recipeSeriesTaxonomy.deleteMany({
          where: {
            seriesId: { in: seriesIds },
            kindId: { in: nodes.map((node) => node.kindId) },
          },
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
    if (mode === 'replace' && nodes.length > 0) {
      // 全量覆盖：先清掉这个系列未在本次选择里的分类
      operations.unshift(
        this.prisma.recipeSeriesTaxonomy.deleteMany({
          where: {
            seriesId: { in: seriesIds },
            kindId: { notIn: nodes.map((node) => node.kindId) },
          },
        }),
      );
    }
    await this.prisma.$transaction(operations);
  }

  /**
   * 单个系列生效中的归类（草稿 ?? 线上）。
   *
   * 发布抽屉里的「快速归类」用它加载当前值：不能再去 200 条的列表里找，
   * 系列一多就会找不到、显示成全空。
   */
  async getSeriesLinks(seriesId: string): Promise<{
    links: Array<{
      kindId: string;
      nodeId: string;
      kindCode: string;
      kindName: string;
      nodeName: string;
    }>;
    hasDraftTaxonomy: boolean;
  }> {
    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: seriesId },
      select: { id: true, releaseDraft: true },
    });
    if (!series) {
      throw new NotFoundException('食谱系列不存在');
    }
    const live = await this.prisma.recipeSeriesTaxonomy.findMany({
      where: { seriesId },
      select: { kindId: true, nodeId: true },
    });
    const draft = series.releaseDraft
      ? parseSeriesReleaseDraft(series.releaseDraft)
      : null;
    const hasDraftTaxonomy =
      draft !== null &&
      taxonomySignature(draft.taxonomy) !== taxonomySignature(live);
    const effective = hasDraftTaxonomy ? draft!.taxonomy : live;
    const nodes = effective.length
      ? await this.prisma.recipeTaxonomyNode.findMany({
          where: { id: { in: effective.map((link) => link.nodeId) } },
          select: {
            id: true,
            name: true,
            kind: { select: { code: true, name: true } },
          },
        })
      : [];
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return {
      links: effective
        .map((link) => {
          const node = nodeById.get(link.nodeId);
          if (!node) return null;
          return {
            kindId: link.kindId,
            nodeId: link.nodeId,
            kindCode: node.kind.code,
            kindName: node.kind.name,
            nodeName: node.name,
          };
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link)),
      hasDraftTaxonomy,
    };
  }

  /**
   * 需求分类只服务产品线整理。
   *
   * 排除三类，缺一不可：
   *   · 绑定到某只顾客狗的系列（`customer_dog_id`）—— 这才是"定制/顾客自己设计"
   *     的真实判据。光看 `business_status` 不够：顾客设计出来的系列状态是草稿，
   *     名字长得像"卡的鲜食食谱 10/21"，会被当成产品线混进来。
   *   · 业务状态为「定制」的系列；
   *   · 订单设计（`design_mode = ORDER`）。
   */
  private buildScopeWhere(query: {
    designMode?: 'CATALOG' | 'ORDER';
    businessStatus?: RecipeSeriesBusinessStatus;
  }): Prisma.RecipeSeriesWhereInput {
    return {
      deletedAt: null,
      customerDogId: null,
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
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;

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

    /**
     * 2026-11-08：归类先写发布草稿，归类页必须显示「草稿 ?? 线上」的生效值，
     * 并标出「待发布」。只读线上值会让人以为「点了归类页面没反应」。
     */
    const effectiveLinksBySeries = new Map<
      string,
      SeriesReleaseDraftTaxonomyLink[]
    >();
    const draftTaxonomySeriesIds = new Set<string>();
    for (const row of rows as any[]) {
      const liveLinks = (row.taxonomyLinks ?? []).map((link: any) => ({
        kindId: link.node.kindId,
        nodeId: link.nodeId,
      }));
      const draft = row.releaseDraft
        ? parseSeriesReleaseDraft(row.releaseDraft)
        : null;
      const hasDraftTaxonomy =
        draft !== null &&
        taxonomySignature(draft.taxonomy) !== taxonomySignature(liveLinks);
      if (hasDraftTaxonomy) {
        draftTaxonomySeriesIds.add(row.id);
        effectiveLinksBySeries.set(row.id, draft!.taxonomy);
      } else {
        effectiveLinksBySeries.set(row.id, liveLinks);
      }
    }

    const nodeIds = [
      ...new Set(
        [...effectiveLinksBySeries.values()].flatMap((links) =>
          links.map((link) => link.nodeId),
        ),
      ),
    ];
    const nodeRows = nodeIds.length
      ? await this.prisma.recipeTaxonomyNode.findMany({
          where: { id: { in: nodeIds } },
          select: {
            id: true,
            kindId: true,
            name: true,
            kind: { select: { code: true, name: true } },
          },
        })
      : [];
    const nodeById = new Map(nodeRows.map((node) => [node.id, node]));

    const items: TaxonomySeriesItem[] = (rows as any[]).map((row) => {
      const links = (effectiveLinksBySeries.get(row.id) ?? [])
        .map((link) => {
          const node = nodeById.get(link.nodeId);
          if (!node) return null;
          return {
            kindId: node.kindId,
            kindCode: node.kind.code,
            kindName: node.kind.name,
            nodeId: node.id,
            nodeName: node.name,
          };
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link));
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
        hasDraftTaxonomy: draftTaxonomySeriesIds.has(row.id),
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
