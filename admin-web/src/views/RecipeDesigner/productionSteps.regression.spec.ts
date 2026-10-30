import { describe, expect, it } from 'vitest'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import launchReadinessSource from '@/views/RecipeDesigner/components/LaunchReadinessDrawer.vue?raw'
import productionStepsEditorSource from '@/views/RecipeDesigner/components/ProductionStepsEditor.vue?raw'
import designerApiSource from '@/api/recipeDesigner.ts?raw'
import designerTypesSource from '@/types/recipeDesigner.ts?raw'
import {
  appendProductionStep,
  buildProductionStepsPayload,
  moveProductionStep,
  normalizeProductionSteps,
  removeProductionStep,
  validateProductionStepsForSave
} from '@/utils/recipeDesigner/productionSteps'
import type { DesignerProductionStep } from '@/types/recipeDesigner'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('设计器 · 制作步骤编辑器（2026-10-22 · Task 7）', () => {
  const component = clean(productionStepsEditorSource)
  const editor = clean(editorSource)
  const launchDrawer = clean(launchReadinessSource)

  it('按草稿加载步骤，保存走 PATCH production-steps', () => {
    expect(component).toContain('recipeDesignerApi.getDraftProductionSteps')
    expect(component).toContain('recipeDesignerApi.updateDraftProductionSteps')
    expect(component).toContain('props.draftId')
    expect(component).toContain('{ steps: payload }')
    expect(designerApiSource).toContain(
      '`/recipe-designer/drafts/${draftId}/production-steps`'
    )
    expect(designerApiSource).toContain(
      'api.patch(`/recipe-designer/drafts/${draftId}/production-steps`, payload)'
    )
    expect(designerApiSource).toContain('getDraftProductionSteps')
    expect(designerApiSource).toContain('updateDraftProductionSteps')
  })

  it('支持新增 / 编辑 / 删除 / 上下移动，sortOrder 自动 1..n', () => {
    expect(component).toContain('handleAddStep')
    expect(component).toContain('handleRemoveStep')
    expect(component).toContain('handleMoveStep')
    expect(component).toContain('appendProductionStep')
    expect(component).toContain('removeProductionStep')
    expect(component).toContain('moveProductionStep')
    expect(component).toContain("'up'")
    expect(component).toContain("'down'")
    expect(component).toContain('PRODUCTION_STEP_LIMITS.maxSteps')
  })

  it('字段：操作说明必填，时长 / 温度 / 设备可选且限制与后端一致', () => {
    expect(component).toContain('操作说明')
    expect(component).toContain('v-model="step.instruction"')
    expect(component).toContain('maxlength="500"')
    expect(component).toContain('durationMinutes')
    expect(component).toContain('temperatureC')
    expect(component).toContain('equipment')
    expect(component).toContain('PRODUCTION_STEP_LIMITS.maxDurationMinutes')
    expect(component).toContain('PRODUCTION_STEP_LIMITS.minTemperatureC')
    expect(component).toContain('PRODUCTION_STEP_LIMITS.maxTemperatureC')
    expect(component).toContain('PRODUCTION_STEP_LIMITS.maxEquipmentLength')
    expect(component).toContain('validateProductionStep')
    expect(component).toContain('validateProductionStepsForSave')
  })

  it('处理加载中 / 加载失败 / 保存中 / 保存失败 / 脏状态', () => {
    expect(component).toContain('v-loading="loading"')
    expect(component).toContain('loadError')
    expect(component).toContain('重新加载')
    expect(component).toContain('saveError')
    expect(component).toContain('saving')
    expect(component).toContain('dirty')
    expect(component).toContain('有未保存修改')
    expect(component).toContain('savedSignature')
    expect(component).toContain("emit('dirty-change'")
  })

  it('旧版纯文本步骤只读提示：仅在没有结构化步骤且旧文本存在时展示', () => {
    expect(component).toContain('legacySteps')
    expect(component).toContain('showLegacyHint')
    expect(component).toContain('旧版')
    expect(component).toContain('只读')
    const hintDefinition = component.indexOf('const showLegacyHint')
    const hintBlock = component.slice(hintDefinition, hintDefinition + 300)
    expect(hintBlock).toContain('steps.value.length === 0')
    expect(component).not.toContain('legacySteps.split')
    expect(component).not.toContain('自动转换旧版')
  })

  it('制作步骤已并入上线检查抽屉，不离开页面，且保留补剂与原料处理 UI', () => {
    expect(launchDrawer).toContain('ProductionStepsEditor')
    expect(launchDrawer).toContain(':draft-id="draftId"')
    expect(launchDrawer).toContain('@saved="handleStepsSaved"')
    expect(launchDrawer).toContain('@dirty-change')
    expect(launchDrawer).toContain('还有未保存的修改')
    // 设计器不再保留第二个制作步骤入口
    expect(editor).not.toContain('productionStepsDrawerVisible')
    expect(editor).not.toContain('制作步骤{{ productionStepsDirty')
    // 不新增路由跳转，制作步骤留在当前设计器页面
    expect(editor).not.toContain("router.push('/recipe-designer/steps")
    // 原有补剂目标与原料预处理 UI 不得被替换
    expect(editor).toContain('SupplementTargetDialog')
    expect(editor).toContain('itemSupplementTargetViews')
    expect(editor).toContain('PREPARATION_FIELD_LABEL')
    expect(editor).toContain('onPreparationMethodChange')
    expect(editor).not.toContain('PreparationMethodManagerDialog')
  })

  it('类型与 API 载荷命名和路由契约一致', () => {
    expect(designerTypesSource).toContain('DesignerProductionStep')
    expect(designerTypesSource).toContain('DesignRecipeProductionStepsResult')
    expect(designerTypesSource).toContain('UpdateDesignRecipeProductionStepsPayload')
    expect(designerTypesSource).toContain('productionSteps: DesignerProductionStep[]')
    expect(designerApiSource).toContain('DesignRecipeProductionStepsResult')
  })
})

describe('制作步骤 · 一次完整编辑行为（加载 → 新增 → 排序 → 删除 → 校验 → 保存载荷）', () => {
  it('顺序与 sortOrder 始终一致，坏步骤被丢弃，最终载荷可直接 PATCH', () => {
    // 加载：后端已存的步骤（含一条坏数据）
    let steps: DesignerProductionStep[] = normalizeProductionSteps([
      { sortOrder: 2, instruction: '混合均匀', durationMinutes: 5 },
      { sortOrder: 1, instruction: '称重', equipment: '厨房秤' },
      { sortOrder: 3, instruction: '   ' }
    ])
    expect(steps.map((step) => step.instruction)).toEqual(['称重', '混合均匀'])
    expect(steps.map((step) => step.sortOrder)).toEqual([1, 2])

    // 新增第三步并填写
    steps = appendProductionStep(steps)
    const appended = steps[steps.length - 1]
    expect(appended).toBeDefined()
    if (!appended) return
    appended.instruction = ' 分装冷冻 '
    appended.temperatureC = -18
    expect(steps.map((step) => step.sortOrder)).toEqual([1, 2, 3])

    // 上移第二、三步，验证重排（文本两端空白由保存载荷统一裁剪）
    steps = moveProductionStep(steps, 2, 'up')
    expect(steps.map((step) => step.instruction)).toEqual([
      '称重',
      ' 分装冷冻 ',
      '混合均匀'
    ])
    expect(steps.map((step) => step.sortOrder)).toEqual([1, 2, 3])

    // 删除第三步
    steps = removeProductionStep(steps, 2)
    expect(steps.map((step) => step.instruction)).toEqual(['称重', ' 分装冷冻 '])
    expect(steps.map((step) => step.sortOrder)).toEqual([1, 2])

    // 校验并生成保存载荷（操作说明两端空白在此统一裁剪）
    const validation = validateProductionStepsForSave(steps)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.steps).toEqual([
      {
        sortOrder: 1,
        instruction: '称重',
        durationMinutes: null,
        temperatureC: null,
        equipment: '厨房秤'
      },
      {
        sortOrder: 2,
        instruction: '分装冷冻',
        durationMinutes: null,
        temperatureC: -18,
        equipment: null
      }
    ])
    expect(buildProductionStepsPayload(steps)).toEqual(validation.steps)
  })

  it('缺操作说明 / 温度越界时不允许保存', () => {
    const steps = normalizeProductionSteps([
      { sortOrder: 1, instruction: '称重' },
      { sortOrder: 2, instruction: '烘烤' }
    ])
    // 模拟用户在输入框里改出了越界温度（input-number 之外的其他入口）
    const baked = steps[1]
    expect(baked).toBeDefined()
    if (!baked) return
    baked.temperatureC = 600
    const validation = validateProductionStepsForSave(steps)
    expect(validation.ok).toBe(false)
    if (!validation.ok) expect(validation.error).toContain('温度')

    const emptyInstruction = validateProductionStepsForSave([
      { sortOrder: 1, instruction: '   ' }
    ])
    expect(emptyInstruction.ok).toBe(false)
    if (!emptyInstruction.ok) expect(emptyInstruction.error).toContain('操作说明')
  })
})
