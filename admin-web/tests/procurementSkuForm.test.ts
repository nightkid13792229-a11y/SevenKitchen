import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeProcurementSkuOptionalText } from '../src/views/Ingredients/procurementSkuForm.ts'

test('normalizes cleared procurement SKU optional text fields as null', () => {
  assert.equal(normalizeProcurementSkuOptionalText(''), null)
  assert.equal(normalizeProcurementSkuOptionalText('   '), null)
  assert.equal(normalizeProcurementSkuOptionalText(null), null)
  assert.equal(normalizeProcurementSkuOptionalText(undefined), null)
})

test('trims procurement SKU optional text fields before saving', () => {
  assert.equal(normalizeProcurementSkuOptionalText('  采购备注  '), '采购备注')
})
