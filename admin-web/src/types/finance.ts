export type FinanceRangePreset = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'

export type ExpenseBillStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED'

export interface FinanceOverview {
  cashIn: number
  operatingRevenue: number
  actualExpense: number
  operatingBalance: number
  cashOut: number
  netCashflow: number
  pendingPayables: number
}

export interface ExpenseBillItem {
  id: string
  billNumber: string
  title: string
  category: string
  status: ExpenseBillStatus
  payeeName: string
  amount: number
  dueAt: string
  recognitionStart: string
  recognitionEnd: string
}

export interface ExpenseAnalysisCategory {
  category: string
  label: string
  amount: number
  deltaRate?: number
}

export interface ExpenseAnalysis {
  categories: ExpenseAnalysisCategory[]
}

export interface ContributionAnalysisRow {
  orderId?: string
  groupKey: string
  revenue: number
  contributionCost: number
  label: string
  isEstimatedCost?: boolean
}

export interface FinanceAlertItem {
  type: string
  category: string
  message: string
}

export interface CreateExpenseBillPayload {
  title: string
  category: string
  amount: number
  payeeName: string
  recognitionStart: string
  recognitionEnd: string
  dueAt: string
  templateId?: string
  note?: string
}

export interface RecordExpensePaymentPayload {
  paidAmount: number
  paidAt: string
  paymentMethod: string
  paymentProofUrls: string[]
  note?: string
}
