import { describe, expect, it } from 'vitest'

import { normalizeRequestData } from './api'

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
})
