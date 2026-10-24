/**
 * Agent 工具调用的展示层映射。
 *
 * 后端返回的是英文工具名 + 原始参数（`toolCalls`）；页面要给人看的是
 * 「查本地库：鸡肝 · 生」「写字段：粗蛋白 = 19.5 g」这样的一行。
 * 这里只做纯函数映射，不请求、不依赖 DOM，方便直接测试。
 */
import type { AgentToolCallRecord } from '@/types/ingredientCreation'
import { findNutritionField } from '@/utils/recipeDesigner/nutritionFieldCatalog'

/** 查库命中的一条词条：给页面直接渲染的匹配依据。 */
export interface AgentSearchMatchView {
  foodName: string
  foodNameEn: string | null
  /** 后端原始匹配方式代码，如 ZH_ALIAS */
  matchedBy: string
  /** 中文匹配方式，如「中英别名匹配」 */
  matchedByLabel: string
  matchedKeyword: string
  score: number | null
  scoreLabel: string
}

/** 「查本地库」这一步的展开内容：关键词、命中词条与匹配方式。 */
export interface AgentSearchEvidenceView {
  /** 本次实际用过的关键词（含中文名扩展出的英文别名） */
  keywords: string[]
  matches: AgentSearchMatchView[]
  /** 后端候选总数（可能大于页面展示的前几条） */
  totalCount: number
  /** 只有真的命中才是 true；工具 ok 不等于命中 */
  found: boolean
  /** 给人看的一句话：命中 N 条 / 没有找到匹配词条 */
  message: string
}

/** 「读来源记录」这一步的展开内容：词条名、覆盖率与读到的项数。 */
export interface AgentRecordEvidenceView {
  name: string
  coverage: number | null
  coverageLabel: string
  valueCount: number
  /** 给人看的一句话：来源记录「X」· 覆盖率 82% · 读到 12 项 */
  message: string
}

/** 一个工具调用在页面上的一行。 */
export interface AgentStepView {
  /** 后端原始工具名；未知工具也原样保留 */
  name: string
  /** 中文名；未知工具时等于原始工具名 */
  label: string
  /** 压成一行的关键参数摘要 */
  summary: string
  ok: boolean
  /** 失败时后端返回的错误原文 */
  error?: string
  /** 标签文案：成功 / 未找到 / 失败；查库零命中不能写「成功」 */
  statusLabel?: string
  statusType?: 'success' | 'warning' | 'danger'
  /** 查本地库的匹配依据；没有结构化结果（旧后端）时为空 */
  search?: AgentSearchEvidenceView
}

/** 匹配方式代码 → 中文。未知代码原样显示，不藏信息。 */
const MATCH_METHOD_LABELS: Record<string, string> = {
  EN_EXACT: '英文名完全匹配',
  EN_PARTIAL: '英文名部分匹配',
  ZH_EXACT: '中文名完全匹配',
  ZH_PARTIAL: '中文名部分匹配',
  ZH_ALIAS: '中英别名匹配',
  FUZZY: '近似匹配'
}

export function matchMethodLabel(method: string): string {
  if (!method) {
    return '匹配方式未知'
  }
  return MATCH_METHOD_LABELS[method] ?? method
}

/** 已知工具的中文名；新增工具没登记时按原始名显示，不隐藏。 */
const TOOL_LABELS: Record<string, string> = {
  searchLocalNutrition: '查本地库',
  getNutritionRecord: '读来源记录',
  updateNutritionField: '写字段',
  updateNutritionFields: '批量写字段',
  updateIngredientFields: '改原料卡',
  runCheck: '跑终检',
  askUser: '向你提问'
}

/** 工具名 → 页面中文名；未知工具原样返回，不抛错。 */
export function toolLabel(name: string): string {
  const trimmed = name.trim()
  return TOOL_LABELS[trimmed] ?? (trimmed || UNKNOWN_TOOL_LABEL)
}

/** 摘要是一行，太长就截断，避免一条参数把页面撑坏。 */
const SUMMARY_MAX = 120

const UNKNOWN_TOOL_LABEL = '未知工具'

type AnyArgs = Record<string, unknown>

function asRecord(value: unknown): AnyArgs {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as AnyArgs)
    : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function uniqueText(values: readonly string[]): string[] {
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed && !result.includes(trimmed)) {
      result.push(trimmed)
    }
  }
  return result
}

/** 后端 result 可能是对象，也可能是旧接口里的 JSON 字符串。 */
function readResultRecord(value: unknown): AnyArgs {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return asRecord(value)
}

function isRecordValue(value: unknown): value is AnyArgs {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 一条候选 → 页面可渲染的匹配依据。
 *
 * 兼容两种来源：旧接口的 `foodName` 与流式事件里的 `name`；
 * 分数取 `score`（流式事件）或 `matchScore`（工具原始结果）。
 */
function toMatchView(
  candidate: AnyArgs,
  fallbackKeyword: string
): AgentSearchMatchView {
  const matchedBy = readText(candidate.matchedBy) || 'UNKNOWN'
  const score =
    readFiniteNumber(candidate.score) ?? readFiniteNumber(candidate.matchScore)
  return {
    foodName:
      readText(candidate.foodName) ||
      readText(candidate.name) ||
      '（未知词条）',
    foodNameEn: readText(candidate.foodNameEn) || null,
    matchedBy,
    matchedByLabel: matchMethodLabel(matchedBy),
    matchedKeyword: readText(candidate.matchedKeyword) || fallbackKeyword,
    score,
    scoreLabel: score === null ? '—' : score.toFixed(2)
  }
}

/**
 * 从 searchLocalNutrition 的工具结果里读出「匹配依据」。
 *
 * - 关键词同时取后端回传的 keywords 与本次参数里的 keyword；
 * - 只有 found=true 或确有候选才算命中，工具 ok 不算；
 * - 零命中时 message 固定为「没有找到匹配词条」，页面不能写成成功。
 */
export function toSearchEvidence(
  result: unknown,
  args: AnyArgs = {}
): AgentSearchEvidenceView | null {
  const record = readResultRecord(result)
  if (Object.keys(record).length === 0) {
    return null
  }

  const rawKeywords = Array.isArray(record.keywords)
    ? record.keywords.filter(
        (keyword): keyword is string => typeof keyword === 'string'
      )
    : []
  const keywords = uniqueText([...rawKeywords, readText(args.keyword)])

  const rawCandidates = Array.isArray(record.candidates)
    ? record.candidates
    : []
  const matches: AgentSearchMatchView[] = rawCandidates
    .filter((candidate): candidate is AnyArgs => isRecordValue(candidate))
    .map((candidate) => toMatchView(candidate, keywords[0] || ''))

  const candidateCount = readFiniteNumber(record.candidateCount)
  const totalCount =
    candidateCount === null
      ? matches.length
      : Math.max(0, Math.floor(candidateCount))
  const found =
    record.found === false
      ? false
      : record.found === true || matches.length > 0 || totalCount > 0

  return {
    keywords,
    matches,
    totalCount,
    found,
    message: found ? `命中 ${totalCount} 条` : '没有找到匹配词条'
  }
}

/**
 * 从流式 `step_end` 事件还原「匹配依据」展开数据。
 *
 * 事件只带精简后的 matches（name / matchedBy / matchedKeyword / score）
 * 与 keywords / candidateCount；旧后端没有这些字段时返回 null，页面退回
 * 只显示结果摘要，不假装有依据。
 */
export function toSearchEvidenceFromEvent(input: {
  found?: unknown
  keywords?: unknown
  matches?: unknown
  candidateCount?: unknown
}): AgentSearchEvidenceView | null {
  const rawMatches = Array.isArray(input.matches) ? input.matches : null
  const rawKeywords = Array.isArray(input.keywords) ? input.keywords : null
  if (!rawMatches && !rawKeywords) {
    return null
  }

  const keywords = uniqueText(
    (rawKeywords ?? []).filter(
      (keyword): keyword is string => typeof keyword === 'string'
    )
  )
  const matches = (rawMatches ?? [])
    .filter((match): match is AnyArgs => isRecordValue(match))
    .map((match) => toMatchView(match, keywords[0] ?? ''))

  const candidateCount = readFiniteNumber(input.candidateCount)
  const totalCount =
    candidateCount === null
      ? matches.length
      : Math.max(0, Math.floor(candidateCount))
  const found =
    input.found === false
      ? false
      : input.found === true || matches.length > 0 || totalCount > 0

  return {
    keywords,
    matches,
    totalCount,
    found,
    message: found ? `命中 ${totalCount} 条` : '没有找到匹配词条'
  }
}

/** 从流式 `step_end.record` 还原「读来源记录」的展开摘要。 */
export function toRecordEvidenceFromEvent(
  value: unknown
): AgentRecordEvidenceView | null {
  if (!isRecordValue(value)) {
    return null
  }
  const valueCount = readFiniteNumber(value.valueCount)
  if (valueCount === null) {
    return null
  }
  const name = readText(value.name) || '（未知词条）'
  const coverage = readFiniteNumber(value.coverage)
  const coverageLabel = coverage === null ? '—' : `${coverage}%`
  const count = Math.max(0, Math.floor(valueCount))
  return {
    name,
    coverage,
    coverageLabel,
    valueCount: count,
    message: `来源记录「${name}」· 覆盖率 ${coverageLabel} · 读到 ${count} 项`
  }
}

function oneLine(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  return chars.length <= SUMMARY_MAX
    ? text
    : `${chars.slice(0, SUMMARY_MAX).join('')}…`
}

/** 数值原样展示；模型偶尔把数字写成字符串，也照原样显示。 */
function formatValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return '—'
}

/** 查库：关键词 · 生熟状态（后端不传 state 时按 RAW 处理）。 */
function summarizeSearch(args: AnyArgs): string {
  const keyword = readText(args.keyword) || '（未填关键词）'
  const state = readText(args.state)
  const stateLabel =
    state === 'COOKED' ? '熟' : state === 'RAW' || !state ? '生' : state
  return oneLine(`${keyword} · ${stateLabel}`)
}

/** 写字段：字段中文名 = 数值 单位。 */
function summarizeUpdate(args: AnyArgs): string {
  const fieldPath = readText(args.fieldPath)
  const label = fieldPath
    ? (findNutritionField(fieldPath)?.label ?? fieldPath)
    : '（未填字段）'
  const value = formatValue(args.value)
  const unit = readText(args.unit)
  return oneLine(unit ? `${label} = ${value} ${unit}` : `${label} = ${value}`)
}

/** 未知工具：把参数压成一行 JSON，能看出模型传了什么即可。 */
function summarizeUnknownArgs(args: AnyArgs): string {
  try {
    return oneLine(JSON.stringify(args) || '')
  } catch {
    return ''
  }
}

/** 原料卡工具的参数名 → 中文，让记录能直接读懂。 */
const INGREDIENT_FIELD_LABELS: Record<string, string> = {
  name: '名称',
  nameEn: '英文名',
  category: '类别',
  baseUnit: '基准单位',
  unitDisplayLabel: '展示名',
  cfctClass: 'CFCT',
  edibleYieldPercent: '可食部'
}

/** 改原料卡：名称=鸡肝 · 类别=MEAT_ORGAN · 可食部=95 */
function summarizeIngredientFields(args: AnyArgs): string {
  const parts = Object.entries(args)
    .filter(([key]) => key in INGREDIENT_FIELD_LABELS)
    .map(
      ([key, value]) =>
        `${INGREDIENT_FIELD_LABELS[key]}=${formatValue(value)}`
    )
  return oneLine(parts.join(' · ') || '（无字段）')
}

/** 批量写字段：档案 0 · 12 项 */
function summarizeBatchUpdate(args: AnyArgs): string {
  const profileIndex = formatValue(args.profileIndex)
  const entries = Array.isArray(args.entries) ? args.entries.length : 0
  return oneLine(`档案 ${profileIndex} · ${entries} 项`)
}

function summarize(name: string, args: AnyArgs): string {
  switch (name) {
    case 'searchLocalNutrition':
      return summarizeSearch(args)
    case 'getNutritionRecord': {
      const id = readText(args.sourceRecordId)
      return oneLine(id || '（未填来源记录）')
    }
    case 'updateNutritionField':
      return summarizeUpdate(args)
    case 'updateNutritionFields':
      return summarizeBatchUpdate(args)
    case 'updateIngredientFields':
      return summarizeIngredientFields(args)
    case 'runCheck':
      return '检查整份草稿'
    case 'askUser':
      return oneLine(readText(args.question) || '（未填问题）')
    default: {
      const argsSummary = summarizeUnknownArgs(args)
      return argsSummary && argsSummary !== '{}' ? argsSummary : '（无参数）'
    }
  }
}

/**
 * 把一次运行的 `toolCalls` 按顺序映射成页面步骤。
 *
 * - 已知工具给中文名和一行摘要；
 * - 未知工具不崩，名字与参数原样展示；
 * - 失败时保留后端 `error` 原文，由页面原样显示。
 */
export function toStepView(
  toolCalls: readonly AgentToolCallRecord[]
): AgentStepView[] {
  if (!Array.isArray(toolCalls)) {
    return []
  }

  return toolCalls.map((call) => {
    const name =
      typeof call?.name === 'string' && call.name.trim()
        ? call.name.trim()
        : UNKNOWN_TOOL_LABEL
    const label = toolLabel(name)
    const args = asRecord(call?.args)
    const ok = call?.ok === true
    // 查库零命中时，摘要与标签都要说「没有找到」，不能因为工具 ok 就写成功。
    const search =
      name === 'searchLocalNutrition' && ok
        ? toSearchEvidence(call?.result, args)
        : null
    let summary = summarize(name, args)
    let statusLabel = ok ? '成功' : '失败'
    let statusType: 'success' | 'warning' | 'danger' = ok
      ? 'success'
      : 'danger'
    if (search) {
      summary = oneLine(`${summary} · ${search.message}`)
      if (!search.found) {
        statusLabel = '未找到'
        statusType = 'warning'
      }
    }

    const view: AgentStepView = {
      name,
      label,
      summary,
      ok,
      statusLabel,
      statusType,
      ...(search ? { search } : {})
    }
    if (typeof call?.error === 'string' && call.error) {
      view.error = call.error
    }
    return view
  })
}
