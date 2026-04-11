export function formatSupplementAmountWithDisplayUnit(
  amount: number,
  originalUnit: string | undefined,
  displayUnit: string,
): string {
  let amountInG = amount
  if (originalUnit === 'kg') {
    amountInG = amount * 1000
  } else if (originalUnit === 'mg') {
    amountInG = amount / 1000
  }

  if (displayUnit === '粒' || displayUnit === '片' || displayUnit === '颗') {
    return `${amountInG.toFixed(1)}${displayUnit}`
  }

  if (displayUnit === 'ml') {
    if (amountInG >= 1000) {
      return `${(amountInG / 1000).toFixed(2)}L`
    }
    return `${amountInG.toFixed(1)}${displayUnit}`
  }

  if (displayUnit === 'g') {
    return `${amountInG.toFixed(1)}${displayUnit}`
  }

  if (displayUnit === 'mg') {
    if (originalUnit === 'g') {
      return `${(amount * 1000).toFixed(1)}${displayUnit}`
    }
    return `${amount.toFixed(1)}${displayUnit}`
  }

  return `${amountInG.toFixed(1)}${displayUnit}`
}
