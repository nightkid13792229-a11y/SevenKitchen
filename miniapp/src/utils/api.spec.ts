import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', () => ({
  getBaseUrl: () => 'https://api.example.com/api/v1',
}))

import { normalizeRequestData, request, resolveRuntimeRequest } from './api'

describe('api request data normalization', () => {
  it('removes undefined query params from GET requests', () => {
    expect(
      normalizeRequestData('GET', {
        keyword: undefined,
        type: undefined,
        page: 1,
      }),
    ).toEqual({
      page: 1,
    })
  })

  it('removes empty sentinel string query params from GET requests', () => {
    expect(
      normalizeRequestData('GET', {
        keyword: '',
        type: 'undefined',
        status: ' null ',
      }),
    ).toBeUndefined()
  })

  it('keeps non-GET payloads unchanged', () => {
    const payload = {
      keyword: undefined,
      type: undefined,
    }

    expect(normalizeRequestData('POST', payload)).toBe(payload)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses native wx.request even when wx is not exposed on globalThis', () => {
    const wxRuntime = {
      request: vi.fn(),
    }
    const brokenUniRuntime = {
      request: vi.fn(() => {
        throw new Error('broken uni request')
      }),
    }

    const runtimeRequest = resolveRuntimeRequest(
      wxRuntime,
      brokenUniRuntime,
      {},
    )

    runtimeRequest?.({ url: 'https://api.example.com/api/v1/dogs/calc-preview' })

    expect(wxRuntime.request).toHaveBeenCalledWith({
      url: 'https://api.example.com/api/v1/dogs/calc-preview',
    })
    expect(brokenUniRuntime.request).not.toHaveBeenCalled()
  })

  it('falls back to wx.request when uni.request is unavailable', async () => {
    const wxRequest = vi.fn((options: any) => {
      options.success({
        statusCode: 200,
        data: {
          code: 0,
          message: 'ok',
          data: { finalFoodKcal: 320 },
        },
      })
    })

    vi.stubGlobal('uni', {
      getStorageSync: vi.fn(() => 'token-123'),
    })
    vi.stubGlobal('wx', {
      request: wxRequest,
    })

    await expect(
      request({
        url: '/dogs/calc-preview',
        method: 'POST',
        data: { currentWeightKg: 3.1 },
      }),
    ).resolves.toEqual({
      code: 0,
      message: 'ok',
      data: { finalFoodKcal: 320 },
    })

    expect(wxRequest).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.example.com/api/v1/dogs/calc-preview',
      method: 'POST',
      data: { currentWeightKg: 3.1 },
      timeout: 15000,
      header: expect.objectContaining({
        Authorization: 'Bearer token-123',
      }),
    }))
  })

  it('sets a default request timeout and allows per-request overrides', async () => {
    const wxRequest = vi.fn((options: any) => {
      options.success({
        statusCode: 200,
        data: {
          code: 0,
          message: 'ok',
          data: { items: [] },
        },
      })
    })

    vi.stubGlobal('uni', {
      getStorageSync: vi.fn(() => ''),
    })
    vi.stubGlobal('wx', {
      request: wxRequest,
    })

    await request({
      url: '/recipe-designer/series',
      method: 'GET',
    })
    await request({
      url: '/recipe-designer/series',
      method: 'GET',
      timeout: 30000,
    })

    expect(wxRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
      timeout: 15000,
    }))
    expect(wxRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
      timeout: 30000,
    }))
  })

  it('includes the resolved request URL when a runtime request fails', async () => {
    const wxRequest = vi.fn((options: any) => {
      options.fail({
        errMsg: 'request:fail -109:net::ERR_ADDRESS_UNREACHABLE',
        errno: 600001,
      })
    })

    vi.stubGlobal('uni', {
      getStorageSync: vi.fn(() => ''),
      showToast: vi.fn(),
    })
    vi.stubGlobal('wx', {
      request: wxRequest,
    })

    await expect(
      request({
        url: '/recipes',
        method: 'GET',
        quiet: true,
      }),
    ).rejects.toMatchObject({
      errMsg: 'request:fail -109:net::ERR_ADDRESS_UNREACHABLE',
      errno: 600001,
      requestUrl: 'https://api.example.com/api/v1/recipes',
    })
  })
})
