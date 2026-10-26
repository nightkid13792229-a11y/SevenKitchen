import { describe, expect, it } from 'vitest'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import assessmentSource from '@/views/RecipeDesigner/components/AssessmentPanel.vue?raw'
import dialogSource from '@/views/RecipeDesigner/components/SupplementTargetDialog.vue?raw'
import preparationFieldSource from '@/views/RecipeDesigner/components/PreparationMethodField.vue?raw'
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

  it('弹窗只列出独立营养字段，不再提供派生组合目标', () => {
    expect(dialog).toContain('listSupplementTargetFieldCandidates')
    expect(dialog).toContain('必须选择至少一个目标营养素')
    expect(dialog).toContain('canConfirm')
    expect(dialog).toContain(':disabled="!canConfirm"')
    expect(dialog).toContain('v-model="selectedFieldPaths"')
    expect(dialog).toContain('multiple')

    // 组合 / 派生目标的 UI 与提示必须彻底移除
    expect(dialog).not.toContain('组合')
    expect(dialog).not.toContain('派生字段')
    expect(dialog).not.toContain('hasDerivedCandidates')
    expect(dialog).not.toContain('DERIVED')
    expect(dialog).not.toContain('target-combination-hint')
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

describe('设计器 · 原料预处理控件内联与 Tab 顺序', () => {
  const editor = clean(editorSource)

  function itemControlsSource() {
    const start = editor.indexOf('<div class="item-controls">')
    const end = editor.indexOf('item-supplement-row', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return editor.slice(start, end)
  }

  it('部位 / 状态 / 预处理与重量、占比、开关同排，不再有管理 / 来源标签', () => {
    const controls = itemControlsSource()

    expect(controls).toContain('class="preparation-method-field"')
    expect(controls).toContain('PREPARATION_FIELD_LABEL')
    expect(controls).not.toContain('preparationSource ===')
    expect(controls).not.toContain('人工')
    expect(controls).not.toContain('自动')
    expect(controls).not.toContain('preparation-manage-btn')
    expect(controls).not.toContain('openPreparationMethodManager')
    expect(controls).toContain('class="weight-input"')
    expect(controls).toContain('class="item-ratio-column"')
    expect(controls).toContain('el-switch')
    expect(controls).toContain('type="danger"')

    const prepIndex = controls.indexOf('class="preparation-method-field"')
    const weightIndex = controls.indexOf('class="weight-input"')
    const ratioIndex = controls.indexOf('class="item-ratio-column"')
    expect(prepIndex).toBeGreaterThan(-1)
    expect(weightIndex).toBeGreaterThan(prepIndex)
    expect(ratioIndex).toBeGreaterThan(weightIndex)
  })

  it('预处理控件不再放在原料名称 / 档案名称下方', () => {
    const itemMetaStart = editor.indexOf('<div class="item-meta">')
    const itemMetaEnd = editor.indexOf('</div>', itemMetaStart)
    const itemMeta = editor.slice(itemMetaStart, itemMetaEnd)

    expect(itemMetaStart).toBeGreaterThan(-1)
    expect(itemMeta).toContain('item-profile-name')
    expect(itemMeta).not.toContain('preparation-method-field')
    expect(itemMeta).not.toContain('preparation-label')
    expect(itemMeta).not.toContain('preparation-manage-btn')

    const prepIndex = editor.indexOf('class="preparation-method-field"')
    const controlsIndex = editor.indexOf('<div class="item-controls">')
    expect(controlsIndex).toBeGreaterThan(-1)
    expect(prepIndex).toBeGreaterThan(controlsIndex)
  })

  it('重量输入是行内唯一可 Tab 进入的控件，其余控件 tabindex=-1', () => {
    const controls = itemControlsSource()

    const tabindexCount = (controls.match(/:tabindex="-1"/g) ?? []).length
    expect(tabindexCount).toBeGreaterThanOrEqual(3)

    const prepTag = controls.slice(
      controls.indexOf('<PreparationMethodField'),
      controls.indexOf('/>', controls.indexOf('<PreparationMethodField'))
    )
    expect(prepTag).toContain(':tabindex="-1"')

    const switchTag = controls.slice(
      controls.indexOf('<el-switch'),
      controls.indexOf('/>', controls.indexOf('<el-switch'))
    )
    expect(switchTag).toContain(':tabindex="-1"')

    const deleteTag = controls.slice(
      controls.indexOf(':icon="Delete"'),
      controls.indexOf('/>', controls.indexOf(':icon="Delete"'))
    )
    expect(deleteTag).toContain(':tabindex="-1"')

    const weightTag = controls.slice(
      controls.indexOf('<el-input-number'),
      controls.indexOf('/>', controls.indexOf('<el-input-number'))
    )
    expect(weightTag).not.toContain('tabindex="-1"')
    expect(editor).toContain('weight-input')
    expect(editor).toContain(':tabindex="-1"')
  })

  it('行内不再提供预处理补充说明输入', () => {
    expect(editor).not.toContain('preparation-note-input')
    expect(editor).not.toContain('onPreparationNoteChange')
    expect(editor).not.toContain('补充说明')
    expect(designerTypesSource).toContain('preparationMethod?: string')
  })

  it('预处理修改通过 updateItem 持久化，不复制历史默认值', () => {
    expect(editor).toContain('data: { preparationMethod: nextMethod }')
    expect(editor).not.toContain('historicalPreparation')
  })

  it('同一原料排队的多个字段修改会合并，不会互相覆盖', () => {
    expect(saveQueueSource).toContain('...existing.data, ...op.data')
  })
})

describe('设计器 · 部位 / 状态 / 预处理可直接编辑（2026-10-26）', () => {
  const editor = clean(editorSource)
  const field = clean(preparationFieldSource)

  it('编辑器用可编辑输入框替换只能选的下拉框，并回填当前文字', () => {
    expect(editor).toContain('<PreparationMethodField')
    expect(editor).toContain(':model-value="element.preparationMethod')
    expect(editor).toContain(':label="element.preparationMethodLabel')
    expect(editor).toContain(':ingredient-id="element.ingredientId"')
    expect(editor).not.toContain(':legacy-options="preparationMethodOptions"')
    expect(editor).not.toContain(':options="preparationMethodOptions"')
    expect(editor).not.toContain('<el-select')
  })

  it('输入框直接显示原文字，回车 / 失焦都会提交', () => {
    expect(field).toContain('el-autocomplete')
    expect(field).toContain('v-model="text"')
    expect(field).toContain('select-when-unmatched')
    expect(field).toContain('@select="handleSelect"')
    expect(field).toContain('@change="handleChange"')
    expect(field).toContain('@blur="handleBlur"')
    expect(field).toContain('resolvePreparationMethodDisplayText')
  })

  it('下拉建议来自该原料历史，最多 3 条，不再保存字典 id', () => {
    expect(field).toContain('getIngredientPreparationMethodHistory')
    expect(field).toContain('resolvePreparationHistorySuggestions')
    expect(field).toContain('resolvePreparationMethodCommitText')
    expect(field).not.toContain('filterPreparationMethodOptions')
    expect(field).not.toContain('applyPreparationMethodSuggestion')
    expect(field).toContain('clearable')
    expect(field).toContain('width: 240px')
    expect(field).toContain('preparation-method-field')
  })
})
