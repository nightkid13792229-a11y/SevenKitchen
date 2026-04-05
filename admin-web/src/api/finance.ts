import api from './index'
import type {
  ContributionAnalysisRow,
  CreateExpenseBillPayload,
  ExpenseAnalysis,
  ExpenseBillItem,
  FinanceAlertItem,
  FinanceOverview,
  FinanceRangePreset,
  RecordExpensePaymentPayload
} from '@/types/finance'

const defaultParams = (preset: FinanceRangePreset, extra?: Record<string, unknown>) => ({
  preset,
  timezone: 'Asia/Shanghai',
  ...extra
})

export const financeApi = {
  getOverview: (preset: FinanceRangePreset): Promise<FinanceOverview> =>
    api.get('/admin/finance/overview', { params: defaultParams(preset) }),

  getExpenseBills: (preset: FinanceRangePreset): Promise<ExpenseBillItem[]> =>
    api.get('/admin/finance/expense-bills', { params: defaultParams(preset) }),

  createExpenseBill: (data: CreateExpenseBillPayload): Promise<ExpenseBillItem> =>
    api.post('/admin/finance/expense-bills', data),

  recordExpensePayment: (
    id: string,
    data: RecordExpensePaymentPayload
  ): Promise<ExpenseBillItem> =>
    api.post(`/admin/finance/expense-bills/${id}/payments`, data),

  getExpenseAnalysis: (preset: FinanceRangePreset): Promise<ExpenseAnalysis> =>
    api.get('/admin/finance/expense-analysis', { params: defaultParams(preset) }),

  getContributionAnalysis: (
    preset: FinanceRangePreset,
    groupBy: 'ORDER' | 'RECIPE'
  ): Promise<ContributionAnalysisRow[]> =>
    api.get('/admin/finance/contribution-analysis', {
      params: defaultParams(preset, { groupBy })
    }),

  getAlerts: (preset: FinanceRangePreset): Promise<FinanceAlertItem[]> =>
    api.get('/admin/finance/alerts', { params: defaultParams(preset) })
}

export default financeApi
