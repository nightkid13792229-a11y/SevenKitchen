/**
 * 交付内容快照（2026-10-16，批次 1.6）
 *
 * ## 为什么要有"快照"
 *
 * 现状是：交付 = 往订单上写一个 `recipe_id`。而私密食谱是**就地覆盖同一行**的
 * （版本号恒为 1），于是营养师交付之后再改配方，**顾客下次打开看到的内容会跟着变**，
 * 而且查不到改了哪。
 *
 * 快照把"交付那一刻的内容"冻结下来，之后改配方不影响顾客手里那一版。
 *
 * ## 为什么单独一个文件、而且是纯函数
 *
 * 两处要用它：
 *   · **历史回填**（把已有的已交付订单补上交付记录）—— 一次性脚本
 *   · **交付动作**（批次 2 的交付服务）
 * 抽成纯函数，两边共用同一套结构，不会"回填出来的和以后交出来的长得不一样"。
 *
 * 而且纯函数可以穷举测试：少一个字段、多一个字段都会被立刻发现 ——
 * 快照这种"给出去就收不回来"的东西，改结构要非常小心。
 */

/** 交付物码（与选项集 `custom_recipe_delivery_item` 对齐） */
export const DELIVERY_ITEM_CODES = {
  RECIPE: 'RECIPE',
  SHOPPING_SOP: 'SHOPPING_SOP',
  NUTRITION_REPORT: 'NUTRITION_REPORT',
} as const;

export type DeliveryItemCode =
  (typeof DELIVERY_ITEM_CODES)[keyof typeof DELIVERY_ITEM_CODES];

/** 交付单里的一项（给前端渲染用） */
export interface DeliveryItemDescriptor {
  code: string;
  label: string;
  description?: string | null;
  /** 有没有实际内容 —— 没有内容的项不该出现在交付清单里 */
  available: boolean;
}

// ==================== 快照结构 ====================

export interface SnapshotRecipeItem {
  name: string;
  /** 食材 id（2026-10-18 补；用途同上，老快照没有） */
  ingredientId?: string | null;
  /** 制备方法（如"切丁煮熟"） */
  preparation?: string | null;
  /** 占比，如 32（表示 32%） */
  ratioPercent?: number | null;
  weightG?: number | null;
  /**
   * 原料类型，照抄 `IngredientType` 枚举：`FOOD` / `SUPPLEMENT` / `PACKAGING`。
   *
   * ⚠️ 为什么不能只用 `isSupplement`（2026-10-17 修的真实缺陷）：
   * 布尔只有两种状态，而枚举有**三种**。`PACKAGING`（包材）被压进
   * "非补剂"那一类，于是交付页 `filter(!isSupplement)` 会把包材当成食材列出来。
   *
   * 判断"是食材"必须用 `ingredientType === 'FOOD'`，不是 `!isSupplement`。
   */
  ingredientType?: string | null;
  /** @deprecated 用 `ingredientType` 替代。保留是因为旧快照里只有这个字段。 */
  isSupplement?: boolean;
}

/**
 * 封面上要叠的狗狗信息（2026-10-18 加）。
 *
 * 交付第 1 页的封面上要写「为 豆豆 定制 / 柯基 · 3 岁 · 11.2kg」，
 * 这些在快照里原本没有 —— 顾客改了档案，"交付时那只狗是什么样"就查不回来了。
 * 所以交付那一刻把档案抄进快照。
 */
export interface SnapshotDog {
  name: string | null;
  breedName: string | null;
  /** 年龄（月）。存月数而不是"3 岁"这种文案 —— 文案是渲染层的事 */
  ageMonths: number | null;
  /** 体重（kg） */
  weightKg: number | null;
}

export interface SnapshotRecipe {
  recipeId: string;
  name: string;
  coverImageUrl?: string | null;
  /** 内部主键（排查用；前端不显示） */
  internalId?: string | null;
  /**
   * 一句话卖点（2026-10-18 加）。
   *
   * 交付第 1 页要显示"为控体重设计：脂肪只有 9%…"那句 ——
   * 它来自 `Recipe.sellingPoint`（后台可手填、也可 AI 生成）。
   * 上限 200 字，页面**默认只显示两行**，可展开。
   */
  sellingPoint?: string | null;
  /** 封面要叠的狗信息（2026-10-18 加） */
  dog?: SnapshotDog | null;
  items: SnapshotRecipeItem[];
}

export interface SnapshotFeeding {
  dailyIntakeG: number | null;
  mealsPerDay: number | null;
  perMealG: number | null;
  cycleDays: number | null;
}

export interface SnapshotNutrition {
  standard: string | null;
  /** 能量密度 kcal/kg */
  energyDensityKcalPerKg: number | null;
  /** 核心营养（蛋白质/脂肪/灰分/水分/纤维/碳水…），键值对 */
  macros?: Record<string, number | null> | null;
}

export interface SnapshotShoppingLine {
  name: string;
  /** 净用量（克） */
  netG: number;
  /** 推荐商品（可空） */
  recommendedProductId?: string | null;
}

/**
 * 采购清单（2026-10-18 起**不再含采购量与损耗**）
 *
 * 需求 2.4.3「要删的」明确写了：
 *   `shopping.lines[].purchaseG` / `totalPurchaseG` / `lossRate` ——
 *   交付页和 DIY 制作页都不再展示采购量。
 *
 * ⚠️ **老快照里这些字段还在**（冻结契约，不能改历史数据）。
 * 类型上删掉之后，读老快照时多出来的键会被忽略 —— 无害。
 * 新交付写出来的快照不再有它们。
 */
export interface SnapshotShopping {
  lines: SnapshotShoppingLine[];
  totalNetG: number;
}

/**
 * 一个补剂要补的**营养素目标**（2026-10-18 加）。
 *
 * ⚠️ 顾客看到的是「**钙** 每kg加 5g」，不是「钙粉 每kg加 5g」——
 * 前者是营养素口径（配方需求），后者是产品口径（买哪瓶）。
 * 两个别混：交付第 1 页列营养素，第 2 页列产品。
 */
export interface SnapshotSupplementTarget {
  /** 营养素名，如「钙」「锌」「维生素 D」 */
  label: string;
  /** 每 kg 食材要补多少 */
  targetValuePerKg: number | null;
  unit: string | null;
}

export interface SnapshotSupplementAlternative {
  ingredientId: string;
  name: string;
  brand?: string | null;
  productModel?: string | null;
  imageUrl?: string | null;
  purchaseLink?: { url: string; platform?: string | null } | null;
  displayUnit?: string | null;
}

export interface SnapshotSupplement {
  name: string;
  /**
   * 补剂对应的食材 id（2026-10-18 补）。
   *
   * 用途：交付第 2 页的「换一个」「去买」「一键买齐」都要拿它去下单页建行 ——
   * 补剂行必须带 id，光有名字建不了行。
   *
   * 老快照没有这个字段 → 可选。前端拿不到就**不显示购买入口**
   * （比显示个点了报错的按钮强）。
   */
  ingredientId?: string | null;
  /** 这一批要加多少（克） */
  totalG: number | null;
  /** 每 kg 食材添加量（给"配方比例"那一页用） */
  perKgG?: number | null;
  brand?: string | null;
  /** 什么时候加（出锅前 / 冷却后…） */
  timing?: string | null;
  /** 这个补剂对应的营养素目标（2026-10-18 加） */
  targets?: SnapshotSupplementTarget[] | null;
  /** 可替换的补剂产品（交付时冻结，2026-10-23） */
  alternatives?: SnapshotSupplementAlternative[] | null;
}

export interface DeliveryContentSnapshot {
  /** 快照结构版本 —— 将来改结构时，旧快照仍能按老版本渲染 */
  schemaVersion: number;
  recipe: SnapshotRecipe;
  feeding: SnapshotFeeding;
  nutrition: SnapshotNutrition;
  shopping: SnapshotShopping;
  supplements: SnapshotSupplement[];
  steps: string[];
  storage?: string | null;
  /** 快照生成时间（ISO） */
  generatedAt: string;
}

/** 当前快照结构版本。改结构时 +1，并在渲染端保留对旧版本的支持。 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

// ==================== 组装 ====================

export interface BuildSnapshotInput {
  recipe: SnapshotRecipe;
  /** 狗狗档案（2026-10-18 加）—— 封面要叠品种/年龄/体重 */
  dog?: SnapshotDog | null;
  feeding?: Partial<SnapshotFeeding> | null;
  nutrition?: Partial<SnapshotNutrition> | null;
  shopping?: {
    lines?: SnapshotShoppingLine[];
    lossRate?: number | null;
  } | null;
  supplements?: SnapshotSupplement[] | null;
  steps?: string[] | null;
  storage?: string | null;
  /** 便于测试注入；不传则取当前时间 */
  now?: Date;
}

/**
 * 组装交付内容快照。
 *
 * ## 三条口径
 *
 * **一、只放渲染需要的字段。**
 * 完整的营养评估明细有几百个营养项、几十 KB —— 那是"报告页"按需再查的东西，
 * 不该塞进每一条交付记录里。
 *
 * **二、缺失就给 null，不给 0。**
 * `0 g` 和"没填"是两回事：前者会让顾客以为"这道食谱不含脂肪"。
 *
 * **三、数字保留原样，不做取整。**
 * 取整是渲染层的事，快照存的是事实。
 */
export function buildDeliverySnapshot(
  input: BuildSnapshotInput,
): DeliveryContentSnapshot {
  const feeding = input.feeding ?? {};
  const nutrition = input.nutrition ?? {};
  /**
   * ⚠️ **显式挑字段，不要 `...line` 展开。**
   *
   * 踩过：类型里删了 `purchaseG`，但 builder 用展开把上游对象里的
   * `purchaseG` 原样带进了快照 —— **类型删了、运行时还在**，
   * 测试一断言 `not.toHaveProperty('purchaseG')` 就露馅。
   *
   * 快照是**对外契约**：给什么就该写什么，不该让上游多出来的键漏进去。
   */
  const lines = (input.shopping?.lines ?? []).map((line) => ({
    name: line.name,
    netG: round1(line.netG),
    ...(line.recommendedProductId !== undefined
      ? { recommendedProductId: line.recommendedProductId }
      : {}),
  }));

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    recipe: {
      recipeId: input.recipe.recipeId,
      name: input.recipe.name,
      coverImageUrl: input.recipe.coverImageUrl ?? null,
      internalId: input.recipe.internalId ?? null,
      // 2026-10-18：封面要叠"为谁定制"，卖点要显示在封面下方
      sellingPoint: input.recipe.sellingPoint ?? null,
      dog: input.dog ?? null,
      items: input.recipe.items ?? [],
    },
    feeding: {
      dailyIntakeG: nullableNumber(feeding.dailyIntakeG),
      mealsPerDay: nullableNumber(feeding.mealsPerDay),
      perMealG: nullableNumber(feeding.perMealG),
      cycleDays: nullableNumber(feeding.cycleDays),
    },
    nutrition: {
      standard: nutrition.standard ?? null,
      energyDensityKcalPerKg: nullableNumber(
        nutrition.energyDensityKcalPerKg,
      ),
      macros: nutrition.macros ?? null,
    },
    shopping: {
      lines,
      totalNetG: round1(sum(lines.map((line) => line.netG))),
    },
    supplements: (input.supplements ?? []).map((item) => ({
      ...item,
      totalG: nullableNumber(item.totalG),
      perKgG: nullableNumber(item.perKgG),
      // 2026-10-18：营养素目标（钙/锌/维生素D…）随补剂一起进快照
      targets: (item.targets ?? []).map((target) => ({
        label: target.label,
        targetValuePerKg: nullableNumber(target.targetValuePerKg),
        unit: target.unit ?? null,
      })),
    })),
    steps: input.steps ?? [],
    storage: input.storage ?? null,
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}

// ==================== 交付物清单 ====================

export interface DeliveryItemAvailability {
  /** 这一版有没有食谱本体 */
  hasRecipe: boolean;
  /** 有没有采购与制作单的内容（要有食材明细才算） */
  hasShoppingSop: boolean;
  /** 有没有营养报告（要有营养数据才算） */
  hasNutritionReport: boolean;
}

/**
 * 按配置与"实际有没有内容"筛出这一版真正该交付哪几样。
 *
 * ## 为什么要看"实际有没有"
 *
 * 配置里开了「营养评估报告」，但这一版**恰好没有营养数据**（例如设计器还没跑评估）。
 * 如果照配置硬塞，顾客会看到一个点开是空白的报告入口 —— 比不显示更糟。
 *
 * ## 为什么要看配置
 *
 * 老板可能决定某段时间不交付某样（例如先不给采购单，观察顾客反应）。
 * 配置是开关，内容是事实，**两者都满足才出现**。
 */
export function resolveDeliveryItems(
  configuredCodes: readonly string[],
  availability: DeliveryItemAvailability,
): DeliveryItemDescriptor[] {
  const configured = new Set(configuredCodes);
  const items: DeliveryItemDescriptor[] = [];

  if (
    configured.has(DELIVERY_ITEM_CODES.RECIPE) &&
    availability.hasRecipe
  ) {
    items.push({
      code: DELIVERY_ITEM_CODES.RECIPE,
      label: '专属食谱',
      description: '食材配比、营养成分、每天喂多少',
      available: true,
    });
  }

  if (
    configured.has(DELIVERY_ITEM_CODES.SHOPPING_SOP) &&
    availability.hasShoppingSop
  ) {
    items.push({
      code: DELIVERY_ITEM_CODES.SHOPPING_SOP,
      label: '采购与制作单',
      description: '要买什么、买多少、怎么做',
      available: true,
    });
  }

  if (
    configured.has(DELIVERY_ITEM_CODES.NUTRITION_REPORT) &&
    availability.hasNutritionReport
  ) {
    items.push({
      code: DELIVERY_ITEM_CODES.NUTRITION_REPORT,
      label: '营养评估报告',
      description: '营养是否达标，附一句白话结论',
      available: true,
    });
  }

  return items;
}

// ==================== 内部工具 ====================

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
