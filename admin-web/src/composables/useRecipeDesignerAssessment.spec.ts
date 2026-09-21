import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/api/recipeDesigner', () => ({
  recipeDesignerApi: {
    getAssessmentInputs: vi.fn()
  }
}))

import { useRecipeDesignerAssessment } from './useRecipeDesignerAssessment'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { AssessmentTarget } from '@/types/recipeDesigner'

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
