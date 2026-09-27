import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/api/recipeDesigner', () => ({
  recipeDesignerApi: {
    getAssessmentInputs: vi.fn()
  }
}))

import { useRecipeDesignerAssessment } from './useRecipeDesignerAssessment'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { AssessmentTarget, DesignerItem } from '@/types/recipeDesigner'

const mockGetAssessmentInputs = recipeDesignerApi.getAssessmentInputs as ReturnType<typeof vi.fn>

const TARGET: AssessmentTarget = {
  nutrientKey: 'protein',
  label: '蛋白质',
  category: 'MACRO',
  expressionBasis: 'PER_1000_KCAL_ME',
  unit: 'g',
  minValue: 75,
  maxValue: 200,
  fieldPaths: ['protein']
}

describe('useRecipeDesignerAssessment', () => {
  beforeEach(() => {
    mockGetAssessmentInputs.mockReset()
  })

  it('loadInputs 完成后目标值可被读取（首次进入编辑器即应有评估数据）', async () => {
    mockGetAssessmentInputs.mockResolvedValue({ targets: [TARGET], items: [] })
    const { loadInputs, getTargets, loadingInputs } = useRecipeDesignerAssessment()

    expect(getTargets('draft-1')).toEqual([])

    await loadInputs('draft-1', 'ADULT_MER_110')

    expect(getTargets('draft-1')).toEqual([TARGET])
    expect(loadingInputs.value).toBe(false)
  })

  it('refreshInputs 期间 loading 置位并在完成后恢复（评估计算依赖此状态触发重算）', async () => {
    mockGetAssessmentInputs.mockResolvedValue({ targets: [TARGET], items: [] })
    const { loadInputs, refreshInputs, loadingInputs } = useRecipeDesignerAssessment()

    await loadInputs('draft-2', 'ADULT_MER_110')
    expect(loadingInputs.value).toBe(false)

    let duringRefresh = false
    mockGetAssessmentInputs.mockImplementation(async () => {
      duringRefresh = loadingInputs.value === true
      return { targets: [TARGET], items: [] }
    })

    await refreshInputs('draft-2')
    expect(duringRefresh).toBe(true)
    expect(loadingInputs.value).toBe(false)
  })

  it('refreshInputs 期间保留上一次的评估输入，营养评估面板不会闪回空白', async () => {
    mockGetAssessmentInputs.mockResolvedValue({ targets: [TARGET], items: [] })
    const { loadInputs, refreshInputs, getTargets, compute } = useRecipeDesignerAssessment()

    await loadInputs('draft-3', 'ADULT_MER_110')

    let release: (value: unknown) => void = () => {}
    mockGetAssessmentInputs.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )

    const pending = refreshInputs('draft-3')

    // 刷新请求还没回来时，目标值仍在、评估结果仍可计算（面板不塌成空白）
    expect(getTargets('draft-3')).toEqual([TARGET])
    expect(compute('ADULT_MER_110', 'draft-3', [])).not.toBeNull()

    release({ targets: [TARGET], items: [] })
    await pending
    expect(getTargets('draft-3')).toEqual([TARGET])
  })

  it('refreshInputs 失败时保留上一次可用的评估输入', async () => {
    mockGetAssessmentInputs.mockResolvedValue({ targets: [TARGET], items: [] })
    const { loadInputs, refreshInputs, getTargets } = useRecipeDesignerAssessment()

    await loadInputs('draft-4', 'ADULT_MER_110')

    mockGetAssessmentInputs.mockRejectedValue(new Error('网络错误'))
    await refreshInputs('draft-4')

    expect(getTargets('draft-4')).toEqual([TARGET])
  })
})

/**
 * 回归：跨阶段复制原料（以及切换阶段）会把目标草稿的原料记录整批删掉重建，
 * 原料 id 全部换新；而缓存里的营养档案是按原料 id 索引的。
 * 一旦复用这份旧缓存，评估引擎拿新原料 id 去旧档案里查，一条都对不上：
 * 「关键比例仪表」全是「—」、「营养评估」整片「缺数据」，而配方明细看起来完全正常。
 * 所以进入编辑器时必须校验缓存与当前原料是否对得上。
 */
describe('useRecipeDesignerAssessment 缓存校验（跨阶段复制/切换阶段后）', () => {
  const scenario = 'ADULT_MER_110' as const

  function inputsWith(draftId: string, itemIds: string[]) {
    return {
      draftId,
      name: '测试配方',
      scenario,
      nutritionStandard: 'FEDIAF_2025',
      targets: [TARGET],
      items: itemIds.map((id) => ({
        id,
        name: `原料-${id}`,
        ingredientType: 'FOOD',
        weightG: 50,
        nutritionProfile: { meta: {}, macros: {} }
      }))
    }
  }

  function editorItems(itemIds: string[]): DesignerItem[] {
    return itemIds.map((id) => ({ id, weightG: 50, includeInAssessment: true }))
  }

  beforeEach(() => {
    mockGetAssessmentInputs.mockReset()
  })

  // 注意：评估缓存是模块级的（跨用例共享），每个用例使用独立草稿 id 保证互不干扰
  it('同一批原料再次进入编辑器时复用缓存，不重复请求', async () => {
    const draftId = 'draft-reuse'
    mockGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-1']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['item-1']))
    await loadInputs(draftId, scenario, editorItems(['item-1']))

    expect(mockGetAssessmentInputs).toHaveBeenCalledTimes(1)
  })

  it('原料被复制替换（id 全变了）时必须重新拉取', async () => {
    const draftId = 'draft-copy-replaced'
    mockGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-old']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['item-old']))

    mockGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-new']))
    await loadInputs(draftId, scenario, editorItems(['item-new']))

    expect(mockGetAssessmentInputs).toHaveBeenCalledTimes(2)
  })

  it('原料条数相同但 id 不同（增删后重排）同样重新拉取', async () => {
    const draftId = 'draft-copy-same-count'
    mockGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['a', 'b']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['a', 'b']))
    mockGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['a', 'c']))
    await loadInputs(draftId, scenario, editorItems(['a', 'c']))

    expect(mockGetAssessmentInputs).toHaveBeenCalledTimes(2)
  })

  it('生命阶段（情境）变了要重新拉取，否则会拿旧阶段的标准表评估', async () => {
    const draftId = 'draft-stage-switch'
    mockGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-1']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['item-1']))
    await loadInputs(draftId, 'LATE_GROWTH', editorItems(['item-1']))

    expect(mockGetAssessmentInputs).toHaveBeenCalledTimes(2)
  })

  it('计入评估的原料集合变了（新增原料）要重新拉取', async () => {
    const draftId = 'draft-included-set'
    mockGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-1']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['item-1']))
    mockGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-1', 'item-2']))
    await loadInputs(draftId, scenario, [
      { id: 'item-1', weightG: 50, includeInAssessment: true },
      { id: 'item-2', weightG: 10, includeInAssessment: true }
    ])

    expect(mockGetAssessmentInputs).toHaveBeenCalledTimes(2)
  })
})
