export function formatFinancialAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '-'
  }

  const amount = Number(value)
  const prefix = amount < 0 ? '-¥' : '¥'
  return `${prefix}${Math.abs(amount).toFixed(2)}`
}

export function getAdjustmentText(amount: number | null | undefined): string {
  const value = Number(amount || 0)
  if (value < 0) {
    return `建议退差价 ${formatFinancialAmount(Math.abs(value))}`
  }
  if (value > 0) {
    return `建议补收 ${formatFinancialAmount(value)}`
  }
  return '无需调整'
}

export function getAdjustmentTagType(
  amount: number | null | undefined,
): 'success' | 'warning' | 'danger' {
  const value = Number(amount || 0)
  if (value < 0) return 'warning'
  if (value > 0) return 'danger'
  return 'success'
}

export interface PendingAdjustmentSummary {
  pendingExtraPaymentAmount?: number | null
  pendingRefundAmount?: number | null
}

export function getPendingAdjustmentAmount(
  summary: PendingAdjustmentSummary | null | undefined,
): number {
  const pendingExtraPayment = Number(summary?.pendingExtraPaymentAmount || 0)
  const pendingRefund = Number(summary?.pendingRefundAmount || 0)
  return pendingExtraPayment - pendingRefund
}

export function getPendingAdjustmentText(
  summary: PendingAdjustmentSummary | null | undefined,
): string {
  const value = getPendingAdjustmentAmount(summary)
  if (value < 0) {
    return `待退差价 ${formatFinancialAmount(Math.abs(value))}`
  }
  if (value > 0) {
    return `待补差价 ${formatFinancialAmount(value)}`
  }
  return '差价已处理'
}

export function getPendingAdjustmentTagType(
  summary: PendingAdjustmentSummary | null | undefined,
): 'success' | 'warning' | 'danger' {
  return getAdjustmentTagType(getPendingAdjustmentAmount(summary))
}
