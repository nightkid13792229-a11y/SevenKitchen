import type {
  CreateExpenseTemplatePayload,
  FinanceExpenseCategory,
  FinanceExpenseInterval,
  FinanceExpensePayerType,
} from '../../api/staff-finance'

/**
 * 固定费用页的纯逻辑（不碰 uni API），给页面和回归测试共用。
 *
 * 放在模块里而不是页面内，是为了让「年付切回月付，保存的服务期必须是 1」
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
 * 切周期后的「服务期月数」输入值。
 *
 * - 切到年付：默认 12（已经手改过的保留原值）；
 * - 切到月付/季付：一律回到 1。否则 5000 的月租会按 12 个月平摊，
 *   首页支出只算 416 块，账就错了。
 */
export function serviceMonthsForInterval(
  interval: FinanceExpenseInterval,
  currentText: string,
): string {
  if (interval === 'YEARLY') {
    return currentText.trim() === '1' ? '12' : currentText
  }
  return '1'
}

/**
 * 组装新建/编辑模板入参：字段名与后端 `CreateExpenseTemplateDto` 一致。
 *
 * - 后端必填 `titleTemplate` / `payeeName`，表单不采集：新建时标题用
 *   「名称 + 年月」，收款方与名称一致；编辑时名称没改就沿用原标题、
 *   保留后台填的收款方，不覆盖。
 * - 非年付强制 `servicePeriodMonths = 1`：页面已校验，这里再兜一层，
 *   防止任何调用方把月付写成 12。
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
      form.interval === 'YEARLY' ? form.servicePeriodMonths : 1,
    payerType: form.payerType,
  }
  if (form.interval === 'YEARLY') payload.monthOfYear = form.monthOfYear
  return payload
}

type DueTemplateShape = {
  isActive: boolean
  interval: FinanceExpenseInterval
  monthOfYear: number | null
}

/**
 * 某月按周期「应该生成」的启用模板（规则与后端
 * `ExpenseTemplateService.isTemplateDueInMonth` 一致）：
 * 月付每月；季付 1/4/7/10 月；年付只看 `monthOfYear`。
 *
 * 补生成返回 created=0 时用它区分「都已生成」和「本来就没有要生成的」，
 * 后者不能骗用户说「本月都已生成」。
 */
export function dueTemplatesForMonth<T extends DueTemplateShape>(
  templates: readonly T[],
  month: string,
): T[] {
  const monthNumber = Number(month.slice(5, 7))
  return templates.filter((template) => {
    if (!template.isActive) return false
    if (template.interval === 'MONTHLY') return true
    if (template.interval === 'QUARTERLY') return (monthNumber - 1) % 3 === 0
    if (template.interval === 'YEARLY') {
      return Number(template.monthOfYear) === monthNumber
    }
    return false
  })
}
