import { afterEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('./api', () => ({
  getToken: () => null,
  request: requestMock,
}))

import {
  buildSupplementImportUploadUrl,
  canShowSupplementImportEntry,
  isAdminUser,
  supplementImportApi,
} from './supplement-import'

describe('supplement import helpers', () => {
  afterEach(() => {
    requestMock.mockReset()
  })

  it('only shows supplement import entry to admin users', () => {
    expect(isAdminUser({ role: 'ADMIN' })).toBe(true)
    expect(isAdminUser({ role: 'admin' })).toBe(false)
    expect(isAdminUser({ user: { role: 'ADMIN' } })).toBe(true)
    expect(isAdminUser({ role: 'STAFF' })).toBe(false)
    expect(isAdminUser({ role: 'CUSTOMER' })).toBe(false)
    expect(canShowSupplementImportEntry({ role: 'ADMIN' })).toBe(true)
  })

  it('builds upload url for supplement import draft images', () => {
    expect(
      buildSupplementImportUploadUrl('http://127.0.0.1:3011/api/v1'),
    ).toBe(
      'http://127.0.0.1:3011/api/v1/recipe-designer/supplement-import-drafts/images',
    )
  })

  it('wraps image urls when creating a supplement import draft', () => {
    const imageUrls = ['https://cdn.example.com/a.jpg']

    supplementImportApi.createDraft(imageUrls)

    expect(requestMock).toHaveBeenCalledWith({
      url: '/recipe-designer/supplement-import-drafts',
      method: 'POST',
      data: { imageUrls },
    })
  })

  it('wraps normalized draft when updating a supplement import draft', () => {
    const normalizedDraft = {
      name: '鱼油',
      brand: 'Seven',
    }

    supplementImportApi.updateDraft('draft-1', normalizedDraft)

    expect(requestMock).toHaveBeenCalledWith({
      url: '/recipe-designer/supplement-import-drafts/draft-1',
      method: 'PUT',
      data: { normalizedDraft },
    })
  })
})
