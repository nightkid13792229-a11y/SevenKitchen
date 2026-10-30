/**
 * Agent 工具调用的展示层映射。
 *
 * 后端返回的是英文工具名 + 原始参数（`toolCalls`）；页面要给人看的是
 * 「查本地库：鸡肝 · 生」「写字段：粗蛋白 = 19.5 g」这样的一行。
 * 这里只做纯函数映射，不请求、不依赖 DOM，方便直接测试。
 */
import type { AgentToolCallRecord } from '@/types/ingredientCreation'
import { findNutritionField } from '@/utils/recipeDesigner/nutritionFieldCatalog'

/** AI 复核对一条候选的判断；与后端 `CandidateReviewVerdict` 同口径。 */
export type AgentAiVerdict = 'RELEVANT' | 'UNCERTAIN' | 'IRRELEVANT'

export const AI_VERDICT_LABELS: Record<AgentAiVerdict, string> = {
  RELEVANT: '相关',
  UNCERTAIN: '存疑',
  IRRELEVANT: '不相关'
}

export type AgentAiVerdictTagType = 'success' | 'warning' | 'danger'

const AI_VERDICT_TAG_TYPES: Record<AgentAiVerdict, AgentAiVerdictTagType> = {
  RELEVANT: 'success',
  UNCERTAIN: 'warning',
  IRRELEVANT: 'danger'
}

export function isAiVerdict(value: unknown): value is AgentAiVerdict {
  return (
    value === 'RELEVANT' || value === 'UNCERTAIN' || value === 'IRRELEVANT'
  )
}

/** 判断代码 → 页面中文；没有判断时返回空串，不写「未知」。 */
export function aiVerdictLabel(verdict: AgentAiVerdict | null): string {
  return verdict ? AI_VERDICT_LABELS[verdict] : ''
}

export function aiVerdictTagType(
  verdict: AgentAiVerdict | null
): AgentAiVerdictTagType {
  return verdict ? AI_VERDICT_TAG_TYPES[verdict] : 'warning'
}

/** AI 分类：状态 → 中文 */
const CLASSIFICATION_STATE_LABELS: Record<string, string> = {
  RAW: '生',
  COOKED: '熟',
  UNKNOWN: '未知'
}

/** AI 分类：加工方式 → 中文 */
const CLASSIFICATION_METHOD_LABELS: Record<string, string> = {
  BOILED: '水煮',
  STEAMED: '蒸',
  GRILLED: '烤',
  FRIED: '煎/炸',
  OTHER: '其它做法',
  NONE: '无'
}

/** AI 分类：部位 key → 中文展示（只是标签，不参与判断） */
const CLASSIFICATION_CUT_GROUP_LABELS: Record<string, string> = {
  ground: '绞肉',
  tenderloin: '里脊',
  loin: '外脊',
  round: '后腿',
  brisket: '腩',
  shank: '腱',
  chuck: '肩',
  rib: '肋排',
  sandwich: '薄片',
  breast: '胸',
  thigh: '腿',
  wing: '翅',
  liver: '肝',
  heart: '心',
  kidney: '肾',
  gizzard: '胗',
  neck: '颈',
  head: '头',
  foot: '爪',
  other: '其他部位'
}

function readClassification(value: unknown): AgentSearchClassificationView | null {
  if (!isRecordValue(value)) {
    return null
  }
  const state = readText(value.state) || 'UNKNOWN'
  const method = readText(value.method) || 'NONE'
  const cutLabel = readText(value.cutLabel) || null
  const cutGroup = readText(value.cutGroup) || null
  const stateLabel = CLASSIFICATION_STATE_LABELS[state] ?? state
  const methodLabel = CLASSIFICATION_METHOD_LABELS[method] ?? method
  const cutGroupLabel =
    (cutGroup && CLASSIFICATION_CUT_GROUP_LABELS[cutGroup]) || cutGroup || ''
  const cut = cutLabel || cutGroupLabel
  const label = [stateLabel, method === 'NONE' ? '' : methodLabel, cut]
    .filter(Boolean)
    .join(' · ')
  return {
    state,
    stateLabel,
    method,
    methodLabel,
    cutLabel,
    cutGroup,
    cutGroupLabel,
    label,
    evidence: readText(value.evidence) || null
  }
}

/** AI 读词条名判出的生熟 / 做法 / 部位 + 依据词；旧后端没有时为 null。 */
export interface AgentSearchClassificationView {
  state: string
  stateLabel: string
  method: string
  methodLabel: string
  cutLabel: string | null
  cutGroup: string | null
  cutGroupLabel: string
  /** 一行展示：生 · 水煮 · 绞肉 */
  label: string
  /** 判断依据词（必须真实出现在词条名里） */
  evidence: string | null
}

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
  /** 服务端 AI 复核判断；旧后端没有时为 null */
  aiVerdict: AgentAiVerdict | null
  /** 「相关 / 存疑 / 不相关」；没有判断时为空串 */
  aiVerdictLabel: string
  aiVerdictTagType: AgentAiVerdictTagType
  /** AI 复核的一句理由（≤40 字）；没有判断时为空串 */
  aiReason: string
  /** AI 分类标签（状态 / 加工方式 / 部位）与依据词；旧后端没有时为 null */
  classification: AgentSearchClassificationView | null
}

/** 查库结果里的部位分组概览（后端 groups 的页面结构）。 */
export interface AgentSearchGroupView {
  key: string
  label: string
  count: number
  states: string[]
  /** 「生」「熟」「生 + 熟」；认不出时为空串 */
  stateLabel: string
  /** 收窄选项 / 页面标签用的「组名（N 条）」 */
  labelWithCount: string
}

/** 「查本地库」这一步的展开内容：关键词、命中词条与匹配方式。 */
export interface AgentSearchEvidenceView {
  /** 本次实际用过的关键词（含中文名扩展出的英文别名） */
  keywords: string[]
  matches: AgentSearchMatchView[]
  /** 后端候选总数（可能大于页面展示的前几条） */
  totalCount: number
  /** AI 复核判为相关的条数；旧后端没有 reviewSummary 时为 null */
  relevantCount: number | null
  /** 部位分组概览：每组给组名 + 条数，页面直接渲染 */
  groups: AgentSearchGroupView[]
  /** 一行分组摘要：牛绞肉 6 条 · 牛里脊 3 条；没有分组时为空串 */
  groupSummary: string
  /** 只有真的命中才是 true；工具 ok 不等于命中 */
  found: boolean
  /** 给人看的一句话：共 N 条候选 · M 条相关 / 没有找到匹配词条 */
  message: string
}

/** 「读来源记录」这一步的展开内容：词条名、来源库、覆盖率与读到的项数。 */
export interface AgentRecordEvidenceView {
  name: string
  /** 来源库代码（USDA / CNF / NZFCD / MEXT / CFCT …）；旧后端没有时为 null */
  sourceType: string | null
  coverage: number | null
  coverageLabel: string
  valueCount: number
  /** 给人看的一句话：来源记录「X」· USDA · 覆盖率 82% · 读到 12 项 */
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
  DICTIONARY: '词典命中',
  AI_TRANSLATION: 'AI 翻译',
  FUZZY: '近似匹配',
  NAME: '名字命中'
}

export function matchMethodLabel(method: string): string {
  if (!method) {
    return '匹配方式未知'
  }
  return MATCH_METHOD_LABELS[method] ?? method
}

/** 已知工具的中文名；新增工具没登记时按原始名显示，不隐藏。 */
const TOOL_LABELS: Record<string, string> = {
  searchLibraries: '查名字',
  loadSkill: '读技能',
  summarizeNames: '汇总名字',
  summarizeByKeyword: '按关键词汇总',
  getRecord: '读来源记录',
  writeNutrition: '写营养',
  writeIngredient: '改原料卡',
  selfCheck: 'AI 自检',
  askUser: '向你提问',
  finish: '结束本轮'
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
  const review = isRecordValue(candidate.review) ? candidate.review : null
  const aiVerdict = isAiVerdict(review?.verdict)
    ? review.verdict
    : isAiVerdict(candidate.aiVerdict)
      ? candidate.aiVerdict
      : null
  const rawReason = readText(review?.reason) || readText(candidate.aiReason)
  const aiReason = aiVerdict
    ? Array.from(rawReason.replace(/\s+/g, ' ')).slice(0, 40).join('')
    : ''
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
    scoreLabel: score === null ? '—' : score.toFixed(2),
    aiVerdict,
    aiVerdictLabel: aiVerdictLabel(aiVerdict),
    aiVerdictTagType: aiVerdictTagType(aiVerdict),
    aiReason,
    classification: readClassification(candidate.classification)
  }
}

const STATE_LABELS: Record<string, string> = {
  RAW: '生',
  COOKED: '熟'
}

/** 后端 groups → 页面结构；认不出的项跳过，不编造条数。 */
export function toSearchGroups(value: unknown): AgentSearchGroupView[] {
  if (!Array.isArray(value)) {
    return []
  }
  const groups: AgentSearchGroupView[] = []
  for (const raw of value) {
    if (!isRecordValue(raw)) {
      continue
    }
    const label = readText(raw.label)
    if (!label) {
      continue
    }
    const key = readText(raw.key) || label
    const count = Math.max(0, Math.floor(readFiniteNumber(raw.count) ?? 0))
    const states = (Array.isArray(raw.states) ? raw.states : [])
      .filter((state): state is string => typeof state === 'string')
      .map((state) => state.trim())
      .filter((state) => state === 'RAW' || state === 'COOKED')
    const stateLabel = states
      .map((state) => STATE_LABELS[state] ?? state)
      .join(' + ')
    groups.push({
      key,
      label,
      count,
      states,
      stateLabel,
      labelWithCount: `${label}（${count} 条）`
    })
  }
  return groups
}

function groupSummaryText(groups: readonly AgentSearchGroupView[]): string {
  return groups.map((group) => `${group.label} ${group.count} 条`).join(' · ')
}

/**
 * 给人看的命中摘要：有分组 / 复核信息时写「共 N 条候选 · M 条相关」，
 * 旧后端没有这些字段时保持「命中 N 条」，不凭空编相关数。
 */
function searchMessage(input: {
  found: boolean
  totalCount: number
  groups: readonly AgentSearchGroupView[]
  relevantCount: number | null
  detailed: boolean
}): string {
  if (!input.found) {
    return '没有找到匹配词条'
  }
  if (!input.detailed) {
    return `命中 ${input.totalCount} 条`
  }
  const relevant =
    input.relevantCount === null ? '' : ` · ${input.relevantCount} 条相关`
  return `共 ${input.totalCount} 条候选${relevant}`
}

/**
 * 从 searchLibraries 的工具结果里读出「匹配依据」。
 *
 * - 关键词同时取后端回传的 keywords 与本次参数里的 keyword；
 * - 只有 found=true 或确有词条才算命中，工具 ok 不算；
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

  // 新工具只返回名字（names）；旧数据仍可能有 candidates，两套都兼容。
  const fromNames = !Array.isArray(record.candidates)
  const rawCandidates = Array.isArray(record.candidates)
    ? record.candidates
    : Array.isArray(record.names)
      ? record.names
      : []
  const matches: AgentSearchMatchView[] = rawCandidates
    .filter((candidate): candidate is AnyArgs => isRecordValue(candidate))
    .map((candidate) =>
      toMatchView(
        fromNames ? { matchedBy: 'NAME', ...candidate } : candidate,
        keywords[0] || ''
      )
    )

  const candidateCount = readFiniteNumber(record.candidateCount)
  const totalCandidates = readFiniteNumber(record.totalCandidates)
  const total = readFiniteNumber(record.total)
  const totalCount =
    totalCandidates === null && candidateCount === null && total === null
      ? matches.length
      : Math.max(
          0,
          Math.floor(totalCandidates ?? candidateCount ?? total ?? 0)
        )
  const groups = toSearchGroups(record.groups)
  const reviewSummary = isRecordValue(record.reviewSummary)
    ? record.reviewSummary
    : null
  const relevantCount =
    reviewSummary === null
      ? null
      : readFiniteNumber(reviewSummary.relevantCount)
  const found =
    record.found === false
      ? false
      : record.found === true || matches.length > 0 || totalCount > 0
  const detailed =
    totalCandidates !== null ||
    total !== null ||
    groups.length > 0 ||
    relevantCount !== null

  return {
    keywords,
    matches,
    totalCount,
    relevantCount,
    groups,
    groupSummary: groupSummaryText(groups),
    found,
    message: searchMessage({
      found,
      totalCount,
      groups,
      relevantCount,
      detailed
    })
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
  totalCandidates?: unknown
  groups?: unknown
  reviewSummary?: unknown
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
  const totalCandidates = readFiniteNumber(input.totalCandidates)
  const totalCount =
    totalCandidates === null && candidateCount === null
      ? matches.length
      : Math.max(0, Math.floor(totalCandidates ?? candidateCount ?? 0))
  const groups = toSearchGroups(input.groups)
  const reviewSummary = isRecordValue(input.reviewSummary)
    ? input.reviewSummary
    : null
  const relevantCount =
    reviewSummary === null
      ? null
      : readFiniteNumber(reviewSummary.relevantCount)
  const found =
    input.found === false
      ? false
      : input.found === true || matches.length > 0 || totalCount > 0
  const detailed =
    totalCandidates !== null || groups.length > 0 || relevantCount !== null

  return {
    keywords,
    matches,
    totalCount,
    relevantCount,
    groups,
    groupSummary: groupSummaryText(groups),
    found,
    message: searchMessage({
      found,
      totalCount,
      groups,
      relevantCount,
      detailed
    })
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
  const sourceType = readText(value.sourceType) || null
  const coverage = readFiniteNumber(value.coverage)
  const coverageLabel = coverage === null ? '—' : `${coverage}%`
  const count = Math.max(0, Math.floor(valueCount))
  return {
    name,
    sourceType,
    coverage,
    coverageLabel,
    valueCount: count,
    message: `来源记录「${name}」· ${sourceType ?? '未知库'} · 覆盖率 ${coverageLabel} · 读到 ${count} 项`
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

/** 查名字：只显示关键词；新工具没有生熟状态参数。 */
function summarizeSearch(args: AnyArgs): string {
  return oneLine(readText(args.keyword) || '（未填关键词）')
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

/** 批量写营养：档案 0 · 12 项（省略档案时显示「自动」） */
function summarizeBatchUpdate(args: AnyArgs): string {
  const profileIndex =
    args.profileIndex === undefined || args.profileIndex === null
      ? '自动'
      : formatValue(args.profileIndex)
  const entries = Array.isArray(args.entries) ? args.entries.length : 0
  return oneLine(`档案 ${profileIndex} · ${entries} 项`)
}

function summarize(name: string, args: AnyArgs): string {
  switch (name) {
    case 'searchLibraries':
      return summarizeSearch(args)
    case 'summarizeNames':
    case 'summarizeByKeyword': {
      const names = Array.isArray(args.names) ? args.names.length : 0
      return oneLine(`${names} 条名字`)
    }
    case 'getRecord': {
      const id = readText(args.id) || readText(args.sourceRecordId)
      return oneLine(id || '（未填来源记录）')
    }
    case 'writeNutrition':
      return summarizeBatchUpdate(args)
    case 'writeIngredient':
      return summarizeIngredientFields(asRecord(args.fields))
    case 'selfCheck':
      return '检查整份草稿'
    case 'askUser':
      return oneLine(readText(args.question) || '（未填问题）')
    case 'finish':
      return oneLine(readText(args.summary) || '结束本轮')
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
      name === 'searchLibraries' && ok ? toSearchEvidence(call?.result, args) : null
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
