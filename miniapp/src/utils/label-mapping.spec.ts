import { describe, expect, it } from 'vitest'
import {
  getNutritionStandardExplain,
  getNutritionStandardLabel,
  getRecipeStatusLabel,
} from './label-mapping'

describe('label-mapping nutrition standards', () => {
  it('maps FEDIAF 2025 to a customer-facing label', () => {
    expect(getNutritionStandardLabel('FEDIAF_2025')).toBe('FEDIAF 2025')
  })

  it('only FEDIAF 2025 is supported (2026-11-28)', () => {
    // 老板定：营养标准只用 FEDIAF 2025。
    // 其他代码不翻译、也不回显原码 —— 否则顾客会看到 AAFCO_2022。
    for (const code of ['FEDIAF_2021', 'FEDIAF_2024', 'AAFCO_2022', 'NRC_2006']) {
      expect(getNutritionStandardLabel(code)).toBe('')
    }
  })

  it('explain follows the same rule', () => {
    expect(getNutritionStandardExplain('FEDIAF_2025')).toContain('FEDIAF')
    expect(getNutritionStandardExplain('AAFCO_2022')).toBe('')
  })
})

describe('label-mapping recipe status', () => {
  it('shows Chinese status, never the enum code', () => {
    expect(getRecipeStatusLabel('PUBLIC')).toBe('公开')
    expect(getRecipeStatusLabel('PRIVATE_CUSTOM')).toBe('私密定制')
    expect(getRecipeStatusLabel('DRAFT')).toBe('草稿')
    expect(getRecipeStatusLabel(undefined)).toBe('-')
    expect(getRecipeStatusLabel('SOMETHING_NEW')).toBe('-')
  })
})
