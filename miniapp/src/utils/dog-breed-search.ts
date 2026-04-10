import { BUILTIN_BREED_SEARCH_ALIASES } from './dog-breed-search-catalog'

export interface SearchableBreed {
  name: string
  aliases?: string[]
  isCommon?: boolean
}

export function normalizeBreedSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）【】[\]{}_\-\\/·•.,，。:：;；'"`]/g, '')
}

type BreedTokenSource = 'name' | 'derived' | 'alias'

interface BreedSearchToken {
  value: string
  source: BreedTokenSource
}

const BREED_DESCRIPTOR_PATTERN = /(小型|中型|大型|巨型|标准|迷你|玩具|微型)/g

function buildBreedTokenVariants(value: string): string[] {
  const normalized = normalizeBreedSearchText(value)
  if (!normalized) {
    return []
  }

  const variants = new Set<string>([normalized])
  const withoutDescriptors = normalized.replace(BREED_DESCRIPTOR_PATTERN, '')
  const withoutSuffix = normalized.replace(/[犬狗]/g, '')
  const withoutDescriptorsAndSuffix = withoutDescriptors.replace(/[犬狗]/g, '')

  if (withoutDescriptors) {
    variants.add(withoutDescriptors)
  }

  if (withoutSuffix) {
    variants.add(withoutSuffix)
  }

  if (withoutDescriptorsAndSuffix) {
    variants.add(withoutDescriptorsAndSuffix)
  }

  return Array.from(variants).filter(token => token.length > 0)
}

function getBreedSearchTokens(breed: SearchableBreed): BreedSearchToken[] {
  const tokens: BreedSearchToken[] = []
  const seen = new Set<string>()

  const addTokens = (values: string[], source: BreedTokenSource) => {
    values.forEach((value) => {
      if (!value) {
        return
      }

      const dedupeKey = `${source}:${value}`
      if (seen.has(dedupeKey)) {
        return
      }

      seen.add(dedupeKey)
      tokens.push({ value, source })
    })
  }

  addTokens(buildBreedTokenVariants(breed.name), 'name')
  addTokens(buildBreedTokenVariants(breed.name.split(/[（(]/)[0] || ''), 'derived')

  ;[...(breed.aliases || []), ...(BUILTIN_BREED_SEARCH_ALIASES[breed.name] || [])].forEach((alias) => {
    addTokens(buildBreedTokenVariants(alias), 'alias')
  })

  return tokens
}

function getExactScore(source: BreedTokenSource): number {
  if (source === 'name') {
    return 120
  }

  if (source === 'derived') {
    return 115
  }

  return 110
}

function getPrefixScore(source: BreedTokenSource): number {
  return source === 'alias' ? 95 : 100
}

function getContainsScore(source: BreedTokenSource): number {
  return source === 'alias' ? 85 : 90
}

function getEditDistance(left: string, right: string): number {
  const rows = left.length + 1
  const cols = right.length + 1
  const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      )
    }
  }

  return matrix[left.length][right.length]
}

function isLightTypoMatch(token: string, keyword: string): boolean {
  if (keyword.length < 3 || token.length < 3) {
    return false
  }

  if (Math.abs(token.length - keyword.length) > 1) {
    return false
  }

  return getEditDistance(token, keyword) <= 1
}

function getBreedMatchScore(breed: SearchableBreed, keyword: string): number {
  return getBreedSearchTokens(breed).reduce((bestScore, token) => {
    if (token.value === keyword) {
      return Math.max(bestScore, getExactScore(token.source))
    }

    if (token.value.startsWith(keyword) || keyword.startsWith(token.value)) {
      return Math.max(bestScore, getPrefixScore(token.source))
    }

    if (token.value.includes(keyword) || keyword.includes(token.value)) {
      return Math.max(bestScore, getContainsScore(token.source))
    }

    if (isLightTypoMatch(token.value, keyword)) {
      return Math.max(bestScore, 70)
    }

    return bestScore
  }, 0)
}

function compareBreeds(
  left: SearchableBreed,
  right: SearchableBreed,
  keyword: string,
): number {
  const scoreDiff = getBreedMatchScore(right, keyword) - getBreedMatchScore(left, keyword)
  if (scoreDiff !== 0) {
    return scoreDiff
  }

  if (Boolean(right.isCommon) !== Boolean(left.isCommon)) {
    return Number(Boolean(right.isCommon)) - Number(Boolean(left.isCommon))
  }

  if (left.name.length !== right.name.length) {
    return left.name.length - right.name.length
  }

  return left.name.localeCompare(right.name, 'zh-Hans-CN')
}

export function filterBreedsByKeyword<T extends SearchableBreed>(breeds: T[], keyword: string): T[] {
  const normalizedKeyword = normalizeBreedSearchText(keyword)
  if (!normalizedKeyword) {
    return []
  }

  return breeds
    .filter(breed => getBreedMatchScore(breed, normalizedKeyword) > 0)
    .sort((left, right) => compareBreeds(left, right, normalizedKeyword))
}
