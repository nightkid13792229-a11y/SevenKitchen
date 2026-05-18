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
