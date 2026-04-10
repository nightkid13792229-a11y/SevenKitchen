import { describe, expect, it } from 'vitest'
import {
  DEFAULT_USER_AVATAR_SRC,
  buildUserAvatarUploadUrl,
  parseAvatarUploadResponse,
  resolveUserAvatarSrc,
} from './user-profile'

describe('user-profile utils', () => {
  it('builds avatar upload URLs from the active runtime base URL', () => {
    expect(buildUserAvatarUploadUrl('http://127.0.0.1:3011/api/v1')).toBe(
      'http://127.0.0.1:3011/api/v1/users/me/avatar',
    )
    expect(buildUserAvatarUploadUrl('https://api.example.com/api/v1/')).toBe(
      'https://api.example.com/api/v1/users/me/avatar',
    )
  })

  it('falls back to a real bundled avatar placeholder when avatarUrl is empty', () => {
    expect(resolveUserAvatarSrc('')).toBe(DEFAULT_USER_AVATAR_SRC)
    expect(resolveUserAvatarSrc(null)).toBe(DEFAULT_USER_AVATAR_SRC)
  })

  it('keeps a real avatar URL when one is present', () => {
    expect(resolveUserAvatarSrc('https://cdn.example.com/avatar.png')).toBe(
      'https://cdn.example.com/avatar.png',
    )
  })

  it('extracts avatar upload URLs from successful upload responses', () => {
    expect(
      parseAvatarUploadResponse({
        statusCode: 200,
        data: JSON.stringify({
          code: 0,
          data: { url: 'https://cdn.example.com/avatar.png' },
        }),
      }),
    ).toBe('https://cdn.example.com/avatar.png')
  })

  it('preserves backend error messages for failed avatar uploads', () => {
    expect(() =>
      parseAvatarUploadResponse({
        statusCode: 500,
        data: JSON.stringify({
          code: 500,
          message: 'COS credentials not configured',
        }),
      }),
    ).toThrow('COS credentials not configured')
  })
})
