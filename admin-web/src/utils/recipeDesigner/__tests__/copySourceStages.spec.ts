import { describe, expect, it } from 'vitest'
import { resolveCopySourceStages } from '../copySourceStages'
import type { RecipeDesignerSeriesStage } from '../../../types/recipeDesigner'

function stage(
  lifeStage: string,
  draftId: string | null,
  recipeId: string | null,
): RecipeDesignerSeriesStage {
  return {
    lifeStage,
    label: lifeStage,
    scenario: 'ADULT_MER_110',
    status: 'NOT_DESIGNED',
    draftId,
    recipeId
  }
}

describe('resolveCopySourceStages', () => {
  const stages: RecipeDesignerSeriesStage[] = [
    stage('PUPPY_UNDER_14_WEEKS', 'draft-puppy', 'recipe-puppy'), // 已发布且有草稿
    stage('PUPPY_14_WEEKS_PLUS', 'draft-target', null), // 目标阶段（未发布）
    stage('HIGH_ACTIVITY_ADULT', 'draft-adult', 'recipe-adult'), // 已发布
    stage('LOW_ACTIVITY_ADULT_OR_SENIOR', 'draft-senior', 'recipe-senior'), // 已发布
    stage('REPRODUCTION', 'draft-repro', null) // 未发布
  ]

  it('已发布的成熟阶段也能作为来源（不再只列未发布阶段）', () => {
    const sources = resolveCopySourceStages(stages, 'PUPPY_14_WEEKS_PLUS')
    expect(sources.map((item) => item.lifeStage)).toEqual([
      'PUPPY_UNDER_14_WEEKS',
      'HIGH_ACTIVITY_ADULT',
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
      'REPRODUCTION'
    ])
  })

  it('排除目标阶段自身', () => {
    const sources = resolveCopySourceStages(stages, 'HIGH_ACTIVITY_ADULT')
    expect(sources.some((item) => item.lifeStage === 'HIGH_ACTIVITY_ADULT')).toBe(false)
  })

  it('只有正式版本、没有草稿的阶段同样可选', () => {
    const sources = resolveCopySourceStages(
      [stage('REPRODUCTION', null, 'recipe-repro')],
      'PUPPY_14_WEEKS_PLUS',
    )
    expect(sources).toHaveLength(1)
  })

  it('既没有草稿也没有正式版本的空阶段不可选', () => {
    const sources = resolveCopySourceStages(
      [stage('REPRODUCTION', null, null)],
      'PUPPY_14_WEEKS_PLUS',
    )
    expect(sources).toHaveLength(0)
  })

  it('stages 为空或缺省时返回空数组', () => {
    expect(resolveCopySourceStages(undefined, 'PUPPY_14_WEEKS_PLUS')).toEqual([])
    expect(resolveCopySourceStages([], undefined)).toEqual([])
  })
})
