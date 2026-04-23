export const normalizeProcurementSkuOptionalText = (
  value?: string | null,
): string | null => {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}
