import assert from 'node:assert/strict'
import test from 'node:test'

import { getProcurementSkuConvertedPriceText } from '../src/views/Ingredients/procurementSkuDisplay.ts'

test('formats procurement SKU converted price per 500 g for gram based ingredients', () => {
  assert.equal(
    getProcurementSkuConvertedPriceText(
      {
        currentPurchasePrice: 39.8,
        purchaseToBaseRatio: 2100,
      },
      'G',
      null,
    ),
    '折算采购价：¥9.48 / 500克',
  )
})

test('formats procurement SKU converted price per 500 ml for liquid ingredients', () => {
  assert.equal(
    getProcurementSkuConvertedPriceText(
      {
        currentPurchasePrice: 12.5,
        purchaseToBaseRatio: 250,
      },
      'ML',
      null,
    ),
    '折算采购价：¥25.00 / 500毫升',
  )
})

test('formats procurement SKU converted price per single PCS base unit', () => {
  assert.equal(
    getProcurementSkuConvertedPriceText(
      {
        currentPurchasePrice: 18.9,
        purchaseToBaseRatio: 30,
      },
      'PCS',
      null,
    ),
    '折算采购价：¥0.63 / 1个/件',
  )
})

test('uses custom base unit display label in converted price text', () => {
  assert.equal(
    getProcurementSkuConvertedPriceText(
      {
        currentPurchasePrice: 18.9,
        purchaseToBaseRatio: 30,
      },
      'PCS',
      '枚',
    ),
    '折算采购价：¥0.63 / 1枚',
  )
})

test('does not format converted price when price or conversion ratio is missing', () => {
  assert.equal(
    getProcurementSkuConvertedPriceText(
      {
        currentPurchasePrice: null,
        purchaseToBaseRatio: 2100,
      },
      'G',
      null,
    ),
    null,
  )
  assert.equal(
    getProcurementSkuConvertedPriceText(
      {
        currentPurchasePrice: 39.8,
        purchaseToBaseRatio: 0,
      },
      'G',
      null,
    ),
    null,
  )
})
