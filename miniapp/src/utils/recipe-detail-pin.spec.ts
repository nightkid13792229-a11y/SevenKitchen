import { describe, expect, it } from 'vitest'
import {
  resolveInitialDogId,
  resolveRecipeDetailDogId,
} from './recipe-detail-pin'

describe('resolveInitialDogId', () => {
  it('普通进入：URL 优先，其次本地缓存', () => {
    expect(
      resolveInitialDogId({
        pinRecipe: false,
        urlDogId: 'dog-url',
        storedDogId: 'dog-storage',
      }),
    ).toBe('dog-url')
    expect(
      resolveInitialDogId({ pinRecipe: false, storedDogId: 'dog-storage' }),
    ).toBe('dog-storage')
    expect(resolveInitialDogId({ pinRecipe: false })).toBeNull()
  })

  it('★ 锁版入口：即使 URL / 缓存里有狗，也先按无狗取这道食谱', () => {
    expect(
      resolveInitialDogId({
        pinRecipe: true,
        urlDogId: 'dog-url',
        storedDogId: 'dog-storage',
      }),
    ).toBeNull()
  })
})

describe('resolveRecipeDetailDogId', () => {
  it('普通进入：选中狗优先，其次 dogId', () => {
    expect(
      resolveRecipeDetailDogId({
        pinRecipe: false,
        selectedDogId: 'dog-selected',
        dogId: 'dog-legacy',
      }),
    ).toBe('dog-selected')
    expect(
      resolveRecipeDetailDogId({ pinRecipe: false, dogId: 'dog-legacy' }),
    ).toBe('dog-legacy')
  })

  it('★ 锁版且没手动选狗：就算 dogId 被别处写回来，也绝不带给后端', () => {
    expect(
      resolveRecipeDetailDogId({
        pinRecipe: true,
        dogId: 'dog-legacy',
      }),
    ).toBe('')
  })

  it('★ 锁版但用户手动点了狗：按这只狗重新请求（允许主动切换）', () => {
    expect(
      resolveRecipeDetailDogId({
        pinRecipe: true,
        selectedDogId: 'dog-selected',
        dogId: 'dog-legacy',
      }),
    ).toBe('dog-selected')
  })
})
