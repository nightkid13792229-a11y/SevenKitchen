import api from './index'

export interface SupplementDashboard {
  date: string
  todayCreated: number
  todayPaid: number
  pendingSchedule: number
  todayPacking: number
  toShip: number
  openAftersale: number
  refundAmountMonth: number | null
  byStatus: Record<string, number>
  configHints: {
    dailyCutoffTime: string
    dailyPackingCapacity: number
    autoScheduleEnabled: boolean
  } | null
}

export const supplementDashboardApi = {
  get: (): Promise<SupplementDashboard> =>
    api.get('/admin/supplement-shop/dashboard'),
}
