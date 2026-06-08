import { describe, expect, it } from 'vitest'
import {
  buildDogProfileEventPayload,
  isUnsupportedDogProfileAnalyticsError,
  shouldTrackDogProfileAnalyticsForBaseUrl,
} from './dog-profile-analytics'

describe('dog-profile-analytics', () => {
  it('builds a stable payload for feeding edit calc success', () => {
    expect(
      buildDogProfileEventPayload('dog_profile_calc_succeeded', {
        mode: 'edit',
        dogId: 'dog-1',
        moduleName: 'feeding_info',
        calcStatus: 'success',
      }),
    ).toEqual({
      eventName: 'dog_profile_calc_succeeded',
      mode: 'edit',
      dogId: 'dog-1',
      moduleName: 'feeding_info',
      calcStatus: 'success',
    })
  })

  it('recognizes unsupported analytics endpoint errors so tracking can fail open', () => {
    expect(isUnsupportedDogProfileAnalyticsError(
      new Error('Cannot POST /api/v1/analytics/dog-profile/events'),
    )).toBe(true)
    expect(isUnsupportedDogProfileAnalyticsError(
      new Error('404 Not Found'),
    )).toBe(true)
    expect(isUnsupportedDogProfileAnalyticsError(
      new Error('Network error'),
    )).toBe(false)
  })

  it('disables dog-profile analytics on the hosted production API until the route is deployed', () => {
    expect(
      shouldTrackDogProfileAnalyticsForBaseUrl('https://api.sevenkitchen.cloud/api/v1'),
    ).toBe(false)
    expect(
      shouldTrackDogProfileAnalyticsForBaseUrl('http://127.0.0.1:3011/api/v1'),
    ).toBe(true)
  })
})
