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
  LaunchReadinessIssue,
  LaunchReadinessScope
} from '@/types/recipeDesigner'

/** 后端字段路径 / 字段名 → 后台可读名 */
export const LAUNCH_READINESS_FIELD_LABELS: Record<string, string> = {
  name: '名称',
  items: '原料',
  preparationMethod: '部位 / 状态 / 预处理',
  supplementTargets: '补剂目标',
  assessment: '配方评估',
  totalWeightG: '总重量',
  energyDensityKcalPerKg: '能量密度',
  nutritionReport: '营养报告',
  productionStepsJson: '制作步骤',
  reviewNote: '审核说明',
  nutritionData: '营养数据',
  nutrition: '营养指标',
  coverImageUrl: '封面图',
  coverTitle: '封面标题',
  description: '详情描述',
  sellingPoint: '一句话卖点',
  applicableLifeStages: '适用生命阶段',
  targetHealthTags: '目标健康标签',
  'series.orderId': '订单号',
  'series.orderQuantity': '本单份数',
  customerDogId: '顾客爱犬'
}

/** 问题归属的固定展示顺序：公共 → 展示 → 当前分支 */
export const LAUNCH_READINESS_SCOPE_ORDER: LaunchReadinessScope[] = [
  'COMMON',
  'PRESENTATION',
  'CATALOG',
  'ORDER'
]

export const LAUNCH_READINESS_SCOPE_LABELS: Record<
  LaunchReadinessScope,
  string
> = {
  COMMON: '共用',
  PRESENTATION: '展示资料',
  CATALOG: '产品线',
  ORDER: '订单'
}

/** 旧响应没有 scope 时按 COMMON 处理，未知值也不丢问题 */
export function resolveLaunchIssueScope(
  scope?: string | null
): LaunchReadinessScope {
  const normalized = String(scope ?? '').trim().toUpperCase()
  return LAUNCH_READINESS_SCOPE_ORDER.includes(
    normalized as LaunchReadinessScope
  )
    ? (normalized as LaunchReadinessScope)
    : 'COMMON'
}

export function launchReadinessScopeLabel(scope?: string | null): string {
  return LAUNCH_READINESS_SCOPE_LABELS[resolveLaunchIssueScope(scope)]
}

/** 当前设计模式需要展示哪些归属（按固定顺序） */
export function launchReadinessScopesForDesign(
  designMode?: string | null
): LaunchReadinessScope[] {
  const branch: LaunchReadinessScope =
    String(designMode ?? '').trim().toUpperCase() === 'ORDER'
      ? 'ORDER'
      : 'CATALOG'
  return ['COMMON', 'PRESENTATION', branch]
}

export interface LaunchReadinessIssueGroup<
  TIssue extends Pick<LaunchReadinessIssue, 'scope'>
> {
  scope: LaunchReadinessScope
  label: string
  issues: TIssue[]
}

/**
 * 按归属分组（共用 / 展示资料 / 产品线 或 订单）。
 * 空分组不返回，避免抽屉里出现一排「0 项」。
 */
export function groupLaunchReadinessIssues<
  TIssue extends Pick<LaunchReadinessIssue, 'scope'>
>(
  issues: TIssue[],
  designMode?: string | null
): LaunchReadinessIssueGroup<TIssue>[] {
  const allowedScopes = launchReadinessScopesForDesign(designMode)
  return allowedScopes
    .map((scope) => ({
      scope,
      label: LAUNCH_READINESS_SCOPE_LABELS[scope],
      issues: issues.filter(
        (issue) => resolveLaunchIssueScope(issue.scope) === scope
      )
    }))
    .filter((group) => group.issues.length > 0)
}

export interface LaunchPassedCheck {
  code: string
  label: string
  scope: LaunchReadinessScope
  scopeLabel: string
}

/**
 * 「已通过」清单：按阻断 / 提醒代码反推。
 *
 * 分支专属项只在对应分支展示：产品线看描述 / 卖点 / 生命阶段 / 健康标签，
 * 订单看订单号 / 份数 / 顾客爱犬。这样列表不会出现「订单设计已通过详情描述」
 * 这种没有意义的通过项。
 */
const LAUNCH_PASSED_CHECK_DEFINITIONS: Array<
  Omit<LaunchPassedCheck, 'scopeLabel'>
> = [
  { code: 'NAME_REQUIRED', label: '食谱名称已填写', scope: 'COMMON' },
  { code: 'NO_INCLUDED_ITEMS', label: '已有参与评估的原料', scope: 'COMMON' },
  { code: 'ASSESSMENT_UNAVAILABLE', label: '配方评估已完成', scope: 'COMMON' },
  { code: 'TOTAL_WEIGHT_INVALID', label: '配方总重量正常', scope: 'COMMON' },
  { code: 'ENERGY_DENSITY_INVALID', label: '能量密度正常', scope: 'COMMON' },
  {
    code: 'NUTRITION_REPORT_UNAVAILABLE',
    label: '完整营养报告可生成',
    scope: 'COMMON'
  },
  {
    code: 'SUPPLEMENT_TARGETS_REQUIRED',
    label: '补剂目标完整',
    scope: 'COMMON'
  },
  {
    code: 'PREPARATION_METHOD_REQUIRED',
    label: '部位/状态/预处理完整',
    scope: 'COMMON'
  },
  { code: 'PRODUCTION_STEPS_REQUIRED', label: '制作步骤已填写', scope: 'COMMON' },
  {
    code: 'COVER_IMAGE_REQUIRED',
    label: '封面图已上传',
    scope: 'PRESENTATION'
  },
  {
    code: 'COVER_TITLE_REQUIRED',
    label: '封面标题已填写',
    scope: 'PRESENTATION'
  },
  {
    code: 'DESCRIPTION_REQUIRED',
    label: '详情描述已填写',
    scope: 'CATALOG'
  },
  {
    code: 'TAXONOMY_REQUIRED',
    label: '已归类（至少一个需求分类）',
    scope: 'CATALOG'
  },
  {
    code: 'SELLING_POINT_REQUIRED',
    label: '一句话卖点已填写',
    scope: 'CATALOG'
  },
  {
    code: 'APPLICABLE_LIFE_STAGES_REQUIRED',
    label: '适用生命阶段已选择',
    scope: 'CATALOG'
  },
  {
    code: 'TARGET_HEALTH_TAGS_MISSING',
    label: '目标健康标签已设置',
    scope: 'CATALOG'
  },
  { code: 'ORDER_ID_REQUIRED', label: '订单已绑定', scope: 'ORDER' },
  { code: 'ORDER_QUANTITY_INVALID', label: '本单份数有效', scope: 'ORDER' },
  {
    code: 'CUSTOMER_DOG_REQUIRED',
    label: '顾客爱犬已绑定',
    scope: 'ORDER'
  }
]

export function buildLaunchPassedChecks(
  readiness: Pick<
    DraftLaunchReadiness,
    'blockers' | 'warnings' | 'designMode'
  >
): LaunchPassedCheck[] {
  const blockerCodes = new Set<string>(
    readiness.blockers.map((item) => item.code)
  )
  const warningCodes = new Set<string>(
    readiness.warnings.map((item) => item.code)
  )
  const scopes = new Set(launchReadinessScopesForDesign(readiness.designMode))

  return LAUNCH_PASSED_CHECK_DEFINITIONS.filter(
    (check) =>
      scopes.has(check.scope) &&
      !blockerCodes.has(check.code) &&
      !warningCodes.has(check.code)
  ).map((check) => ({
    ...check,
    scopeLabel: LAUNCH_READINESS_SCOPE_LABELS[check.scope]
  }))
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

/** 模式说明：公共门槛两种设计都适用，分支专属检查按设计模式区分 */
export function launchReadinessModeNote(
  designMode?: string | null
): string {
  if (String(designMode ?? '').trim().toUpperCase() === 'ORDER') {
    return '公共门槛 + 展示资料 + 订单信息共同决定能否加入本单待提交；产品线上架文案不参与本单检查。'
  }
  return '公共门槛 + 展示资料 + 上架文案共同决定能否发布到产品线；订单信息不参与产品线检查。'
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
  value: number | null | undefined,
  unit = 'kcal/kg'
): string {
  if (value === null || value === undefined) return '—'
  const energy = Number(value)
  if (!Number.isFinite(energy)) return '—'
  return `${Math.round(energy)} ${unit}`
}

/** 概要能量密度：优先干物质，缺失时才回退成品值 */
export function resolveLaunchEnergyDensity(
  summary: Pick<
    DraftLaunchReadinessSummary,
    'dryMatterEnergyDensityKcalPerKg' | 'energyDensityKcalPerKg'
  >
): { value: string; basis: 'DM' | 'AS_FED' | 'MISSING' } {
  const dm = summary.dryMatterEnergyDensityKcalPerKg
  if (dm !== null && dm !== undefined && Number.isFinite(Number(dm))) {
    return {
      value: formatLaunchEnergyDensity(dm, 'kcal/kg DM'),
      basis: 'DM'
    }
  }
  return {
    value: formatLaunchEnergyDensity(summary.energyDensityKcalPerKg),
    basis:
      summary.energyDensityKcalPerKg === null ||
      summary.energyDensityKcalPerKg === undefined
        ? 'MISSING'
        : 'AS_FED'
  }
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
      label: '能量密度（每kg干物质）',
      value: resolveLaunchEnergyDensity(summary).value,
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
