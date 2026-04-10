import { describe, expect, it } from 'vitest'
import {
  DEVTOOLS_BASE_URL,
  LAN_DEBUG_BASE_URL,
  migrateLegacyDevBaseUrl,
} from './runtime-base-url'

describe('runtime-base-url', () => {
  it('uses the branch local backend on port 3011 for DevTools', () => {
    expect(DEVTOOLS_BASE_URL).toBe('http://127.0.0.1:3011/api/v1')
    expect(LAN_DEBUG_BASE_URL).toBe('http://192.168.31.43:3011/api/v1')
  })

  it('migrates legacy local dev overrides on port 3001 to the branch backend port', () => {
    expect(migrateLegacyDevBaseUrl('http://localhost:3001/api/v1')).toBe(
      'http://127.0.0.1:3011/api/v1',
    )
    expect(migrateLegacyDevBaseUrl('http://127.0.0.1:3001/api/v1')).toBe(
      'http://127.0.0.1:3011/api/v1',
    )
    expect(migrateLegacyDevBaseUrl('http://192.168.31.43:3001/api/v1')).toBe(
      'http://192.168.31.43:3011/api/v1',
    )
  })

  it('leaves non-legacy values untouched', () => {
    expect(migrateLegacyDevBaseUrl('http://127.0.0.1:3011/api/v1')).toBe(
      'http://127.0.0.1:3011/api/v1',
    )
    expect(
      migrateLegacyDevBaseUrl('https://api.sevenkitchen.cloud/api/v1'),
    ).toBe('https://api.sevenkitchen.cloud/api/v1')
    expect(migrateLegacyDevBaseUrl('')).toBeNull()
    expect(migrateLegacyDevBaseUrl(undefined)).toBeNull()
  })
})
