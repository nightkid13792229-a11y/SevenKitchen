/**
 * 食材线原料卡字段目录：与后端 `ingredient-card-fields.ts` 同序、同键、同分组。
 *
 * 为什么前端也要一份目录：
 * - 页面原来手写 7 个输入框，AI 就只看得见 7 个字段；少一项等于「看不见」；
 * - 渲染、保存、人工标记都从这份目录取值，字段名不会和草稿 / 后端漂移；
 * - 这里只有数据与类型，不依赖 Vue，也不请求接口，纯函数和单测都能直接引用。
 *
 * 2026-11 起这份目录只描述**食材线**：补剂线还没开放，等补剂流程上线后
 * 单独维护一份补剂目录，不要把两类原料的字段混在同一张卡里。
 *
 * 与后端契约一一对应：`key` 是公共名（camelCase），顺序即页面展示顺序。
 * `valueType` 是**前端渲染口径**（后端那一侧是 STRING/NUMBER/ENUM 等存储口径）：
 * - `percent`：0–100 的百分数（食材可食部固定 10–100）；
 * - `string-list`：可多选/可新建的字符串列表（标签名称）；
 * - `select`：受控词表，选项见 `options`。
 */

/** 字段分组；数组顺序即页面分区顺序。 */
export type IngredientFieldGroup =
  | 'BASIC'
  | 'MEASURE'
  | 'NUTRITION'
  | 'PURCHASE'
  | 'LABEL'

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
  | 'string-list'
  | 'tags'

/** 5 个分组，顺序即页面分区顺序。 */
export const INGREDIENT_CARD_FIELD_GROUPS: readonly {
  key: IngredientFieldGroup
  label: string
}[] = [
  { key: 'BASIC', label: '基本信息' },
  { key: 'MEASURE', label: '计量与形态' },
  { key: 'NUTRITION', label: '营养属性' },
  { key: 'PURCHASE', label: '采购' },
  { key: 'LABEL', label: '标签信息' },
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
  /** 口径提示，如百分数范围 */
  hint?: string
  /** 只在某个基准单位下出现：单个重量只在「个/件」，密度只在「毫升」 */
  visibleWhenBaseUnit?: 'G' | 'ML' | 'PCS'
}

/**
 * 15 项定义，数组顺序即展示顺序（与后端目录逐项对应）。
 *
 * 不单独导出这一份：对外只给排好序的 `INGREDIENT_CARD_FIELDS`，
 * 类型 `IngredientCardFieldKey` 从它派生，避免键表维护两遍。
 */
const CARD_FIELD_DEFINITIONS = [
  // BASIC 基本信息
  {
    key: 'name',
    group: 'BASIC',
    label: '原料名称',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'type',
    group: 'BASIC',
    label: '原料类型',
    stage: 'CREATABLE',
    valueType: 'select',
    options: [{ label: '食材', value: 'FOOD' }],
  },
  {
    key: 'notes',
    group: 'BASIC',
    label: '备注',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'tags',
    group: 'BASIC',
    label: '标签分类',
    stage: 'CREATABLE',
    valueType: 'tags',
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
    label: '标准单位展示名',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'weightG',
    group: 'MEASURE',
    label: '单个重量(克)',
    stage: 'CREATABLE',
    valueType: 'number',
    visibleWhenBaseUnit: 'PCS',
  },
  {
    key: 'densityGPerMl',
    group: 'MEASURE',
    label: '密度(g/ml)',
    stage: 'CREATABLE',
    valueType: 'number',
    visibleWhenBaseUnit: 'ML',
  },
  // NUTRITION 营养属性
  {
    key: 'cfctClass',
    group: 'NUTRITION',
    label: 'CFCT分类',
    stage: 'CREATABLE',
    valueType: 'text',
  },
  {
    key: 'edibleYieldPercent',
    group: 'NUTRITION',
    label: '可食部比率',
    stage: 'CREATABLE',
    valueType: 'percent',
    unit: '%',
    hint: '10–100，85 = 85%',
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
      { label: '日采', value: 'DAILY_PURCHASE' },
      { label: '库存补货', value: 'STOCK_REPLENISHMENT' },
      { label: '混合', value: 'HYBRID' },
    ],
  },
  // LABEL 标签信息（合规）：决定原料在标签上出现在哪一段、写成什么
  {
    key: 'labelCategory',
    group: 'LABEL',
    label: '标签类型',
    stage: 'CREATABLE',
    valueType: 'select',
    options: [
      { label: '饲料原料', value: 'FEED_MATERIAL' },
      { label: '饲料添加剂', value: 'FEED_ADDITIVE' },
    ],
  },
  {
    key: 'labelNames',
    group: 'LABEL',
    label: '标签名称',
    stage: 'CREATABLE',
    valueType: 'string-list',
    hint: '按目录规范写法，可填多个',
  },
  {
    key: 'labelNameSource',
    group: 'LABEL',
    label: '名称依据',
    stage: 'CREATABLE',
    valueType: 'text',
  },
] as const

/** 15 个公共字段名；从定义数组派生，不另维护一份键表。 */
export type IngredientCardFieldKey =
  (typeof CARD_FIELD_DEFINITIONS)[number]['key']

/**
 * 人工标记可以覆盖的字段：15 个可见键 + `category`。
 *
 * `category` 不在食材档案里展示（已移到营养档案页），但它参与生熟判定，
 * 人改过之后同样不能让 AI 再覆盖，所以必须进人工字段白名单。
 */
export type IngredientManualField = IngredientCardFieldKey | 'category'

/** 15 个字段的完整定义，顺序即展示顺序。 */
export const INGREDIENT_CARD_FIELDS: readonly IngredientCardFieldDef[] =
  CARD_FIELD_DEFINITIONS

/**
 * 建完之后才补的项：当前为空（标签分类已改为建原料时可填）。
 *
 * 保留这个派生常量，后续若新增库存类字段可以直接挂上去。
 */
export const INGREDIENT_AFTER_CREATE_FIELDS: readonly IngredientCardFieldDef[] =
  INGREDIENT_CARD_FIELDS.filter((field) => field.stage === 'AFTER_CREATE')

/** 运行时判定用的键集合。 */
const INGREDIENT_CARD_FIELD_KEY_SET: ReadonlySet<string> = new Set(
  INGREDIENT_CARD_FIELDS.map((field) => field.key),
)

/** 人工字段白名单：15 个可见键 + category。 */
export const INGREDIENT_MANUAL_FIELD_KEYS: readonly IngredientManualField[] = [
  ...INGREDIENT_CARD_FIELDS.map((field) => field.key),
  'category'
]

const INGREDIENT_MANUAL_FIELD_KEY_SET: ReadonlySet<string> = new Set(
  INGREDIENT_MANUAL_FIELD_KEYS
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

/** 这个键能不能被人工标记（可见字段或 category）。 */
export function isIngredientManualField(
  value: string,
): value is IngredientManualField {
  return INGREDIENT_MANUAL_FIELD_KEY_SET.has(value)
}
