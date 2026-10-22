import { describe, expect, it } from 'vitest'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import assessmentSource from '@/views/RecipeDesigner/components/AssessmentPanel.vue?raw'
import dialogSource from '@/views/RecipeDesigner/components/SupplementTargetDialog.vue?raw'
import designerApiSource from '@/api/recipeDesigner.ts?raw'
import saveQueueSource from '@/composables/useDesignerSaveQueue.ts?raw'
import designerTypesSource from '@/types/recipeDesigner.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('设计器 · 添加补剂必须先选择目标营养素', () => {
  const editor = clean(editorSource)
  const dialog = clean(dialogSource)

  it('原料库 / 智能添加的补剂统一走目标选择弹窗，不直接 addItem', () => {
    expect(editor).toContain('isSupplementOption(option)')
    expect(editor).toContain('openSupplementTargetAddDialog')
    expect(editor).toContain('SupplementTargetDialog')

    const addStart = editor.indexOf('async function handleAddOption')
    const supplementBranch = editor.indexOf('isSupplementOption(option)', addStart)
    const addItemCall = editor.indexOf(
      'recipeDesignerApi.addItem(draft.value.id, payload)',
      addStart
    )
    expect(supplementBranch).toBeGreaterThan(addStart)
    expect(addItemCall).toBeGreaterThan(supplementBranch)
  })

  it('弹窗列出档案非空字段，未选目标时禁用确认', () => {
    expect(dialog).toContain('listSupplementTargetFieldCandidates')
    expect(dialog).toContain('必须选择至少一个目标营养素')
    expect(dialog).toContain('canConfirm')
    expect(dialog).toContain(':disabled="!canConfirm"')
    expect(dialog).toContain('v-model="selectedFieldPaths"')
    expect(dialog).toContain('multiple')
  })

  it('默认目标会预选；智能添加把当前评估营养素加进预选', () => {
    expect(editor).toContain('readDefaultSupplementTargets(detail)')
    expect(editor).toContain('resolveSupplementTargetFieldPath(nutrientKey)')
    expect(editor).toContain('initialTargets.push(definition)')
    expect(assessmentSource).toContain("emit('add-ingredient', option, profile, info.weightG, entry.nutrientKey)")
  })

  it('添加 / 修改目标都随 addItem / updateItem 提交目标定义', () => {
    expect(editor).toContain('supplementTargets: payloadTargets')
    expect(editor).toContain('recipeDesignerApi.updateItem(dialogState.itemId, {')
    expect(editor).toContain('supplementTargets: payloadTargets')
    expect(designerApiSource).toContain('supplementTargets?: RecipeDesignSupplementTargetPayload[]')
    expect(designerApiSource).toContain('preparationNote?: string | null')
    expect(designerApiSource).toContain("preparationSource?: 'AUTO' | 'MANUAL' | null")
  })

  it('明细行展示目标标签与实际添加浓度，并允许修改目标', () => {
    expect(editor).toContain('itemSupplementTargetViews')
    expect(editor).toContain('computeSupplementTargetConcentration')
    expect(editor).toContain('formatSupplementTargetConcentration')
    expect(editor).toContain('assessment.value?.totalWeightG')
    expect(editor).toContain('target.text')
    expect(editor).toContain('修改目标')
    expect(editor).toContain('未设置目标营养素')
  })

  it('没有目标时不允许保存目标（后端硬阻断在前端提前提示）', () => {
    expect(dialog).toContain('canConfirm')
    expect(editor).toContain('补剂至少需要选择一个目标营养素')
  })
})

describe('设计器 · 原料预处理编辑', () => {
  const editor = clean(editorSource)

  it('每行提供预处理方式选择 / 手填、补充说明与来源标签', () => {
    expect(editor).toContain('原料预处理')
    expect(editor).toContain('onPreparationMethodChange')
    expect(editor).toContain('allow-create')
    expect(editor).toContain('onPreparationNoteChange')
    expect(editor).toContain("element.preparationSource === 'MANUAL'")
    expect(editor).toContain('人工')
    expect(editor).toContain('自动')
  })

  it('预处理修改通过 updateItem 持久化，不复制历史默认值', () => {
    expect(editor).toContain('data: { preparationMethod: nextMethod }')
    expect(editor).toContain('data: { preparationNote: nextNote }')
    expect(editor).not.toContain('historicalPreparation')
    expect(designerTypesSource).toContain('preparationNote?: string | null')
    expect(designerTypesSource).toContain(
      "preparationSource?: DesignerPreparationSource | null"
    )
  })

  it('同一原料排队的多个字段修改会合并，不会互相覆盖', () => {
    expect(saveQueueSource).toContain('...existing.data, ...op.data')
  })
})
