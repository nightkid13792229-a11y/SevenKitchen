import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('dog-profile-overview runtime regressions', () => {
  it('does not reference removed applyProfile helper in diet reminder save flow', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(source).toContain('applyServerState(')
    expect(source).not.toContain('applyProfile(')
  })

  it('routes avatar replacement through the shared dogApi helper and refreshes local cache', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(source).toContain('<DogAvatarCropper')
    expect(source).toContain('avatarCropSourcePath')
    expect(source).toContain('avatarLocalPreviewPath')
    expect(source).toContain('handleOverviewAvatarCropConfirm')
    expect(source).toContain('await dogApi.uploadAvatar(')
    expect(source).toContain('addDogToCache({')
  })
})
