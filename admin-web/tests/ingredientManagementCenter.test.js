import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('ingredient management center owns nutrition governance and tag management tabs', () => {
  const ingredientsPage = read('admin-web/src/views/Ingredients/index.vue')

  assert.match(ingredientsPage, /IngredientNutritionGovernancePanel/)
  assert.match(ingredientsPage, /IngredientTagsPanel/)
  assert.match(ingredientsPage, /activeCenterTab/)
  assert.match(ingredientsPage, /name="standard"/)
  assert.match(ingredientsPage, /name="nutrition"/)
  assert.match(ingredientsPage, /name="tags"/)
  assert.doesNotMatch(ingredientsPage, /name="agent"/)
  assert.doesNotMatch(ingredientsPage, /agent-tab-note/)
})

test('nutrition tab owns source import and Agent operations', () => {
  const nutritionPanel = read('admin-web/src/views/Ingredients/components/IngredientNutritionGovernancePanel.vue')
  const cfctPanel = read('admin-web/src/views/Ingredients/components/CfctSourceReviewPanel.vue')
  const nutritionApi = read('admin-web/src/api/nutritionGovernance.ts')

  assert.match(nutritionPanel, /Agent 设置/)
  assert.match(nutritionPanel, /AgentBatchReviewPanel/)
  assert.match(nutritionPanel, /CfctSourceReviewPanel/)
  assert.match(nutritionPanel, /生成候选/)
  assert.match(nutritionPanel, /导入 USDA/)
  assert.match(nutritionPanel, /批量确认/)
  assert.match(cfctPanel, /CFCT OCR 审核入库/)
  assert.match(cfctPanel, /载入本地中间库/)
  assert.match(cfctPanel, /handleLoadLocalLibrary/)
  assert.match(cfctPanel, /导入已审核 CFCT/)
  assert.match(cfctPanel, /handleStructuredFileChange/)
  assert.match(cfctPanel, /getLocalCfctStructuredLibrary/)
  assert.match(cfctPanel, /importReviewedCfctRows/)
  assert.match(nutritionApi, /sources\/cfct\/local-library/)
  assert.match(nutritionApi, /sources\/cfct\/import-reviewed/)
})

test('CFCT source review groups mapped and extra nutrients for readable review', () => {
  const cfctPanel = read('admin-web/src/views/Ingredients/components/CfctSourceReviewPanel.vue')
  const nutritionTypes = read('admin-web/src/types/nutritionGovernance.ts')

  assert.match(cfctPanel, /type="expand"/)
  assert.match(cfctPanel, /宏量营养/)
  assert.match(cfctPanel, /能量 \(Energy\)/)
  assert.match(cfctPanel, /矿物质/)
  assert.match(cfctPanel, /维生素/)
  assert.match(cfctPanel, /维生素 A \(Vitamin A\)/)
  assert.match(cfctPanel, /维生素 D \(Vitamin D\)/)
  assert.match(cfctPanel, /维生素 E \(Vitamin E\)/)
  assert.match(cfctPanel, /氨基酸/)
  assert.match(cfctPanel, /丙氨酸 \(Alanine\)/)
  assert.match(cfctPanel, /天冬氨酸 \(Aspartic acid\)/)
  assert.match(cfctPanel, /丝氨酸 \(Serine\)/)
  assert.match(cfctPanel, /脂肪酸/)
  assert.match(cfctPanel, /其他营养素/)
  assert.match(cfctPanel, /reviewNutrientGroups/)
  assert.match(cfctPanel, /classifyExtraNutrientKey/)
  assert.match(cfctPanel, /cfctVitaminATotalUg/)
  assert.match(cfctPanel, /cfctIodineUg/)
  assert.match(cfctPanel, /cfctAminoAcid/)
  assert.match(cfctPanel, /cfctFattyAcid/)
  assert.doesNotMatch(cfctPanel, /未映射项/)
  assert.doesNotMatch(cfctPanel, /额外项/)
  assert.match(cfctPanel, /OCR 来源/)
  assert.match(cfctPanel, /markRowReviewed/)
  assert.match(cfctPanel, /isReviewedImportableRow/)
  assert.match(cfctPanel, /row\.reviewStatus === 'NEEDS_REVIEW'/)
  assert.match(cfctPanel, /qualityFlags\?\.length !== 0/)

  assert.match(nutritionTypes, /sourceSegments\?: CfctReviewedSourceSegment\[\]/)
  assert.match(nutritionTypes, /unmappedNutrients\?: Record<string, number \| null \| undefined>/)
})

test('nutrition tab surfaces searched ingredients that only have confirmed profiles', () => {
  const nutritionPanel = read('admin-web/src/views/Ingredients/components/IngredientNutritionGovernancePanel.vue')
  const types = read('admin-web/src/types/nutritionGovernance.ts')
  const dto = read('backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts')

  assert.match(nutritionPanel, /matchedIngredientsWithoutVisibleCandidates/)
  assert.match(nutritionPanel, /没有待确认候选，但找到标准原料/)
  assert.match(nutritionPanel, /打开营养档案/)
  assert.match(nutritionPanel, /handleOpenIngredientWorkbenchByIngredient/)
  assert.match(nutritionPanel, /reloadIngredientWorkbenchCandidates\([\s\S]*includeAllStatuses:\s*true/)
  assert.match(types, /ingredientId\?: string/)
  assert.match(dto, /ingredientId\?: string/)
})

test('legacy nutrition and tag routes redirect into ingredient management center', () => {
  const router = read('admin-web/src/router/index.ts')

  assert.match(
    router,
    /path:\s*["']nutrition-governance["'][\s\S]*redirect:\s*\{ path:\s*["']\/ingredients["'], query:\s*\{ tab:\s*["']nutrition["'] \} \}/
  )
  assert.match(
    router,
    /path:\s*["']ingredient-tags["'][\s\S]*redirect:\s*\{ path:\s*["']\/ingredients["'], query:\s*\{ tab:\s*["']tags["'] \} \}/
  )
})

test('sidebar exposes one ingredient management entry', () => {
  const layout = read('admin-web/src/layouts/MainLayout.vue')

  assert.match(layout, /index="\/ingredients"/)
  assert.match(layout, />原料管理</)
  assert.doesNotMatch(layout, /index="\/nutrition-governance"/)
  assert.doesNotMatch(layout, /index="\/ingredient-tags"/)
  assert.doesNotMatch(layout, />原料营养治理</)
  assert.doesNotMatch(layout, />原料标签管理</)
})

test('ingredient management panels are extracted for reuse', () => {
  assert.equal(
    existsSync(resolve(root, 'admin-web/src/views/Ingredients/components/IngredientNutritionGovernancePanel.vue')),
    true
  )
  assert.equal(
    existsSync(resolve(root, 'admin-web/src/views/Ingredients/components/IngredientTagsPanel.vue')),
    true
  )
})

test('ingredient nutrition dialog manages mapped nutrition profiles instead of a single legacy profile', () => {
  const dialog = read('admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue')
  const ingredientApi = read('admin-web/src/api/ingredients.ts')
  const ingredientTypes = read('admin-web/src/types/ingredient.ts')
  const adminController = read('backend/src/interfaces/controllers/admin.controller.ts')

  assert.match(dialog, /营养档案管理器/)
  assert.match(dialog, /profileMappings/)
  assert.match(dialog, /selectedMappingId/)
  assert.match(dialog, /profile-table-panel/)
  assert.match(dialog, /profile-current-panel/)
  assert.match(dialog, /当前编辑档案/)
  assert.match(dialog, /档案列表/)
  assert.match(dialog, /<el-table/)
  assert.match(dialog, /设为主档案/)
  assert.match(dialog, /编辑档案数据/)
  assert.doesNotMatch(dialog, /profile-card/)
  assert.match(dialog, /handleSetPrimaryProfile/)
  assert.match(dialog, /nutritionFoodApi\.updateMapping/)
  assert.match(dialog, /nutritionFoodApi\.update/)
  assert.doesNotMatch(dialog, /仅维护该标准原料的营养数据/)

  assert.match(ingredientApi, /nutritionFoodApi/)
  assert.match(ingredientApi, /patch\(`\/nutrition-foods\/\$\{id\}`/)
  assert.match(ingredientApi, /patch\(`\/nutrition-foods\/\$\{nutritionFoodId\}\/mappings\/\$\{ingredientId\}`/)

  assert.match(ingredientTypes, /nutritionData\?: NutritionProfile/)
  assert.match(ingredientTypes, /ediblePortionLabel\?: string/)
  assert.match(ingredientTypes, /processingLabel\?: string/)

  assert.match(adminController, /nutritionData:\s*mapping\.nutritionFood\.nutritionData/)
  assert.match(adminController, /ediblePortionLabel:\s*mapping\.nutritionFood\.ediblePortionLabel/)
  assert.match(adminController, /processingLabel:\s*mapping\.nutritionFood\.processingLabel/)
})

test('mapped food nutrition profiles do not duplicate sample state in the nutrient editor', () => {
  const dialog = read('admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue')
  const editor = read('admin-web/src/views/Ingredients/components/IngredientNutritionEditor.vue')

  assert.match(dialog, /:show-sample-state="shouldShowSampleState"/)
  assert.match(dialog, /const shouldShowSampleState = computed/)
  assert.match(dialog, /props\.ingredient\?\.type === IngredientType\.SUPPLEMENT/)
  assert.match(dialog, /!selectedMapping\.value/)

  assert.match(editor, /showSampleState\?: boolean/)
  assert.match(editor, /v-if="showSampleState"/)
})

test('ingredient nutrition dialog can ask Agent to draft a food nutrition profile', () => {
  const dialog = read('admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue')

  assert.match(dialog, /Agent 添加档案/)
  assert.match(dialog, /IngredientNutritionWorkbenchDrawer/)
  assert.match(dialog, /openAgentProfileDraftDrawer/)
  assert.match(dialog, /agentProfileDraftCandidates/)
  assert.match(dialog, /nutritionGovernanceApi\.listCandidates/)
  assert.match(dialog, /nutritionGovernanceApi\.rankFoodCandidatesWithAgent/)
  assert.match(dialog, /nutritionGovernanceApi\.validateCandidateNutritionWithAgent/)
  assert.match(dialog, /nutritionGovernanceApi\.applyIngredientCandidateConfiguration/)
  assert.match(dialog, /nutritionGovernanceApi\.rejectCandidate/)
  assert.match(dialog, /nutritionGovernanceApi\.importUsdaSource/)
  assert.match(dialog, /emit\("saved"\)/)
})
