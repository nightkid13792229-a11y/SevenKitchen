import { describe, expect, it } from 'vitest'
import { buildRecipeSubmitData } from '../recipeFormPayload'
import { NutritionStandard, RecipeStatus } from '../../types/recipe'
import type { NutritionDetailedData, RecipeForm } from '../../types/recipe'

/**
 * 名称一致性：属于食谱系列的食谱，保存时不提交 name。
 *
 * 背景：编辑页的名称框对系列食谱是只读的，值又是（可能过时的）版本名。
 * 旧实现把这个值一起提交，后端会"顺手"把系列名也改成它 ——
 * 于是每次保存都把系列名静默回滚（生产实测 2026-09-30 21:59 触发过一次）。
 */
describe('buildRecipeSubmitData · 名称一致性', () => {
  const nutritionData = {} as NutritionDetailedData

  const buildForm = (overrides: Partial<RecipeForm> = {}): RecipeForm => ({
    name: '可能过时的版本名',
    nutritionStandard: NutritionStandard.FEDIAF_2025,
    energyDensityKcalPerKg: 1300,
    items: [],
    ...overrides,
  })

  it('默认提交 name（新建食谱、独立食谱都要用）', () => {
    const data = buildRecipeSubmitData(buildForm(), nutritionData)
    expect(data.name).toBe('可能过时的版本名')
  })

  it('omitName = true 时不提交 name（系列食谱走这条）', () => {
    const data = buildRecipeSubmitData(
      buildForm(),
      nutritionData,
      {},
      undefined,
      { omitName: true },
    )
    expect(data).not.toHaveProperty('name')
  })

  it('omitName 不影响其它字段与状态覆盖', () => {
    const data = buildRecipeSubmitData(
      buildForm({ coverTitle: '含兔肉' }),
      nutritionData,
      { status: RecipeStatus.DRAFT },
      undefined,
      { omitName: true },
    )
    expect(data).not.toHaveProperty('name')
    expect(data.coverTitle).toBe('含兔肉')
    expect(data.status).toBe(RecipeStatus.DRAFT)
  })
})
