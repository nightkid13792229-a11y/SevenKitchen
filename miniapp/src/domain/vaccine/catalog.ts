/**
 * ══ 疫苗板块 · 病种 / 产品词表（兜底来自接口）══════════════════════════════
 *
 * 技术方案《四、前端结构》：`catalog.ts` = 病种/产品词表，**兜底也来自接口**。
 *
 * 三件事：
 *   ① 病种（`components`）的值 ↔ 中文名 —— **权威在后端**
 *      （`GET /dogs/vaccines/catalog` 下发），这里那份只是**接口失败时的兜底**，
 *      内容与后端逐字对齐（有测试盯着两边不许漂开）；
 *   ② 产品名归一化 + 在目录里找产品 —— 录入器"从产品库选"和
 *      "这行字是不是库里那支苗"都用它；
 *   ③ 识别结果**哪几行要核对**（技术方案 3.3 收敛成三条判据）。
 *
 * ⚠️ 这里**没有**类别判定（`kinds`）—— 归类是后端的 domain 知识，
 *    前端复制一份迟早对不上（老代码吃过这个亏）。前端只把"家长勾了哪些病种"
 *    交给后端，类别由它推。
 */

import type {
  AntibodyResult,
  AntibodyTarget,
  VaccineCatalogOption,
  VaccineCatalogProduct,
  VaccineCatalogResponse,
} from './types'

/** 病种选项（值 + 中文名） */
export interface VaccineComponentOption {
  value: string
  label: string
}

/**
 * 病种词表兜底（**与后端同序、同文案**）。
 *
 * ⚠️ 顺序别乱动：后端的顺序就是界面上的顺序。
 * ⚠️ 这份与后端 `vaccine-products.ts` 的 `VACCINE_COMPONENTS` +
 *    `VACCINE_COMPONENT_LABELS` 逐项一致，测试会读后端源码比对。
 */
export const VACCINE_COMPONENT_FALLBACK: VaccineComponentOption[] = [
  { value: 'cdv', label: '犬瘟热' },
  { value: 'cpv', label: '犬细小病毒' },
  { value: 'cav', label: '犬腺病毒' },
  { value: 'rabies', label: '狂犬病' },
  { value: 'lepto', label: '钩端螺旋体' },
  { value: 'cpi', label: '犬副流感' },
  { value: 'ccov', label: '犬冠状病毒' },
  { value: 'bordetella', label: '博德特氏菌' },
  { value: 'lyme', label: '莱姆病' },
]

/**
 * 词表：接口给了就用接口的，没给才用兜底。
 *
 * 空数组也退兜底 —— 接口挂了却回了个空表时，界面上不能变成"一个病种都不给选"。
 */
export function componentOptionsOf(
  options: VaccineComponentOption[] | null | undefined,
): VaccineComponentOption[] {
  return options && options.length > 0 ? options : VACCINE_COMPONENT_FALLBACK
}

/**
 * 病种值 → 中文名（唯一的一份实现）。
 *
 * 查不到就原样显示值 —— 这样"库里新加了一个病种、前端还没更新"时
 * 也不会显示成英文码或 undefined。
 */
export function componentLabelOf(
  options: VaccineComponentOption[] | null | undefined,
  value: string,
): string {
  const fromOptions = (options || []).find((item) => item.value === value)
  if (fromOptions) return fromOptions.label
  const fromFallback = VACCINE_COMPONENT_FALLBACK.find((item) => item.value === value)
  return fromFallback ? fromFallback.label : value
}

/**
 * 把接口下发的病种列表读成统一形状。
 *
 * 后端下发的一直是 `[{ value, label }]`；这里额外容忍
 * `{ cdv: '犬瘟热' }` 这种形状（读不到就当没给，退兜底）——
 * 但**绝不在前端另写一份词表**。
 */
export function readComponentOptions(
  source: VaccineCatalogResponse | null | undefined,
): VaccineComponentOption[] {
  const raw = (source || {}).components
  if (Array.isArray(raw)) {
    return raw
      .map((item) => readOption(item))
      .filter((item): item is VaccineComponentOption => Boolean(item))
  }
  if (raw && typeof raw === 'object') {
    return Object.keys(raw).map((key) => ({
      value: key,
      label: String((raw as unknown as Record<string, unknown>)[key]),
    }))
  }
  return []
}

/** 类别词表（可选下发；没有就用后端给的 `kindLabel`） */
export function readKindOptions(
  source: VaccineCatalogResponse | null | undefined,
): VaccineCatalogOption[] {
  const raw = (source || {}).kinds
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => readOption(item))
    .filter((item): item is VaccineCatalogOption => Boolean(item))
}

function readOption(item: unknown): VaccineCatalogOption | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const value = String(record.value ?? record.key ?? '').trim()
  const label = String(record.label ?? record.name ?? '').trim()
  if (!value || !label) return null
  return { value, label }
}

/** 产品库（只读对外字段；匹配与别名在后端做，前端不做） */
export function readCatalogProducts(
  source: VaccineCatalogResponse | null | undefined,
): VaccineCatalogProduct[] {
  const raw = (source || {}).products
  // 接口回来的东西一律当"不可信输入"读：少一个字段不该让整页挂掉
  const items: unknown[] = Array.isArray(raw) ? (raw as unknown[]) : []
  const products: VaccineCatalogProduct[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = String(record.name || '').trim()
    if (!name) continue
    const components = Array.isArray(record.components) ? record.components : []
    products.push({
      name,
      components: components.map((value) => String(value)),
      manufacturer: record.manufacturer ? String(record.manufacturer) : undefined,
      recommendable: record.recommendable === undefined ? undefined : Boolean(record.recommendable),
    })
  }
  return products
}

/* ══ 产品名归一化（与后端 `normalizeProductText` 逐条一致）══════════════════
 *
 * 为什么要在前端也做：识别出来的字常常带 ® / 空格 / 分隔符
 * （「宠必威® 幼犬保」vs 库里的「宠必威幼犬保」），用 `===` 比就比不中 ——
 * 界面上会表现成"名字显示不出来 / 选不中那支苗"。
 * 后端判归类时本来就会去掉这些字符，前端显示也得用同一套规则。
 *
 * ⚠️ 后端改了这里也要跟着改。
 */
export function normalizeProductName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[®™©]/g, '')
    .replace(/[·・\-_/\\、,，.。．()（）【】\[\]]/g, '')
}

/** 在目录里找这个名字对应的产品（归一化之后比），找不到回 null */
export function findCatalogProduct(
  products: readonly VaccineCatalogProduct[],
  name: string,
): VaccineCatalogProduct | null {
  const key = normalizeProductName(name)
  if (!key) return null
  return products.find((item) => normalizeProductName(item.name) === key) || null
}

/** 名字按前缀命中的候选（"从产品库选"面板里边打字边筛） */
export function filterCatalogProducts(
  products: readonly VaccineCatalogProduct[],
  keyword: string,
): VaccineCatalogProduct[] {
  const key = normalizeProductName(keyword)
  if (!key) return products.slice(0, 50)
  return products
    .filter((item) => normalizeProductName(item.name).includes(key))
    .slice(0, 50)
}

/**
 * 这个名字含哪些病种（给录入器那行小字：`含 犬瘟热、犬细小病毒、犬腺病毒`）。
 *
 * 目录里查得到就用目录的；查不到回空数组（界面就不显示这行小字，
 * 绝不猜 —— 猜错会让家长以为这针含了他没打的病种）。
 */
export function productComponentLabels(
  products: readonly VaccineCatalogProduct[],
  name: string,
  options?: VaccineComponentOption[] | null,
): string[] {
  const product = findCatalogProduct(products, name)
  if (!product || product.components.length === 0) return []
  return product.components.map((item) => componentLabelOf(options, item))
}

/* ══ 识别结果：哪几行要核对（技术方案 3.3 的三条判据）══════════════════════
 *
 *   ① **狂犬一律要核对** —— 错认成"打过了"会让狗漏打，这一类的代价最大；
 *   ② **名称在产品库里认不出**；
 *   ③ **日期可疑**（没读出来 / 不是日期 / 落在未来）。
 * 原来靠"品牌对不上 / 复核读到不一样的字"，那两条随字段一起没了。
 */

export function isRabiesName(
  name: string,
  products: readonly VaccineCatalogProduct[] = [],
): boolean {
  const text = String(name || '')
  // 中英文都认（「狂犬」「Rabies」）—— 不用正则的 i 标志，写成小写比对更直白
  if (text.indexOf('狂犬') >= 0 || text.toLowerCase().indexOf('rabies') >= 0) return true
  const product = findCatalogProduct(products, text)
  return Boolean(product && product.components.includes('rabies'))
}

/** 日期可疑：没读出来 / 不是 YYYY-MM-DD / 落在未来（需求 R13：日期不能填未来） */
export function isSuspiciousDate(date: string, today: string): boolean {
  const text = String(date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return true
  if (!today) return false
  return text > today
}

/**
 * 这一行要不要核对 + 为什么（理由是给家长看的一句话）。
 *
 * ⚠️ 这里只判"识别得可不可信"，**不参与任何计划推算** ——
 *    算不算进计划是后端的事（待核对的记录后端不拿它排期）。
 */
export function scanRowReview(
  row: { name: string; date: string },
  products: readonly VaccineCatalogProduct[],
  today: string,
): { needsReview: boolean; reason: string } {
  const name = String(row?.name || '').trim()
  if (!name) {
    return { needsReview: true, reason: '没读出疫苗名称，请对照疫苗本填一下' }
  }
  if (isRabiesName(name, products)) {
    return { needsReview: true, reason: '狂犬这一针请对照疫苗本核对一下' }
  }
  if (!findCatalogProduct(products, name)) {
    return { needsReview: true, reason: '常见疫苗里没找到这个名字，请对照疫苗本核对' }
  }
  if (isSuspiciousDate(row?.date, today)) {
    return { needsReview: true, reason: '日期看着不对，请对照疫苗本核对' }
  }
  return { needsReview: false, reason: '' }
}

/* ══ 抗体检测：录入器里的选项 ═════════════════════════════════════════════ */

export const ANTIBODY_TARGET_OPTIONS: { value: AntibodyTarget; label: string }[] = [
  { value: 'CORE', label: '核心三项（犬瘟、细小、腺病毒）' },
  { value: 'RABIES', label: '狂犬' },
]

export const ANTIBODY_RESULT_OPTIONS: { value: AntibodyResult; label: string }[] = [
  /*
   * H2（自检清单）：三个选项都是**照抄报告**的说法 ——
   * 我们不判"合格/不合格"，只记"报告上写的是什么"。
   * 尤其第三项：报告没写结论时，界面上就是「没写结论」（与记录区的"未判读"口径一致，
   * 不再把"请让兽医判读"塞进一个状态位里）。
   */
  { value: 'PASS', label: '报告写的是：合格' },
  { value: 'FAIL', label: '报告写的是：不合格' },
  { value: 'UNKNOWN', label: '报告没写结论' },
]
