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
    {
      id: 'teddy',
      name: '泰迪',
      aliases: [],
      sizeCategory: 'SMALL',
      isCommon: true,
    },
    {
      id: 'mini-poodle',
      name: '贵宾犬(小型)',
      aliases: [],
      sizeCategory: 'SMALL',
      isCommon: true,
    },
    {
      id: 'standard-poodle',
      name: '贵宾犬(标准)',
      aliases: [],
      sizeCategory: 'LARGE',
      isCommon: false,
    },
    {
      id: 'border-collie',
      name: '边牧',
      aliases: [],
      sizeCategory: 'MEDIUM',
      isCommon: true,
    },
    {
      id: 'mini-schnauzer',
      name: '雪纳瑞(小型)',
      aliases: [],
      sizeCategory: 'SMALL',
      isCommon: true,
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

  it('returns related poodle breeds when searching teddy terms', () => {
    expect(filterBreedsByKeyword(breeds, '泰迪').map(breed => breed.id)).toEqual([
      'teddy',
      'mini-poodle',
    ])
  })

  it('matches common shorthand aliases that are not stored in backend data', () => {
    expect(filterBreedsByKeyword(breeds, '边境牧羊犬').map(breed => breed.id)).toEqual([
      'border-collie',
    ])
  })

  it('matches bracketed breed names by their family name', () => {
    expect(filterBreedsByKeyword(breeds, '贵宾犬').map(breed => breed.id)).toEqual([
      'mini-poodle',
      'standard-poodle',
      'teddy',
    ])
  })

  it('tolerates small misspellings for common breeds', () => {
    expect(filterBreedsByKeyword(breeds, '雪纳锐').map(breed => breed.id)).toEqual([
      'mini-schnauzer',
    ])
  })
})
