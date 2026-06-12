import { describe, expect, it } from 'vitest'
import {
  formatEnergyDensityKcalPerKg,
  formatRecipeFormulaSoftwareLabel,
} from './recipe-display'

describe('recipe display helpers', () => {
  it('rounds energy density for customer-facing pages', () => {
    expect(formatEnergyDensityKcalPerKg(1650.42518127884)).toBe('1650')
    expect(formatEnergyDensityKcalPerKg(1650.5)).toBe('1651')
    expect(formatEnergyDensityKcalPerKg(0)).toBe('-')
  })

  it('shows Setar instead of internal recipe designer source abbreviations', () => {
    expect(formatRecipeFormulaSoftwareLabel('Setar Recipe Designer Platform')).toBe('Setar')
    expect(formatRecipeFormulaSoftwareLabel('SETAR_RECIPE_DESIGNER_PRIVATE')).toBe('Setar')
    expect(formatRecipeFormulaSoftwareLabel('Setar')).toBe('Setar')
  })
})
