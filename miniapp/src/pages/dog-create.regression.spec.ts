import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('dog-create hot breed regressions', () => {
  it('uses the hot breed api instead of deriving shortcuts from isCommon metadata', () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-create/index.vue'),
      'utf-8',
    )
    const apiSource = readFileSync(
      resolve(process.cwd(), 'src/api/dogs.ts'),
      'utf-8',
    )

    expect(apiSource).toContain("hotBreeds: () => request({ url: '/dogs/breeds/hot', method: 'GET' })")
    expect(pageSource).toContain("const hotBreeds = ref<Breed[]>([])")
    expect(pageSource).toContain('dogApi.hotBreeds()')
    expect(pageSource).toContain('热门品种')
    expect(pageSource).not.toContain('breeds.value.filter(b => b.isCommon).map(b => b.name)')
  })
})
