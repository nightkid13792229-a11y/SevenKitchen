import { describe, expect, it } from 'vitest'
import { getNutritionStandardLabel } from './label-mapping'

describe('label-mapping nutrition standards', () => {
  it('maps FEDIAF 2025 to a customer-facing label', () => {
    expect(getNutritionStandardLabel('FEDIAF_2025')).toBe('FEDIAF 2025')
  })
})
