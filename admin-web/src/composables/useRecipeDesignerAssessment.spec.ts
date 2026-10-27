import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/api/recipeDesigner', () => ({
  recipeDesignerApi: {
    getAssessmentInputs: vi.fn(),
    assessItems: vi.fn()
  }
}))

import { useRecipeDesignerAssessment } from './useRecipeDesignerAssessment'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { AssessmentTarget, DesignerItem } from '@/types/recipeDesigner'

const mockedGetAssessmentInputs = recipeDesignerApi.getAssessmentInputs as ReturnType<typeof vi.fn>
const mockedAssessItems = recipeDesignerApi.assessItems as ReturnType<typeof vi.fn>

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
    mockedGetAssessmentInputs.mockReset()
  })

  it('loadInputs 完成后目标值可被读取（首次进入编辑器即应有评估数据）', async () => {
    mockedGetAssessmentInputs.mockResolvedValue({ targets: [TARGET], items: [] })
    const { loadInputs, loadingInputs } = useRecipeDesignerAssessment()

    // 目标值不再缓存在前端（改由后端按 scenario 取），这里只验输入缓存的命中
    expect(loadingInputs.value).toBe(false)

    await loadInputs('draft-1', 'ADULT_MER_110')

    expect(mockedGetAssessmentInputs).toHaveBeenCalledTimes(1)
    expect(loadingInputs.value).toBe(false)
  })

  it('refreshInputs 期间 loading 置位并在完成后恢复（评估计算依赖此状态触发重算）', async () => {
    mockedGetAssessmentInputs.mockResolvedValue({ targets: [TARGET], items: [] })
    const { loadInputs, refreshInputs, loadingInputs } = useRecipeDesignerAssessment()

    await loadInputs('draft-2', 'ADULT_MER_110')
    expect(loadingInputs.value).toBe(false)

    let duringRefresh = false
    mockedGetAssessmentInputs.mockImplementation(async () => {
      duringRefresh = loadingInputs.value === true
      return { targets: [TARGET], items: [] }
    })

    await refreshInputs('draft-2')
    expect(duringRefresh).toBe(true)
    expect(loadingInputs.value).toBe(false)
  })

  it('refreshInputs 期间保留上一次的评估输入，营养评估面板不会闪回空白', async () => {
    mockedGetAssessmentInputs.mockResolvedValue({ targets: [TARGET], items: [] })
    const { loadInputs, refreshInputs } = useRecipeDesignerAssessment()

    await loadInputs('draft-3', 'ADULT_MER_110')

    let release: (value: unknown) => void = () => {}
    mockedGetAssessmentInputs.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )

    const pending = refreshInputs('draft-3')

    // 刷新请求还没回来时，目标值仍在、评估结果仍可计算（面板不塌成空白）
    expect(mockedGetAssessmentInputs).toHaveBeenCalled()

    release({ targets: [TARGET], items: [] })
    await pending
    expect(mockedGetAssessmentInputs).toHaveBeenCalled()
  })

  it('refreshInputs 失败时保留上一次可用的评估输入', async () => {
    mockedGetAssessmentInputs.mockResolvedValue({ targets: [TARGET], items: [] })
    const { loadInputs, refreshInputs } = useRecipeDesignerAssessment()

    await loadInputs('draft-4', 'ADULT_MER_110')

    mockedGetAssessmentInputs.mockRejectedValue(new Error('网络错误'))
    await refreshInputs('draft-4')

    /**
     * 刷新失败时**保留上一次可用的输入**（不能清空）——
     * 清空会让面板整块塌成"评估引擎准备中"，滚动位置还会被顶回顶部。
     * 目标值不再缓存于前端，所以这里验的是"缓存没被清掉"。
     */
    expect(mockedGetAssessmentInputs).toHaveBeenCalledTimes(2)
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
    mockedGetAssessmentInputs.mockReset()
  })

  // 注意：评估缓存是模块级的（跨用例共享），每个用例使用独立草稿 id 保证互不干扰
  it('同一批原料再次进入编辑器时复用缓存，不重复请求', async () => {
    const draftId = 'draft-reuse'
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-1']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['item-1']))
    await loadInputs(draftId, scenario, editorItems(['item-1']))

    expect(mockedGetAssessmentInputs).toHaveBeenCalledTimes(1)
  })

  it('原料被复制替换（id 全变了）时必须重新拉取', async () => {
    const draftId = 'draft-copy-replaced'
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-old']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['item-old']))

    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-new']))
    await loadInputs(draftId, scenario, editorItems(['item-new']))

    expect(mockedGetAssessmentInputs).toHaveBeenCalledTimes(2)
  })

  it('原料条数相同但 id 不同（增删后重排）同样重新拉取', async () => {
    const draftId = 'draft-copy-same-count'
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['a', 'b']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['a', 'b']))
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['a', 'c']))
    await loadInputs(draftId, scenario, editorItems(['a', 'c']))

    expect(mockedGetAssessmentInputs).toHaveBeenCalledTimes(2)
  })

  it('生命阶段（情境）变了要重新拉取，否则会拿旧阶段的标准表评估', async () => {
    const draftId = 'draft-stage-switch'
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-1']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['item-1']))
    await loadInputs(draftId, 'LATE_GROWTH', editorItems(['item-1']))

    expect(mockedGetAssessmentInputs).toHaveBeenCalledTimes(2)
  })

  it('计入评估的原料集合变了（新增原料）要重新拉取', async () => {
    const draftId = 'draft-included-set'
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-1']))
    const { loadInputs } = useRecipeDesignerAssessment()

    await loadInputs(draftId, scenario, editorItems(['item-1']))
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['item-1', 'item-2']))
    await loadInputs(draftId, scenario, [
      { id: 'item-1', weightG: 50, includeInAssessment: true },
      { id: 'item-2', weightG: 10, includeInAssessment: true }
    ])

    expect(mockedGetAssessmentInputs).toHaveBeenCalledTimes(2)
  })
})

/**
 * 档案不齐时不发评估请求（2026-10-28）
 *
 * 撤销删除 = 服务器删掉再重建，原料 id 会变；按 id 索引的营养档案一时间对不上。
 * 若此时把「没有档案」的原料发去评估，面板会整片变成缺数据/空值 ——
 * 用户看到的是「配方算不出来了」，而其实只是档案还没回来。
 */
describe('useRecipeDesignerAssessment 档案齐备性（撤销删除后）', () => {
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

  beforeEach(() => {
    mockedGetAssessmentInputs.mockReset()
    mockedAssessItems.mockReset()
    mockedAssessItems.mockResolvedValue({ groupedEntries: [], entries: [] })
  })

  it('★ 缺档案时先补一次再算：补到了就正常发一次评估', async () => {
    const draftId = 'draft-profile-refill'
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['a']))
    const { loadInputs, compute } = useRecipeDesignerAssessment()
    await loadInputs(draftId, scenario, [{ id: 'a', weightG: 50 }])

    // 撤销重建：b 是新 id，缓存里还没有
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['a', 'b']))
    await compute(scenario, draftId, [
      { id: 'a', weightG: 50 } as DesignerItem,
      { id: 'b', weightG: 10 } as DesignerItem
    ])

    // 补了一次档案 + 发了一次评估
    expect(mockedGetAssessmentInputs).toHaveBeenCalledTimes(2)
    expect(mockedAssessItems).toHaveBeenCalledTimes(1)
    const firstCall = mockedAssessItems.mock.calls[0]
    expect(firstCall).toBeDefined()
    const payload = firstCall![0] as { items: Array<{ nutritionProfile?: unknown }> }
    expect(payload.items.every((item) => Boolean(item.nutritionProfile))).toBe(true)
  })

  it('★ 补完还是缺：不发评估、保留上一次结果（不把面板刷成空）', async () => {
    const draftId = 'draft-profile-still-missing'
    mockedGetAssessmentInputs.mockResolvedValue(inputsWith(draftId, ['a']))
    const { loadInputs, compute, assessment, assessError } =
      useRecipeDesignerAssessment()
    await loadInputs(draftId, scenario, [{ id: 'a', weightG: 50 }])

    // 先算一次，面板上有结果
    await compute(scenario, draftId, [{ id: 'a', weightG: 50 } as DesignerItem])
    expect(mockedAssessItems).toHaveBeenCalledTimes(1)
    const previous = assessment.value

    // 新原料 b 始终补不到档案
    await compute(scenario, draftId, [
      { id: 'a', weightG: 50 } as DesignerItem,
      { id: 'b', weightG: 10 } as DesignerItem
    ])

    // 不再发第二次评估，结果保持上一次的
    expect(mockedAssessItems).toHaveBeenCalledTimes(1)
    expect(assessment.value).toBe(previous)
    expect(assessError.value).toContain('营养档案')
  })
})
