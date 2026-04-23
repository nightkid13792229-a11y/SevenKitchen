import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INGREDIENT_NUTRITION_TAB_DEFINITIONS,
  SUPPLEMENT_TARGET_FIELD_OPTIONS
} from '../src/constants/ingredientNutrition.ts'

test('supplement target options expose every structured nutrition field', () => {
  const expectedFieldPaths = INGREDIENT_NUTRITION_TAB_DEFINITIONS.flatMap((tab) =>
    tab.fields.map((field) => `${tab.key}.${field.key}`)
  )
  const actualFieldPaths = SUPPLEMENT_TARGET_FIELD_OPTIONS.map((option) => option.fieldPath)

  assert.deepEqual(
    actualFieldPaths,
    expectedFieldPaths,
    '补剂目标字段下拉框应完整覆盖结构化营养字段目录，并保持营养数据表顺序'
  )
})

test('supplement target options include manual-review nutrients but exclude custom nutrition items', () => {
  const actualFieldPaths = new Set(
    SUPPLEMENT_TARGET_FIELD_OPTIONS.map((option) => option.fieldPath)
  )

  for (const fieldPath of [
    'macros.fiber',
    'macros.solubleFiber',
    'minerals.iron',
    'minerals.copper',
    'minerals.manganese',
    'vitamins.vitaminB2',
    'vitamins.vitaminB6',
    'vitamins.vitaminB12',
    'aminoAcids.taurine'
  ]) {
    assert.equal(actualFieldPaths.has(fieldPath), true, `${fieldPath} 应出现在补剂目标字段下拉框`)
  }

  assert.equal(
    [...actualFieldPaths].some((fieldPath) => fieldPath.startsWith('customItems.')),
    false,
    '自定义营养项没有稳定字段 key，不能作为补剂目标字段直接选择'
  )
})
