import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DOG_AVATAR_SRC,
  buildDogAvatarUploadUrl,
  parseDogAvatarUploadResponse,
  persistDogAvatarLocalPreviewPath,
  resolveDogAvatarUploadErrorMessage,
  resolveDogAvatarSrc,
} from './dog-avatar'

describe('dog-avatar utils', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds dog avatar upload URLs from the active runtime base URL', () => {
    expect(buildDogAvatarUploadUrl('http://127.0.0.1:3011/api/v1', 'dog-123')).toBe(
      'http://127.0.0.1:3011/api/v1/dogs/dog-123/avatar',
    )
    expect(buildDogAvatarUploadUrl('https://api.example.com/api/v1/', 'dog-456')).toBe(
      'https://api.example.com/api/v1/dogs/dog-456/avatar',
    )
  })

  it('falls back to a bundled dog avatar placeholder when avatarUrl is empty', () => {
    expect(resolveDogAvatarSrc('')).toBe(DEFAULT_DOG_AVATAR_SRC)
    expect(resolveDogAvatarSrc(null)).toBe(DEFAULT_DOG_AVATAR_SRC)
  })

  it('keeps a real dog avatar URL when one is present', () => {
    expect(resolveDogAvatarSrc('https://cdn.example.com/dogs/seven.png')).toBe(
      'https://cdn.example.com/dogs/seven.png',
    )
  })

  it('prefers a freshly selected local preview over the saved remote avatar', () => {
    expect(
      (resolveDogAvatarSrc as any)(
        'https://cdn.example.com/dogs/seven.png',
        '/tmp/wechat-avatar-preview.png',
      ),
    ).toBe('/tmp/wechat-avatar-preview.png')
  })

  it('extracts dog avatar URLs from successful upload responses', () => {
    expect(
      parseDogAvatarUploadResponse({
        statusCode: 201,
        data: JSON.stringify({
          code: 0,
          data: { url: 'https://cdn.example.com/dogs/seven.png' },
        }),
      }),
    ).toBe('https://cdn.example.com/dogs/seven.png')
  })

  it('preserves backend error messages for failed dog avatar uploads', () => {
    expect(() =>
      parseDogAvatarUploadResponse({
        statusCode: 500,
        data: JSON.stringify({
          code: 500,
          message: 'COS credentials not configured',
        }),
      }),
    ).toThrow('COS credentials not configured')
  })

  it('maps COS configuration errors to a friendly localized hint', () => {
    expect(resolveDogAvatarUploadErrorMessage(new Error('COS credentials not configured'))).toBe(
      '头像上传功能暂未配置，请稍后再试',
    )
  })

  it('keeps meaningful upload errors when they are already user-friendly', () => {
    expect(resolveDogAvatarUploadErrorMessage(new Error('文件大小不能超过 5MB'))).toBe(
      '文件大小不能超过 5MB',
    )
  })

  it('persists local avatar previews before storing them in create drafts', async () => {
    const saveFile = vi.fn((options: any) => {
      options.success({ savedFilePath: 'wxfile://user/dog-avatar.png' })
    })
    vi.stubGlobal('uni', { saveFile })

    await expect(persistDogAvatarLocalPreviewPath('wxfile://tmp/dog-avatar.png')).resolves.toBe(
      'wxfile://user/dog-avatar.png',
    )
    expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({
      tempFilePath: 'wxfile://tmp/dog-avatar.png',
    }))
  })

  it('falls back to the selected avatar path when local persistence is unavailable', async () => {
    vi.stubGlobal('uni', {})

    await expect(persistDogAvatarLocalPreviewPath('wxfile://tmp/dog-avatar.png')).resolves.toBe(
      'wxfile://tmp/dog-avatar.png',
    )
  })
})
