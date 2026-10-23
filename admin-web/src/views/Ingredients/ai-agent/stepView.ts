/**
 * Agent 工具调用的展示层映射。
 *
 * 后端返回的是英文工具名 + 原始参数（`toolCalls`）；页面要给人看的是
 * 「查本地库：鸡肝 · 生」「写字段：粗蛋白 = 19.5 g」这样的一行。
 * 这里只做纯函数映射，不请求、不依赖 DOM，方便直接测试。
 */
import type { AgentToolCallRecord } from '@/types/ingredientCreation'
import { findNutritionField } from '@/utils/recipeDesigner/nutritionFieldCatalog'

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
}

/** 已知工具的中文名；新增工具没登记时按原始名显示，不隐藏。 */
const TOOL_LABELS: Record<string, string> = {
  searchLocalNutrition: '查本地库',
  getNutritionRecord: '读来源记录',
  updateNutritionField: '写字段',
  updateNutritionFields: '批量写字段',
  updateIngredientFields: '改原料卡',
  runCheck: '跑终检'
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
    const label = TOOL_LABELS[name] ?? name
    const summary = summarize(name, asRecord(call?.args))
    const view: AgentStepView = {
      name,
      label,
      summary,
      ok: call?.ok === true
    }
    if (typeof call?.error === 'string' && call.error) {
      view.error = call.error
    }
    return view
  })
}
