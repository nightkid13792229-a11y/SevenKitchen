import { describe, expect, it } from 'vitest'
import { filterBreedsByKeyword } from './dog-breed-search'

describe('dog-breed-search', () => {
  const breeds = [
    {
      id: 'labrador',
      name: '拉布拉多',
      aliases: ['拉拉', 'Labrador Retriever'],
      sizeCategory: 'LARGE',
    },
    {
      id: 'golden',
      name: '金毛',
      aliases: ['Golden Retriever'],
      sizeCategory: 'LARGE',
    },
  ]

  it('returns empty results for blank keywords', () => {
    expect(filterBreedsByKeyword(breeds, '   ')).toEqual([])
  })

  it('matches breed aliases after normalizing spaces and casing', () => {
    expect(
      filterBreedsByKeyword(breeds, ' labrador  retriever ').map(breed => breed.id),
    ).toEqual(['labrador'])
  })

  it('matches chinese aliases as well as primary breed names', () => {
    expect(filterBreedsByKeyword(breeds, '拉拉').map(breed => breed.id)).toEqual(['labrador'])
    expect(filterBreedsByKeyword(breeds, '金毛').map(breed => breed.id)).toEqual(['golden'])
  })
})
