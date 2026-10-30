import api from './index'

export interface WorkbenchBadges {
  purchasing: number
  production: number
  orders: number
  supplementOrders: number
  reimbursement: number
  inventory: number
}

export interface WorkbenchSummary {
  todayOrders: number
  pendingTasks: number
  shippingCount: number
  badges: WorkbenchBadges
}

/**
 * 员工端工作台汇总（管理员也能调，StaffGuard 允许 STAFF/ADMIN）。
 * 后台左侧菜单只复用它已有的待办数字，不另造一套统计。
 */
export const workbenchApi = {
  summary: (): Promise<WorkbenchSummary> =>
    api.get('/staff/workbench/summary'),
}
