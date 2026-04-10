import { analyticsApi } from '../api/analytics'
import { getBaseUrl } from './config'

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

export function shouldTrackDogProfileAnalyticsForBaseUrl(baseUrl: string) {
  return !baseUrl.includes('api.sevenkitchen.cloud/api/v1')
}

export async function trackDogProfileEvent(
  eventName: string,
  payload: Record<string, any>,
) {
  if (analyticsEndpointUnavailable) {
    return
  }

  if (!shouldTrackDogProfileAnalyticsForBaseUrl(getBaseUrl())) {
    analyticsEndpointUnavailable = true
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
