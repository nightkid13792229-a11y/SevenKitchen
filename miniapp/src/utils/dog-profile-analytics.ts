import { analyticsApi } from '../api/analytics'

let analyticsEndpointUnavailable = false

export function buildDogProfileEventPayload(
  eventName: string,
  payload: Record<string, any>,
) {
  return {
    eventName,
    ...payload,
  }
}

/**
 * 建档埋点上报。
 *
 * 背景（2026-09-21 复盘）：这里原有一段 `shouldTrackDogProfileAnalyticsForBaseUrl`
 * 判断 —— 只要接口域名是正式域名就整体跳过上报。而正式构建的域名是固定的，
 * 结果是**线上用户的建档行为一条都没记录**，后台「狗档案转化分析」在生产恒为 0。
 * 当时加这个开关是因为后端路由还没部署；现在路由、表、migration 都已就绪，故移除。
 *
 * 仍然保留「接口不可用就停止上报」的兜底（避免在缺路由的环境里反复空跑），
 * 但触发条件从「域名是生产域名」收窄为「接口确实返回 404 / 路由不存在」。
 */
export async function trackDogProfileEvent(
  eventName: string,
  payload: Record<string, any>,
) {
  if (analyticsEndpointUnavailable) {
    return
  }

  try {
    await analyticsApi.trackDogProfileEvent(
      buildDogProfileEventPayload(eventName, payload),
    )
  } catch (error) {
    if (isUnsupportedDogProfileAnalyticsError(error)) {
      analyticsEndpointUnavailable = true
      return
    }

    console.warn('[DogProfileAnalytics] track failed', eventName, error)
  }
}

export function isUnsupportedDogProfileAnalyticsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return (
    message.includes('Cannot POST /api/v1/analytics/dog-profile/events')
    || message.includes('404')
  )
}
