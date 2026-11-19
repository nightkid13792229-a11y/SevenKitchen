import type {
  CreateExpenseTemplatePayload,
  FinanceExpenseCategory,
  FinanceExpenseInterval,
  FinanceExpensePayerType,
} from '../../api/staff-finance'

/**
 * 固定费用页的纯逻辑（不碰 uni API），给页面和回归测试共用。
 *
 * 放在模块里而不是页面内，是为了让「月付只能是 1 个月、季付 3 个月要能原样存回」
 * 这类会造成算错钱的规则能被真正执行断言，而不是只 grep 源码字符串。
 */

export type TemplateFormState = {
  name: string
  category: FinanceExpenseCategory
  /** 元，已校验过 > 0、最多两位小数 */
  amount: number
  interval: FinanceExpenseInterval
  /** 1-31 */
  dayOfMonth: number
  servicePeriodMonths: number
  payerType: FinanceExpensePayerType
  /** 年付的月份（1-12）；非年付忽略 */
  monthOfYear?: number
  /** 编辑时用于沿用原标题/收款方；新建传 null */
  editing?: {
    name: string
    titleTemplate: string
    payeeName: string
  } | null
}

/**
 * 切换周期后的「服务期月数」输入值。
 *
 * - MONTHLY：固定 1。月租按 12 个月平摊会把 5000 算成 416，必须拦住；
 * - QUARTERLY：默认 3（季税费本来就摊 3 个月），允许 1-3；
 *   从年付 12 切过来时收敛到 3，填过 2/3 的保留；
 * - YEARLY：默认 12，已经填过其他值的保留，仍可手改。
 */
export function serviceMonthsForInterval(
  interval: FinanceExpenseInterval,
  currentText: string,
): string {
  const text = currentText.trim()
  const parsed = Number(text)
  const valid = /^\d+$/.test(text) && Number.isInteger(parsed) && parsed >= 1

  if (interval === 'MONTHLY') return '1'

  if (interval === 'QUARTERLY') {
    if (!valid || parsed === 1 || parsed > 3) return '3'
    return String(parsed)
  }

  if (!valid || parsed === 1) return '12'
  return String(parsed)
}

/**
 * 打开编辑时的「服务期月数」：沿用库里存的原值，不要强改。
 *
 * - MONTHLY：只能是 1（老数据若被写成 12，展示成 1，保存后顺手修正）；
 * - QUARTERLY：季付 3 个月是合法用法，原样带出，往返保存不改写；
 * - YEARLY：原样带出；老数据缺失时默认 12。
 */
export function serviceMonthsForEdit(
  interval: FinanceExpenseInterval,
  saved: number | string | null | undefined,
): string {
  const value = Number(saved)
  if (interval === 'MONTHLY') return '1'
  if (Number.isInteger(value) && value >= 1 && value <= 120) {
    return String(value)
  }
  return interval === 'QUARTERLY' ? '3' : '12'
}

/**
 * 组装新建/编辑模板入参：字段名与后端 `CreateExpenseTemplateDto` 一致。
 *
 * - 后端必填 `titleTemplate` / `payeeName`，表单不采集：新建时标题用
 *   「名称 + 年月」，收款方与名称一致；编辑时名称没改就沿用原标题、
 *   保留后台填的收款方，不覆盖。
 * - 只有 MONTHLY 强制 `servicePeriodMonths = 1`；季付/年付原样提交，
 *   否则季税费的 3 个月服务期会被改掉，账就摊错了。
 * - 年付才带 `monthOfYear`（必填），月付/季付不传。
 */
export function buildTemplateFormPayload(
  form: TemplateFormState,
): CreateExpenseTemplatePayload {
  const editing = form.editing ?? null
  const payload: CreateExpenseTemplatePayload = {
    name: form.name,
    titleTemplate:
      editing && editing.name === form.name
        ? editing.titleTemplate
        : `${form.name} {{year}}年{{month}}月`,
    category: form.category,
    payeeName: editing?.payeeName || form.name,
    defaultAmount: form.amount,
    interval: form.interval,
    dayOfMonth: form.dayOfMonth,
    servicePeriodMonths:
      form.interval === 'MONTHLY' ? 1 : form.servicePeriodMonths,
    payerType: form.payerType,
  }
  if (form.interval === 'YEARLY') payload.monthOfYear = form.monthOfYear
  return payload
}
