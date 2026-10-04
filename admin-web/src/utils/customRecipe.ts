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
