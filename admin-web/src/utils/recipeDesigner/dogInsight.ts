/**
 * 「爱犬指导」面板的事实整理（2026-10-21）。
 *
 * 面板只陈述档案 / 订单 / 健康记录里**已经存在的事实**，
 * 不判断过敏可信度、不提醒配方命中、不给替换建议。
 * 所以这里也不输出 certainty / warning 之类的字段 ——
 * 页面不需要，测试也能据此守住「不加判断」这条边界。
 *
 * 放在 utils 而不是组件里：admin-web 的 vitest 是 node 环境，
 * 挂不起 Element Plus 页面；纯函数才能被真正跑起来验证。
 */

import { PROTEIN_OPTIONS } from '@/utils/assistedOrder'
import { normalizeAllergen } from '@/utils/customRecipe'

/** 顾客没有指定主蛋白时，面板显示这句话（不是建议，是订单事实） */
export const DIETITIAN_PROTEIN_FALLBACK = '营养师搭配'

const PROTEIN_LABEL_BY_CODE = new Map(
  PROTEIN_OPTIONS.map((option) => [option.code, option.label])
)

/**
 * 主蛋白 code → 中文。
 *
 * 空数组 / 缺字段 → 「营养师搭配」；未知 code 原样显示（不猜、不吞）。
 * 去重并保持后端给出的顺序。
 */
export function formatRequestedProteins(
  codes?: readonly (string | null | undefined)[] | null
): string {
  const labels: string[] = []
  const seen = new Set<string>()

  for (const raw of codes ?? []) {
    const text = String(raw ?? '').trim()
    const key = text.toUpperCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    labels.push(PROTEIN_LABEL_BY_CODE.get(key) ?? text)
  }

  return labels.length > 0 ? labels.join('、') : DIETITIAN_PROTEIN_FALLBACK
}

/* ---------- 过敏信息（合并去重，不分档） ---------- */

export type AllergyFactSource = 'PROFILE' | 'ORDER'

/** 来源标签：只说明这条过敏是从哪儿来的，不评价可靠性 */
export const ALLERGY_SOURCE_LABELS: Record<AllergyFactSource, string> = {
  PROFILE: '档案',
  ORDER: '本单填写',
}

export interface AllergyDetailLike {
  allergen?: string | null
  /** 后端会带可信度，但 fact-only 面板不读取、不输出 */
  certainty?: string | null
  source?: string | null
}

export interface AllergyFactsInput {
  /** 顾客健康档案里的结构化过敏记录（带 certainty，但这里只取名字） */
  allergyDetail?: readonly (AllergyDetailLike | null | undefined)[] | null
  /** 只有名字的旧版结构化列表（后端兜底字段） */
  structuredAllergies?: readonly (string | null | undefined)[] | null
  /** 员工在设计备注里维护的旧文本字段 */
  allergyFoods?: string | null
  /** 本单顾客勾选的过敏 */
  orderAllergies?: readonly (string | null | undefined)[] | null
  /** 本单顾客手填的过敏原文 */
  orderAllergyText?: string | null
}

export interface AllergyFact {
  text: string
  /** 同一个过敏原可能同时来自档案与本单，合并成一条并标出所有来源 */
  sources: AllergyFactSource[]
}

export interface DogAllergyFacts {
  /** 档案 + 本单的结构化过敏，已按归一化名称去重 */
  allergens: AllergyFact[]
  /** 本单手填的过敏原文 */
  orderText: string
  hasAny: boolean
}

function textOf(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * 合并档案与本单的过敏事实。
 *
 * - 档案：`allergyDetail[].allergen` + `structuredAllergies`，去重；
 * - 本单：`orderAllergies`，与档案重复时合并来源，不重复显示；
 * - 订单自由文本（`allergyText`）原样保留；旧档案文本已停止读取。
 */
export function buildAllergyFacts(input: AllergyFactsInput = {}): DogAllergyFacts {
  const allergens: AllergyFact[] = []
  const byKey = new Map<string, AllergyFact>()

  const push = (value: unknown, source: AllergyFactSource) => {
    const text = textOf(value)
    if (!text) return
    const key = normalizeAllergen(text)
    if (!key) return

    const existing = byKey.get(key)
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source)
      return
    }

    const fact: AllergyFact = { text, sources: [source] }
    byKey.set(key, fact)
    allergens.push(fact)
  }

  for (const item of input.allergyDetail ?? []) {
    push(item?.allergen, 'PROFILE')
  }
  for (const item of input.structuredAllergies ?? []) {
    push(item, 'PROFILE')
  }
  for (const item of input.orderAllergies ?? []) {
    push(item, 'ORDER')
  }

  const orderText = textOf(input.orderAllergyText)

  return {
    allergens,
    orderText,
    hasAny: allergens.length > 0 || Boolean(orderText),
  }
}

/** 「档案 · 本单填写」 */
export function formatAllergySources(
  sources: readonly AllergyFactSource[]
): string {
  return sources.map((source) => ALLERGY_SOURCE_LABELS[source]).join(' · ')
}

/* ---------- 最近一次就诊 / 体检 ---------- */

export interface LatestMedicalRecordLike {
  visitDate?: string | Date | null
  diagnosis?: string | null
  status?: string | null
  chiefComplaint?: string | null
  exams?: string | null
}

export interface LatestCheckupRecordLike {
  checkupDate?: string | Date | null
  checkupType?: string | null
  findings?: string | null
}

export interface LatestMedicalFact {
  /** YYYY-MM-DD；日期无法解析时为「日期未知」 */
  date: string
  diagnosis: string
}

export interface LatestCheckupFact {
  date: string
  findings: string
}

export interface DogLatestHealthFacts {
  medical: LatestMedicalFact | null
  checkup: LatestCheckupFact | null
  hasAny: boolean
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 记录日期 → YYYY-MM-DD。
 *
 * 后端给的是 ISO 时间，但「就诊日期 / 体检日期」本身是日历日。
 * 字符串以 `YYYY-MM-DD` 开头时直接取这一段，避免时区把日期挪一天。
 */
export function formatInsightDate(
  value?: string | Date | null
): string {
  if (value == null || value === '') return ''

  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
    if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 只保留最近一次就诊 / 体检里要展示的事实。
 *
 * 后端已经把「最近」筛好了，这里不再排序，也不读取 `status` /
 * `chiefComplaint` / `exams` / 任何化验数值 —— 面板只显示日期 + 诊断/结论。
 */
export function buildLatestHealthFacts(input: {
  latestMedicalRecord?: LatestMedicalRecordLike | null
  latestCheckupRecord?: LatestCheckupRecordLike | null
} = {}): DogLatestHealthFacts {
  const medicalRecord = input.latestMedicalRecord
  const checkupRecord = input.latestCheckupRecord

  const medical = medicalRecord
    ? {
        date: formatInsightDate(medicalRecord.visitDate) || '日期未知',
        diagnosis: textOf(medicalRecord.diagnosis) || '未记录诊断',
      }
    : null

  const checkup = checkupRecord
    ? {
        date: formatInsightDate(checkupRecord.checkupDate) || '日期未知',
        findings: textOf(checkupRecord.findings) || '未记录结论',
      }
    : null

  return {
    medical,
    checkup,
    hasAny: Boolean(medical || checkup),
  }
}
