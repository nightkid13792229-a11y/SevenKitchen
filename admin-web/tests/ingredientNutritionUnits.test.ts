import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getIngredientNutritionResolvedDisplayUnit,
  INGREDIENT_NUTRITION_FIELD_DEFINITION_MAP
} from '../src/constants/ingredientNutrition.ts'
import { convertIngredientNutritionFieldValue } from '../src/utils/ingredientNutritionUnits.ts'

function almostEqual(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`)
}

test('vitamin D keeps official IU to μg conversion', () => {
  almostEqual(convertIngredientNutritionFieldValue('vitaminD', 1000, 'IU', 'μg'), 25)
  almostEqual(convertIngredientNutritionFieldValue('vitaminD', 25, 'μg', 'IU'), 1000)
})

test('mass-unit conversions keep direction correct across mg, μg and g', () => {
  almostEqual(convertIngredientNutritionFieldValue('iodine', 180, 'mg', 'μg'), 180000)
  almostEqual(convertIngredientNutritionFieldValue('iodine', 180000, 'μg', 'mg'), 180)
  almostEqual(convertIngredientNutritionFieldValue('calcium', 1.8, 'g', 'mg'), 1800)
  almostEqual(convertIngredientNutritionFieldValue('calcium', 1800, 'mg', 'g'), 1.8)
})

test('vitamin A follows canine FEDIAF source-to-IU activity factors', () => {
  almostEqual(convertIngredientNutritionFieldValue('vitaminA', 1, 'mg（视黄醇）', 'IU（视黄醇）'), 3333)
  almostEqual(convertIngredientNutritionFieldValue('vitaminA', 1000, 'IU（视黄醇）', 'mg（视黄醇）'), 1000 / 3333)
  almostEqual(convertIngredientNutritionFieldValue('vitaminA', 1, 'mg（乙酸酯）', 'IU（乙酸酯）'), 1000 / 0.344)
  almostEqual(convertIngredientNutritionFieldValue('vitaminA', 1, 'mg（丙酸酯）', 'IU（丙酸酯）'), 1000 / 0.359)
  almostEqual(convertIngredientNutritionFieldValue('vitaminA', 1, 'mg（棕榈酸酯）', 'IU（棕榈酸酯）'), 1000 / 0.55)
  almostEqual(convertIngredientNutritionFieldValue('vitaminA', 1, 'mg（β-胡萝卜素，犬）', 'IU（β-胡萝卜素，犬）'), 833)
})

test('vitamin E follows canine FEDIAF natural and synthetic source factors', () => {
  almostEqual(convertIngredientNutritionFieldValue('vitaminE', 1, 'mg（天然，d-α-tocopherol）', 'IU（天然，d-α-tocopherol）'), 1.49)
  almostEqual(convertIngredientNutritionFieldValue('vitaminE', 1.49, 'IU（天然，d-α-tocopherol）', 'mg（天然，d-α-tocopherol）'), 1)
  almostEqual(
    convertIngredientNutritionFieldValue('vitaminE', 1, 'mg（合成，dl-α-tocopheryl acetate）', 'IU（合成，dl-α-tocopheryl acetate）'),
    1
  )
  almostEqual(
    convertIngredientNutritionFieldValue('vitaminE', 400, 'IU（合成，dl-α-tocopheryl acetate）', 'mg（合成，dl-α-tocopheryl acetate）'),
    400
  )
})

test('vitamin A and E field defaults reflect the canine FEDIAF model', () => {
  const vitaminA = INGREDIENT_NUTRITION_FIELD_DEFINITION_MAP.vitaminA
  const vitaminE = INGREDIENT_NUTRITION_FIELD_DEFINITION_MAP.vitaminE

  assert.ok(vitaminA)
  assert.ok(vitaminE)
  assert.equal(vitaminA.unit, 'IU')
  assert.equal(vitaminA.defaultDisplayUnit, 'IU（视黄醇）')
  assert.equal(vitaminE.unit, 'IU')
  assert.equal(vitaminE.defaultDisplayUnit, 'IU（天然，d-α-tocopherol）')
})

test('legacy invalid vitamin E display unit does not override the new default', () => {
  assert.equal(getIngredientNutritionResolvedDisplayUnit('vitaminA', 'IU（视黄醇）'), 'IU（视黄醇）')
  assert.equal(
    getIngredientNutritionResolvedDisplayUnit('vitaminE', 'μg'),
    'IU（天然，d-α-tocopherol）'
  )
})
