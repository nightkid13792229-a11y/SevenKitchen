export interface SearchableBreed {
  name: string
  aliases?: string[]
}

export function normalizeBreedSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function getBreedSearchTokens(breed: SearchableBreed): string[] {
  const tokens = new Set<string>([normalizeBreedSearchText(breed.name)])

  ;(breed.aliases || []).forEach((alias) => {
    const normalizedAlias = normalizeBreedSearchText(alias)
    if (normalizedAlias) {
      tokens.add(normalizedAlias)
    }
  })

  return Array.from(tokens)
}

export function filterBreedsByKeyword<T extends SearchableBreed>(breeds: T[], keyword: string): T[] {
  const normalizedKeyword = normalizeBreedSearchText(keyword)
  if (!normalizedKeyword) {
    return []
  }

  return breeds.filter((breed) =>
    getBreedSearchTokens(breed).some(token => token.includes(normalizedKeyword)),
  )
}
