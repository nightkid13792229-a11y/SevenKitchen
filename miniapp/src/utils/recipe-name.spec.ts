import {
  RECIPE_NAME_MAX_LENGTH,
  buildCustomerRecipeDefaultName,
  countRecipeNameLength,
  isRecipeNameWithinLimit,
  truncateRecipeName,
} from './recipe-name'

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('recipe-name', () => {
  it('caps names at twelve characters, matching the backend', () => {
    expect(RECIPE_NAME_MAX_LENGTH).toBe(12)
    expect(isRecipeNameWithinLimit('一二三四五六七八九十一二')).toBe(true)
    expect(isRecipeNameWithinLimit('一二三四五六七八九十一二三')).toBe(false)
  })

  it('counts by character, not UTF-16 code unit', () => {
    expect(countRecipeNameLength('🐶 11/19')).toBe(7)
    expect(countRecipeNameLength('  好久 11/19  ')).toBe(8)
  })

  it('truncates without cutting emoji', () => {
    expect([...truncateRecipeName('🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶')]).toHaveLength(12)
  })

  it('builds the customer default name as 「狗狗名 MM/DD」 inside the limit', () => {
    expect(buildCustomerRecipeDefaultName('好久', day(2026, 11, 19))).toBe('好久 11/19')
    expect(buildCustomerRecipeDefaultName('豆豆', day(2026, 1, 5))).toBe('豆豆 01/05')
  })

  it('never produces a name longer than twelve characters', () => {
    const names = ['好久', '爱犬', '一二三四五六七八九十', '🐶'.repeat(20), '   ']
    for (const name of names) {
      const generated = buildCustomerRecipeDefaultName(name, day(2026, 11, 19))
      expect(countRecipeNameLength(generated)).toBeLessThanOrEqual(RECIPE_NAME_MAX_LENGTH)
    }
  })

  it('drops the date instead of cutting the dog name when the name is long', () => {
    expect(buildCustomerRecipeDefaultName('一二三四五六七八九十', day(2026, 11, 19))).toBe(
      '一二三四五六七八九十',
    )
  })

  it('falls back to 爱犬 for a missing dog name', () => {
    expect(buildCustomerRecipeDefaultName('', day(2026, 11, 19))).toBe('爱犬 11/19')
    expect(buildCustomerRecipeDefaultName(undefined, day(2026, 11, 19))).toBe('爱犬 11/19')
  })
})
