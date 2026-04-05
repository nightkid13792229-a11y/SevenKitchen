import { analyticsApi } from '../api/analytics'

export function buildDogProfileEventPayload(
  eventName: string,
  payload: Record<string, any>,
) {
  return {
    eventName,
    ...payload,
  }
}

export async function trackDogProfileEvent(
  eventName: string,
  payload: Record<string, any>,
) {
  try {
    await analyticsApi.trackDogProfileEvent(
      buildDogProfileEventPayload(eventName, payload),
    )
  } catch (error) {
    console.warn('[DogProfileAnalytics] track failed', eventName, error)
  }
}
