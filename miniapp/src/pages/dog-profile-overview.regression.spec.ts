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
})
