/**
 * 定制订单详情页用到的纯函数：过敏来源比对、预计交付倒计时。
 *
 * 抽出来的理由与 `utils/dogHealthTags` 一致：admin-web 的 vitest 是 node 环境，
 * 挂不起 Element Plus 页面。**算法**放这里由单测真跑，页面只负责呈现。
 */

import type { CustomRecipeDogProfile } from '@/api/customRecipe'
import type { CustomRecipeTagType } from '@/constants/customRecipeOrder'
import { isCustomRecipeOrderOpen } from '@/constants/customRecipeOrder'

// ==================== 过敏：三个来源别搞混 ====================

/** 与 DogDetail / 小程序同一套可信度口径（缺省按"可疑"，不按"确诊"） */
const ALLERGY_CERTAINTY_TEXT: Record<string, string> = {
  CONFIRMED: '确诊',
  SUSPECTED: '可疑',
  TO_VERIFY: '待排查',
  RULED_OUT: '已排除',
}

const ALLERGY_CERTAINTY_TAG: Record<string, CustomRecipeTagType> = {
  CONFIRMED: 'danger',
  SUSPECTED: 'warning',
  TO_VERIFY: 'info',
  RULED_OUT: 'success',
}

export function getAllergyCertaintyText(certainty?: string | null): string {
  const key = String(certainty || 'SUSPECTED').toUpperCase()
  return ALLERGY_CERTAINTY_TEXT[key] || key
}

export function getAllergyCertaintyTagType(
  certainty?: string | null,
): CustomRecipeTagType {
  const key = String(certainty || 'SUSPECTED').toUpperCase()
  return ALLERGY_CERTAINTY_TAG[key] || 'warning'
}

/**
 * 解析自由文本里的过敏原。
 *
 * 档案里的 `allergyFoods` 是员工手填的文本，分隔符五花八门
 * （中英文逗号、顿号、分号、斜杠、空格都出现过），所以按这些一起切。
 */
export function parseAllergyText(text?: string | null): string[] {
  if (!text) return []
  return String(text)
    .split(/[,，、;；/|\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 比对用的归一化：忽略大小写、空格与常见修饰词，避免"鸡 肉 "和"鸡肉"被当成两条 */
export function normalizeAllergen(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

/**
 * 「档案最新」的过敏全集 = 顾客自己填的结构化记录 + 员工维护的旧文本字段。
 *
 * 为什么两个都要：`allergyRecords` 是顾客在小程序/健康档案里填的（顾客端唯一入口），
 * `allergyFoods` 是员工在设计备注里维护的旧字段。只取其中一个都会漏。
 * 已排除（RULED_OUT）的不算"不能吃"，从"要避开的"里剔掉。
 */
export function buildDogProfileAllergens(
  dog?: CustomRecipeDogProfile | null,
): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  const push = (value?: string | null) => {
    const text = String(value || '').trim()
    if (!text) return
    const key = normalizeAllergen(text)
    if (!key || seen.has(key)) return
    seen.add(key)
    result.push(text)
  }

  for (const record of dog?.allergyRecords || []) {
    if (String(record?.certainty || '').toUpperCase() === 'RULED_OUT') continue
    push(record?.allergen)
  }

  for (const item of parseAllergyText(dog?.allergyFoods)) {
    push(item)
  }

  return result
}

export interface AllergyComparison {
  /** 档案最新（结构化记录 + 旧文本字段） */
  profileAllergens: string[]
  /** 下单当时顾客手填的那份 */
  orderAllergens: string[]
  /** 档案里有、下单时没写的（最需要看的一类） */
  added: string[]
  /** 下单时写了、档案里没有的（可能已被排除或删掉） */
  removed: string[]
  /** 两份内容是否一致 */
  changed: boolean
}

/**
 * 比对「下单时填写」与「档案最新」。
 *
 * 为什么要提醒：顾客下单后在健康档案里补了过敏，订单上的快照不会跟着变，
 * 营养师照旧信息设计就可能踩到新过敏原。两份内容不同即提示，
 * 宁可让营养师多看一眼，也不要让他照着旧的做。
 */
export function compareDogProfileAllergies(
  dog: CustomRecipeDogProfile | null | undefined,
  orderAllergies?: string[] | null,
): AllergyComparison {
  const profileAllergens = buildDogProfileAllergens(dog)
  const orderAllergens = (orderAllergies || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  const profileKeys = new Set(profileAllergens.map(normalizeAllergen))
  const orderKeys = new Set(orderAllergens.map(normalizeAllergen))

  const added = profileAllergens.filter(
    (item) => !orderKeys.has(normalizeAllergen(item)),
  )
  const removed = orderAllergens.filter(
    (item) => !profileKeys.has(normalizeAllergen(item)),
  )

  return {
    profileAllergens,
    orderAllergens,
    added,
    removed,
    changed: added.length > 0 || removed.length > 0,
  }
}

// ==================== 疾病史：档案最新 vs 下单时填写 ====================

export interface MedicalComparison {
  /** 档案最新（狗档案上的疾病史文本） */
  profileConditions: string[]
  /** 下单当时顾客手填的那份 */
  orderConditions: string[]
  /** 档案里有、下单时没写的（最需要看的一类） */
  added: string[]
  /** 下单时写了、档案里没有的 */
  removed: string[]
  /** 两份内容是否一致 */
  changed: boolean
}

/**
 * 比对「下单时填写」与「档案最新」的疾病史。
 *
 * 2026-10-04 补：此前订单页只有下单当时手填的那份，顾客之后在健康档案里
 * 补了疾病（例如确诊胰腺炎），订单上的快照不会跟着变，
 * 员工照旧信息设计就可能给出不合适的配方。
 *
 * 疾病史是狗档案上的自由文本，手填习惯与过敏那份一致，
 * 所以直接复用 parseAllergyText 的切分规则与归一化。
 */
export function compareDogProfileMedicalConditions(
  dog: CustomRecipeDogProfile | null | undefined,
  orderConditions?: string[] | null,
): MedicalComparison {
  const profileConditions = parseAllergyText(dog?.medicalHistory)
  const orderConditionList = (orderConditions || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  const profileKeys = new Set(profileConditions.map(normalizeAllergen))
  const orderKeys = new Set(orderConditionList.map(normalizeAllergen))

  const added = profileConditions.filter(
    (item) => !orderKeys.has(normalizeAllergen(item)),
  )
  const removed = orderConditionList.filter(
    (item) => !profileKeys.has(normalizeAllergen(item)),
  )

  return {
    profileConditions,
    orderConditions: orderConditionList,
    added,
    removed,
    changed: added.length > 0 || removed.length > 0,
  }
}

// ==================== 预计交付：倒计时与超期 ====================

export interface DeliveryCountdown {
  /** 超期天数（>=1 才算超期），未超期为 0 */
  overdueDays: number
  /** 距到期天数：0 = 今天到期，负数 = 已过 */
  remainingDays: number
  /** 是否需要标红催办（只有进行中的单才标） */
  overdue: boolean
  /** 可直接渲染的短文案；已交付/已取消或没有日期时为空串 */
  text: string
  /** 规范化后的到期日 YYYY-MM-DD，没有则空串 */
  dateText: string
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * 解析日期。
 *
 * 后端的 `scheduled_date` / `estimated_delivery_date` 是 `@db.Date`，
 * 序列化出来是 UTC 零点的 ISO 串。直接 new Date 在东八区会偏成前一天的风险，
 * 所以优先取字符串里的 `YYYY-MM-DD`。
 */
export function parseCalendarDate(value?: string | null): Date | null {
  if (!value) return null
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (matched) {
    return new Date(
      Number(matched[1]),
      Number(matched[2]) - 1,
      Number(matched[3]),
    )
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatCalendarDate(value?: string | null): string {
  const date = parseCalendarDate(value)
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** 按"自然日"相减，绕开跨时区与夏令时导致的 23/25 小时误差 */
export function diffCalendarDays(target: Date, base: Date): number {
  const targetUtc = Date.UTC(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  )
  const baseUtc = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())
  return Math.round((targetUtc - baseUtc) / MILLISECONDS_PER_DAY)
}

/**
 * 预计交付倒计时。
 *
 * 已交付/已取消的单不再催办（`overdue` 恒为 false、`text` 为空），
 * 否则列表里满是红色，"真正要催的单"反而看不见。
 */
export function getEstimatedDeliveryInfo(
  estimatedDeliveryDate?: string | null,
  status?: string | null,
  now: Date = new Date(),
): DeliveryCountdown {
  const date = parseCalendarDate(estimatedDeliveryDate)
  const dateText = formatCalendarDate(estimatedDeliveryDate)

  if (!date) {
    return {
      overdueDays: 0,
      remainingDays: 0,
      overdue: false,
      text: '',
      dateText: '',
    }
  }

  const remainingDays = diffCalendarDays(date, now)
  const open = isCustomRecipeOrderOpen(status)

  if (!open) {
    return {
      overdueDays: 0,
      remainingDays,
      overdue: false,
      text: '',
      dateText,
    }
  }

  if (remainingDays < 0) {
    const overdueDays = Math.abs(remainingDays)
    return {
      overdueDays,
      remainingDays,
      overdue: true,
      text: `已超期 ${overdueDays} 天`,
      dateText,
    }
  }

  return {
    overdueDays: 0,
    remainingDays,
    overdue: false,
    text: remainingDays === 0 ? '今天到期' : `剩 ${remainingDays} 天`,
    dateText,
  }
}

// ==================== 多份购买配置：折扣换算与校验 ====================

/**
 * 多份优惠配置的换算与校验（2026-10-20）。
 *
 * 为什么抽到这里：admin-web 的 vitest 是 node 环境，挂不起 Element Plus 页面。
 * 页面只负责呈现，**换算和校验放这里由单测真跑** —— 与文件头写的原则一致。
 *
 * ⚠️ 这些规则必须与后端 `custom-recipe-config.service.ts` 的
 * `assertValidMultiRecipeDiscounts` 保持一致。后端是权威，前端的校验
 * 只是让运营不用等一次往返就能看到哪里填错。
 */

/** 单笔最多份数的业务硬上限：后台只能调低，不能配到 6 */
export const MAX_MULTI_RECIPE_QUANTITY = 5

/** 单档最高折扣：20% */
export const MAX_MULTI_RECIPE_DISCOUNT_PERCENT = 20

/** 四档必须齐全：2/3/4/5 份（缺一档会让某个份数静默变成"无优惠"） */
export const REQUIRED_MULTI_RECIPE_DISCOUNT_QUANTITIES = [2, 3, 4, 5] as const

/**
 * 默认四档，与后端 `DEFAULT_MULTI_RECIPE_DISCOUNTS` 保持一致。
 * 页面拿不到配置（或后端返回空数组）时用它兜底，保证永远能存回完整四档。
 */
export const DEFAULT_MULTI_RECIPE_DISCOUNT_TIERS = [
  { quantity: 2, discountRate: 0.05, label: '2 份享 95 折' },
  { quantity: 3, discountRate: 0.08, label: '3 份享 92 折' },
  { quantity: 4, discountRate: 0.1, label: '4 份享 9 折' },
  { quantity: 5, discountRate: 0.12, label: '5 份享 88 折' },
] as const

/** 页面上的优惠档位：折扣率按**百分比**编辑（5 表示 5%） */
export interface MultiRecipeDiscountTierInput {
  quantity: number
  /** 百分比，如 5 表示 5% */
  discountRatePercent: number
  label: string
}

/** 提交前校验需要的多份配置字段 */
export interface MultiRecipeConfigInput {
  multiRecipeEnabled: boolean
  maxRecipeQuantity: number
  multiRecipeDiscounts: MultiRecipeDiscountTierInput[]
  dailyDesignMinutes: number
  minutesPerRecipe: number
}

/**
 * 百分比 → 保存用小数。
 *
 * 先乘 100 再取整，避免 0.05 这类值在浮点里变成
 * 0.05000000000000001 再被后端当成"超过 5%"。
 * 5 → 0.05，12 → 0.12，20 → 0.2。
 */
export function percentToDiscountRate(percent: number): number {
  return Math.round(Number(percent) * 100) / 10000
}

/**
 * 后端小数 → 页面百分比。
 * 0.05 → 5，0.1 → 10，0.12 → 12。
 */
export function discountRateToPercent(rate: number): number {
  return Math.round(Number(rate) * 10000) / 100
}

/**
 * 把后端返回的档位（小数）转成页面行（百分比）。
 *
 * 无论后端返回什么，页面永远输出 2/3/4/5 四行：
 *   · 空数组 / 缺档位 → 对应行用默认档位补上；
 *   · 坏数据（份数越界、折扣非法）→ 该行用默认值；
 * 这样运营打开页面看到的就是一份**能直接存回去**的完整配置，
 * 不会出现"少一档、一保存就被拒"的死循环。
 */
export function buildMultiRecipeDiscountRows(
  raw: unknown,
): MultiRecipeDiscountTierInput[] {
  const fromBackend = new Map<
    number,
    { discountRate: number; label: string }
  >()

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const {
        quantity,
        discountRate,
        label,
      } = item as Record<string, unknown>

      if (
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity < 2 ||
        quantity > MAX_MULTI_RECIPE_QUANTITY
      ) {
        continue
      }
      if (
        typeof discountRate !== 'number' ||
        !Number.isFinite(discountRate) ||
        discountRate <= 0 ||
        discountRate > MAX_MULTI_RECIPE_DISCOUNT_PERCENT / 100
      ) {
        continue
      }

      fromBackend.set(quantity, {
        discountRate,
        label: typeof label === 'string' ? label : '',
      })
    }
  }

  return REQUIRED_MULTI_RECIPE_DISCOUNT_QUANTITIES.map((quantity) => {
    const found = fromBackend.get(quantity)
    const fallback = DEFAULT_MULTI_RECIPE_DISCOUNT_TIERS.find(
      (tier) => tier.quantity === quantity,
    )!
    return {
      quantity,
      discountRatePercent: discountRateToPercent(
        found?.discountRate ?? fallback.discountRate,
      ),
      label: found ? found.label : fallback.label,
    }
  })
}

/**
 * 保存前校验 —— 与后端同一套规则，返回第一条人能看懂的错误；合法返回 null。
 *
 * 规则（后端 `assertValidMultiRecipeDiscounts` + `assertValid`）：
 *   · 单笔最多份数是 1–5 的整数；
 *   · 优惠档位覆盖 2/3/4/5 四档，份数不能重复；
 *   · 每档折扣 >0 且 ≤20%；
 *   · 份数越高折扣不能降低（可以持平）；
 *   · 每份 / 每日设计工时都是大于 0 的整数分钟。
 */
export function validateMultiRecipeConfig(
  input: MultiRecipeConfigInput,
): string | null {
  if (typeof input.multiRecipeEnabled !== 'boolean') {
    return '多份购买开关必须是布尔值'
  }

  const maxQuantity = Number(input.maxRecipeQuantity)
  if (
    !Number.isInteger(maxQuantity) ||
    maxQuantity < 1 ||
    maxQuantity > MAX_MULTI_RECIPE_QUANTITY
  ) {
    return `最多份数必须是 1~${MAX_MULTI_RECIPE_QUANTITY} 的整数（业务硬上限为 ${MAX_MULTI_RECIPE_QUANTITY}）`
  }

  const tiers = input.multiRecipeDiscounts
  if (!Array.isArray(tiers)) {
    return '优惠配置不合法：优惠档位必须是数组'
  }

  // 先按份数排序再判"不能降低"，否则后台换一下行的顺序就会被误判
  const sorted = [...tiers].sort((a, b) => a.quantity - b.quantity)
  const seen = new Set<number>()
  let previousRate = -Infinity

  for (const tier of sorted) {
    if (
      !Number.isInteger(tier.quantity) ||
      tier.quantity < 2 ||
      tier.quantity > MAX_MULTI_RECIPE_QUANTITY
    ) {
      return `优惠配置不合法：优惠份数必须是 2~${MAX_MULTI_RECIPE_QUANTITY} 的整数`
    }

    if (seen.has(tier.quantity)) {
      return `优惠配置不合法：${tier.quantity} 份的优惠档位重复了`
    }
    seen.add(tier.quantity)

    const percent = Number(tier.discountRatePercent)
    if (
      !Number.isFinite(percent) ||
      percent <= 0 ||
      percent > MAX_MULTI_RECIPE_DISCOUNT_PERCENT
    ) {
      return `优惠配置不合法：${tier.quantity} 份的折扣率必须大于 0 且不超过 ${MAX_MULTI_RECIPE_DISCOUNT_PERCENT}%`
    }

    if (percent < previousRate) {
      return `优惠配置不合法：份数越高折扣不能降低（${tier.quantity} 份的折扣低于上一档）`
    }
    previousRate = percent

    if (typeof tier.label !== 'string') {
      return `优惠配置不合法：${tier.quantity} 份的展示文案必须是字符串`
    }
  }

  const missing = REQUIRED_MULTI_RECIPE_DISCOUNT_QUANTITIES.filter(
    (quantity) => !seen.has(quantity),
  )
  if (missing.length > 0) {
    return `优惠配置不合法：优惠档位必须覆盖 2/3/4/5 份，缺少 ${missing.join('、')} 份`
  }

  const dailyDesignMinutes = Number(input.dailyDesignMinutes)
  if (!Number.isInteger(dailyDesignMinutes) || dailyDesignMinutes < 1) {
    return '每日设计工时必须是大于 0 的整数（分钟）'
  }

  const minutesPerRecipe = Number(input.minutesPerRecipe)
  if (!Number.isInteger(minutesPerRecipe) || minutesPerRecipe < 1) {
    return '每份设计工时必须是大于 0 的整数（分钟）'
  }

  return null
}

/**
 * 每日最多能设计几份 = floor(每日设计工时 / 每份设计工时)。
 *
 * 这是**展示用**的推导值，不是可配置字段；工时为 0/非法时返回 0，
 * 不产出 Infinity/NaN 让页面显示成「每天最多设计 NaN 份」。
 */
export function calcDailyDesignCapacity(
  dailyDesignMinutes: number,
  minutesPerRecipe: number,
): number {
  const daily = Number(dailyDesignMinutes)
  const per = Number(minutesPerRecipe)
  if (!Number.isFinite(daily) || !Number.isFinite(per) || per <= 0) return 0
  return Math.max(0, Math.floor(daily / per))
}
