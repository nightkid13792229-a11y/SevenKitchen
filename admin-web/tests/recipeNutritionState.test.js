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
  assert.match(listVue, /row\.currentPublicVersion\?\.name \|\| row\.name/)
  assert.match(listVue, /row\.pendingDraftVersion/)
  assert.match(listVue, /handlePublish\(row\.pendingDraftVersion \|\| row\)/)
  assert.match(listVue, /getRecipeSeriesStatusLabel/)
})
