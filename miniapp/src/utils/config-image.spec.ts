import { describe, expect, it } from 'vitest'
import {
  appendRecipeCoverThumbnailParams,
  getRecipeCoverImageUrl,
  isKnownStaleRecipeCoverUrl,
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
})
