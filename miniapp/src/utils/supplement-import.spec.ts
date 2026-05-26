import { describe, expect, it } from 'vitest'

import {
  buildSupplementImportUploadUrl,
  canShowSupplementImportEntry,
  isAdminUser,
} from './supplement-import'

describe('supplement import helpers', () => {
  it('only shows supplement import entry to admin users', () => {
    expect(isAdminUser({ role: 'ADMIN' })).toBe(true)
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
})
