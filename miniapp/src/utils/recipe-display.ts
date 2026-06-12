export function formatEnergyDensityKcalPerKg(value: number | string | null | undefined): string {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '-'
  return String(Math.round(numericValue))
}

export function formatRecipeFormulaSoftwareLabel(value: string | null | undefined): string {
  const source = String(value || '').trim()
  if (!source) return 'Setar'

  const normalized = source.toLowerCase()
  if (normalized.includes('setar') || normalized.includes('recipe_designer')) {
    return 'Setar'
  }

  return source
}
