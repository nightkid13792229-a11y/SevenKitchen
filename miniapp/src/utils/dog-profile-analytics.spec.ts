import { beforeEach, describe, expect, it, vi } from 'vitest'

const { trackDogProfileEventMock } = vi.hoisted(() => ({
  trackDogProfileEventMock: vi.fn(),
}))

vi.mock('../api/analytics', () => ({
  analyticsApi: {
    trackDogProfileEvent: (data: Record<string, any>) => trackDogProfileEventMock(data),
  },
}))

// 关键：这里模拟的就是正式构建固定使用的生产域名。
// 2026-09-21 之前，这个域名会让所有建档埋点被整体跳过。
vi.mock('./config', () => ({
  getBaseUrl: () => 'https://api.sevenkitchen.cloud/api/v1',
}))

describe('dog-profile-analytics', () => {
  beforeEach(() => {
    vi.resetModules()
    trackDogProfileEventMock.mockReset()
    trackDogProfileEventMock.mockResolvedValue(undefined)
  })

  it('builds a stable payload for feeding edit calc success', async () => {
    const { buildDogProfileEventPayload } = await import('./dog-profile-analytics')

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

  it('recognizes unsupported analytics endpoint errors so tracking can fail open', async () => {
    const { isUnsupportedDogProfileAnalyticsError } = await import('./dog-profile-analytics')

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

  it('正式环境下照常上报建档埋点（不再因为域名是生产域名而整体跳过）', async () => {
    const { trackDogProfileEvent } = await import('./dog-profile-analytics')

    await trackDogProfileEvent('dog_profile_create_started', {
      mode: 'create',
      entrySource: 'recipe_order',
    })

    expect(trackDogProfileEventMock).toHaveBeenCalledTimes(1)
    expect(trackDogProfileEventMock).toHaveBeenCalledWith({
      eventName: 'dog_profile_create_started',
      mode: 'create',
      entrySource: 'recipe_order',
    })
  })

  it('接口确实不可用时停止后续上报，避免反复空跑', async () => {
    trackDogProfileEventMock.mockRejectedValue(
      new Error('Cannot POST /api/v1/analytics/dog-profile/events'),
    )
    const { trackDogProfileEvent } = await import('./dog-profile-analytics')

    await trackDogProfileEvent('dog_profile_create_started', { mode: 'create' })
    await trackDogProfileEvent('dog_profile_step_viewed', { mode: 'create' })

    expect(trackDogProfileEventMock).toHaveBeenCalledTimes(1)
  })

  it('普通网络错误不关闭上报，只记一条告警', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    trackDogProfileEventMock.mockRejectedValue(new Error('Network error'))
    const { trackDogProfileEvent } = await import('./dog-profile-analytics')

    await trackDogProfileEvent('dog_profile_create_started', { mode: 'create' })
    await trackDogProfileEvent('dog_profile_step_viewed', { mode: 'create' })

    expect(trackDogProfileEventMock).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })
})
