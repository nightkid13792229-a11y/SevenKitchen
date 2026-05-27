import { describe, expect, it } from 'vitest'
import {
  appendRecipeCoverThumbnailParams,
  getOptimizedProductImageUrl,
  getRecipeCoverImageUrl,
  isKnownStaleRecipeCoverUrl,
  normalizeImageUrl,
} from './config'

describe('config image helpers', () => {
  it('adds a lightweight thumbnail transform to recipe cover images', () => {
    expect(
      appendRecipeCoverThumbnailParams(
        'https://img.sevenkitchen.cloud/recipes/covers/demo-cover.png',
      ),
    ).toBe(
      'https://img.sevenkitchen.cloud/recipes/covers/demo-cover.png?imageMogr2/thumbnail/750x/format/jpg',
    )
  })

  it('leaves other image assets unchanged', () => {
    expect(
      appendRecipeCoverThumbnailParams(
        'https://img.sevenkitchen.cloud/avatars/demo-avatar.jpeg',
      ),
    ).toBe('https://img.sevenkitchen.cloud/avatars/demo-avatar.jpeg')
  })

  it('does not duplicate thumbnail transforms when one already exists', () => {
    expect(
      appendRecipeCoverThumbnailParams(
        'https://img.sevenkitchen.cloud/recipes/covers/demo-cover.png?imageMogr2/thumbnail/750x/format/jpg',
      ),
    ).toBe(
      'https://img.sevenkitchen.cloud/recipes/covers/demo-cover.png?imageMogr2/thumbnail/750x/format/jpg',
    )
  })

  it('skips thumbnail transforms for known stale recipe cover URLs', () => {
    expect(
      getRecipeCoverImageUrl(
        'https://img.sevenkitchen.cloud/recipes/covers/1774240957971-2792c7e2.png',
      ),
    ).toBe('https://img.sevenkitchen.cloud/recipes/covers/1774240957971-2792c7e2.png')
  })

  it('can force recipe covers to use the original image URL', () => {
    expect(
      getRecipeCoverImageUrl(
        'https://img.sevenkitchen.cloud/recipes/covers/demo-cover.png',
        { skipOptimization: true },
      ),
    ).toBe('https://img.sevenkitchen.cloud/recipes/covers/demo-cover.png')
  })

  it('drops unresolved local e2e recipe covers before image components request them', () => {
    const localE2eCoverUrl = 'https://static.sevenkitchen.local/e2e-cover-20260522154915.jpg'

    expect(normalizeImageUrl(localE2eCoverUrl)).toBe('')
    expect(getRecipeCoverImageUrl(localE2eCoverUrl)).toBe('')
  })

  it('recognizes known stale recipe cover URLs that should avoid list rendering', () => {
    expect(
      isKnownStaleRecipeCoverUrl(
        'https://img.sevenkitchen.cloud/recipes/covers/1774240957971-2792c7e2.png',
      ),
    ).toBe(true)

    expect(
      isKnownStaleRecipeCoverUrl(
        'https://img.sevenkitchen.cloud/recipes/covers/demo-cover.png',
      ),
    ).toBe(false)
  })

  it('adds a small thumbnail transform to CDN product images for picker cards', () => {
    expect(
      getOptimizedProductImageUrl(
        'https://img.sevenkitchen.cloud/recommended-products/demo-product.png',
      ),
    ).toBe(
      'https://img.sevenkitchen.cloud/recommended-products/demo-product.png?imageMogr2/thumbnail/360x/format/jpg',
    )
  })

  it('keeps existing image transforms and external product images unchanged', () => {
    expect(
      getOptimizedProductImageUrl(
        'https://img.sevenkitchen.cloud/recommended-products/demo-product.png?imageMogr2/thumbnail/360x/format/jpg',
      ),
    ).toBe(
      'https://img.sevenkitchen.cloud/recommended-products/demo-product.png?imageMogr2/thumbnail/360x/format/jpg',
    )

    expect(
      getOptimizedProductImageUrl('https://img.example.com/demo-product.png'),
    ).toBe('https://img.example.com/demo-product.png')
  })
})
