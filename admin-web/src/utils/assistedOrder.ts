/**
 * 代客下单页的纯函数（2026-10-21 · Task 4）
 *
 * 这里只做**表单校验 / 收款归一化 / 载荷拼装**，不发请求、不碰 Vue。
 * 页面负责展示与服务端报价；金额的唯一来源是 `/custom-recipe/quote`，
 * 本文件绝不根据配置单价自行算价。
 */

import type {
  AssistedCustomerDogSearchItem,
  AssistedPaymentChannel,
  CreateAssistedOrderPayload,
} from '@/api/customRecipe'
import { calculateAge } from '@/types/dog'
import { isInternalCustomerRole } from '@/utils/customerRole'

/** 代客单可登记的线下渠道。刻意不含微信在线支付：线下单不能走微信退款。 */
export const ASSISTED_PAYMENT_CHANNELS: ReadonlyArray<{
  value: AssistedPaymentChannel
  label: string
}> = [
  { value: 'OFFLINE_WECHAT', label: '线下微信' },
  { value: 'OFFLINE_ALIPAY', label: '线下支付宝' },
  { value: 'OTHER', label: '其他（现金等）' },
]

/**
 * 代客下单只开放三个体重管理方向。
 *
 * `HEALTH_SUPPORT` 是顾客自助端的历史目标，不属于本入口；
 * 中文标签仍从选项字典取，这里只固定允许的 code。
 */
export const ASSISTED_TARGET_GOAL_CODES = [
  'LOSE_WEIGHT',
  'MAINTAIN',
  'GAIN_WEIGHT',
] as const

/**
 * 主蛋白选项（与小程序确认页同一套六项，不含鱼）。
 *
 * 后端目前没有主蛋白选项字典接口（设计文档约定后续再做），
 * 所以这里保留一份 code + 中文；不要把它扩成第二套业务字典。
 */
export const PROTEIN_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'CHICKEN', label: '鸡' },
  { code: 'DUCK', label: '鸭' },
  { code: 'PORK', label: '猪' },
  { code: 'BEEF', label: '牛' },
  { code: 'TURKEY', label: '火鸡' },
  { code: 'RABBIT', label: '兔' },
]

export type ProteinChoiceMode = 'DIETITIAN' | 'SELF'
export type AssistedAllergyAnswer = '' | 'HAS_ALLERGY' | 'NO_ALLERGY'

/** 页面表单的纯数据形状（不含 loading / 选项集等 UI 状态） */
export interface AssistedOrderFormState {
  customerId: string
  dogId: string
  targetGoal: string
  recipeQuantity: number
  requestedProteinCodes: string[]
  allergyStatus: AssistedAllergyAnswer
  allergyText: string
  currentFoodMain: string
  currentFoodOther: string
  changeReasons: string[]
  stomachConditions: string[]
  additionalNotes: string
  payment: {
    collected: boolean
    channel: AssistedPaymentChannel
    amount: number | null
    externalRef: string
    overrideReason: string
  }
}

export interface AssistedOrderValidationOptions {
  /** 后台当前允许的最多份数（1–5；多份开关关闭时为 1） */
  maxQuantity: number
  proteinMode: ProteinChoiceMode
  /** 服务端报价应付金额；null = 还没拿到报价 */
  quotePayable: number | null
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 展示金额（只格式化，不参与定价） */
export function formatMoney(value: unknown): string {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(2) : '—'
}

/** 折扣率 → 「9折 / 85折」；没有优惠时返回「无优惠」 */
export function formatDiscountRate(rate: unknown): string {
  const value = Number(rate ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '无优惠'

  const discount = Math.round((1 - value) * 1000) / 10
  const text = Number.isInteger(discount)
    ? String(discount).replace(/(?<=^\d)0$/, '')
    : String(discount)
  return `${text}折`
}

/**
 * 顾客展示文案：姓名 + 手机号。
 *
 * 代客下单最容易出错的不是填错字段，而是**认错人/认错狗**：
 * 同名顾客、同名狗都很常见。任何顾客/狗的展示都必须带上手机号，
 * 不能只显示名字。
 */
export function describeCustomer(name: unknown, phone: unknown): string {
  const safeName = String(name ?? '').trim() || '未命名顾客'
  const safePhone = String(phone ?? '').trim() || '无手机号'
  return `${safeName}（${safePhone}）`
}

// ===== 代客下单：顾客 + 狗狗合并选择（2026-10-21）=====

/** 合并搜索卡片里的一只狗（年龄/体重已经格式化成页面文案） */
export interface AssistedDogSummary {
  id: string
  name: string
  breedName: string | null
  ageText: string
  weightText: string
}

/**
 * 合并搜索卡片：一位顾客 + 他的全部狗狗。
 *
 * 点狗即同时选中顾客和狗，页面不再有独立的「选择狗狗」步骤。
 */
export interface AssistedCustomerDogCard {
  customerId: string
  name: string
  phone: string | null
  role: string
  isInternal: boolean
  dogs: AssistedDogSummary[]
}

/** 已选身份：顶部身份卡展示的顾客 + 狗狗 */
export interface AssistedSelectedIdentity {
  customerId: string
  customerName: string
  customerPhone: string
  role: string
  isInternal: boolean
  dogId: string | null
  dogName: string
  dogBreedName: string
  dogAgeText: string
  dogWeightText: string
}

/** 生日 → 年龄文案（与订单详情同一口径；没填显示「年龄未填」） */
export function formatDogAge(birthday: unknown): string {
  const value = String(birthday ?? '').trim()
  if (!value) return '年龄未填'
  return calculateAge(value) || '年龄未填'
}

/** 体重 → 「12.3 kg」（无效值显示「体重未填」） */
export function formatDogWeight(weight: unknown): string {
  const value = Number(weight)
  return Number.isFinite(value) && value > 0
    ? `${value.toFixed(1)} kg`
    : '体重未填'
}

/** 判断一个搜索项是否内部账号：优先后端下发的 isInternal */
export function isInternalCustomer(item: {
  role?: unknown
  isInternal?: unknown
}): boolean {
  if (typeof item.isInternal === 'boolean') return item.isInternal
  return isInternalCustomerRole(item.role)
}

/**
 * 后端合并搜索结果 → 页面卡片。
 *
 * 这里只做**归一化与展示文案**：补齐空姓名/空角色、没有 ageText 时按生日算、
 * 体重统一格式。不能在这里过滤狗狗 —— 关键词只命中一只时，
 * 员工仍要能看到这位顾客的其它狗。
 */
export function buildCustomerDogCards(
  items: AssistedCustomerDogSearchItem[] | null | undefined,
): AssistedCustomerDogCard[] {
  return (items ?? []).map((item) => {
    const role = String(item.role ?? '').trim().toUpperCase() || 'CUSTOMER'
    return {
      customerId: item.id,
      name: String(item.name ?? '').trim() || '未命名顾客',
      phone: item.phone ?? null,
      role,
      isInternal: isInternalCustomer({ role, isInternal: item.isInternal }),
      dogs: (item.dogs ?? []).map((dog) => ({
        id: dog.id,
        name: String(dog.name ?? '').trim() || '未命名狗狗',
        breedName: dog.breedName ?? null,
        ageText:
          String(dog.ageText ?? '').trim() || formatDogAge(dog.birthday),
        weightText: formatDogWeight(dog.currentWeightKg),
      })),
    }
  })
}

/**
 * 内部账号选中前必须二次确认。
 *
 * 只认后端/卡片上的 isInternal；普通顾客不弹窗，避免把正常下单也拦住。
 */
export function requiresInternalConfirmation(card: {
  isInternal?: boolean
}): boolean {
  return card?.isInternal === true
}

/**
 * 顶部「已选身份」卡的数据。
 *
 * 顾客一定有；狗狗可能还没选（代客客户刚建档时），此时 dog 传 null，
 * 页面显示「请选择或新建狗狗」。
 */
export function buildSelectedIdentity(
  customer: {
    id?: string
    name?: unknown
    phone?: unknown
    role?: unknown
    isInternal?: unknown
  },
  dog?: {
    id?: string
    name?: unknown
    breedName?: unknown
    ageText?: unknown
    weightText?: unknown
  } | null,
): AssistedSelectedIdentity {
  const role = String(customer.role ?? '').trim().toUpperCase() || 'CUSTOMER'
  const isInternal = isInternalCustomer({
    role,
    isInternal: customer.isInternal,
  })
  return {
    customerId: String(customer.id ?? ''),
    customerName: String(customer.name ?? '').trim() || '未命名顾客',
    customerPhone: String(customer.phone ?? '').trim() || '未填写手机号',
    role,
    isInternal,
    dogId: dog?.id ? String(dog.id) : null,
    dogName: String(dog?.name ?? '').trim(),
    dogBreedName: String(dog?.breedName ?? '').trim() || '品种未填写',
    dogAgeText: String(dog?.ageText ?? '').trim() || '年龄未填',
    dogWeightText: String(dog?.weightText ?? '').trim() || '体重未填',
  }
}

/**
 * 报价刷新后是否把实收金额同步成新的应付。
 *
 * 员工没动过金额 → 跟随报价；动过但当前值仍等于上一版应付 → 也跟随，
 * 避免改份数后实收停留在旧价格、又被要求填差异原因。
 */
export function shouldSyncActualAmount(
  currentAmount: unknown,
  previousPayable: number | null,
  amountTouched: boolean,
): boolean {
  if (!amountTouched) return true
  if (previousPayable === null || !Number.isFinite(previousPayable)) return false

  const amount = Number(currentAmount)
  if (!Number.isFinite(amount)) return false
  return round2(amount) === round2(previousPayable)
}

/**
 * 收款校验（与后端 `AssistedOrderService.resolvePayment` 同一口径）。
 *
 * 返回 null = 合法；返回字符串 = 给员工看的具体原因。
 */
export function getPaymentValidationError(input: {
  collected: boolean
  amount: unknown
  payableAmount: number | null
  overrideReason: string
}): string | null {
  if (
    input.payableAmount === null ||
    !Number.isFinite(input.payableAmount)
  ) {
    return '请先获取服务端报价'
  }

  const amount = Number(input.amount)
  if (!Number.isFinite(amount)) return '请输入实收金额'
  if (amount < 0) return '实收金额不能为负数'

  const differs =
    Math.round(amount * 100) !== Math.round(input.payableAmount * 100)
  if (differs && !String(input.overrideReason || '').trim()) {
    return '实收金额与系统报价不一致时，必须填写原因'
  }

  return null
}

/**
 * 提交前的完整校验。
 *
 * 顺序按页面从上到下，返回的每一条都能直接展示给员工；
 * 页面只显示第一条 + 顶部汇总，不自己再写一套规则。
 */
export function collectAssistedOrderIssues(
  form: AssistedOrderFormState,
  options: AssistedOrderValidationOptions,
): string[] {
  const issues: string[] = []

  if (!String(form.customerId || '').trim()) {
    issues.push('请选择顾客')
  }
  if (!String(form.dogId || '').trim()) {
    issues.push('请选择狗狗')
  }

  const maxQuantity = Math.max(1, Math.floor(Number(options.maxQuantity) || 1))
  const quantity = Number(form.recipeQuantity)
  const quantityValid =
    Number.isInteger(quantity) && quantity >= 1 && quantity <= maxQuantity
  if (!quantityValid) {
    issues.push(`份数必须是 1~${maxQuantity} 的整数`)
  }

  if (
    !(ASSISTED_TARGET_GOAL_CODES as readonly string[]).includes(
      String(form.targetGoal || ''),
    )
  ) {
    issues.push('请选择健康管理方向')
  }

  if (options.proteinMode === 'SELF' && quantityValid) {
    if (form.requestedProteinCodes.length !== quantity) {
      issues.push(`请选择 ${quantity} 种主蛋白，或改选“营养师配”`)
    } else if (
      new Set(form.requestedProteinCodes).size !==
      form.requestedProteinCodes.length
    ) {
      issues.push('主蛋白不能重复选择')
    }
  }

  if (
    form.allergyStatus !== 'HAS_ALLERGY' &&
    form.allergyStatus !== 'NO_ALLERGY'
  ) {
    issues.push('请先回答狗狗是否对部分食物过敏')
  } else if (
    form.allergyStatus === 'HAS_ALLERGY' &&
    !String(form.allergyText || '').trim()
  ) {
    issues.push('请补充过敏食物')
  }

  if (!String(form.currentFoodMain || '').trim()) {
    issues.push('请选择现在主要喂什么')
  } else if (
    form.currentFoodMain === 'OTHER' &&
    !String(form.currentFoodOther || '').trim()
  ) {
    issues.push('请补充现在主要喂什么的说明')
  }

  if (!Array.isArray(form.changeReasons) || form.changeReasons.length === 0) {
    issues.push('请选择定制原因')
  }

  const paymentError = getPaymentValidationError({
    collected: form.payment.collected,
    amount: form.payment.amount,
    payableAmount: options.quotePayable,
    overrideReason: form.payment.overrideReason,
  })
  if (paymentError) issues.push(paymentError)

  return issues
}

/**
 * 拼装 `POST /admin/custom-recipe/orders/assisted` 的载荷。
 *
 * 只传后端 DTO 认识的字段；金额取服务端报价之外的**实收**，并由后端
 * 重新校验。实收等于应付时清掉原因（与后端落库口径一致）。
 */
export function buildAssistedOrderPayload(
  form: AssistedOrderFormState,
  options: { proteinMode: ProteinChoiceMode; quotePayable: number },
): CreateAssistedOrderPayload {
  if (
    form.allergyStatus !== 'HAS_ALLERGY' &&
    form.allergyStatus !== 'NO_ALLERGY'
  ) {
    throw new Error('请先回答狗狗是否对部分食物过敏')
  }

  const amount = Number(form.payment.amount)
  if (!Number.isFinite(amount)) {
    throw new Error('请输入实收金额')
  }

  const overrideReason = String(form.payment.overrideReason || '').trim()
  const differs =
    Math.round(amount * 100) !== Math.round(options.quotePayable * 100)

  return {
    customerId: form.customerId,
    dogId: form.dogId,
    targetGoal: form.targetGoal,
    recipeQuantity: Number(form.recipeQuantity),
    requestedProteinCodes:
      options.proteinMode === 'SELF'
        ? [...form.requestedProteinCodes]
        : [],
    allergies: [],
    allergyText:
      form.allergyStatus === 'HAS_ALLERGY'
        ? String(form.allergyText || '').trim() || null
        : null,
    allergyStatus: form.allergyStatus,
    currentFoodMain: String(form.currentFoodMain || '').trim() || null,
    currentFoodOther:
      form.currentFoodMain === 'OTHER'
        ? String(form.currentFoodOther || '').trim() || null
        : null,
    changeReasons: [...form.changeReasons],
    stomachConditions: [...form.stomachConditions],
    additionalNotes: String(form.additionalNotes || '').trim() || null,
    payment: {
      collected: form.payment.collected,
      channel: form.payment.channel,
      amount,
      externalRef: String(form.payment.externalRef || '').trim() || null,
      overrideReason: differs ? overrideReason || null : null,
    },
  }
}
