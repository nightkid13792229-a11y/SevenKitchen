/**
 * 七类食材判定映射（2026-10-24 · P0a Task 1）。
 *
 * 依据 `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`
 * 第 5.4 节「七类判定映射（已确认）」：
 *
 * - 一份原料只归一类；先判补剂，再判内脏，最后按 CFCT 分类。
 * - 内脏：营养库分类为 `ORGAN`，或名称命中内脏词表且 CFCT 属于畜/禽/水产
 *   （排除香肠/腊肠/火腿肠这类加工肉，避免「肠」被误伤）。
 * - 南瓜按 CFCT 归蔬菜；鱼油按 CFCT 归油脂；鸡蛋按 CFCT 归蛋，不算主蛋白。
 * - 补剂不参与七类；映射不到的一律 `UNCLASSIFIED`，列出来，不静默放过。
 *
 * 这里是**纯函数 + 代码配置**，不是 AI 提示词：`check_coverage` 只读它。
 */

/** 七类必需类别，顺序即 `check_coverage` 的输出顺序。 */
export const REQUIRED_FOOD_CATEGORIES = [
  'PROTEIN',
  'ORGAN',
  'CARB',
  'VEGETABLE',
  'MUSHROOM',
  'NUTS',
  'OIL',
] as const;

export type RequiredFoodCategory = (typeof REQUIRED_FOOD_CATEGORIES)[number];

/** 可选类别；补剂与未归类单独计数，不算可选类。 */
export type OptionalFoodCategory =
  | 'FRUIT'
  | 'DAIRY'
  | 'EGG'
  | 'LEGUME'
  | 'SEASONING'
  | 'SUPPLEMENT'
  | 'UNCLASSIFIED';

export type FoodCategory = RequiredFoodCategory | OptionalFoodCategory;

export interface FoodCategoryInput {
  name: string;
  cfctClass?: string | null;
  nutritionCategory?: string | null;
  ingredientType: 'FOOD' | 'SUPPLEMENT';
}

export interface FoodCategoryCoverage {
  covered: RequiredFoodCategory[];
  missing: RequiredFoodCategory[];
  optionalPresent: OptionalFoodCategory[];
  supplementCount: number;
  unclassifiedCount: number;
}

/** 可选类只统计这五类；补剂、未归类不进入 `optionalPresent`。 */
const OPTIONAL_FOOD_CATEGORIES = [
  'FRUIT',
  'DAIRY',
  'EGG',
  'LEGUME',
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
const PROCESSED_MEAT_KEYWORDS: readonly string[] = ['香肠', '腊肠', '火腿肠'];

/** CFCT 分类 → 七类 / 可选类。 */
const CFCT_CATEGORY_MAP: Record<string, FoodCategory> = {
  畜肉类及制品: 'PROTEIN',
  禽肉类及制品: 'PROTEIN',
  水产类: 'PROTEIN',
  谷类及制品: 'CARB',
  薯类及制品: 'CARB',
  蔬菜类及制品: 'VEGETABLE',
  菌藻类: 'MUSHROOM',
  坚果种子类: 'NUTS',
  油脂类: 'OIL',
  水果类及制品: 'FRUIT',
  乳类及制品: 'DAIRY',
  蛋类及制品: 'EGG',
  干豆类及制品: 'LEGUME',
  调味品类: 'SEASONING',
};

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
    const mapped = CFCT_CATEGORY_MAP[cfctClass];
    if (mapped) {
      return mapped;
    }
  }

  return 'UNCLASSIFIED';
}

/**
 * 汇总七类覆盖情况。
 *
 * `covered` / `missing` 按 `REQUIRED_FOOD_CATEGORIES` 顺序输出；`optionalPresent`
 * 按固定可选类顺序输出；补剂与未归类只计数。
 */
export function summarizeFoodCategoryCoverage(
  items: Array<{ category: FoodCategory }>,
): FoodCategoryCoverage {
  const present = new Set<FoodCategory>(items.map((item) => item.category));

  return {
    covered: REQUIRED_FOOD_CATEGORIES.filter((category) =>
      present.has(category),
    ),
    missing: REQUIRED_FOOD_CATEGORIES.filter(
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
