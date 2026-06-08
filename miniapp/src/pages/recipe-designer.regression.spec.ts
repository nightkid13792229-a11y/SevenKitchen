import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildAssessmentCategories,
  canDisplayAssessmentRange,
  getAssessmentCategoryAttentionCount,
  getAssessmentCategoryLabel,
  getAssessmentCategoryTitle,
  getAssessmentBoundaryNote,
  getAssessmentBoundaryTitle,
  getAssessmentContributionRows,
  getAssessmentDetailModalContent,
  getAssessmentDetailNotes,
  getAssessmentDetailRows,
  getAssessmentDisplayEntry,
  getAssessmentDisplayStatusClass,
  getAssessmentDisplayStatusLabel,
  getAssessmentDryMatterLabel,
  getAssessmentNutrientSearchTarget,
  getAssessmentRangeConflictNote,
  getAssessmentStatusClass,
  getAssessmentStatusLabel,
  formatAssessmentRatioValue,
  getOverallStatusLabel,
  shouldShowAssessmentCurrentMarker,
  shouldShowAssessmentDetailTrigger,
  shouldShowAssessmentDryMatterInline,
} from './recipe-designer/assessment'
import { buildPublishNutritionReport } from './recipe-designer/publish-report'

const readSource = (path: string) => {
  const absolutePath = resolve(process.cwd(), path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : ''
}

const staffWorkbenchSource = readSource('src/pages/staff-workbench/index.vue')
const pagesJsonSource = readSource('src/pages.json')
const apiSource = readSource('src/api/recipe-designer.ts')
const editorSource = readSource('src/pages/recipe-designer/editor.vue')
const listSource = readSource('src/pages/recipe-designer/list.vue')
const supplementLibrarySource = readSource('src/pages/recipe-designer/supplement-library.vue')
const assessmentSource = readSource('src/pages/recipe-designer/assessment.ts')
const publishSource = readSource('src/pages/recipe-designer/publish.vue')

describe('recipe designer mobile entry', () => {
  it('links staff workbench to the recipe designer draft list', () => {
    expect(staffWorkbenchSource).toContain('食谱设计器')
    expect(staffWorkbenchSource).toContain('goToRecipeDesigner')
    expect(staffWorkbenchSource).toContain('/pages/recipe-designer/list')
  })

  it('registers recipe designer pages in pages.json', () => {
    expect(pagesJsonSource).toContain('pages/recipe-designer/list')
    expect(pagesJsonSource).toContain('pages/recipe-designer/editor')
    expect(pagesJsonSource).toContain('pages/recipe-designer/publish')
    expect(pagesJsonSource).toContain('pages/recipe-designer/supplement-library')
  })

  it('places supplement maintenance as a separate recipe designer library entry', () => {
    expect(listSource).toContain('补剂库')
    expect(listSource).toContain('goToSupplementLibrary')
    expect(listSource).toContain('/pages/recipe-designer/supplement-library')
  })

  it('loads recipe designer series cards instead of standalone draft cards', () => {
    expect(apiSource).toContain('RecipeDesignerSeriesCard')
    expect(apiSource).toContain('RecipeDesignerSeriesStage')
    expect(apiSource).toContain('RecipeSeriesStageStatus')
    expect(listSource).toContain('recipeDesignerApi.listSeries')
    expect(listSource).toContain('series.value')
    expect(listSource).toContain('series-card')
    expect(listSource).toContain('publishedStageCount')
    expect(listSource).toContain('seriesStageStatusLabels')
    expect(listSource).toContain('NOT_DESIGNED')
    expect(listSource).toContain('NEEDS_CHANGES')
    expect(listSource).not.toContain('cover')
    expect(listSource).not.toContain('系列设置')
    expect(listSource).not.toContain('进入编辑')
    expect(listSource).not.toContain('修订')
  })

  it('opens or creates a series stage draft from a stage row', () => {
    expect(listSource).toContain('openSeriesStage')
    expect(listSource).toContain('@tap.stop="openSeriesStage(seriesItem, stage)"')
    expect(listSource).toContain('stage.draftId')
    expect(listSource).toContain('recipeDesignerApi.createSeriesStageDraft')
    expect(listSource).toContain('{ scenario: stage.scenario }')
    expect(listSource).toContain('/pages/recipe-designer/editor?id=')
    expect(listSource).toContain("title: '进入阶段失败'")
  })

  it('offers published stage ingredient structures as templates before creating a blank stage draft', () => {
    expect(apiSource).toContain('sourceDraftId?: string')
    expect(listSource).toContain('getPublishedTemplateStages')
    expect(listSource).toContain('选择起始方式')
    expect(listSource).toContain('空白开始')
    expect(listSource).toContain('sourceDraftId: selectedTemplate.draftId')
  })

  it('lets users rename and safely delete recipe series from overflow actions only', () => {
    expect(listSource).toContain('series-actions')
    expect(listSource).toContain('series-more-btn')
    expect(listSource).toContain('openSeriesActionSheet(seriesItem)')
    expect(listSource).toContain('uni.showActionSheet')
    expect(listSource).toContain("itemList: ['重命名', '删除']")
    expect(listSource).toContain('重命名')
    expect(listSource).toContain('删除')
    expect(listSource).toContain('function renameSeries')
    expect(listSource).toContain('recipeDesignerApi.renameSeries')
    expect(listSource).toContain('function deleteSeries')
    expect(listSource).toContain('recipeDesignerApi.deleteSeries')
    expect(listSource).toContain('confirmName')
    expect(listSource).toContain('confirmUserVisibleRemoval')
    expect(listSource).toContain('editable: true')
    expect(listSource).not.toContain('@tap.stop="renameSeries(seriesItem)"')
    expect(listSource).not.toContain('@tap.stop="deleteSeries(seriesItem)"')
    expect(listSource).not.toContain('series-delete-btn')
    expect(listSource).not.toContain('recipeDesignerApi.deleteDraft')
    expect(listSource).not.toContain('recipeDesignerApi.updateDraft')
    expect(listSource).not.toContain('revision-draft-btn')
  })

  it('creates a new series and navigates to the backend initial draft when available', () => {
    expect(listSource).toContain('createSeries')
    expect(listSource).toContain('recipeDesignerApi.createSeries')
    expect(listSource).toContain('extractInitialDraftId')
    expect(listSource).toContain("name: '未命名食谱'")
    expect(listSource).not.toContain('recipeDesignerApi.createDraft')
  })

  it('automatically enters an editable revision draft for published recipe designer stages', () => {
    expect(editorSource).toContain('ensureEditableDraftAfterLoad(draft)')
    expect(editorSource).toContain('redirectingToEditableDraft')
    expect(editorSource).toContain('recipeDesignerApi.createRevisionDraft(draftId.value)')
    expect(editorSource).toContain('uni.redirectTo({ url: `/pages/recipe-designer/editor?id=${revisionId}` })')
    expect(editorSource).toContain("title: '正在进入可编辑版本'")
    expect(editorSource).toContain("title: '进入可编辑版本失败'")
    expect(editorSource).toContain("status === 'PUBLISHED'")
    expect(editorSource).not.toContain('isEditorReadOnly')
    expect(editorSource).not.toContain('readonly-banner')
    expect(editorSource).not.toContain('createRevisionFromPublishedDraft')
    expect(editorSource).not.toContain('@tap.stop="createRevisionFromPublishedDraft"')
    expect(editorSource).not.toContain('已发布版本只读')
    expect(editorSource).not.toContain('点击编辑后进入草稿，不影响当前上架版本。')
    expect(editorSource).not.toContain('已发布只读')
    expect(editorSource).not.toContain(':disabled="isEditorReadOnly || reorderMode"')
    expect(editorSource).not.toContain('v-if="!reorderMode && !isEditorReadOnly" class="item-action-stack"')
    expect(editorSource).not.toContain('v-if="!loading && !reorderMode && !isEditorReadOnly" class="ingredient-list-actions"')
    expect(editorSource).not.toContain('function ensureDraftEditable')
  })

  it('shows compact series and stage context in the editor when present', () => {
    expect(editorSource).toContain('draftSeriesId')
    expect(editorSource).toContain('draftSeriesLifeStage')
    expect(editorSource).toContain('availableSeriesStages')
    expect(editorSource).toContain('seriesId')
    expect(editorSource).toContain('seriesLifeStage')
    expect(editorSource).toContain('seriesStages')
    expect(editorSource).toContain('series-context-block')
    expect(editorSource).toContain('draftSeriesStageLabel')
    expect(editorSource).toContain('assessmentStandardContextLabel')
  })

  it('starts unnamed draft creation from life stage selection before navigating to the editor', () => {
    expect(listSource).toContain('createSheetVisible')
    expect(listSource).toContain('newDraftScenario')
    expect(listSource).toContain('生命阶段')
    expect(listSource).toContain('scenario-option-list')
    expect(listSource).toContain('scenario-option')
    expect(listSource).toContain('scenario-option-desc')
    expect(listSource).toContain('@tap="selectScenarioOption(option.value)"')
    expect(listSource).toContain('openCreateDraftSheet')
    expect(listSource).toContain("name: '未命名食谱'")
    expect(listSource).toContain("{{ creating ? '创建中' : '开始设计' }}")
    expect(listSource).not.toContain('newDraftName')
    expect(listSource).not.toContain('canSubmitNewDraft')
    expect(listSource).not.toContain('请填写食谱名称')
    expect(listSource).not.toContain('class="sheet-label">食谱名称')
    expect(listSource).not.toContain('<picker')
    expect(listSource).not.toContain('scenario-chevron')
    expect(listSource).not.toContain('sheet-subtitle')
    expect(listSource).not.toContain('sheet-close')
    expect(listSource).not.toContain('先填写名称和生命阶段，再开始添加原料')
    expect(listSource).not.toContain("name: '未命名配方'")
  })

  it('refreshes the draft list when returning from the editor page', () => {
    expect(listSource).toContain("import { onShow } from '@dcloudio/uni-app'")
    expect(listSource).toContain('onShow(() => {')
    expect(listSource).toContain('loadSeries()')
    expect(listSource).not.toContain('onMounted(() => {')
  })

  it('loads editor detail from the single draft endpoint instead of the full draft list', () => {
    expect(apiSource).toContain('getDraft')
    expect(editorSource).toContain('recipeDesignerApi.getDraft(draftId.value)')
    expect(editorSource).not.toContain('recipeDesignerApi.listDrafts()')
  })

  it('places reproduction as the last option in the new draft life stage picker', () => {
    const scenarioOptionsBlock = listSource.match(
      /const scenarioOptions:[\s\S]*?\n\]/,
    )?.[0] || ''
    const values = Array.from(scenarioOptionsBlock.matchAll(/value: '([^']+)'/g)).map((match) => match[1])

    expect(values).toEqual([
      'EARLY_GROWTH_REPRODUCTION',
      'LATE_GROWTH',
      'ADULT_MER_95',
      'ADULT_MER_110',
      'REPRODUCTION',
    ])
  })
})

describe('recipe designer editor guardrails', () => {
  it('keeps supplement maintenance out of the add ingredient picker', () => {
    expect(editorSource).toContain('supplement-library-tip')
    expect(editorSource).toContain('没有找到补剂？去补剂库新增')
    expect(editorSource).toContain('goToSupplementLibrary')
    expect(editorSource).toContain('v-if="showSupplementLibraryTip"')
    expect(editorSource).toContain('const showSupplementLibraryTip = computed(() => {')
    expect(editorSource).toContain('canCreateSupplementOption.value')
    expect(editorSource).toContain('ingredientSearchKeyword.value.trim().length > 0')
    expect(editorSource).toContain('ingredientLastLoadedSearchKeyword.value === ingredientSearchKeyword.value.trim()')
    expect(editorSource).toContain('ingredientOptionSections.value.length === 0')
    expect(editorSource).toContain('!ingredientLoading.value')
    expect(editorSource).toContain('applyPendingSupplementOptionFromStorage')
    expect(editorSource).toContain('recipeDesignerPendingSupplementOption')
    expect(editorSource).not.toContain('class="internal-supplement-card"')
    expect(editorSource).not.toContain('class="supplement-form-panel"')
    expect(editorSource).not.toContain('内部补剂维护')
    expect(editorSource).not.toContain('chooseSupplementLabelImage')
    expect(editorSource).not.toContain('submitSupplementOption')
  })

  it('moves supplement creation and label recognition to the supplement library page', () => {
    expect(supplementLibrarySource).toContain('内部补剂维护')
    expect(supplementLibrarySource).toContain('补剂库')
    expect(supplementLibrarySource).toContain('拍照识别补剂')
    expect(supplementLibrarySource).toContain('新增补剂')
    expect(supplementLibrarySource).toContain('recipeDesignerApi.listIngredientOptions')
    expect(supplementLibrarySource).toContain('recipeDesignerApi.createSupplementOption')
    expect(supplementLibrarySource).toContain('recipeDesignerApi.extractSupplementLabel')
    expect(supplementLibrarySource).toContain('recipeDesignerPendingSupplementOption')
    expect(supplementLibrarySource).toContain('returnToEditor')
    expect(supplementLibrarySource).toContain('uni.navigateBack')
  })

  it('uses user-facing scenario labels with reproduction as an independent saved choice', () => {
    expect(apiSource).toContain('小于14周龄幼犬')
    expect(apiSource).toContain('大于等于14周龄幼犬')
    expect(apiSource).toContain('低能量需求成年犬（95ME）')
    expect(apiSource).toContain('普通成年犬（110ME）')
    expect(apiSource).toContain('繁殖期母犬')
    expect(apiSource).toContain('REPRODUCTION')
    expect(apiSource).not.toContain('<14周幼犬 / 繁殖期')
    expect(apiSource).not.toContain('>=14周幼犬')
    expect(apiSource).not.toContain('成年犬 MER 95')
    expect(apiSource).not.toContain('成年犬 MER 110')
    expect(listSource).toContain('getScenarioDescription(option.value)')
    expect(apiSource).toContain('妊娠后期')
    expect(apiSource).toContain('哺乳期')
    expect(apiSource).toContain('不适用于单纯备孕或配种早期')
    expect(apiSource).toContain('低活动、老年、易胖、控重、室内低运动')
    expect(apiSource).toContain('不确定时优先选此项')
    expect(apiSource).toContain('体况理想、3-7岁、每日活动约1-3小时、无需控重')
  })

  it('keeps first version weight editing focused on current total and item weightG', () => {
    expect(editorSource).toContain('{{ items.length }}种 · 总重量 {{ currentTotalWeightG.toFixed(0) }}g')
    expect(editorSource).toContain('weightG')
    expect(editorSource).toContain('{{ getItemNutritionProfileName(item) }}')
    expect(editorSource).toContain('function getItemNutritionProfileName')
    expect(editorSource).toContain('displayNameZh')
    expect(editorSource).not.toContain('class="total-bar"')
    expect(editorSource).not.toContain('总量 {{ currentTotalWeightG.toFixed(0) }}g')
    expect(editorSource).not.toContain("{{ item.preparationMethod || '未设置处理方式' }}")
    expect(editorSource).not.toContain('一键归一')
    expect(editorSource).not.toContain('缩放到')
    expect(editorSource).not.toContain('1kg')
  })

  it('shows live weight ratio for regular ingredients without showing it for supplements', () => {
    expect(editorSource).toContain('item-ratio-column')
    expect(editorSource).toContain('shouldShowItemWeightRatio(item)')
    expect(editorSource).toContain('{{ getItemWeightPercentLabel(item) }}')
    expect(editorSource).toContain('function shouldShowItemWeightRatio')
    expect(editorSource).toContain('function getItemWeightPercentLabel')
    expect(editorSource).toContain("normalizedType === 'SUPPLEMENT'")
    expect(editorSource).toContain('currentTotalWeightG.value')
    expect(editorSource).toContain("return `${formatItemWeightPercentValue(percent)}%`")
  })

  it('persists nutrient target context when adding ingredients from an assessment nutrient', () => {
    expect(assessmentSource).toContain('targetValue?: number')
    expect(assessmentSource).toContain('targetValue !== null')
    expect(assessmentSource).toContain('{ targetValue }')
    expect(editorSource).toContain('nutrientTargetKey: ingredientNutrientSearchTarget.value?.nutrientKey')
    expect(editorSource).toContain('nutrientTargetValue: ingredientNutrientSearchTarget.value?.targetValue')
  })

  it('keeps nutrient target context after returning from the supplement library', () => {
    const pendingSupplementBlock =
      editorSource.match(/function applyPendingSupplementOptionFromStorage\(\) \{[\s\S]*?function navigateToNutritionReport/)?.[0] || ''

    expect(pendingSupplementBlock).toContain('applyPendingSupplementOptionFromStorage')
    expect(pendingSupplementBlock).toContain('selectIngredientOption(option)')
    expect(pendingSupplementBlock).not.toContain('ingredientNutrientSearchTarget.value = null')
  })

  it('marks ingredient type, supports silent participation switches, and reorders from a dedicated sort handle', () => {
    expect(editorSource).toContain('item-type-tag')
    expect(editorSource).toContain('{{ getItemTypeLabel(item) }}')
    expect(editorSource).toContain('getItemTypeTagClass(item)')
    expect(editorSource).toContain('include-switch')
    expect(editorSource).toContain(':checked="isItemIncludedInAssessment(item)"')
    expect(editorSource).toContain('@change="toggleItemAssessment(item, $event)"')
    expect(editorSource).toContain('sort-mode-btn')
    expect(editorSource).toContain("{{ reorderMode ? '完成' : '排序' }}")
    expect(editorSource).toContain('v-if="reorderMode" class="item-drag-handle-shell"')
    expect(editorSource).toContain('class="drag-handle"')
    expect(editorSource).toContain('@touchstart.stop.prevent="startItemDrag(item, index, $event)"')
    expect(editorSource).not.toContain('@longpress.stop.prevent="startItemDrag(item, index, $event)"')
    expect(editorSource).toContain('@touchmove.stop.prevent="onItemTouchMove"')
    expect(editorSource).toContain('@touchend.stop.prevent="finishItemDrag($event)"')
    expect(editorSource).toContain('v-if="!reorderMode" class="item-action-stack"')
    expect(editorSource).toContain('v-if="!loading && !redirectingToEditableDraft && !reorderMode" class="ingredient-list-actions"')
    expect(editorSource).toContain(':disabled="reorderMode"')
    expect(editorSource).toContain('function toggleReorderMode')
    expect(editorSource).toContain('if (!reorderMode.value || items.value.length < 2 || dragPersisting.value) return')
    expect(editorSource).toContain('if (draggingItemId.value === item.id) return')
    expect(editorSource).toContain('@touchmove="lockEditorScrollWhileItemDragging"')
    expect(editorSource).toContain('function lockEditorScrollWhileItemDragging')
    expect(editorSource).not.toContain('include-label')
    expect(editorSource).not.toContain("? '计算' : '暂停'")
    expect(editorSource).not.toContain("'暂停'")
    expect(editorSource).not.toContain('item-excluded-note')
    expect(editorSource).not.toContain('不参与计算')
    expect(editorSource).toContain('stopItemDragEvent(event)')
    expect(editorSource).toContain('persistItemSortOrder')
    expect(editorSource).toContain('includeInAssessment')
    expect(editorSource).not.toContain('item-drag-zone')
    expect(editorSource).not.toContain('@longpress.stop="startItemDrag(item, index, $event)"')
    expect(editorSource).not.toContain('function prepareItemDrag')
  })

  it('keeps ingredient weight editor compact after adding the ratio column', () => {
    expect(editorSource).toContain('width: 128rpx;')
    expect(editorSource).toContain('width: 72rpx;')
  })

  it('shows gram units for regular recipe designer ingredients while preserving supplement units', () => {
    expect(editorSource).toContain('function getRecipeDesignerWeightUnit')
    expect(editorSource).toContain("normalizedType !== 'SUPPLEMENT'")
    expect(editorSource).toContain('readIngredientDisplayUnit')
    expect(editorSource).toContain("return 'g'")
    expect(editorSource).toContain(
      'getRecipeDesignerWeightUnit(option?.type, option?.purchaseUnit, option?.unitDisplayLabel, option?.properties)',
    )
    expect(editorSource).toContain('const standardIngredient = resolveItemStandardIngredient(item)')
    expect(editorSource).toContain('standardIngredient?.purchaseUnit')
    expect(editorSource).toContain('standardIngredient?.unitDisplayLabel')
  })

  it('reads ingredient type from nutrition profile mapped standard ingredients before falling back', () => {
    expect(editorSource).toContain('function resolveItemStandardIngredient')
    expect(editorSource).toContain('item.nutritionFood?.mappings')
    expect(editorSource).toContain('candidate.ingredientId === item.ingredientId')
    expect(editorSource).toContain('candidate.isPrimary')
    expect(editorSource).toContain('return mappedIngredient || item.ingredient || null')
    expect(editorSource).toContain('const standardIngredient = resolveItemStandardIngredient(item)')
    expect(editorSource).toContain('standardIngredient?.type || item.ingredientType')
    expect(editorSource).toContain("case 'SUPPLEMENT':")
    expect(editorSource).toContain("case 'PACKAGING':")
    expect(editorSource).toContain("return '包材'")
  })

  it('hydrates missing item type hints through a helper-safe ingredient option request', () => {
    expect(editorSource).toContain('const ingredientTypeHints')
    expect(editorSource).toContain('function fetchRecipeDesignerIngredientOptions')
    expect(editorSource).toContain('return recipeDesignerApi.listIngredientOptions(query)')
    expect(editorSource).toContain('function hydrateIngredientTypeHintsForItems')
    expect(editorSource).toContain('await fetchRecipeDesignerIngredientOptions({')
    expect(editorSource).toContain('search: searchName')
    expect(editorSource).toContain('function getIngredientTypeHint')
    expect(editorSource).toContain('standardIngredient || getIngredientTypeHint(item)')
    expect(editorSource).toContain('setIngredientTypeHint(option)')
    const directIngredientOptionCalls = editorSource.match(/recipeDesignerApi\.listIngredientOptions\(/g) || []
    expect(directIngredientOptionCalls).toHaveLength(1)
  })

  it('keeps recipe naming out of the editor canvas and routes the footer directly to the nutrition report', () => {
    expect(editorSource).not.toContain('评估场景')
    expect(editorSource).toContain('食谱编辑')
    expect(editorSource).toContain('bottom-publish-bar')
    expect(editorSource).toContain('bottom-publish-btn')
    expect(editorSource).toContain('查看营养报告')
    expect(editorSource).toContain('goToNutritionReport')
    expect(editorSource).toContain('autoSaveStatusLabel')
    const autoSaveStatusLabelBlock =
      editorSource.match(/const autoSaveStatusLabel[\s\S]*?\n}\)/)?.[0] || ''
    expect(autoSaveStatusLabelBlock).toContain("'已保存'")
    expect(autoSaveStatusLabelBlock).toContain("'保存中'")
    expect(autoSaveStatusLabelBlock).toContain("'保存失败'")
    expect(editorSource).toContain('watch(autoSaveStatusLabel, () => {')
    expect(editorSource).toContain('title: `食谱编辑 · ${autoSaveStatusLabel.value}`')
    expect(autoSaveStatusLabelBlock).not.toContain("'已自动保存'")
    expect(autoSaveStatusLabelBlock).not.toContain("'自动保存中'")
    expect(autoSaveStatusLabelBlock).not.toContain("'自动保存失败'")
    expect(editorSource).toContain('/pages/recipe-designer/publish?id=')
    expect(editorSource).not.toContain('class="auto-save-status"')
    expect(editorSource).not.toContain('metadata-name-row')
    expect(editorSource).not.toContain('editable-name-row')
    expect(editorSource).not.toContain('name-input-shell')
    expect(editorSource).not.toContain('placeholder="输入食谱名称"')
    expect(editorSource).not.toContain('autoSaveDraftMetadata')
    expect(editorSource).not.toContain('metadataSaveLabel')
    expect(editorSource).not.toContain('flushMetadataAutosave')
    expect(editorSource).not.toContain('watch(draftName')
    expect(editorSource).not.toContain('watch([draftName, scenario]')
    expect(editorSource).not.toContain('onScenarioChange')
    expect(editorSource).not.toContain('metadata-stage-row')
    expect(editorSource).not.toContain('stage-picker')
    expect(editorSource).not.toContain("{{ saving ? '保存中' : '保存' }}")
    expect(editorSource).not.toContain('saveDraftMetadata')
    expect(editorSource).not.toContain('保存食谱')
    expect(editorSource).not.toContain('showSaveRecipeNameModal')
    expect(editorSource).not.toContain('savingRecipeName')
    expect(editorSource).not.toContain("title: '保存食谱'")
    expect(editorSource).not.toContain("placeholderText: '请输入食谱名称'")
    expect(editorSource).not.toContain('name: nextName')
    expect(editorSource).not.toContain('@tap="goToPublish">发布食谱</button>')
  })

  it('keeps the recipe metadata block compact for ingredient and assessment work space', () => {
    expect(editorSource).toContain('uni.setNavigationBarTitle')
    expect(editorSource).toContain('食谱编辑')
    expect(pagesJsonSource).toContain('"navigationBarTitleText": "食谱编辑"')
    expect(editorSource).toContain('bottom-publish-bar')
    expect(editorSource).toContain('showBottomPublishBar')
    expect(editorSource).toContain('bottom-publish-btn')
    expect(editorSource).toContain('查看营养报告')
    expect(editorSource).not.toContain('请输入食谱名称')
    expect(editorSource).not.toContain('配方编辑 ·')
    expect(editorSource).not.toContain('配方名称')
    expect(editorSource).not.toContain('class="action-row"')
    expect(editorSource).not.toContain('.action-row')
  })

  it('reads persisted backend draft fields without changing the write payload contract', () => {
    expect(listSource).toContain('RecipeDesignerSeriesCard')
    expect(listSource).toContain('RecipeDesignerSeriesStage')
    expect(editorSource).toContain('fediafDogScenario')
    expect(editorSource).toContain('getDraftScenario')
  })

  it('shows assessment drawer and supports backend assessment statuses', () => {
    expect(editorSource).toContain('assessment-drawer')
    expect(editorSource).toContain('groupedEntries')
    expect(editorSource).toContain('currentValue')
    expect(editorSource).toContain('minValue')
    expect(editorSource).toContain('maxValue')
    expect(editorSource).toContain('entry.label')
    expect(assessmentSource).toContain('MISSING_DATA')
    expect(assessmentSource).toContain('DEFICIENT')
    expect(assessmentSource).toContain('EXCESS')
    expect(assessmentSource).toContain('COMPLIANT')
  })

  it('renders compact categorized nutrition assessment rows', () => {
    expect(editorSource).toContain('assessment-category-tabs')
    expect(editorSource).toContain('assessment-category-badge')
    expect(editorSource).toContain('selectedAssessmentCategory')
    expect(editorSource).toContain('visibleAssessmentEntries')
    expect(editorSource).toContain('assessmentStandardContextLabel')
    expect(editorSource).toContain('standard-context')
    expect(editorSource).toContain('formatAssessmentBasisLabel')
    expect(editorSource).toContain("return '/1000kcal ME'")
    expect(editorSource).not.toContain("return '每1000 kcal ME'")
    expect(editorSource).toContain('formatDryMatterPercent')
    expect(editorSource).toContain('shouldShowDryMatter')
    expect(editorSource).toContain('entry-status-inline')
    expect(editorSource).toContain('entry-dry-matter-side')
    expect(editorSource).toContain('getAssessmentRangeStyle')
    expect(editorSource).toContain('shouldShowAssessmentCurrentMarker(entry)')
    expect(editorSource).toContain(':style="getAssessmentCurrentMarkerStyle(entry)"')
    expect(editorSource).toContain(':style="getAssessmentCurrentLabelStyle(entry)"')
    expect(editorSource).toContain('transform: translateX(0)')
    expect(editorSource).toContain('transform: translateX(-100%)')
    expect(editorSource).toContain('transform: translateX(-50%)')
    expect(editorSource).toContain('getAssessmentBoundaryTitle(entry,')
    expect(assessmentSource).toContain("return '上限'")
    expect(editorSource).toContain('当前')
    expect(editorSource).not.toContain('standard-stage')
    expect(editorSource).not.toContain('FEDIAF 2025 犬标准')
    expect(editorSource).not.toContain('{{ formatAssessmentDetail(entry) }}')
    expect(editorSource).not.toContain('summary-grid')
    expect(editorSource).not.toContain('按需关注优先')
  })

  it('restores the nutrition assessment category scroll position after ingredient edits', () => {
    expect(editorSource).toContain('<scroll-view v-if="assessmentListVisible" scroll-y class="assessment-list"')
    expect(editorSource).toContain(':key="selectedAssessmentCategory"')
    expect(editorSource).toContain(':scroll-top="assessmentScrollTop"')
    expect(editorSource).toContain('@scroll="onAssessmentListScroll"')
    expect(editorSource).toContain('const assessmentScrollTopByCategory = ref<Partial<Record<AssessmentCategoryKey, number>>>({})')
    expect(editorSource).toContain('const assessmentScrollTop = ref(0)')
    expect(editorSource).toContain('const assessmentCurrentScrollTop = ref(0)')
    expect(editorSource).toContain('function onAssessmentListScroll')
    expect(editorSource).toContain('function restoreAssessmentScrollPosition')
    expect(editorSource).toContain('rememberAssessmentScrollPosition()')
    expect(editorSource).toContain('restoreAssessmentScrollPosition(selectedAssessmentCategory.value)')
    expect(editorSource).not.toContain('<view v-if="assessmentListVisible" class="assessment-list">')

    const scrollHandler = editorSource.match(/function onAssessmentListScroll[\s\S]*?\n}/)?.[0] || ''
    expect(scrollHandler).toContain('assessmentCurrentScrollTop.value = scrollTop')
    expect(scrollHandler).not.toContain('assessmentScrollTop.value = scrollTop')
  })

  it('renders supplemental macro metrics as overview rows instead of standard range rows', () => {
    const macroOverviewBlock = editorSource.match(
      /<view v-if="isMacroOverviewEntry\(entry\)"[\s\S]*?<view v-else>/,
    )?.[0] || ''

    expect(macroOverviewBlock).toContain('macro-overview-row')
    expect(macroOverviewBlock).toContain('macro-overview-name')
    expect(macroOverviewBlock).toContain('macro-overview-amount')
    expect(macroOverviewBlock).toContain('macro-overview-value')
    expect(macroOverviewBlock).toContain('macro-overview-basis')
    expect(macroOverviewBlock).toContain('macro-overview-dry-matter')
    expect(editorSource).toContain('formatMacroOverviewPrimaryValue')
    expect(editorSource).toContain('formatMacroOverviewDryMatterLabel')
    expect(macroOverviewBlock).toContain("formatMacroOverviewDryMatterLabel(entry) || ''")
    expect(macroOverviewBlock).toContain('{{ formatMacroOverviewBasisLabel(entry) }}')
    expect(editorSource).toContain('`干物质 ${formatAssessmentNumber(value)}%`')
    expect(macroOverviewBlock).not.toContain('class="entry-dry-matter entry-dry-matter-side"')
    expect(macroOverviewBlock).not.toContain('class="entry-name-line"')
    expect(macroOverviewBlock).not.toContain('class="macro-overview-meta"')
  })

  it('maps backend overall assessment statuses used by publish and drawer badges', () => {
    expect(getAssessmentStatusLabel('DEFICIENT')).toBe('不足')
    expect(getAssessmentStatusLabel('EXCESS')).toBe('过量')
    expect(getOverallStatusLabel('COMPLIANT')).toBe('已达标')
    expect(getOverallStatusLabel('NON_COMPLIANT')).toBe('未达标/需审核')
    expect(getOverallStatusLabel('INCOMPLETE')).toBe('资料不完整')
    expect(getAssessmentStatusClass('NON_COMPLIANT')).toBe('status-deficient')
    expect(getAssessmentStatusClass('INCOMPLETE')).toBe('status-missing')
  })

  it('keeps status tag colors aligned with the nutrition range bar zones', () => {
    expect(editorSource).toContain("deficient: '#fed7aa'")
    expect(editorSource).toContain("excess: '#fecaca'")
    expect(editorSource).toContain('.status-deficient')
    expect(editorSource).toContain('#c2410c')
    expect(editorSource).toContain('.status-excess')
    expect(editorSource).toContain('#dc2626')
    expect(editorSource).not.toContain('#fee2e2 0 ${minPosition}%')
    expect(editorSource).not.toContain('#fde68a ${maxPosition}% 100%')
  })

  it('formats calcium phosphorus ratio values as calcium-to-phosphorus ratios without the raw ratio unit', () => {
    expect(formatAssessmentRatioValue(1)).toBe('1:1')
    expect(formatAssessmentRatioValue(1.2)).toBe('1.2:1')
    expect(formatAssessmentRatioValue(1.8)).toBe('1.8:1')
    expect(editorSource).toContain('formatAssessmentRatioValue(value)')
    expect(editorSource).not.toContain('${formatAssessmentNumber(value)}ratio')
  })

  it('shows a footnote button for conditional assessment bounds', () => {
    expect(getAssessmentBoundaryNote({ minValueNote: '按当前粗蛋白动态调整。' }, 'min')).toContain(
      '动态调整',
    )
    expect(getAssessmentBoundaryNote({ maxValueNote: '默认按更保守的 1.6:1 评估。' }, 'max')).toContain(
      '1.6:1',
    )
    expect(editorSource).toContain('entry-footnote-btn')
    expect(editorSource).toContain("showAssessmentBoundaryNote(entry, 'min')")
    expect(editorSource).toContain("getAssessmentBoundaryNote(entry, 'min')")
    expect(editorSource).toContain("showAssessmentBoundaryNote(entry, 'max')")
    expect(editorSource).toContain("getAssessmentBoundaryNote(entry, 'max')")
    expect(editorSource).toContain('uni.showModal')
  })

  it('uses scenario for draft updates and never sends legacy scenario or nutrition ids while changing weight', () => {
    const updateDraftCalls = editorSource.match(/recipeDesignerApi\.updateDraft\([\s\S]*?\)/g) || []
    const updateWeightBlock = editorSource.match(/(?:async\s+)?function updateWeight[\s\S]*?\n}/)?.[0] || ''

    expect(updateDraftCalls.join('\n')).not.toContain('fediafDogScenario')
    expect(updateWeightBlock).toContain('recipeDesignerApi.updateItem')
    expect(updateWeightBlock).toContain('weightG')
    expect(updateWeightBlock).not.toContain('scenario')
    expect(updateWeightBlock).not.toContain('nutritionFoodId')
  })

  it('lets users drag the assessment panel and collapses it when the editor canvas is tapped', () => {
    expect(editorSource).toContain('@tap="collapseAssessmentIfOpen"')
    expect(editorSource).toContain('drawer-drag-zone')
    expect(editorSource).toContain('@touchstart.stop="onAssessmentTouchStart"')
    expect(editorSource).toContain('@touchmove.stop.prevent="onAssessmentTouchMove"')
    expect(editorSource).toContain('@touchend.stop="onAssessmentTouchEnd"')
    expect(editorSource).toContain('assessmentDrawerStyle')
    expect(editorSource).toContain('assessmentListVisible')
    expect(editorSource).toContain('setAssessmentExpanded')
    expect(editorSource).toContain('drawer-title-row')
    expect(editorSource).toContain('assessment-category-tabs')
    expect(editorSource).toContain('@tap.stop="selectAssessmentCategory(category.key, true)"')
    expect(editorSource).toContain('function selectAssessmentCategory(key: AssessmentCategoryKey, expandDrawer = false)')
    expect(editorSource).toContain('if (expandDrawer && !assessmentListVisible.value)')
    expect(editorSource).toContain('<scroll-view v-if="assessmentListVisible" scroll-y class="assessment-list"')
    expect(editorSource).toContain('ASSESSMENT_COLLAPSED_HEIGHT_RPX')
    expect(editorSource).toContain('assessmentCollapsedHeightPx.value = rpxToPx(ASSESSMENT_COLLAPSED_HEIGHT_RPX, windowWidth)')
    expect(editorSource).toContain('min-height: 136rpx')
    expect(editorSource).not.toContain('min-height: 88px')
    expect(editorSource).toContain('padding: 8rpx 32rpx 6rpx')
    expect(editorSource).toContain('background: #eef4f8')
    expect(editorSource).toContain('assessment-list-surface')
    expect(editorSource).not.toContain('drawer-toggle')
    expect(editorSource).not.toContain('上拉查看')
    expect(editorSource).not.toContain('下拉收起')
    expect(editorSource).not.toContain('@tap="assessmentExpanded = !assessmentExpanded"')
  })

  it('adds editor-wide undo and redo controls for recipe item changes', () => {
    expect(editorSource).toContain("from './editor-history'")
    expect(editorSource).toContain('history-controls')
    expect(editorSource).toContain('undoRecipeDesignerHistory')
    expect(editorSource).toContain('redoRecipeDesignerHistory')
    expect(editorSource).toContain('canUndoRecipeDesignerHistory')
    expect(editorSource).toContain('canRedoRecipeDesignerHistory')
    expect(editorSource).toContain('aria-label="撤回"')
    expect(editorSource).toContain('aria-label="前进"')
    expect(editorSource).toContain('history-icon history-icon-undo')
    expect(editorSource).toContain('history-icon history-icon-redo')
    expect(editorSource).not.toContain('{{ undoRecipeDesignerHistoryLabel }}')
    expect(editorSource).not.toContain('{{ redoRecipeDesignerHistoryLabel }}')
    expect(editorSource).not.toContain('undoRecipeDesignerHistoryLabel')
    expect(editorSource).not.toContain('redoRecipeDesignerHistoryLabel')
    expect(editorSource).not.toContain('history-feedback-bar')
    expect(editorSource).not.toContain('historyFeedbackMessage')
    expect(editorSource).not.toContain('history-feedback-action')
  })

  it('keeps the ingredient action header sticky while editing long recipes', () => {
    expect(editorSource).toContain('class="section-header ingredient-action-header"')
    const stickyHeaderStyle = editorSource.match(/\.ingredient-action-header\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(stickyHeaderStyle).toContain('position: sticky;')
    expect(stickyHeaderStyle).toContain('top: 0;')
    expect(stickyHeaderStyle).toContain('z-index:')
    expect(stickyHeaderStyle).toContain('background: #fff;')
  })

  it('moves the ingredient action bar to the top while the ingredient picker is open', () => {
    expect(editorSource).toContain("'ingredient-picker-active': ingredientPickerVisible")

    const activeContextStyle =
      editorSource.match(/\.recipe-designer-editor-page\.ingredient-picker-active \.series-context-block\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(activeContextStyle).toContain('display: none;')

    const activeHeaderStyle =
      editorSource.match(/\.recipe-designer-editor-page\.ingredient-picker-active \.ingredient-action-header\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(activeHeaderStyle).toContain('top: 0;')
    expect(activeHeaderStyle).toContain('z-index: 32;')

    const activeMaskStyle =
      editorSource.match(/\.recipe-designer-editor-page\.ingredient-picker-active \.ingredient-picker-mask\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(activeMaskStyle).toContain('top: 104rpx;')

    const activePanelStyle =
      editorSource.match(/\.recipe-designer-editor-page\.ingredient-picker-active \.ingredient-picker-panel\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(activePanelStyle).toContain('height: calc(100vh - 104rpx);')
    expect(activePanelStyle).toContain('max-height: calc(100vh - 104rpx);')
  })

  it('shows clear visual feedback while dragging recipe ingredients in reorder mode', () => {
    expect(editorSource).toContain('dragTargetIndex')
    expect(editorSource).toContain('showDragInsertionMarker(index)')
    expect(editorSource).toContain('class="drag-insertion-marker"')
    expect(editorSource).toContain('pulseItemDragFeedback()')
    expect(editorSource).toContain('dragTargetIndex.value = targetIndex')
    expect(editorSource).toContain('dragTargetIndex.value = -1')
    const draggingStyle = editorSource.match(/\.item-row\.dragging\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(draggingStyle).toContain('border-color: #1677ff;')
    expect(draggingStyle).toContain('box-shadow:')
    expect(draggingStyle).toContain('transform: scale')
    const markerStyle = editorSource.match(/\.drag-insertion-marker\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(markerStyle).toContain('background: #1677ff;')
    expect(markerStyle).toContain('box-shadow:')
  })

  it('lets editable drafts switch FEDIAF 2025 life stages from the assessment drawer', () => {
    expect(editorSource).toContain('FEDIAF_DOG_SCENARIO_DESCRIPTIONS')
    expect(editorSource).toContain('FEDIAF_DOG_SCENARIO_LABELS')
    expect(editorSource).toContain('const scenarioOptions: Array<{ label: string; value: FediafDogScenario }>')
    expect(editorSource).toContain('scenario-switch-btn')
    expect(editorSource).not.toContain('v-if="!isEditorReadOnly"')
    expect(editorSource).toContain('@tap.stop="openScenarioSwitchSheet"')
    const standardContextStyle = editorSource.match(/\.standard-context\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(standardContextStyle).toContain('text-align: right;')
    expect(standardContextStyle).toContain('max-width:')
    expect(editorSource).toContain(`class="drawer-touch-zone"
        @touchstart.stop="onAssessmentTouchStart"
        @touchmove.stop.prevent="onAssessmentTouchMove"
        @touchend.stop="onAssessmentTouchEnd"
      >
        <view class="drawer-drag-zone">
          <view class="drawer-grip"></view>
        </view>

        <view class="drawer-handle">`)
    expect(editorSource).toContain('scenario-switch-mask')
    expect(editorSource).toContain('scenario-switch-panel')
    expect(editorSource).toContain('切换生命阶段')
    expect(editorSource).toContain('pendingScenario')
    expect(editorSource).toContain('scenarioSwitching')
    expect(editorSource).toContain('selectScenarioOption(option.value)')
    expect(editorSource).toContain('confirmScenarioSwitch')
    expect(editorSource).toContain('recipeDesignerApi.updateDraft(draftId.value, { scenario: pendingScenario.value })')
    expect(editorSource).toContain('scenario.value = pendingScenario.value')
    expect(editorSource).toContain('let scenarioPersisted = false')
    expect(editorSource).toContain('if (!scenarioPersisted) {')
    expect(editorSource).toContain('rememberAssessmentScrollPosition()')
    expect(editorSource).toContain('await refreshAssessment()')
    expect(editorSource).toContain('scenarioSwitchSheetVisible.value = false')
  })

  it('records undo history for weight, assessment switch, add, remove, and reorder edits', () => {
    expect(editorSource).toContain('createUpdateItemHistoryEntry')
    expect(editorSource).toContain('createAddItemHistoryEntry')
    expect(editorSource).toContain('createRemoveItemHistoryEntry')
    expect(editorSource).toContain('createReorderItemsHistoryEntry')
    expect(editorSource).toContain('pushEditorHistory')
    expect(editorSource).toContain('recordHistoryItemIdReplacement')
    expect(editorSource).toContain('executeHistoryEntry')
    expect(editorSource).toContain('applyHistoryOrder')
    expect(editorSource).toContain('itemWeightEditBaselines')
  })

  it('applies undo and redo optimistically while preserving rollback on failure', () => {
    expect(editorSource).toContain('historyActionDirection')
    expect(editorSource).toContain('type HistoryActionDirection')
    expect(editorSource).toContain('type RecipeDesignerEditorStateSnapshot')
    expect(editorSource).toContain('snapshotRecipeDesignerEditorState')
    expect(editorSource).toContain('restoreRecipeDesignerEditorState')
    expect(editorSource).toContain('applyHistoryEntryOptimistically')
    expect(editorSource).toContain('applyOptimisticHistoryItemPatch')
    expect(editorSource).toContain('insertOptimisticHistoryItem')
    expect(editorSource).toContain('removeOptimisticHistoryItem')
    expect(editorSource).toContain('const snapshot = snapshotRecipeDesignerEditorState()')
    expect(editorSource).toContain('applyHistoryEntryOptimistically(entry, direction)')
    expect(editorSource).toContain('restoreRecipeDesignerEditorState(snapshot)')
  })

  it('lets the assessment panel rest at dragged positions instead of snapping only open or closed', () => {
    expect(editorSource).toContain('assessmentDrawerTopPx')
    expect(editorSource).toContain('assessmentDragStartTopPx')
    expect(editorSource).toContain('assessmentDrawerMaxTopPx')
    expect(editorSource).toContain('assessmentDrawerMinTopPx')
    expect(editorSource).toContain('top: ${assessmentDrawerTopPx.value}px')
    expect(editorSource).toContain('height: calc(100vh - ${assessmentDrawerTopPx.value}px')
    expect(editorSource).toContain('assessmentDrawerBottomInsetPx')
    expect(editorSource).toContain('assessmentExpanded.value = assessmentListVisible.value')
    expect(editorSource).not.toContain('setAssessmentExpanded(assessmentDrawerHeightPx.value >= threshold)')
  })

  it('keeps ingredient actions scrollable above the draggable assessment panel', () => {
    expect(editorSource).toContain(':style="editorPageStyle"')
    expect(editorSource).toContain('const editorBottomPaddingPx = computed')
    expect(editorSource).toContain('assessmentDrawerHeightPx.value')
    expect(editorSource).toContain('assessmentPublishBarHeightPx.value')
    expect(editorSource).toContain('padding-bottom: ${editorBottomPaddingPx.value}px')
    expect(editorSource).not.toContain('const publishPadding = showBottomPublishBar.value ? 96 : 0')
    expect(editorSource).not.toContain('padding: 24rpx 32rpx 380rpx')
  })

  it('keeps the collapsed assessment drawer flush with the publish bar on real devices', () => {
    expect(editorSource).toContain('BOTTOM_PUBLISH_BAR_HEIGHT_RPX')
    expect(editorSource).toContain('const BOTTOM_PUBLISH_BAR_HEIGHT_RPX = 108')
    expect(editorSource).toContain('assessmentPublishBarHeightPx')
    expect(editorSource).toContain('getSafeAreaBottomPx')
    expect(editorSource).toContain('const bottomInsetCandidates = [explicitInset, derivedInset]')
    expect(editorSource).toContain('return Math.max(0, ...bottomInsetCandidates)')
    expect(editorSource).toContain(
      'windowHeight - assessmentCollapsedHeightPx.value - collapsedAssessmentDrawerBottomInsetPx.value',
    )
    expect(editorSource).not.toContain('windowHeight - assessmentCollapsedHeightPx.value - 88')
    expect(editorSource).not.toContain('Math.max(220, drawerPadding + publishPadding)')
    expect(editorSource).toContain('z-index: 18;')
  })

  it('lets the full nutrition drawer header act as the drag target without adding a separate toggle button', () => {
    expect(editorSource).toContain('class="drawer-touch-zone"')
    expect(editorSource).toContain('@touchstart.stop="onAssessmentTouchStart"')
    expect(editorSource).toContain('@touchmove.stop.prevent="onAssessmentTouchMove"')
    expect(editorSource).not.toContain('class="assessment-toggle-btn"')
  })

  it('replaces the ingredient placeholder with a mobile picker that can add and remove items', () => {
    expect(editorSource).not.toContain('原料选择稍后接入')
    expect(editorSource).toContain('ingredient-picker-panel')
    expect(editorSource).toContain('openIngredientPicker')
    expect(editorSource).toContain('ingredient-list-actions')
    expect(editorSource).toContain('secondary-add-btn')
    expect(editorSource).toContain('listIngredientOptions')
    expect(editorSource).toContain('ingredientSearchDebounceTimer')
    expect(editorSource).toContain('watch(ingredientSearchKeyword')
    expect(editorSource).toContain('仅显示已维护并验证营养档案的原料')
    expect(editorSource).toContain('可尝试缩短关键词')
    expect(editorSource).toContain('近义词')
    expect(editorSource).toContain('selectedIngredientOption')
    expect(editorSource).toContain('selectedNutritionProfile')
    expect(editorSource).toContain('selectNutritionProfile')
    expect(editorSource).toContain('ingredientId: selectedIngredientOption.value.id')
    expect(editorSource).toContain('confirmAddIngredient')
    expect(editorSource).toContain('recipeDesignerApi.addItem')
    expect(editorSource).toContain('removeIngredient')
    expect(editorSource).toContain('recipeDesignerApi.removeItem')
    expect(editorSource).not.toContain('hasPrimaryMapping')
    expect(editorSource).not.toContain('class="search-btn"')
    expect(editorSource).not.toContain('class="food-badge"')
    expect(editorSource).not.toContain('多档案')
    expect(editorSource).not.toContain('主档案')
  })

  it('keeps the add ingredient picker header and footer fixed while only the result list scrolls', () => {
    expect(editorSource).toContain('picker-fixed-top')
    expect(editorSource).toContain('picker-scroll-body')
    expect(editorSource).toContain('picker-fixed-footer')
    expect(editorSource).toMatch(/\.ingredient-picker-panel\s*\{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
    expect(editorSource).toMatch(/\.picker-scroll-body\s*\{[\s\S]*flex: 1;[\s\S]*min-height: 0;/)
  })

  it('keeps the add ingredient picker focused on search, source, and required weight entry', () => {
    expect(editorSource).not.toContain('选择标准原料，必要时切换营养档案')
    expect(editorSource).not.toContain('picker-subtitle')
    expect(editorSource).not.toContain('getIngredientOptionMeta')
    expect(editorSource).not.toContain('默认：')
    expect(editorSource).not.toContain('个档案')
    expect(editorSource).not.toContain('营养档案：')
    expect(editorSource).toContain('数据来源：')
    expect(editorSource).not.toContain('营养数据来源：')
    expect(editorSource).not.toContain('profile.category')
    expect(editorSource).toContain("newItemWeightInput.value = ''")
    expect(editorSource).toContain('canConfirmAddIngredient')
    expect(editorSource).toContain(':disabled="!canConfirmAddIngredient"')
    expect(editorSource).toContain('picker-footer-panel')
    expect(editorSource).toContain('weight-entry')
    expect(editorSource).toContain('用量')
    expect(editorSource).toContain('required-mark')
    expect(editorSource).toContain('add-weight-input-shell')
    expect(editorSource).toContain('placeholder="请输入"')
    expect(editorSource).not.toContain('placeholder="克重"')
  })

  it('keeps supplement details compact and food profiles collapsed until selected', () => {
    expect(editorSource).toContain('getSupplementOptionDetailText(option)')
    expect(editorSource).toContain("join(' · ')")
    expect(editorSource).not.toContain('品牌：')
    expect(editorSource).not.toContain('规格：')
    expect(editorSource).toContain('shouldShowNutritionProfileOptions(option)')
    expect(editorSource).toContain('!isSupplementOption(option)')
    expect(editorSource).not.toContain('待选档案')
    expect(editorSource).not.toContain('food-profile-summary')
    expect(editorSource).not.toContain('food-profile-tag')
  })

  it('visually separates supplement recommendations from nutrient-rich foods', () => {
    expect(editorSource).toContain("kind: 'supplement'")
    expect(editorSource).toContain("kind: 'food'")
    expect(editorSource).toContain(":class=\"[`ingredient-option-section-${section.kind}`]\"")
    expect(editorSource).toContain('section-count')
    expect(editorSource).toContain('supplement-option')
    expect(editorSource).toContain('food-source-option')
    expect(editorSource).toContain('.ingredient-option-section-supplement')
    expect(editorSource).toContain('.ingredient-option-section-food')
  })

  it('keeps nutrient ingredient search rows compact while using colored nutrient amounts and supplement display units', () => {
    expect(editorSource).toContain('{{ option.name }}')
    expect(editorSource).toContain('class="food-nutrient-match"')
    expect(editorSource).toContain('{{ getIngredientOptionNutrientMatchText(option) }}')
    expect(editorSource).not.toContain('{{ getIngredientOptionNameLine(option) }}')
    expect(editorSource).not.toContain('{{ option.nutrientMatch.displayText }}')
    expect(editorSource).toContain('function getIngredientOptionNutrientMatchText')
    expect(editorSource).toContain('return replaceSupplementServingUnit(match.displayText, getIngredientOptionUnit(option))')
    expect(editorSource).toContain('function replaceSupplementServingUnit')
    expect(editorSource).toContain('text.replace(/\\/[^/]+$/, `/${unitLabel}`)')
    expect(editorSource).toContain('function getSupplementOptionDetailText')
    expect(editorSource).toContain("return [brand, productModel].filter(Boolean).join(' · ')")
    expect(editorSource).toContain('{{ getSupplementOptionDetailText(option) }}')
    expect(editorSource).toContain('{{ profile.name }}')
    expect(editorSource).not.toContain('{{ getProfileOptionNameLine(profile, option) }}')
    expect(editorSource).not.toContain('function getProfileNutrientMatchText')
    expect(editorSource).toContain('function getSelectedNutritionProfileLabel')
    expect(editorSource).toContain('return getNutritionProfileSourceLabel(selectedNutritionProfile.value)')
    expect(editorSource).toContain('.food-source-option .food-nutrient-match')
  })

  it('labels nutrient ingredient search food sorting as per-100g', () => {
    expect(editorSource).toContain('食材按每100g{{ ingredientNutrientSearchTarget.label }}含量排序')
    expect(editorSource).not.toContain('按{{ ingredientNutrientSearchTarget.label }}含量排序')
  })

  it('offers an internal-only supplement creation flow without enabling food creation in the miniapp', () => {
    expect(apiSource).toContain('createSupplementOption')
    expect(apiSource).toContain("url: '/recipe-designer/supplement-options'")
    expect(supplementLibrarySource).toContain('canCreateSupplementOption')
    expect(supplementLibrarySource).toContain('getCurrentUserRole')
    expect(supplementLibrarySource).toContain("uni.getStorageSync('userInfo') || uni.getStorageSync('user')")
    expect(supplementLibrarySource).toContain('新增补剂')
    expect(supplementLibrarySource).toContain('supplement-form-panel')
    expect(supplementLibrarySource).toContain('补剂名称')
    expect(supplementLibrarySource).toContain('平时怎么添加')
    expect(supplementLibrarySource).toContain('包装营养数据')
    expect(supplementLibrarySource).toContain('每粒')
    expect(supplementLibrarySource).toContain('每平勺')
    expect(supplementLibrarySource).toContain('营养数据')
    expect(supplementLibrarySource).toContain('完整营养字段')
    expect(supplementLibrarySource).toContain('supplement-nutrient-grid')
    expect(supplementLibrarySource).toContain('supplementNutrientGroups')
    expect(supplementLibrarySource).toContain('hasSupplementNutrientInput')
    expect(supplementLibrarySource).toContain('recipeDesignerApi.createSupplementOption')
    expect(supplementLibrarySource).toContain('请至少填写一个营养成分')
    expect(supplementLibrarySource).not.toContain('新增食材')
  })

  it('offers OCR plus DeepSeek supplement label recognition and pre-fills the manual form', () => {
    expect(apiSource).toContain('extractSupplementLabel')
    expect(apiSource).toContain('/recipe-designer/supplement-label/extract')
    expect(supplementLibrarySource).toContain('拍照识别补剂')
    expect(supplementLibrarySource).toContain('recognizingSupplementLabel')
    expect(supplementLibrarySource).toContain('chooseSupplementLabelImage')
    expect(supplementLibrarySource).toContain('applySupplementLabelDraft')
    expect(supplementLibrarySource).toContain('recipeDesignerApi.extractSupplementLabel')
    expect(supplementLibrarySource).toContain('supplementAiWarnings')
    expect(supplementLibrarySource).toContain('OCR 原文')
  })
})

describe('recipe designer assessment categorization', () => {
  it('builds the five fixed categories with red-badge attention counts and display details', () => {
    const categories = buildAssessmentCategories([
      {
        nutrientKey: 'crude_fat',
        label: '粗脂肪',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 13.8,
        maxValue: 60,
        currentValue: 12.2,
        status: 'DEFICIENT',
        details: [
          {
            nutrientKey: 'crude_fat',
            label: '粗脂肪',
            category: 'MACRO',
            expressionBasis: 'PER_1000_KCAL_ME',
            unit: 'g',
            minValue: 13.8,
            maxValue: 60,
            currentValue: 12.2,
            status: 'DEFICIENT',
          },
          {
            nutrientKey: 'crude_fat',
            label: '粗脂肪',
            category: 'MACRO',
            expressionBasis: 'PER_100G_DRY_MATTER',
            unit: '%',
            minValue: null,
            maxValue: null,
            currentValue: 7.1,
            status: 'COMPLIANT',
          },
        ],
      },
      {
        nutrientKey: 'vitamin_a',
        label: '维生素A',
        category: 'VITAMIN',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'IU',
        minValue: 1250,
        maxValue: 100000,
        currentValue: null,
        status: 'MISSING_DATA',
      },
    ])

    expect(categories.map((category) => category.key)).toEqual([
      'MACRO',
      'AMINO_ACID',
      'FATTY_ACID',
      'MINERAL',
      'VITAMIN',
    ])
    expect(getAssessmentCategoryLabel('MINERAL')).toBe('微量')
    expect(getAssessmentCategoryTitle('MINERAL')).toBe('微量元素')
    expect(getAssessmentCategoryAttentionCount(categories[0])).toBe(1)
    expect(getAssessmentCategoryAttentionCount(categories[4])).toBe(1)
    expect(getAssessmentDisplayEntry(categories[0].entries[0]).dryMatterValue).toBe(7.1)
  })

  it('keeps non-macro nutrition rows in the FEDIAF table order instead of status priority order', () => {
    const categories = buildAssessmentCategories([
      {
        nutrientKey: 'leucine',
        label: '亮氨酸',
        category: 'AMINO_ACID',
        status: 'MISSING_DATA',
        displayOrder: 50,
      },
      {
        nutrientKey: 'arginine',
        label: '精氨酸',
        category: 'AMINO_ACID',
        status: 'COMPLIANT',
        displayOrder: 20,
      },
      {
        nutrientKey: 'histidine',
        label: '组氨酸',
        category: 'AMINO_ACID',
        status: 'EXCESS',
        displayOrder: 30,
      },
    ])

    const aminoAcids = categories.find((category) => category.key === 'AMINO_ACID')
    expect(aminoAcids?.entries.map((entry) => entry.nutrientKey)).toEqual([
      'arginine',
      'histidine',
      'leucine',
    ])
  })

  it('adds fixed macro metrics without counting informational rows as alerts', () => {
    const categories = buildAssessmentCategories([], {
      totalWeightG: 900,
      dryMatterG: 305,
      energyDensityKcalPerKg: 1611.111,
      macroMetrics: {
        carbohydrate: { currentValue: 140, per1000Kcal: 96.55, dryMatterPercent: 45.9 },
        fiber: { currentValue: 2, per1000Kcal: 1.38, dryMatterPercent: 0.66 },
        ash: { currentValue: 5, per1000Kcal: 3.45, dryMatterPercent: 1.64 },
      },
    } as any)
    const macro = categories.find((category) => category.key === 'MACRO')

    expect(macro?.entries.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(['净碳水', '膳食纤维', '灰分', '水分', '能量密度']),
    )
    expect(getAssessmentCategoryAttentionCount(macro!)).toBe(0)
    const moisture = macro?.entries.find((entry) => entry.nutrientKey === 'moisture')
    expect(moisture).toMatchObject({
      unit: '%',
      displayBasisLabel: '占总重',
      hideDryMatter: true,
    })
    expect(moisture?.currentValue).toBeCloseTo(66.11, 2)
    expect(macro?.entries.find((entry) => entry.nutrientKey === 'energy_density')).toMatchObject({
      currentValue: 1611.111,
      unit: 'kcal/kg',
      displayBasisLabel: 'kcal/kg',
      hideDryMatter: true,
      isSupplementalMacro: true,
      excludeFromAttention: true,
      status: 'INFO',
    })
  })

  it('shows assumed-zero rows with a current marker', () => {
    const assumedZeroCalcium = {
      nutrientKey: 'calcium',
      label: '钙磷比',
      category: 'MINERAL',
      expressionBasis: 'PER_1000_KCAL_ME',
      unit: '',
      minValue: 1,
      maxValue: 2,
      currentValue: 0,
      status: 'DEFICIENT',
      missingAsZero: true,
    }

    expect(canDisplayAssessmentRange(assumedZeroCalcium)).toBe(true)
    expect(shouldShowAssessmentCurrentMarker(assumedZeroCalcium)).toBe(true)
  })

  it('shows reference-only nutrients without a range bar or alert badge', () => {
    const referenceVitamin = {
      nutrientKey: 'vitaminK',
      label: '维生素 K',
      category: 'VITAMIN',
      expressionBasis: 'PER_1000_KCAL_ME',
      unit: 'μg',
      minValue: null,
      maxValue: null,
      currentValue: 12.5,
      status: 'INFO',
      excludeFromAttention: true,
    }
    const categories = buildAssessmentCategories([referenceVitamin])
    const vitamins = categories.find((category) => category.key === 'VITAMIN')

    expect(vitamins?.entries.map((entry) => entry.nutrientKey)).toEqual(['vitaminK'])
    expect(getAssessmentCategoryAttentionCount(vitamins!)).toBe(0)
    expect(canDisplayAssessmentRange(referenceVitamin)).toBe(false)
    expect(shouldShowAssessmentCurrentMarker(referenceVitamin)).toBe(false)
    expect(getAssessmentDisplayStatusLabel(referenceVitamin)).toBe('无上下限')
    expect(editorSource).toContain('entry-reference-value')
    expect(editorSource).toContain("entry.status === 'INFO'")
  })

  it('uses the per-energy representative row for status text and color when detail rows disagree', () => {
    const vitaminD = {
      nutrientKey: 'vitaminD',
      label: '维生素 D',
      category: 'VITAMIN',
      expressionBasis: 'PER_100G_DRY_MATTER',
      unit: 'IU',
      status: 'EXCESS',
      details: [
        {
          nutrientKey: 'vitaminD',
          label: '维生素 D',
          category: 'VITAMIN',
          expressionBasis: 'PER_100G_DRY_MATTER',
          unit: 'IU',
          minValue: 55.2,
          maxValue: 227,
          currentValue: 274,
          status: 'EXCESS',
        },
        {
          nutrientKey: 'vitaminD',
          label: '维生素 D',
          category: 'VITAMIN',
          expressionBasis: 'PER_1000_KCAL_ME',
          unit: 'IU',
          minValue: 138,
          maxValue: 568,
          currentValue: 546.79,
          status: 'COMPLIANT',
        },
      ],
    }

    expect(getAssessmentDisplayStatusLabel(vitaminD)).toBe('达标')
    expect(getAssessmentDisplayStatusClass(vitaminD)).toBe('status-compliant')
  })

  it('keeps fresh-food selenium focused on current amounts without a legal-limit conflict', () => {
    const selenium = {
      nutrientKey: 'selenium',
      label: '硒',
      category: 'MINERAL',
      expressionBasis: 'PER_100G_DRY_MATTER',
      unit: 'μg',
      status: 'DEFICIENT',
      details: [
        {
          nutrientKey: 'selenium',
          label: '硒',
          category: 'MINERAL',
          expressionBasis: 'PER_1000_KCAL_ME',
          unit: 'μg',
          minValue: 100,
          currentValue: 98,
          status: 'DEFICIENT',
        },
        {
          nutrientKey: 'selenium',
          label: '硒',
          category: 'MINERAL',
          expressionBasis: 'PER_MJ_ME',
          unit: 'μg',
          minValue: 23.9,
          currentValue: 23.43,
          status: 'DEFICIENT',
        },
        {
          nutrientKey: 'selenium',
          label: '硒',
          category: 'MINERAL',
          expressionBasis: 'PER_100G_DRY_MATTER',
          unit: 'μg',
          minValue: 40,
          currentValue: 58.02,
          status: 'COMPLIANT',
        },
      ],
    }

    expect(getAssessmentDryMatterLabel(selenium)).toBe('干物质 58.02μg/100g')
    expect(shouldShowAssessmentDryMatterInline(selenium)).toBe(false)
    expect(shouldShowAssessmentDetailTrigger(selenium)).toBe(true)
    expect(getAssessmentDetailModalContent(selenium)).toContain('/MJ ME')
    expect(getAssessmentDetailModalContent(selenium)).toContain('23.43μg')
    expect(getAssessmentDetailModalContent(selenium)).toContain('干物质')
    expect(getAssessmentDetailModalContent(selenium)).toContain('58.02μg/100g')
    expect(getAssessmentDetailRows(selenium)).toEqual([
      { label: '/1000kcal ME', value: '98μg' },
      { label: '/MJ ME', value: '23.43μg' },
      { label: '干物质', value: '58.02μg/100g' },
    ])
    expect(getAssessmentDetailModalContent(selenium)).not.toMatch(/下限|上限|法定上限|欧盟法定上限|说明|当前/)
    expect(getAssessmentDetailNotes(selenium)).toEqual([])
    expect(getAssessmentDisplayStatusLabel(selenium)).toBe('不足')
    expect(getAssessmentDisplayStatusClass(selenium)).toBe('status-deficient')
    expect(getAssessmentRangeConflictNote(selenium)).toBe('')
    expect(editorSource).toContain('entry-range-conflict')
    expect(editorSource).toContain('entry-detail-trigger')
    expect(editorSource).toContain('含量/原料')
    expect(editorSource).not.toContain('详情/原料贡献')
    expect(editorSource).toContain('showAssessmentEntryDetail(entry)')
    expect(editorSource).toContain('shouldShowAssessmentDetailTrigger(entry)')
    expect(editorSource).toContain('assessment-detail-mask')
    expect(editorSource).toContain('assessment-detail-panel')
    expect(editorSource).toContain('detail-modal-table')
    expect(editorSource).toContain('detail-modal-table-head')
    expect(editorSource).toContain('detail-modal-row')
    expect(editorSource).toContain('detailModalRows')
    expect(editorSource).toContain('detailContributionRows')
    expect(editorSource).toContain('原料贡献')
    expect(editorSource).toContain('贡献量')
    expect(editorSource).toContain('贡献度')
    expect(editorSource).toContain('寻找富含该营养素的原料')
    expect(editorSource).toContain('openIngredientPickerForDetailNutrient')
    expect(editorSource).toContain('ingredientNutrientSearchTarget')
    expect(editorSource).toContain('nutrientKey: ingredientNutrientSearchTarget.value.nutrientKey')
    expect(editorSource).toContain('scenario: scenario.value')
    expect(editorSource).toContain('expressionBasis: ingredientNutrientSearchTarget.value.expressionBasis')
    expect(editorSource).toContain('nutrientMatch')
    expect(editorSource).toContain('supplementIngredientOptions')
    expect(editorSource).toContain('supplementData')
    expect(editorSource).toContain('foodData')
    expect(editorSource).toContain('推荐补剂')
    expect(editorSource).toContain('富含${ingredientNutrientSearchTarget.value.label}的食材')
    expect(editorSource).toContain('closeAssessmentEntryDetail')
    expect(editorSource).toContain('当前含量')
    expect(editorSource).not.toContain('detailModalNotes')
    expect(editorSource).not.toContain('detail-modal-note')
    expect(editorSource).not.toContain('content,\\n    showCancel: false')
    expect(editorSource).not.toContain('>\\n                    i\\n                  </text>')
  })

  it('keeps nutrient details actionable while editing contributor weights', () => {
    expect(editorSource).not.toContain('${getAssessmentEntryName(entry)}营养详情')
    expect(editorSource).toContain('detailModalTitle.value = getAssessmentEntryName(entry)')
    expect(editorSource).toContain('detail-range-preview')
    expect(editorSource).toContain('detail-range-current')
    expect(editorSource).toContain('detail-range-status')
    expect(editorSource).toContain('detail-range-track')
    expect(editorSource).toContain(':style="detailModalRangeStyle"')
    expect(editorSource).toContain(':style="detailModalRangeMarkerStyle"')
    expect(editorSource).toContain(':style="detailModalRangeCurrentLabelStyle"')
    expect(editorSource).toContain('detail-modal-body')
    expect(editorSource).toContain('detail-modal-footer')
    expect(editorSource).toContain('detail-contribution-weight-input')
    expect(editorSource).toContain('detail-contribution-weight-confirm-btn')
    expect(editorSource).toContain('detail-contribution-spinner')
    expect(editorSource).toContain('onDetailContributionWeightInput')
    expect(editorSource).toContain('confirmDetailContributionWeight')
    expect(editorSource).not.toContain('applyDetailContributionMidpoint')
    expect(editorSource).not.toContain('调至中线')
    expect(editorSource).not.toContain('detail-contribution-midpoint-btn')
    expect(editorSource).toContain('updatingDetailContributionItemId')
    expect(editorSource).toContain('detailNutrientSearchTarget')
    expect(editorSource).toContain('寻找富含该营养素的原料')
  })

  it('requires explicit confirmation before applying contributor weight edits', () => {
    expect(editorSource).toContain('confirmDetailContributionWeight')
    expect(editorSource).toContain('detail-contribution-weight-confirm-btn')
    expect(editorSource).toContain('@tap.stop="confirmDetailContributionWeight(row)"')

    const contributionInputMatch = editorSource.match(
      /<input[\s\S]*?class="detail-contribution-weight-input"[\s\S]*?\/>/,
    )
    expect(contributionInputMatch?.[0] || '').toContain('@input="onDetailContributionWeightInput(row, $event)"')
    expect(contributionInputMatch?.[0] || '').not.toContain('@blur="adjustDetailContributionWeight(row, $event)"')
    expect(contributionInputMatch?.[0] || '').not.toContain('@confirm="adjustDetailContributionWeight(row, $event)"')
    expect(editorSource).not.toContain('detailContributionWeightDebounceTimer = setTimeout')
  })

  it('sorts nutrient contribution rows by contribution share and shows amount labels', () => {
    const calcium = {
      nutrientKey: 'calcium',
      label: '钙',
      category: 'MINERAL',
      expressionBasis: 'PER_1000_KCAL_ME',
      unit: 'mg',
      currentValue: 220,
      status: 'COMPLIANT',
      contributors: [
        {
          itemId: 'item-rice',
          itemName: '米饭',
          weightG: 500,
          amount: 12.5,
          unit: 'mg',
          contributionPercent: 13.5135,
          missing: false,
        },
        {
          itemId: 'item-beef',
          itemName: '牛肉',
          weightG: 400,
          amount: 80,
          unit: 'mg',
          contributionPercent: 86.4865,
          missing: false,
        },
        {
          itemId: 'item-kelp',
          itemName: '海带',
          weightG: 1,
          amount: null,
          unit: 'mg',
          contributionPercent: null,
          missing: true,
        },
      ],
    }

    const rows = getAssessmentContributionRows(calcium)

    expect(rows.map((row) => row.itemName)).toEqual(['牛肉', '米饭', '海带'])
    expect(rows[0]).toMatchObject({
      weightLabel: '400g',
      amountLabel: '80mg',
      percentLabel: '86.5%',
    })
    expect(rows[1]).toMatchObject({
      weightLabel: '500g',
      amountLabel: '12.5mg',
      percentLabel: '13.5%',
    })
    expect(rows[2]).toMatchObject({
      weightLabel: '1g',
      amountLabel: '缺数据',
      percentLabel: '-',
    })
    expect(shouldShowAssessmentDetailTrigger(calcium)).toBe(true)
    expect(getAssessmentNutrientSearchTarget(calcium)).toEqual({
      nutrientKey: 'calcium',
      label: '钙',
      expressionBasis: 'PER_1000_KCAL_ME',
    })
    expect(
      getAssessmentNutrientSearchTarget({
        nutrientKey: 'ca_p_ratio',
        label: '钙磷比',
        category: 'RATIO',
        expressionBasis: 'RATIO',
        unit: ':1',
        currentValue: 1.2,
        status: 'COMPLIANT',
      }),
    ).toBeNull()
  })

  it('uses short boundary titles on assessment range labels', () => {
    expect(
      getAssessmentBoundaryTitle(
        {
          nutrientKey: 'calcium',
          label: '钙',
          category: 'MINERAL',
          expressionBasis: 'PER_1000_KCAL_ME',
          unit: 'g',
          minValue: 2.5,
          maxValue: 4,
          currentValue: 3,
          status: 'COMPLIANT',
        },
        'max',
      ),
    ).toBe('上限')
  })

  it('renders late-growth calcium as a single conservative lower-bound marker', () => {
    const calcium = {
      nutrientKey: 'calcium',
      label: '钙',
      category: 'MINERAL',
      expressionBasis: 'PER_1000_KCAL_ME',
      unit: 'g',
      minValue: 2.5,
      maxValue: 4.5,
      minValueNote:
        '当前默认按 2.50g/1000kcal ME 保守评估；成年预期体重 <=15kg 的幼犬可参考 2.00g/1000kcal ME。',
      currentValue: 2.2,
      status: 'DEFICIENT',
    }

    expect(getAssessmentBoundaryTitle(calcium, 'min')).toBe('下限')
    expect(getAssessmentBoundaryNote(calcium, 'min')).toContain('2.50g/1000kcal ME')
    expect(getAssessmentBoundaryNote(calcium, 'min')).toContain('<=15kg')
    expect(editorSource).toContain("getAssessmentBoundaryNote(entry, 'min')")
    expect(editorSource).not.toContain('getAssessmentReferenceBoundaries(entry)')
    expect(editorSource).not.toContain('entry-range-reference-bound')
    expect(editorSource).not.toContain('entry-range-reference-marker')
    expect(editorSource).not.toContain('getAssessmentReferenceBoundaryMarkerStyle(entry, referenceBoundary)')
    expect(editorSource).not.toContain('showAssessmentReferenceBoundaryNote(entry, referenceBoundary)')
  })

  it('keeps dry-matter inline for macro nutrients only', () => {
    const macro = {
      nutrientKey: 'crudeProtein',
      label: '粗蛋白',
      category: 'MACRO',
      expressionBasis: 'PER_1000_KCAL_ME',
      unit: 'g',
      currentValue: 55,
      status: 'COMPLIANT',
      details: [
        {
          nutrientKey: 'crudeProtein',
          label: '粗蛋白',
          category: 'MACRO',
          expressionBasis: 'PER_100G_DRY_MATTER',
          unit: 'g',
          currentValue: 42,
          status: 'COMPLIANT',
        },
      ],
    }

    expect(getAssessmentDryMatterLabel(macro)).toBe('干物质 42.0%')
    expect(shouldShowAssessmentDryMatterInline(macro)).toBe(true)
    expect(shouldShowAssessmentDetailTrigger(macro)).toBe(false)
  })
})

describe('recipe designer publish nutrition report', () => {
  it('builds ingredient, macro, energy, mineral, and vitamin report rows', () => {
    const report = buildPublishNutritionReport({
      draft: {
        name: '鸡肉成犬维护',
        items: [
          {
            id: 'food-1',
            ingredientName: '鸡胸',
            weightG: 80,
            ingredient: { type: 'MEAT' },
            nutritionProfileDisplayName: '鸡胸肉（熟）',
          },
          {
            id: 'supplement-1',
            ingredientName: '碳酸钙',
            weightG: 2,
            ingredient: {
              type: 'SUPPLEMENT',
              unitDisplayLabel: null,
              purchaseUnit: 'g',
              properties: { display_unit: '平勺' },
              brand: 'NOW',
              productModel: '227g/瓶',
            },
            nutritionProfileDisplayName: '碳酸钙粉',
          },
        ],
      },
      assessment: {
        totalWeightG: 100,
        totalEnergyKcal: 120,
        dryMatterG: 40,
        dryMatterEnergyKcalPer100g: 300.04,
        energyDensityKcalPerKg: 1200.49,
        items: [
          { id: 'food-1', name: '鸡胸', weightG: 80, ratioPercent: 80 },
          { id: 'supplement-1', name: '碳酸钙', weightG: 2, ratioPercent: 2 },
        ],
        macroMetrics: {
          crudeProtein: { total: 20, dryMatterPercent: 50 },
          crudeFat: { total: 5, dryMatterPercent: 12.5 },
          ash: { total: 2, dryMatterPercent: 5 },
          moisture: { total: 60, dryMatterPercent: null },
          fiber: { total: 1, dryMatterPercent: 2.5 },
          carbohydrate: { total: 12, dryMatterPercent: 30 },
        },
        groupedEntries: [
          {
            nutrientKey: 'calcium',
            label: '钙',
            category: 'MINERAL',
            expressionBasis: 'PER_1000_KCAL_ME',
            unit: 'g',
            minValue: 1.25,
            maxValue: 6.25,
            currentValue: 2.5,
            status: 'DEFICIENT',
            details: [
              {
                nutrientKey: 'calcium',
                label: '钙',
                category: 'MINERAL',
                expressionBasis: 'PER_100G_DRY_MATTER',
                unit: 'g',
                currentValue: 0.75,
              },
            ],
          },
          {
            nutrientKey: 'calcium_phosphorus_ratio',
            label: '钙磷比',
            category: 'MINERAL',
            expressionBasis: 'RATIO',
            unit: 'ratio',
            minValue: 1,
            maxValue: 2,
            currentValue: 2.4,
            status: 'EXCESS',
          },
          {
            nutrientKey: 'vitaminA',
            label: '维生素A',
            category: 'VITAMIN',
            expressionBasis: 'PER_1000_KCAL_ME',
            unit: 'IU',
            minValue: 1250,
            maxValue: null,
            currentValue: 2400,
            status: 'COMPLIANT',
            details: [
              {
                nutrientKey: 'vitaminA',
                label: '维生素A',
                category: 'VITAMIN',
                expressionBasis: 'PER_100G_DRY_MATTER',
                unit: 'IU',
                currentValue: 7200,
              },
            ],
          },
          {
            nutrientKey: 'epaDha',
            label: 'EPA + DHA',
            category: 'COMBINATION',
            expressionBasis: 'PER_1000_KCAL_ME',
            unit: 'g',
            minValue: null,
            maxValue: null,
            currentValue: 0.86,
            status: 'INFO',
            details: [
              {
                nutrientKey: 'epaDha',
                label: 'EPA + DHA',
                category: 'COMBINATION',
                expressionBasis: 'PER_100G_DRY_MATTER',
                unit: 'g',
                currentValue: 0.4,
              },
            ],
          },
        ],
      },
    })

    expect(report.ingredientRows).toEqual([
      { ingredientName: '鸡胸肉（熟）', amountLabel: '80g', weightPercentLabel: '80.0%' },
      { ingredientName: '碳酸钙粉（NOW · 227g/瓶）', amountLabel: '2平勺', weightPercentLabel: '-' },
    ])
    expect(report.macroRows.find((row) => row.key === 'crudeProtein')).toMatchObject({
      name: '蛋白质',
      weightPercentLabel: '20.0%',
      dryMatterLabel: '50.0%',
      energyPercentLabel: '58.3%',
    })
    expect(report.energyDensityRows).toEqual([
      { label: '每公斤配方', value: '1200 kcal/kg' },
      { label: '每公斤干物质', value: '3000 kcal/kg DM' },
    ])
    expect(report.nutrientSections.minerals.rows[0]).toMatchObject({
      name: '钙',
      unit: 'g',
      minLabel: '1.25',
      maxLabel: '6.25',
      currentLabel: '2.5',
      dryMatterLabel: '0.75',
      statusClass: 'status-deficient',
    })
    expect(report.nutrientSections.minerals.rows.find((row) => row.name === '钙磷比')).toMatchObject({
      unit: '比例',
      minLabel: '1:1',
      maxLabel: '2:1',
      currentLabel: '2.4:1',
      dryMatterLabel: '',
      statusClass: 'status-excess',
    })
    expect(report.nutrientSections.vitamins.rows[0]).toMatchObject({
      name: '维生素A',
      unit: 'IU',
      minLabel: '1250',
      maxLabel: '-',
      currentLabel: '2400',
      dryMatterLabel: '7200',
    })
    expect(report.nutrientSections.fattyAcids.rows.find((row) => row.name === 'EPA + DHA')).toMatchObject({
      unit: 'g',
      currentLabel: '0.86',
      dryMatterLabel: '0.4',
    })
    expect(report.macroRows.find((row) => row.key === 'carbohydrate')?.name).toBe('碳水')
  })

  it('renders the renamed publish page as a nutrition report instead of the old publish guardrail form', () => {
    expect(pagesJsonSource).toContain('"navigationBarTitleText": "发布食谱"')
    expect(publishSource).toContain('recipeName')
    expect(publishSource).toContain('standardName')
    expect(publishSource).toContain('userName')
    expect(publishSource).toContain('基础信息')
    expect(publishSource).toContain('用户名称')
    expect(publishSource).toContain('营养报告')
    expect(publishSource).toContain('食谱原料清单')
    expect(publishSource).toContain('原料')
    expect(publishSource).toContain('用量')
    expect(publishSource).toContain('重量占比')
    expect(publishSource).toContain('宏量营养分析')
    expect(publishSource).toContain('占配方')
    expect(publishSource).toContain('占干物质')
    expect(publishSource).toContain('占热量')
    expect(publishSource).toContain('微量元素')
    expect(publishSource).toContain('维生素')
    expect(publishSource).toContain('氨基酸')
    expect(publishSource).toContain('脂肪酸')
    expect(publishSource).toContain('下限')
    expect(publishSource).toContain('上限')
    expect(publishSource).toContain('/1,000kcal')
    expect(publishSource).toContain('干物质/100g')
    expect(publishSource).toContain('buildPublishNutritionReport')
    expect(publishSource).toContain('@tap="handlePublishTap"')
    expect(publishSource).toContain('v-if="canPublishRecipe"')
    expect(publishSource).toContain('getCurrentUserRole')
    expect(publishSource).toContain('open-type="share"')
    expect(publishSource).toContain('onShareAppMessage')
    expect(publishSource).toContain('CURRENT_SHARE_CONFIG.recipeImageUrl')
    expect(publishSource).toContain('/static/logo.png')
    expect(publishSource).toContain('status-deficient')
    expect(publishSource).toContain('status-excess')
    expect(publishSource).toContain('提交后台草稿')
    expect(publishSource).not.toContain("{{ publishing ? '发布中...' : '发布食谱' }}")
    expect(publishSource).toContain('分享')
    expect(publishSource).toContain('await recipeDesignerApi.publishDraft(draftId.value')
    expect(publishSource).toContain('name: recipeName.value')
    expect(publishSource).toContain('reviewNote')
    expect(publishSource).toContain('审核说明')
    expect(publishSource).toContain('publishRequiresReview')
    expect(publishSource).toContain('食谱已保存为后台草稿')
    expect(publishSource).not.toContain('发布功能待确认')
    expect(publishSource).not.toContain('原料档案名称')
    expect(publishSource).not.toContain('重量百分比')
    expect(publishSource).not.toContain('配方重量百分比')
    expect(publishSource).not.toContain('干物质百分比')
    expect(publishSource).not.toContain('热量百分比')
    expect(publishSource).not.toContain('净碳水')
    expect(publishSource).not.toContain('/1000kcal 下限')
    expect(publishSource).not.toContain('/1000kcal 上限')
    expect(publishSource).not.toContain('干物质百分比/含量')
    expect(publishSource).not.toContain('干物质值')
    expect(publishSource).not.toContain('评估结果')
    expect(publishSource).not.toContain('正式食谱名称')
  })

  it('keeps publish report ingredient and macro tables within the mobile viewport', () => {
    const ingredientSection = publishSource.match(/<view class="section">\s*<text class="section-title">食谱原料清单[\s\S]*?<text class="section-title">宏量营养分析/)?.[0] || ''
    const macroSection = publishSource.match(/<view class="section">\s*<text class="section-title">宏量营养分析[\s\S]*?<view v-for="section in nutrientSectionList/)?.[0] || ''

    expect(ingredientSection).not.toContain('scroll-x')
    expect(macroSection).not.toContain('scroll-x')
    expect(publishSource).toContain('compact-report-table-wrap')
    expect(publishSource).toContain('compact-report-table')
    expect(publishSource).toMatch(/\.compact-report-table\s*\{[\s\S]*width: 100%;/)
    expect(publishSource).toMatch(/\.ingredient-name-cell\s*\{[\s\S]*flex: 1 1 0;[\s\S]*white-space: normal;/)
    expect(publishSource).toMatch(/\.amount-cell\s*\{[\s\S]*flex: 0 0 150rpx;/)
    expect(publishSource).toMatch(/\.percent-cell\s*\{[\s\S]*flex: 0 0 134rpx;/)
    expect(publishSource).toMatch(/\.macro-table \.nutrient-name-cell\s*\{[\s\S]*flex: 0 0 142rpx;/)
    expect(publishSource).toMatch(/\.macro-table \.report-number-cell\s*\{[\s\S]*flex: 1 1 0;/)
  })
})
