/**
 * 试吃装订单快照
 *
 * 试吃装是现货：订单里存的不是"一道菜的配方"，而是"这一套包含哪几道菜"。
 * 之所以仍然复用 `OrderItem.recipeSnapshot` 这个字段，是因为订单详情的渲染、
 * 售后、财务都挂在它上面；但内容形状与鲜食不同，因此用 `kind` 显式区分。
 *
 * 为什么要存快照而不是只存商品 ID：
 * 运营之后可能改这道菜、换封面、甚至改商品名。顾客回头看订单时，
 * 应该看到**下单当时**买到的东西，而不是商品页现在的样子。
 */

export const TASTING_PACK_SNAPSHOT_KIND = 'TASTING_PACK';

export interface TastingPackDishSnapshot {
  recipeId: string;
  name: string;
  coverImageUrl: string | null;
}

export interface TastingPackOrderSnapshot {
  /** 商品 ID（OrderItem.tastingPackId 也单独存了一份，便于按商品统计） */
  id: string;
  kind: typeof TASTING_PACK_SNAPSHOT_KIND;
  version: number;
  name: string;
  /**
   * 下面三个字段是为了兼容读 `recipeSnapshot` 的既有代码而填的中性值。
   * 试吃装不走定价重算、也不进生产，因此它们不会被真正使用。
   */
  production_loss_rate: number;
  energy_density_kcal_per_kg: number;
  nutrition_standard: string;
  /** 现货商品没有"原料清单"，订单里也不展示配方 —— 保持为空数组 */
  items: never[];
  // ---- 试吃装专有 ----
  tastingPackCode: string;
  bagsPerRecipe: number;
  packSpecG: number;
  /** 这一套包含哪几道菜（下单当时的菜名与封面） */
  dishes: TastingPackDishSnapshot[];
  capturedAt: string;
}

/** 判断一条 `recipeSnapshot` 是不是试吃装快照 */
export function isTastingPackSnapshot(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === TASTING_PACK_SNAPSHOT_KIND
  );
}

/**
 * 把商品 + 菜品，组装成订单快照。
 *
 * 传入的是**商品与菜品的当前状态**，一次成文之后不再随商品改动而变。
 */
export function buildTastingPackOrderSnapshot(pack: {
  id: string;
  code: string;
  name: string;
  bagsPerRecipe: number;
  packSpecG: number;
  items: Array<{
    recipeId: string;
    recipeSnapshot: unknown;
  }>;
}): TastingPackOrderSnapshot {
  const dishes: TastingPackDishSnapshot[] = (pack.items ?? []).map((item) => {
    const snapshot = (item.recipeSnapshot ?? {}) as Record<string, any>;
    return {
      recipeId: item.recipeId,
      name: snapshot.name ?? '未知食谱',
      coverImageUrl: snapshot.coverImageUrl ?? null,
    };
  });

  return {
    id: pack.id,
    kind: TASTING_PACK_SNAPSHOT_KIND,
    version: 1,
    name: pack.name,
    production_loss_rate: 1,
    energy_density_kcal_per_kg: 0,
    nutrition_standard: '',
    items: [],
    tastingPackCode: pack.code,
    bagsPerRecipe: pack.bagsPerRecipe,
    packSpecG: pack.packSpecG,
    dishes,
    capturedAt: new Date().toISOString(),
  };
}
