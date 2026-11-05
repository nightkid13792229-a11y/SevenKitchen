/**
 * 采购清单「食材」组的展示顺序（老板 2026-11-05 定）。
 *
 * 直接按 CFCT（WS/T 464-2015《食物成分数据表达规范》）的 15 个标准分类排：
 * 畜肉 → 禽肉 → 水产 → 蛋 → 乳 → 谷类 → 薯类 → 干豆 → 蔬菜 → 菌藻 →
 * 水果 → 坚果种子 → 油脂 → 调味 → 其他。
 *
 * 分类来自原料档案 `ingredient.properties.cfct_class`（后台原料卡片里维护的
 * 标准下拉项），采购清单接口已经把整条原料带回来了，所以这里是纯展示排序，
 * 不改库、不新增字段。
 *
 * 排不到分类（老数据没填 / 填了奇怪的值）一律当「其他」垫底，
 * 同一档内保持接口返回的原有先后，不让排序把清单打乱。
 */

/** 15 类固定顺序；下标即展示优先级，`其他` 与未分类同属最后一档。 */
export const CFCT_DISPLAY_ORDER = [
  '畜肉类及制品',
  '禽肉类及制品',
  '水产类',
  '蛋类及制品',
  '乳类及制品',
  '谷类及制品',
  '薯类及制品',
  '干豆类及制品',
  '蔬菜类及制品',
  '菌藻类',
  '水果类及制品',
  '坚果种子类',
  '油脂类',
  '调味品类',
  '其他',
] as const;

export type CfctClass = (typeof CFCT_DISPLAY_ORDER)[number];

/** 最后一档：`其他` 与未分类。 */
const FALLBACK_RANK = CFCT_DISPLAY_ORDER.length - 1;

const RANK_BY_CFCT_CLASS = new Map<string, number>(
  CFCT_DISPLAY_ORDER.map((cfctClass, index) => [cfctClass, index]),
);

/** 老数据可能只写「畜肉类」「油脂类」，去掉「及制品」后也能对上。 */
const LEGACY_CLASS_ALIASES = new Map<string, CfctClass>(
  CFCT_DISPLAY_ORDER.filter((cfctClass) => cfctClass.endsWith('及制品')).map(
    (cfctClass) => [cfctClass.replace(/及制品$/u, ''), cfctClass],
  ),
);

const parseProperties = (properties: unknown): Record<string, unknown> | null => {
  if (properties && typeof properties === 'object') {
    return properties as Record<string, unknown>;
  }

  if (typeof properties === 'string' && properties.trim()) {
    try {
      const parsed = JSON.parse(properties);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return null;
};

/** 读一条采购明细的 CFCT 分类；读不到返回 null。 */
export function resolveCfctClass(item: any): CfctClass | null {
  const properties = parseProperties(item?.ingredient?.properties);
  const raw = properties?.cfct_class;

  if (typeof raw !== 'string') {
    return null;
  }

  const value = raw.trim();
  if (!value) {
    return null;
  }

  if (RANK_BY_CFCT_CLASS.has(value)) {
    return value as CfctClass;
  }

  return LEGACY_CLASS_ALIASES.get(value) ?? null;
}

function resolveRank(item: any): number {
  const cfctClass = resolveCfctClass(item);
  if (!cfctClass) {
    return FALLBACK_RANK;
  }

  return RANK_BY_CFCT_CLASS.get(cfctClass) ?? FALLBACK_RANK;
}

/**
 * 按 CFCT 顺序返回排好的新数组，不修改入参。
 * 同档内用原始下标兜底，保证不同运行时的排序稳定性一致。
 */
export function sortFoodItemsByCfctOrder<T>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, rank: resolveRank(item) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.item);
}
