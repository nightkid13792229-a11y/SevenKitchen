/**
 * 食材分类判定映射（2026-10-24 · P0a Task 1；2026-10-25 改为 10 类检查清单）。
 *
 * 依据 `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`
 * 第 5.4 节「七类判定映射（已确认）」：
 *
 * - 一份原料只归一类；先判补剂，再判内脏，最后按 CFCT 分类。
 * - 内脏：营养库分类为 `ORGAN`，或名称命中内脏词表且 CFCT 属于畜/禽/水产
 *   （排除香肠/腊肠/火腿肠这类加工肉，避免「肠」被误伤）。
 * - 南瓜按 CFCT 归蔬菜；鱼油按 CFCT 归油脂；鸡蛋按 CFCT 归蛋，不算主蛋白。
 * - 补剂不参与检查清单；映射不到的一律 `UNCLASSIFIED`，列出来，不静默放过。
 *
 * 检查清单共 10 类：基础 7 类 + 建议 3 类（蛋/豆/水果）。**分类不是门禁**，
 * 只用来避免选料时漏项；缺类说明原因即可，不阻断交付。
 *
 * 这里是**纯函数 + 代码配置**，不是 AI 提示词：`check_coverage` 只读它。
 */

/** 基础 7 类检查项，顺序即 `check_coverage` 的输出顺序；不是门禁。 */
export const BASE_FOOD_CATEGORIES = [
  'PROTEIN',
  'ORGAN',
  'CARB',
  'VEGETABLE',
  'MUSHROOM',
  'NUTS',
  'OIL',
] as const;

export type BaseFoodCategory = (typeof BASE_FOOD_CATEGORIES)[number];

/** 建议 3 类检查项；缺了只提示，不降低交付状态。 */
export const SUGGESTED_FOOD_CATEGORIES = ['EGG', 'LEGUME', 'FRUIT'] as const;

export type SuggestedFoodCategory = (typeof SUGGESTED_FOOD_CATEGORIES)[number];

/** 10 类选料检查清单 = 基础 7 + 建议 3，顺序固定。 */
export const CHECKLIST_FOOD_CATEGORIES = [
  ...BASE_FOOD_CATEGORIES,
  ...SUGGESTED_FOOD_CATEGORIES,
] as const;

export type ChecklistFoodCategory = (typeof CHECKLIST_FOOD_CATEGORIES)[number];

/** 基础检查项，不是门禁。保留旧名兼容既有调用方。 */
export const REQUIRED_FOOD_CATEGORIES = BASE_FOOD_CATEGORIES;

export type RequiredFoodCategory = BaseFoodCategory;

/** 检查清单之外的类别；补剂与未归类单独计数。 */
export type OptionalFoodCategory =
  | 'DAIRY'
  | 'SEASONING'
  | 'SUPPLEMENT'
  | 'UNCLASSIFIED';

export type FoodCategory =
  | BaseFoodCategory
  | SuggestedFoodCategory
  | OptionalFoodCategory;

export interface FoodCategoryInput {
  name: string;
  cfctClass?: string | null;
  nutritionCategory?: string | null;
  ingredientType: 'FOOD' | 'SUPPLEMENT';
}

export interface FoodCategoryCoverage {
  covered: BaseFoodCategory[];
  missing: BaseFoodCategory[];
  suggestedCovered: SuggestedFoodCategory[];
  suggestedMissing: SuggestedFoodCategory[];
  /** 实际只会出现 DAIRY / SEASONING。 */
  optionalPresent: OptionalFoodCategory[];
  supplementCount: number;
  unclassifiedCount: number;
}

/** 可选类只统计乳/调味；补剂、未归类不进入 `optionalPresent`。 */
const OPTIONAL_FOOD_CATEGORIES = [
  'DAIRY',
  'SEASONING',
] as const satisfies readonly OptionalFoodCategory[];

/** 内脏判定只在畜/禽/水产里生效。 */
const ORGAN_CFCT_CLASSES: readonly string[] = [
  '畜肉类及制品',
  '禽肉类及制品',
  '水产类',
];

/** 内脏词表（业务口径，不按解剖学）。 */
const ORGAN_NAME_KEYWORDS: readonly string[] = [
  '肝',
  '心',
  '胗',
  '肾',
  '肚',
  '肠',
  '肺',
  '脾',
  '脑',
  '胰',
  '腺',
  '腰',
];

/** 加工肉排除词：名称里带这些的「肠」不算内脏。 */
const PROCESSED_MEAT_KEYWORDS: readonly string[] = [
  '香肠',
  '腊肠',
  '火腿肠',
  '红肠',
  '脆皮肠',
  '鸡肉肠',
  '鱼肠',
];

/** CFCT 分类 → 七类 / 可选类。用 Map 避免 `toString` / `__proto__` 命中原型。 */
const CFCT_CATEGORY_MAP = new Map<string, FoodCategory>([
  ['畜肉类及制品', 'PROTEIN'],
  ['禽肉类及制品', 'PROTEIN'],
  ['水产类', 'PROTEIN'],
  ['谷类及制品', 'CARB'],
  ['薯类及制品', 'CARB'],
  ['蔬菜类及制品', 'VEGETABLE'],
  ['菌藻类', 'MUSHROOM'],
  ['坚果种子类', 'NUTS'],
  ['油脂类', 'OIL'],
  ['水果类及制品', 'FRUIT'],
  ['乳类及制品', 'DAIRY'],
  ['蛋类及制品', 'EGG'],
  ['干豆类及制品', 'LEGUME'],
  ['调味品类', 'SEASONING'],
]);

const includesAny = (text: string, keywords: readonly string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword));

const isOrgan = (
  input: FoodCategoryInput,
  cfctClass: string | null,
): boolean => {
  const nutritionCategory = input.nutritionCategory?.trim();
  if (nutritionCategory === 'ORGAN') {
    return true;
  }
  if (!cfctClass || !ORGAN_CFCT_CLASSES.includes(cfctClass)) {
    return false;
  }
  const name = input.name.trim();
  return (
    includesAny(name, ORGAN_NAME_KEYWORDS) &&
    !includesAny(name, PROCESSED_MEAT_KEYWORDS)
  );
};

/**
 * 判定一份原料属于哪一类。
 *
 * 顺序：补剂 → 内脏 → CFCT 映射 → 未归类。
 */
export function classifyFoodCategory(input: FoodCategoryInput): FoodCategory {
  if (input.ingredientType === 'SUPPLEMENT') {
    return 'SUPPLEMENT';
  }

  const cfctClass = input.cfctClass?.trim() || null;

  if (isOrgan(input, cfctClass)) {
    return 'ORGAN';
  }

  if (cfctClass) {
    const mapped = CFCT_CATEGORY_MAP.get(cfctClass);
    if (mapped) {
      return mapped;
    }
  }

  return 'UNCLASSIFIED';
}

/**
 * 汇总 10 类检查清单的覆盖情况。
 *
 * `covered` / `missing` 按 `BASE_FOOD_CATEGORIES` 顺序输出；
 * `suggestedCovered` / `suggestedMissing` 按 `SUGGESTED_FOOD_CATEGORIES`
 * 顺序输出；`optionalPresent` 按固定可选类顺序输出；补剂与未归类只计数。
 */
export function summarizeFoodCategoryCoverage(
  items: Array<{ category: FoodCategory }>,
): FoodCategoryCoverage {
  const present = new Set<FoodCategory>(items.map((item) => item.category));

  return {
    covered: BASE_FOOD_CATEGORIES.filter((category) => present.has(category)),
    missing: BASE_FOOD_CATEGORIES.filter((category) => !present.has(category)),
    suggestedCovered: SUGGESTED_FOOD_CATEGORIES.filter((category) =>
      present.has(category),
    ),
    suggestedMissing: SUGGESTED_FOOD_CATEGORIES.filter(
      (category) => !present.has(category),
    ),
    optionalPresent: OPTIONAL_FOOD_CATEGORIES.filter((category) =>
      present.has(category),
    ),
    supplementCount: items.filter((item) => item.category === 'SUPPLEMENT')
      .length,
    unclassifiedCount: items.filter((item) => item.category === 'UNCLASSIFIED')
      .length,
  };
}
