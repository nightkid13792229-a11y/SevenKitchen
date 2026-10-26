/**
 * 需求分类树的组装逻辑（纯函数）。
 *
 * 只做三件事：按分类分组、按 parentId 挂父子、自底向上累加计数。
 * 不碰数据库，方便单测。
 */

export interface TaxonomyKindRow {
  id: string;
  code: string;
  name: string;
  sort: number;
}

export interface TaxonomyNodeRow {
  id: string;
  kindId: string;
  parentId: string | null;
  name: string;
  definition: string;
  sort: number;
  status: 'ACTIVE' | 'DISABLED';
}

export interface TaxonomyNodeView extends TaxonomyNodeRow {
  /** 直接归属到本节点的系列数 */
  seriesCount: number;
  /** 含全部子孙的系列数；父节点用它显示总数 */
  rollupSeriesCount: number;
  children: TaxonomyNodeView[];
}

export interface TaxonomyKindView extends TaxonomyKindRow {
  nodes: TaxonomyNodeView[];
  rollupSeriesCount: number;
}

function compareBySortThenName(
  left: { sort: number; name: string },
  right: { sort: number; name: string },
): number {
  if (left.sort !== right.sort) return left.sort - right.sort;
  // 用码位比较而不是 localeCompare：不依赖运行环境的排序规则，顺序永远一致
  if (left.name === right.name) return 0;
  return left.name < right.name ? -1 : 1;
}

export function buildTaxonomyTree(
  kinds: TaxonomyKindRow[],
  nodes: TaxonomyNodeRow[],
  directCounts: Record<string, number>,
): TaxonomyKindView[] {
  return [...kinds]
    .sort(compareBySortThenName)
    .map((kind) => {
      const kindNodes = nodes.filter((node) => node.kindId === kind.id);
      const ids = new Set(kindNodes.map((node) => node.id));

      const views = new Map<string, TaxonomyNodeView>(
        kindNodes.map((node) => [
          node.id,
          {
            ...node,
            seriesCount: directCounts[node.id] ?? 0,
            rollupSeriesCount: 0,
            children: [],
          },
        ]),
      );

      const roots: TaxonomyNodeView[] = [];
      for (const view of views.values()) {
        // 父节点不存在（被删或数据错乱）时提升为一级，宁可显示错层级也不让节点消失
        const parent = view.parentId ? views.get(view.parentId) : undefined;
        if (parent && ids.has(parent.id)) {
          parent.children.push(view);
        } else {
          roots.push(view);
        }
      }

      const rollup = (view: TaxonomyNodeView): number => {
        view.children.sort(compareBySortThenName);
        view.children.forEach((child) => rollup(child));
        view.rollupSeriesCount =
          view.seriesCount +
          view.children.reduce((sum, child) => sum + child.rollupSeriesCount, 0);
        return view.rollupSeriesCount;
      };

      roots.sort(compareBySortThenName);
      const total = roots.reduce((sum, root) => sum + rollup(root), 0);

      return { ...kind, nodes: roots, rollupSeriesCount: total };
    });
}
