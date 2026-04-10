import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/config', () => ({
  getBaseUrl: () => 'https://api.example.com/api/v1',
}))

vi.mock('../utils/api', async () => {
  const actual = await vi.importActual<typeof import('../utils/api')>('../utils/api')
  return {
    ...actual,
    request: vi.fn(),
    getToken: () => 'token-123',
  }
})

import { dogApi } from './dogs'

const uploadFile = vi.fn()

vi.stubGlobal('uni', {
  uploadFile,
  getStorageSync: vi.fn(() => ''),
})

describe('dogApi avatar upload', () => {
  beforeEach(() => {
    uploadFile.mockReset()
  })

  it('uploads a dog avatar through the shared miniapp upload path', async () => {
    uploadFile.mockImplementation((options: any) => {
      options.success({
        statusCode: 201,
        data: JSON.stringify({
          code: 0,
          data: { url: 'https://cdn.example.com/dogs/seven-new.png' },
        }),
      })
    })

    await expect((dogApi as any).uploadAvatar('dog-123', '/tmp/dog-avatar.png')).resolves.toBe(
      'https://cdn.example.com/dogs/seven-new.png',
    )

    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.example.com/api/v1/dogs/dog-123/avatar',
      filePath: '/tmp/dog-avatar.png',
      name: 'file',
      header: expect.objectContaining({
        Authorization: 'Bearer token-123',
      }),
    }))
  })
})
