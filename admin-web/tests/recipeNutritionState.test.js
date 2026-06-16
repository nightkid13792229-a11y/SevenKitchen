import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('recipe form lets food rows choose a mapped nutrition profile', () => {
  const formVue = read('admin-web/src/views/Recipes/RecipeForm.vue')

  assert.match(formVue, /label="营养档案"/)
  assert.match(formVue, /未指定时默认使用该原料的主档案/)
  assert.match(formVue, /v-model="ingredientForm\.nutritionFoodId"/)
  assert.match(formVue, /availableNutritionFoodMappings/)
  assert.match(formVue, /selectDefaultNutritionFoodForIngredient/)
  assert.match(formVue, /formatNutritionStateLabel/)
  assert.match(formVue, /formatNutritionProfileOptionLabel/)
  assert.match(formVue, /nutritionFoodId:\s*ingredientForm\.nutritionFoodId \|\| undefined/)
})

test('admin types include ingredient nutrition food mappings and recipe item selection', () => {
  const ingredientTypes = read('admin-web/src/types/ingredient.ts')
  const recipeTypes = read('admin-web/src/types/recipe.ts')

  assert.match(ingredientTypes, /export interface NutritionFoodMapping/)
  assert.match(ingredientTypes, /preparationStateLabel\?: string/)
  assert.match(ingredientTypes, /nutritionFoodMappings\?: NutritionFoodMapping\[\]/)
  assert.match(recipeTypes, /nutritionFoodId\?: string/)
  assert.match(recipeTypes, /nutritionStateLabel\?: string/)
})

test('admin recipe life stage enum uses the five precise backend recipe stages', () => {
  const recipeTypes = read('admin-web/src/types/recipe.ts')

  assert.match(recipeTypes, /PUPPY_UNDER_14_WEEKS = 'PUPPY_UNDER_14_WEEKS'/)
  assert.match(recipeTypes, /PUPPY_14_WEEKS_PLUS = 'PUPPY_14_WEEKS_PLUS'/)
  assert.match(recipeTypes, /LOW_ACTIVITY_ADULT_OR_SENIOR = 'LOW_ACTIVITY_ADULT_OR_SENIOR'/)
  assert.match(recipeTypes, /HIGH_ACTIVITY_ADULT = 'HIGH_ACTIVITY_ADULT'/)
  assert.match(recipeTypes, /REPRODUCTION = 'REPRODUCTION'/)
})

test('admin recipe form renders Setar nutrition reports read-only and removes PDF upload', () => {
  const formVue = read('admin-web/src/views/Recipes/RecipeForm.vue')
  const recipeApi = read('admin-web/src/api/recipes.ts')
  const recipeTypes = read('admin-web/src/types/recipe.ts')

  assert.match(formVue, /完整营养报告/)
  assert.match(formVue, /Setar/)
  assert.match(formVue, /nutritionReportSections/)
  assert.doesNotMatch(formVue, /营养报告PDF/)
  assert.doesNotMatch(formVue, /handleNutritionReportUpload/)
  assert.doesNotMatch(formVue, /viewNutritionReport/)
  assert.doesNotMatch(formVue, /removeNutritionReport/)

  assert.doesNotMatch(recipeApi, /uploadNutritionReport/)
  assert.doesNotMatch(recipeApi, /upload-nutrition-report/)
  assert.doesNotMatch(recipeTypes, /nutritionReportUrl/)
})

test('admin recipe list groups recipe versions and surfaces pending revision state', () => {
  const listVue = read('admin-web/src/views/Recipes/index.vue')
  const recipeTypes = read('admin-web/src/types/recipe.ts')

  assert.match(recipeTypes, /export interface RecipeVersionSummary/)
  assert.match(recipeTypes, /currentPublicVersion\?: RecipeVersionSummary/)
  assert.match(recipeTypes, /pendingDraftVersion\?: RecipeVersionSummary/)
  assert.match(recipeTypes, /versionHistory\?: RecipeVersionSummary\[\]/)

  assert.match(listVue, /当前公开 v/)
  assert.match(listVue, /待发布修订 v/)
  assert.match(listVue, /getRecipeSeriesDisplayName/)
  assert.match(listVue, /row\.seriesName \|\| row\.name/)
  assert.match(listVue, /row\.pendingDraftVersion/)
  assert.match(listVue, /getPendingPublishStages\(row\)/)
  assert.match(listVue, /<el-popover/)
  assert.match(listVue, /选择要发布的生命阶段/)
  assert.match(listVue, /publishSelectedStages\(row\)/)
  assert.match(listVue, /publishAllPendingStages\(row\)/)
  assert.match(listVue, /publishingRecipeStages/)
  assert.match(listVue, /recipeApi\.publish\(stage\.publishRecipeId\)/)
  assert.match(listVue, /await loadRecipes\(\)/)
  assert.match(listVue, /failures\.push/)
  assert.match(listVue, /部分发布失败/)
  assert.doesNotMatch(listVue, /handlePublish\(row\.pendingDraftVersion \|\| row\)/)
  assert.doesNotMatch(listVue, /确认发布该食谱/)
  assert.match(listVue, /getRecipeBusinessStatusLabel/)
  assert.match(recipeTypes, /recipeVersionId\?: string/)
  assert.match(listVue, /handleStageView\(stage\)/)
  assert.match(listVue, /stage\.recipeVersionId/)
  assert.match(listVue, /is-clickable/)
  assert.match(listVue, /getConfiguredSeriesStages\(row\)/)
  assert.doesNotMatch(listVue, /row\.seriesStages"\n\s+:key="stage\.lifeStage"/)
})

test('admin recipe list no longer opens the legacy recipe create form', () => {
  const listVue = read('admin-web/src/views/Recipes/index.vue')

  assert.match(listVue, /食谱设计器中新建系列食谱/)
  assert.doesNotMatch(listVue, /router\.push\('\/recipes\/create'\)/)
})

test('admin recipe form exposes current series life stage and stage switching', () => {
  const formVue = read('admin-web/src/views/Recipes/RecipeForm.vue')
  const recipeTypes = read('admin-web/src/types/recipe.ts')

  assert.match(recipeTypes, /seriesLifeStage\?: string/)
  assert.match(recipeTypes, /seriesLifeStageLabel\?: string/)
  assert.match(formVue, /currentRecipe/)
  assert.match(formVue, /currentSeriesStageLabel/)
  assert.match(formVue, /handleSeriesStageChange/)
  assert.match(formVue, /recipeVersionId/)
  assert.match(formVue, /切换生命阶段/)
  assert.match(formVue, /由食谱系列当前阶段决定/)
})
