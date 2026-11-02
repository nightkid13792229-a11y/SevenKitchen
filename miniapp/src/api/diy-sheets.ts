/**
 * DIY 制作单接口（补剂下单页的"快速改分装"用）。
 *
 * 为什么单独一个文件：制作单原本只有 DIY 配置页在读写，那里直接用 request；
 * 现在下单页也要读它的分装、并且只改分装，所以把这两个调用收在这里，
 * 免得两个页面各写一份 url。
 */
import { request } from '../utils/api'

export interface DIYSheetPackagePlanRow {
  packageSpecG: number
  packageCount: number
}

export interface DIYSheetSummary {
  id: string
  recipeId: string
  recipeName: string
  dogId: string
  dogName: string
  perMealG: number
  dailyIntakeG: number
  packagePlan?: DIYSheetPackagePlanRow[]
}

/** 我的全部制作单（下单页按 id 取出当前那张） */
export function fetchMyDiySheets() {
  return request<DIYSheetSummary[]>({
    url: '/user/diy-sheets',
    method: 'GET',
    // 错误由下单页行内展示，网络层不再弹 toast
    suppressErrorToast: true
  } as any)
}

/**
 * 只改分装规格。
 * 服务端按新旧总重比例缩放采购清单；已冻结（下过单）的制作单会新建一张，
 * 所以返回的 id 可能和传进去的不一样 —— 调用方必须用返回值覆盖本地 id。
 */
export function updateDiySheetPlan(
  sheetId: string,
  packagePlan: DIYSheetPackagePlanRow[]
) {
  return request<DIYSheetSummary>({
    url: `/user/diy-sheets/${sheetId}/plan`,
    method: 'PATCH',
    data: { packagePlan },
    suppressErrorToast: true
  } as any)
}
