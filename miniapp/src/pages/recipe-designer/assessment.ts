import {
  FEDIAF_DOG_SCENARIO_LABELS,
  type FediafDogScenario,
} from '../../api/recipe-designer'

export type AssessmentEntryStatus = 'MISSING_DATA' | 'DEFICIENT' | 'EXCESS' | 'COMPLIANT'
export type AssessmentOverallStatus = 'INCOMPLETE' | 'NON_COMPLIANT' | 'COMPLIANT'
export type AssessmentStatus = AssessmentEntryStatus | AssessmentOverallStatus

export interface AssessmentSummaryLike {
  compliant?: number
  deficient?: number
  excess?: number
  missingData?: number
  compliantCount?: number
  deficientCount?: number
  excessCount?: number
  missingDataCount?: number
}

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentEntryStatus, string> = {
  MISSING_DATA: '缺数据',
  DEFICIENT: '缺口',
  EXCESS: '超标',
  COMPLIANT: '达标',
}

export const OVERALL_STATUS_LABELS: Record<AssessmentOverallStatus, string> = {
  INCOMPLETE: '资料不完整',
  NON_COMPLIANT: '未达标/需审核',
  COMPLIANT: '已达标',
}

export function getAssessmentStatusLabel(status?: string) {
  return ASSESSMENT_STATUS_LABELS[status as AssessmentEntryStatus] || '待评估'
}

export function getOverallStatusLabel(status?: string) {
  return OVERALL_STATUS_LABELS[status as AssessmentOverallStatus] || '待评估'
}

export function getAssessmentStatusClass(status?: string) {
  const map: Record<AssessmentStatus, string> = {
    INCOMPLETE: 'status-missing',
    NON_COMPLIANT: 'status-deficient',
    MISSING_DATA: 'status-missing',
    DEFICIENT: 'status-deficient',
    EXCESS: 'status-excess',
    COMPLIANT: 'status-compliant',
  }
  return map[status as AssessmentStatus] || 'status-pending'
}

export function getScenarioLabel(scenario?: string) {
  return FEDIAF_DOG_SCENARIO_LABELS[scenario as FediafDogScenario] || scenario || '未设置'
}

export function getSummaryCount(summary: AssessmentSummaryLike | undefined, key: keyof AssessmentSummaryLike) {
  if (!summary) return 0
  const value = summary[key]
  return typeof value === 'number' ? value : 0
}

export function normalizeAssessmentSummary(summary?: AssessmentSummaryLike) {
  return {
    compliant: getSummaryCount(summary, 'compliant') || getSummaryCount(summary, 'compliantCount'),
    deficient: getSummaryCount(summary, 'deficient') || getSummaryCount(summary, 'deficientCount'),
    excess: getSummaryCount(summary, 'excess') || getSummaryCount(summary, 'excessCount'),
    missingData: getSummaryCount(summary, 'missingData') || getSummaryCount(summary, 'missingDataCount'),
  }
}
