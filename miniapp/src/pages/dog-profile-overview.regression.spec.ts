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

  it('uses hot breeds for the default breed shortcuts instead of isCommon metadata', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(source).toContain("const hotBreeds = ref<DogBreedItem[]>([])")
    expect(source).toContain('dogApi.hotBreeds()')
    expect(source).not.toContain('breeds.value.filter(breed => breed.isCommon).slice(0, 8)')
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

  it('shows customer-visible finished-food recipe history without DIY records', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'),
      'utf-8',
    )

    expect(source).toContain('成品食谱历史')
    expect(source).toContain('finishedFoodHistory')
    expect(source).toContain('finishedFoodHistoryItems')
    expect(source).toContain('/pages/order-detail/index?orderId=')
    expect(source).not.toContain('DIY历史')
  })
})
