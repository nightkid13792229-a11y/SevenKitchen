export interface DogDesignHistoryIngredientRow {
  name: string;
  count: number;
  lastUsedAt: string | null;
  ingredientType: string | null;
  isSupplement: boolean;
}

export interface DogDesignHistorySummary {
  designCount: number;
  seriesNames: string[];
  ingredients: DogDesignHistoryIngredientRow[];
  /** 最近 90 天订单中实际吃过（至少进入冷冻）的食材，按标准原料聚合，仅食材类 */
  recentEatenIngredients: RecentEatenIngredientRow[];
}

export interface RecentEatenIngredientRow {
  ingredientId: string;
  name: string;
  count: number;
  lastUsedAt: string | null;
}

export interface DogOrderSummary {
  orderCount: number;
  recipeNames: string[];
  customRecipeCount: number;
}

export interface DogDesignInsight {
  dog: {
    id: string;
    name: string;
    avatarUrl: string | null;
    ownerId: string;
    currentWeightKg: number;
    breedName: string | null;
    lifeStageLabel: string | null;
    /** 性别：MALE / FEMALE */
    gender: string | null;
    /** 由生日推算的月龄（无生日则为 null） */
    ageMonths: number | null;
    /** 是否绝育 */
    isNeutered: boolean | null;
    /** 体况评分 1-9 */
    bcsScore: number | null;
    /** 活动量：RESTING / LOW / NORMAL / HIGH / WORKING */
    activityLevel: string | null;
    /** 每日餐数 */
    mealsPerDay: number | null;
    /** 零食输入模式：ESTIMATE_LEVEL / EXACT_KCAL */
    treatInputMode: string | null;
    /** 零食等级：NONE / LOW / MODERATE / HIGH */
    treatLevel: string | null;
    /** 精确模式下每日零食热量 kcal */
    manualTreatKcal: number | null;
    /** 每日目标能量 kcal（档案缓存值） */
    targetFoodKcal: number | null;
    allergyFoods: string | null;
    pickyFoods: string | null;
    preferredFoods: string | null;
    medicalHistory: string | null;
  };
  designHistory: DogDesignHistorySummary;
  orderSummary: DogOrderSummary;
}

interface InsightDesignItemLike {
  id?: string;
  name?: string;
  ingredientName?: string;
  nutritionFoodName?: string;
  nutritionFood?: { name?: string; displayNameZh?: string | null } | null;
  ingredient?: { name?: string; type?: string | null } | null;
  ingredientType?: string | null;
}

interface InsightDesignLike {
  id?: string;
  name?: string;
  seriesLifeStage?: string | null;
  updatedAt?: string | Date;
  items?: InsightDesignItemLike[];
}

interface InsightSeriesLike {
  id?: string;
  name?: string;
  designs?: InsightDesignLike[];
}

interface InsightOrderItemLike {
  id?: string;
  recipeSnapshot?: unknown;
  dogId?: string | null;
  order?: {
    status?: string | null;
    freezingSince?: string | Date | null;
    shippedAt?: string | Date | null;
    completedAt?: string | Date | null;
    paidAt?: string | Date | null;
    createdAt?: string | Date | null;
  } | null;
}

/**
 * 订单「实际食用」的时间：优先冷冻时间（freezingSince），
 * 其次发货/完成/付款，最后回退到创建时间。
 */
function resolveOrderEatenTime(
  order?: InsightOrderItemLike['order'],
): string | null {
  return toIsoString(
    order?.freezingSince ??
      order?.shippedAt ??
      order?.completedAt ??
      order?.paidAt ??
      order?.createdAt ??
      null,
  );
}

/** 快照内单个原料（与订单 RecipeSnapshotItem 结构对齐） */
interface InsightSnapshotItemLike {
  ingredient_id?: unknown;
  name?: unknown;
  ingredient_type?: unknown;
}

interface InsightSnapshotLike {
  items?: InsightSnapshotItemLike[];
}

interface InsightDogLike {
  id: string;
  name: string;
  avatarUrl?: string | null;
  ownerId?: string;
  currentWeightKg?: number;
  breed?: { name?: string | null } | null;
  customBreedName?: string | null;
  gender?: string | null;
  birthday?: string | Date | null;
  isNeutered?: boolean | null;
  bcsScore?: number | null;
  activityLevel?: string | null;
  mealsPerDay?: number | null;
  treatInputMode?: string | null;
  treatLevel?: string | null;
  manualTreatKcal?: number | null;
  cachedTargetFoodKcal?: number | null;
  allergyFoods?: string | null;
  pickyFoods?: string | null;
  preferredFoods?: string | null;
  medicalHistory?: string | null;
}

function calcAgeMonths(birthday?: string | Date | null): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  return (
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  );
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function resolveInsightItemName(
  item: InsightDesignItemLike,
): string {
  return firstString(
    item.name,
    item.ingredientName,
    item.nutritionFoodName,
    item.nutritionFood?.displayNameZh,
    item.nutritionFood?.name,
    item.ingredient?.name,
  );
}

export function resolveInsightItemIngredientType(
  item: InsightDesignItemLike,
): string | null {
  const type = firstString(
    item.ingredientType,
    item.ingredient?.type,
  );
  return type || null;
}

export function isInsightItemSupplement(item: InsightDesignItemLike): boolean {
  const type = resolveInsightItemIngredientType(item);
  return type === 'SUPPLEMENT';
}

/**
 * 汇总一只爱犬名下所有设计（RecipeSeries.designs）使用过的食材及频次。
 * 纯函数，便于单元测试。
 */
export function aggregateDogDesignHistory(
  seriesList: InsightSeriesLike[],
): DogDesignHistorySummary {
  const ingredientByName = new Map<
    string,
    DogDesignHistoryIngredientRow
  >();
  const seriesNames: string[] = [];
  let designCount = 0;

  for (const series of seriesList) {
    const seriesName = firstString(series.name);
    if (seriesName && !seriesNames.includes(seriesName)) {
      seriesNames.push(seriesName);
    }
    const designs = series.designs ?? [];
    designCount += designs.length;

    for (const design of designs) {
      const lastUsedAt = toIsoString(design.updatedAt);
      for (const item of design.items ?? []) {
        const name = resolveInsightItemName(item);
        if (!name) continue;
        const existing = ingredientByName.get(name);
        if (existing) {
          existing.count += 1;
          if (
            lastUsedAt &&
            (!existing.lastUsedAt || lastUsedAt > existing.lastUsedAt)
          ) {
            existing.lastUsedAt = lastUsedAt;
          }
        } else {
          ingredientByName.set(name, {
            name,
            count: 1,
            lastUsedAt,
            ingredientType: resolveInsightItemIngredientType(item),
            isSupplement: isInsightItemSupplement(item),
          });
        }
      }
    }
  }

  const ingredients = Array.from(ingredientByName.values()).sort(
    (left, right) =>
      right.count - left.count ||
      (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '') ||
      left.name.localeCompare(right.name),
  );

  return { designCount, seriesNames, ingredients, recentEatenIngredients: [] };
}

/**
 * 汇总该狗历史订单信息（OrderItem 快照中的食谱名）。
 */
export function aggregateDogOrderSummary(
  orderItems: InsightOrderItemLike[],
): DogOrderSummary {
  const recipeNames: string[] = [];
  for (const item of orderItems) {
    const snapshot = item.recipeSnapshot;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      continue;
    }
    const record = snapshot as Record<string, unknown>;
    const name = firstString(
      record.recipeTitle,
      record.recipeName,
      record.name,
      record.title,
    );
    if (name && !recipeNames.includes(name)) {
      recipeNames.push(name);
    }
  }
  return {
    orderCount: orderItems.length,
    recipeNames,
    customRecipeCount: 0,
  };
}

/**
 * 按「标准原料」聚合订单快照中的食材（排除补剂/包材），用于「最近吃过的食材」展示。
 * 调用方需先按 90 天窗口和订单状态（≥ FREEZING）过滤 orderItems。
 * 排序：最近使用时间倒序（最新吃过的排前），同名按名称升序。
 */
export function aggregateRecentEatenIngredients(
  orderItems: InsightOrderItemLike[],
): RecentEatenIngredientRow[] {
  const byId = new Map<string, RecentEatenIngredientRow>();

  for (const orderItem of orderItems) {
    const eatenAt = resolveOrderEatenTime(orderItem.order);
    const snapshot = orderItem.recipeSnapshot;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      continue;
    }
    const items = (snapshot as InsightSnapshotLike).items ?? [];
    for (const item of items) {
      if (item.ingredient_type === 'SUPPLEMENT' || item.ingredient_type === 'PACKAGING') {
        continue;
      }
      const ingredientId = typeof item.ingredient_id === 'string' ? item.ingredient_id : '';
      if (!ingredientId) continue;
      const name = firstString(item.name) || ingredientId;

      const existing = byId.get(ingredientId);
      if (existing) {
        existing.count += 1;
        if (eatenAt && (!existing.lastUsedAt || eatenAt > existing.lastUsedAt)) {
          existing.lastUsedAt = eatenAt;
        }
      } else {
        byId.set(ingredientId, {
          ingredientId,
          name,
          count: 1,
          lastUsedAt: eatenAt,
        });
      }
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) =>
      (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '') ||
      left.name.localeCompare(right.name),
  );
}

export function buildDogDesignInsight(input: {
  dog: InsightDogLike;
  seriesList: InsightSeriesLike[];
  orderItems: InsightOrderItemLike[];
  /** 已按 90 天窗口与订单状态（≥ FREEZING）过滤的订单，用于「最近吃过的食材」 */
  recentEatenOrderItems?: InsightOrderItemLike[];
  lifeStageLabel: string | null;
}): DogDesignInsight {
  const dog = input.dog;
  const breedName = firstString(
    dog.customBreedName,
    dog.breed?.name,
  ) || null;

  return {
    dog: {
      id: dog.id,
      name: dog.name,
      avatarUrl: dog.avatarUrl ?? null,
      ownerId: dog.ownerId ?? '',
      currentWeightKg: dog.currentWeightKg ?? 0,
      breedName,
      lifeStageLabel: input.lifeStageLabel,
      gender: dog.gender ?? null,
      ageMonths: calcAgeMonths(dog.birthday),
      isNeutered: dog.isNeutered ?? null,
      bcsScore: dog.bcsScore ?? null,
      activityLevel: dog.activityLevel ?? null,
      mealsPerDay: dog.mealsPerDay ?? null,
      treatInputMode: dog.treatInputMode ?? null,
      treatLevel: dog.treatLevel ?? null,
      manualTreatKcal: dog.manualTreatKcal ?? null,
      targetFoodKcal: dog.cachedTargetFoodKcal ?? null,
      allergyFoods: dog.allergyFoods ?? null,
      pickyFoods: dog.pickyFoods ?? null,
      preferredFoods: dog.preferredFoods ?? null,
      medicalHistory: dog.medicalHistory ?? null,
    },
    designHistory: {
      ...aggregateDogDesignHistory(input.seriesList),
      recentEatenIngredients: aggregateRecentEatenIngredients(
        input.recentEatenOrderItems ?? [],
      ),
    },
    orderSummary: aggregateDogOrderSummary(input.orderItems),
  };
}