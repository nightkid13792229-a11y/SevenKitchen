import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('nutrition standard api exposes FEDIAF 2025 dog endpoints', () => {
  const apiSource = readFileSync(
    new URL('../src/api/nutritionStandards.ts', import.meta.url),
    'utf8'
  )

  assert.match(apiSource, /getFediaf2025DogOverview/)
  assert.match(apiSource, /listFediaf2025DogEntries/)
  assert.match(apiSource, /getFediaf2025DogEntryDetail/)
  assert.match(apiSource, /updateFediaf2025DogEntryReview/)
  assert.match(apiSource, /admin\/nutrition-standards\/fediaf-2025-dog\/overview/)
  assert.match(apiSource, /admin\/nutrition-standards\/fediaf-2025-dog\/entries/)
})

test('nutrition standard types include review states and source tables', () => {
  const typeSource = readFileSync(
    new URL('../src/types/nutritionStandard.ts', import.meta.url),
    'utf8'
  )

  assert.match(typeSource, /UNREVIEWED/)
  assert.match(typeSource, /REVIEWED/)
  assert.match(typeSource, /QUESTION/)
  assert.match(typeSource, /NEEDS_FIX/)
  assert.match(typeSource, /III-3a/)
  assert.match(typeSource, /VII-17d/)
})
