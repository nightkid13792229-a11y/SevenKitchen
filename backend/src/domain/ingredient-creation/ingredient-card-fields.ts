/**
 * 食材线原料卡字段契约：原料卡上要展示/可写的全部字段，以这份纯数据为唯一口径。
 *
 * 为什么收成一份契约：
 * - 页面手写 7 个输入框，AI 就只看得见 7 个字段；少一项等于「看不见」；
 * - 草稿校验、提交入库、AI 工具、前端渲染都从同一份目录取值，两侧才不会漂移；
 * - 这里只放数据与类型，不碰 Prisma、不碰 DTO，任何一层都能直接引用。
 *
 * 2026-11 起这份目录只描述**食材线**。补剂线还没开放；等补剂流程上线后
 * 单独维护一份补剂目录，不要把两类原料的字段混在同一张卡里。
 *
 * 约定：
 * - `key` 是页面 / 草稿 / AI 工具共用的公共名（camelCase）；
 * - 直接落 `properties` JSON 的字段用 snake_case，见 `INGREDIENT_PROPERTY_KEY_BY_FIELD`；
 * - 可食部是唯一「公共名与存储名不同」的字段：公共名 `edibleYieldPercent`（10–100），
 *   草稿与入库用 `edibleYieldRate`（0.1–1），换算只在 `toIngredientDraft` /
 *   `toIngredientCard` 两处发生，落库键是 `properties.edible_yield_rate`；
 * - 只做展示、还没接入来源的字段，来源标记只允许「人工 / AI / 空」。
 */

/** 字段分组；数组顺序即页面分区顺序。 */
export type IngredientFieldGroup =
  | 'BASIC'
  | 'MEASURE'
  | 'NUTRITION'
  | 'PURCHASE'
  | 'LABEL';

/**
 * 字段的生命周期阶段：
 * - `CREATABLE`：建原料时就能填，也允许 AI 写；
 * - `AFTER_CREATE`：要等原料建完、有了库存记录才谈得上（当前没有这样的字段）；
 * - `SYSTEM`：系统生成，页面不给人填（当前没有这样的字段，预留给后续）。
 */
export type IngredientFieldStage = 'CREATABLE' | 'AFTER_CREATE' | 'SYSTEM';

/** 原料卡字段定义的一行。 */
export interface IngredientCardFieldDef {
  key: IngredientCardFieldKey;
  group: IngredientFieldGroup;
  label: string;
  stage: IngredientFieldStage;
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ENUM' | 'STRING_ARRAY';
}

/**
 * 15 个字段的定义，数组顺序即展示顺序。
 *
 * 不导出这一份：对外只给排好序的 `INGREDIENT_CARD_FIELDS`，
 * 类型 `IngredientCardFieldKey` 从它派生，避免键表维护两遍。
 */
const CARD_FIELD_DEFINITIONS = [
  // BASIC
  {
    key: 'name',
    group: 'BASIC',
    label: '原料名称',
    stage: 'CREATABLE',
    valueType: 'STRING',
  },
  {
    key: 'type',
    group: 'BASIC',
    label: '原料类型',
    stage: 'CREATABLE',
    valueType: 'ENUM',
  },
  {
    key: 'notes',
    group: 'BASIC',
    label: '备注',
    stage: 'CREATABLE',
    valueType: 'STRING',
  },
  {
    key: 'tags',
    group: 'BASIC',
    label: '标签分类',
    stage: 'CREATABLE',
    valueType: 'STRING_ARRAY',
  },
  // MEASURE
  {
    key: 'baseUnit',
    group: 'MEASURE',
    label: '基准单位',
    stage: 'CREATABLE',
    valueType: 'ENUM',
  },
  {
    key: 'unitDisplayLabel',
    group: 'MEASURE',
    label: '标准单位展示名',
    stage: 'CREATABLE',
    valueType: 'STRING',
  },
  {
    key: 'weightG',
    group: 'MEASURE',
    label: '单个重量(克)',
    stage: 'CREATABLE',
    valueType: 'NUMBER',
  },
  // NUTRITION
  {
    key: 'cfctClass',
    group: 'NUTRITION',
    label: 'CFCT分类',
    stage: 'CREATABLE',
    valueType: 'STRING',
  },
  {
    key: 'edibleYieldPercent',
    group: 'NUTRITION',
    label: '可食部比率',
    stage: 'CREATABLE',
    valueType: 'NUMBER',
  },
  {
    key: 'mainNutrientsDesc',
    group: 'NUTRITION',
    label: '主要营养价值',
    stage: 'CREATABLE',
    valueType: 'STRING',
  },
  {
    key: 'densityGPerMl',
    group: 'NUTRITION',
    label: '密度(g/ml)',
    stage: 'CREATABLE',
    valueType: 'NUMBER',
  },
  // PURCHASE
  {
    key: 'procurementStrategy',
    group: 'PURCHASE',
    label: '采购策略',
    stage: 'CREATABLE',
    valueType: 'ENUM',
  },
  // LABEL 标签信息（合规）
  {
    key: 'labelCategory',
    group: 'LABEL',
    label: '标签类型',
    stage: 'CREATABLE',
    valueType: 'ENUM',
  },
  {
    key: 'labelNames',
    group: 'LABEL',
    label: '标签名称',
    stage: 'CREATABLE',
    valueType: 'STRING_ARRAY',
  },
  {
    key: 'labelNameSource',
    group: 'LABEL',
    label: '名称依据',
    stage: 'CREATABLE',
    valueType: 'STRING',
  },
] as const;

/** 15 个公共字段名；从定义数组派生，不另维护一份键表。 */
export type IngredientCardFieldKey =
  (typeof CARD_FIELD_DEFINITIONS)[number]['key'];

/**
 * 人工标记可以覆盖的字段：15 个可见键 + `category`。
 *
 * `category` 不在食材档案里展示（已移到营养档案页），但它参与生熟判定，
 * 人改过之后同样不能让 AI 再覆盖，所以必须进人工字段白名单。
 */
export type IngredientManualField = IngredientCardFieldKey | 'category';

/** 15 个字段的完整定义，顺序即展示顺序。 */
export const INGREDIENT_CARD_FIELDS: readonly IngredientCardFieldDef[] =
  CARD_FIELD_DEFINITIONS;

/** 只要键的有序列表（DTO 校验、字段目录接口都用它）。 */
export const INGREDIENT_CARD_FIELD_KEYS: readonly IngredientCardFieldKey[] =
  INGREDIENT_CARD_FIELDS.map((field) => field.key);

/** 人工字段白名单：15 个可见键 + category。 */
export const INGREDIENT_MANUAL_FIELD_KEYS: readonly IngredientManualField[] = [
  ...INGREDIENT_CARD_FIELD_KEYS,
  'category',
];

/**
 * AI 可写的 15 项：当前全部字段都是建原料时可填。
 */
export const AI_WRITABLE_INGREDIENT_FIELDS: readonly IngredientCardFieldKey[] =
  INGREDIENT_CARD_FIELDS.filter((field) => field.stage === 'CREATABLE').map(
    (field) => field.key,
  );

/**
 * 落 `properties` JSON 的字段：公共名 → snake_case 存储键。
 *
 * 其中 `nameEn` / `category` / `addTiming` / `productionLossRate` 已经不在
 * 食材档案里展示，但旧草稿与 AI 工具仍可能带值，保留映射避免写库时丢掉。
 */
export const INGREDIENT_PROPERTY_KEY_BY_FIELD: Partial<
  Record<IngredientCardFieldKey | 'nameEn' | 'category' | 'addTiming' | 'productionLossRate', string>
> = {
  nameEn: 'name_en',
  category: 'coverage_category',
  cfctClass: 'cfct_class',
  mainNutrientsDesc: 'main_nutrients_desc',
  addTiming: 'add_timing',
  productionLossRate: 'production_loss_rate',
  densityGPerMl: 'density_g_per_ml',
  labelCategory: 'label_category',
  labelNames: 'label_names',
  labelNameSource: 'label_name_source',
};

/**
 * 可食部落 `properties` 的键。
 *
 * 单独导出、**不**塞进上面那张映射表：它的公共名（10–100 的百分数）
 * 与存储名（0.1–1 的比例）不同，混进通用映射会被当成「可直接写入」而多除/少除一次。
 */
export const EDIBLE_YIELD_RATE_PROPERTY_KEY = 'edible_yield_rate';

/** 运行时判定用的键集合。 */
const INGREDIENT_CARD_FIELD_KEY_SET: ReadonlySet<string> = new Set(
  INGREDIENT_CARD_FIELD_KEYS,
);
const INGREDIENT_MANUAL_FIELD_KEY_SET: ReadonlySet<string> = new Set(
  INGREDIENT_MANUAL_FIELD_KEYS,
);

/**
 * 这个键是不是契约内的原料卡字段。
 *
 * 草稿、DTO、AI 工具参数在相信外部输入之前都先过这一道。
 */
export function isIngredientCardFieldKey(
  value: unknown,
): value is IngredientCardFieldKey {
  return typeof value === 'string' && INGREDIENT_CARD_FIELD_KEY_SET.has(value);
}

/** 这个键能不能被人工标记（可见字段或 category）。 */
export function isIngredientManualField(
  value: unknown,
): value is IngredientManualField {
  return (
    typeof value === 'string' && INGREDIENT_MANUAL_FIELD_KEY_SET.has(value)
  );
}
