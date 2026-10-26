/**
 * 前端原料卡字段目录：与后端 `ingredient-card-fields.ts` 同序、同键、同分组的镜像。
 *
 * 为什么前端也要一份目录：
 * - 页面原来手写 7 个输入框，AI 就只看得见 7 个字段；少一项等于「看不见」；
 * - 渲染、保存、人工标记都从这份目录取值，字段名不会和草稿 / 后端漂移；
 * - 这里只有数据与类型，不依赖 Vue，也不请求接口，纯函数和单测都能直接引用。
 *
 * 与后端契约一一对应：`key` 是公共名（camelCase），30 项顺序即页面展示顺序。
 * `valueType` 是**前端渲染口径**（后端那一侧是 STRING/NUMBER/ENUM 等存储口径）：
 * - `percent`：0–100 的百分数，`75` 表示 75%；
 * - `multiplier`：倍数，`1.05` 表示 5% 损耗，**不是** 0–1 比例、也不能渲染成 105%；
 * - `select`：受控词表，选项见 `options`。
 */

/** 字段分组；数组顺序即页面分区顺序。 */
export type IngredientFieldGroup =
  | 'BASIC'
  | 'MEASURE'
  | 'NUTRITION'
  | 'PURCHASE'
  | 'STOCK'
  | 'USAGE'
  | 'STORAGE'

/** 字段的生命周期阶段：建原料时可填 / 建完之后才补。 */
export type IngredientFieldStage = 'CREATABLE' | 'AFTER_CREATE'

/** 前端展示与编辑用的值类型。 */
export type IngredientCardFieldValueType =
  | 'text'
  | 'number'
  | 'percent'
  | 'multiplier'
  | 'boolean'
  | 'select'
  | 'tags'

/** 7 个分组，顺序即页面分区顺序。 */
export const INGREDIENT_CARD_FIELD_GROUPS: readonly {
  key: IngredientFieldGroup
  label: string
}[] = [
  { key: 'BASIC', label: '基本信息' },
  { key: 'MEASURE', label: '计量与形态' },
  { key: 'NUTRITION', label: '营养属性' },
  { key: 'PURCHASE', label: '采购' },
  { key: 'STOCK', label: '库存' },
  { key: 'USAGE', label: '用途与标签' },
  { key: 'STORAGE', label: '保存' },
]

/** 原料卡字段定义的一行。 */
export interface IngredientCardFieldDef {
  key: IngredientCardFieldKey
  group: IngredientFieldGroup
  label: string
  stage: IngredientFieldStage
  valueType: IngredientCardFieldValueType
  /** 数值单位，如 g / 元 / 倍 / 个月 / 天 */
  unit?: string
  /** `valueType: 'select'` 的选项；未知值展示时原样保留，不静默清空 */
  options?: readonly { label: string; value: string }[]
  /** 口径提示，如倍数语义、百分数范围 */
  hint?: string
}

/**
 * 30 项定义，数组顺序即展示顺序（与后端目录逐项对应）。
 *
 * 不单独导出这一份：对外只给排好序的 `INGREDIENT_CARD_FIELDS`，
 * 类型 `IngredientCardFieldKey` 从它派生，避免键表维护两遍。
 */
const CARD_FIELD_DEFINITIONS = [
  // BASIC 基本信息
  {
    key: 'name',
    group: 'BASIC',
    label: '名称',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'nameEn',
    group: 'BASIC',
    label: '英文名',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'type',
    group: 'BASIC',
    label: '类型',
    stage: 'CREATABLE',
    valueType: 'select',
    options: [{ label: '食材', value: 'FOOD' }],
  },
  {
    key: 'category',
    group: 'BASIC',
    label: '类别',
    stage: 'CREATABLE',
    valueType: 'select',
    options: [
      { label: '肉/内脏/水产/蛋', value: 'MEAT_ORGAN' },
      { label: '根茎淀粉类蔬菜', value: 'STARCHY_VEGETABLE' },
      { label: '其他', value: 'OTHER' },
    ],
  },
  {
    key: 'notes',
    group: 'BASIC',
    label: '备注',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  // MEASURE 计量与形态
  {
    key: 'baseUnit',
    group: 'MEASURE',
    label: '基准单位',
    stage: 'CREATABLE',
    valueType: 'select',
    options: [
      { label: '克', value: 'G' },
      { label: '毫升', value: 'ML' },
      { label: '个/件', value: 'PCS' },
    ],
  },
  {
    key: 'unitDisplayLabel',
    group: 'MEASURE',
    label: '展示名',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'weightG',
    group: 'MEASURE',
    label: '单块重量',
    stage: 'CREATABLE',
    valueType: 'number',
    unit: 'g',
  },
  {
    key: 'maxCapacityG',
    group: 'MEASURE',
    label: '最大容量',
    stage: 'CREATABLE',
    valueType: 'number',
    unit: 'g',
  },
  // NUTRITION 营养属性
  {
    key: 'cfctClass',
    group: 'NUTRITION',
    label: 'CFCT 分类',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'edibleYieldPercent',
    group: 'NUTRITION',
    label: '可食部',
    stage: 'CREATABLE',
    valueType: 'percent',
    hint: '0–100，75 = 75%',
  },
  {
    key: 'mainNutrientsDesc',
    group: 'NUTRITION',
    label: '主要营养价值',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  // PURCHASE 采购
  {
    key: 'procurementStrategy',
    group: 'PURCHASE',
    label: '采购策略',
    stage: 'CREATABLE',
    valueType: 'select',
    options: [
      { label: '按需采购', value: 'DAILY_PURCHASE' },
      { label: '备货补货', value: 'STOCK_REPLENISHMENT' },
      { label: '混合', value: 'HYBRID' },
    ],
  },
  {
    key: 'purchaseUnit',
    group: 'PURCHASE',
    label: '采购单位',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'purchaseToBaseRatio',
    group: 'PURCHASE',
    label: '换算倍数',
    stage: 'CREATABLE',
    valueType: 'number',
    unit: '倍',
  },
  {
    key: 'currentPricePerPurchaseUnit',
    group: 'PURCHASE',
    label: '当前采购价',
    stage: 'CREATABLE',
    valueType: 'number',
    unit: '元',
  },
  {
    key: 'brand',
    group: 'PURCHASE',
    label: '品牌',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'productModel',
    group: 'PURCHASE',
    label: '规格',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'purchaseChannel',
    group: 'PURCHASE',
    label: '采购渠道',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  // STOCK 库存（要等原料建完、有了库存记录才谈得上）
  {
    key: 'safetyStock',
    group: 'STOCK',
    label: '安全库存',
    stage: 'AFTER_CREATE',
    valueType: 'number',
  },
  {
    key: 'reorderPoint',
    group: 'STOCK',
    label: '补货点',
    stage: 'AFTER_CREATE',
    valueType: 'number',
  },
  {
    key: 'targetStock',
    group: 'STOCK',
    label: '目标库存',
    stage: 'AFTER_CREATE',
    valueType: 'number',
  },
  // USAGE 用途与标签
  {
    key: 'diyEnabled',
    group: 'USAGE',
    label: '用于 DIY',
    stage: 'CREATABLE',
    valueType: 'boolean',
  },
  {
    key: 'addTiming',
    group: 'USAGE',
    label: '添加时机',
    stage: 'CREATABLE',
    valueType: 'select',
    options: [
      { label: '制作中', value: 'BEFORE_MIXING' },
      { label: '随餐', value: 'BEFORE_MEAL' },
    ],
  },
  {
    key: 'productionLossRate',
    group: 'USAGE',
    label: '生产损耗率',
    stage: 'CREATABLE',
    valueType: 'multiplier',
    unit: '倍',
    hint: '1.05 = 损耗 5%',
  },
  {
    key: 'tags',
    group: 'USAGE',
    label: '标签分类',
    stage: 'AFTER_CREATE',
    valueType: 'tags',
  },
  // STORAGE 保存
  {
    key: 'shelfLifeMonths',
    group: 'STORAGE',
    label: '保质期',
    stage: 'CREATABLE',
    valueType: 'number',
    unit: '个月',
  },
  {
    key: 'storageCondition',
    group: 'STORAGE',
    label: '储存条件',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'openedShelfLifeDays',
    group: 'STORAGE',
    label: '开封后效期',
    stage: 'CREATABLE',
    valueType: 'number',
    unit: '天',
  },
  {
    key: 'isOilBased',
    group: 'STORAGE',
    label: '内容物油性',
    stage: 'CREATABLE',
    valueType: 'boolean',
  },
] as const

/** 30 个公共字段名；从定义数组派生，不另维护一份键表。 */
export type IngredientCardFieldKey =
  (typeof CARD_FIELD_DEFINITIONS)[number]['key']

/** 30 个字段的完整定义，顺序即展示顺序。 */
export const INGREDIENT_CARD_FIELDS: readonly IngredientCardFieldDef[] =
  CARD_FIELD_DEFINITIONS

/**
 * 建完之后才补的 4 项：库存三项 + 标签分类。
 *
 * 本阶段只读展示（灰底、禁用），提交时也不写；它们不能出现在
 * 「建原料时可填」的字段里，否则页面会让人填一堆没有落地处的格子。
 */
export const INGREDIENT_AFTER_CREATE_FIELDS: readonly IngredientCardFieldDef[] =
  INGREDIENT_CARD_FIELDS.filter((field) => field.stage === 'AFTER_CREATE')

/** 运行时判定用的键集合。 */
const INGREDIENT_CARD_FIELD_KEY_SET: ReadonlySet<string> = new Set(
  INGREDIENT_CARD_FIELDS.map((field) => field.key),
)

/**
 * 这个键是不是目录内的原料卡字段。
 *
 * 相信外部输入（草稿、接口回包、旧版本地缓存）之前先过这一道。
 */
export function isIngredientCardField(
  value: string,
): value is IngredientCardFieldKey {
  return INGREDIENT_CARD_FIELD_KEY_SET.has(value)
}
