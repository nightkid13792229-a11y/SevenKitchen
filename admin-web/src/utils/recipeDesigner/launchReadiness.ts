/**
 * 上线检查（共享发布门槛）展示辅助函数。
 *
 * 后端 `GET /recipe-designer/drafts/:id/launch-readiness` 与产品线发布、
 * 订单「加入待提交」使用同一套判断；这里只负责把结果转成后台可读的文案，
 * 不参与任何门槛计算，避免前后端两套口径。
 */
import type {
  DraftLaunchReadiness,
  DraftLaunchReadinessSummary,
  LaunchReadinessIssue
} from '@/types/recipeDesigner'

/** 后端字段路径 / 字段名 → 后台可读名 */
export const LAUNCH_READINESS_FIELD_LABELS: Record<string, string> = {
  name: '名称',
  items: '原料',
  preparationMethod: '预处理方式',
  supplementTargets: '补剂目标',
  assessment: '配方评估',
  totalWeightG: '总重量',
  energyDensityKcalPerKg: '能量密度',
  nutritionReport: '营养报告',
  productionStepsJson: '制作步骤',
  reviewNote: '审核说明',
  nutritionData: '营养数据',
  nutrition: '营养指标'
}

export type LaunchReadinessSummaryTone = 'default' | 'success' | 'danger'

export interface LaunchReadinessSummaryRow {
  key: string
  label: string
  value: string
  tone: LaunchReadinessSummaryTone
}

/** 设计模式中文名：历史系列缺省为产品线（与后端默认一致） */
export function launchReadinessModeLabel(
  designMode?: string | null
): string {
  const normalized = String(designMode ?? '').trim().toUpperCase()
  if (normalized === 'ORDER') return '本单设计'
  if (normalized === 'CATALOG') return '产品线'
  return designMode?.trim() || '产品线'
}

/** 抽屉标题旁的状态文案 */
export function launchReadinessStatusLabel(ready: boolean): string {
  return ready ? '可以上线' : '有阻断项'
}

/** 抽屉总览的一句话结论 */
export function launchReadinessStatusSummary(
  readiness: Pick<DraftLaunchReadiness, 'ready' | 'blockers' | 'warnings'>
): string {
  if (readiness.ready) {
    return readiness.warnings.length > 0
      ? `没有阻断项，有 ${readiness.warnings.length} 条提醒`
      : '没有阻断项，可以进入下一步'
  }
  return `发现 ${readiness.blockers.length} 项阻断，暂时不能进入下一步`
}

/** 模式说明：明确订单与产品线共用共享门槛，订单分支专属检查尚未接入 */
export function launchReadinessModeNote(
  designMode?: string | null
): string {
  if (String(designMode ?? '').trim().toUpperCase() === 'ORDER') {
    return '本单设计与产品线发布共用同一套上线门槛；订单分支专属检查（订单状态、交付数量等）暂未接入。'
  }
  return '产品线发布使用共享上线门槛；本单设计同样使用这一套门槛，订单分支专属检查暂未接入。'
}

function formatDecimal(value: number, fractionDigits: number): string {
  return Number(value.toFixed(fractionDigits)).toString()
}

/** 总重量：小于 1kg 用 g，1kg 以上用 kg（保留两位） */
export function formatLaunchWeightG(value: number | null | undefined): string {
  const weight = Number(value)
  if (!Number.isFinite(weight) || weight <= 0) return '0 g'
  if (weight >= 1000) {
    return `${(weight / 1000).toFixed(2)} kg`
  }
  return `${formatDecimal(weight, 1)} g`
}

/** 能量密度：缺失显示破折号，不把 null 伪造成 0 */
export function formatLaunchEnergyDensity(
  value: number | null | undefined
): string {
  if (value === null || value === undefined) return '—'
  const energy = Number(value)
  if (!Number.isFinite(energy)) return '—'
  return `${Math.round(energy)} kcal/kg`
}

/** 概要区六项：原料 / 重量 / 能量 / 补剂 / 步骤 / 报告 */
export function buildLaunchSummaryRows(
  summary: DraftLaunchReadinessSummary
): LaunchReadinessSummaryRow[] {
  return [
    {
      key: 'itemCount',
      label: '参与评估项',
      value: `${summary.itemCount} 项`,
      tone: 'default'
    },
    {
      key: 'foodItemCount',
      label: '参与评估食材',
      value: `${summary.foodItemCount} 种`,
      tone: 'default'
    },
    {
      key: 'energyDensityKcalPerKg',
      label: '能量密度（每kg成品）',
      value: formatLaunchEnergyDensity(summary.energyDensityKcalPerKg),
      tone: 'default'
    },
    {
      key: 'supplementCount',
      label: '参与评估补剂',
      value: `${summary.supplementCount} 种`,
      tone: 'default'
    },
    {
      key: 'stepCount',
      label: '制作步骤',
      value: `${summary.stepCount} 步`,
      tone: 'default'
    },
    {
      key: 'reportAvailable',
      label: '完整营养报告',
      value: summary.reportAvailable ? '可生成' : '不可生成',
      tone: summary.reportAvailable ? 'success' : 'danger'
    }
  ]
}

/** 阻断 / 提醒的字段提示；未知字段原样展示，便于后端新增时定位 */
export function launchIssueFieldLabel(
  field?: string | null
): string | null {
  const normalized = String(field ?? '').trim()
  if (!normalized) return null
  return LAUNCH_READINESS_FIELD_LABELS[normalized] ?? normalized
}

/** 阻断 / 提醒的原料提示；长 id 只展示前 8 位，完整值仍在 title 中 */
export function launchIssueItemLabel(
  itemId?: string | null
): string | null {
  const normalized = String(itemId ?? '').trim()
  if (!normalized) return null
  return normalized.length > 8
    ? `原料 #${normalized.slice(0, 8)}`
    : `原料 #${normalized}`
}

/** 兼容未来在 issue 上增加更多定位字段时的统一入口 */
export function launchIssueLocationHint(
  issue: Pick<LaunchReadinessIssue, 'field' | 'itemId'>
): string {
  return [
    launchIssueFieldLabel(issue.field),
    launchIssueItemLabel(issue.itemId)
  ]
    .filter(Boolean)
    .join(' · ')
}
