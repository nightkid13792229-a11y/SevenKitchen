import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatFinancialAmount,
  getAdjustmentTagType,
  getAdjustmentText,
} from '../src/views/Orders/orderFinancialSummary.ts';

test('formats financial amounts with currency prefix', () => {
  assert.equal(formatFinancialAmount(12), '¥12.00');
  assert.equal(formatFinancialAmount(-3.456), '-¥3.46');
  assert.equal(formatFinancialAmount(null), '-');
});

test('describes refund and extra payment suggestions from adjustment amount', () => {
  assert.equal(getAdjustmentText(-12), '建议退差价 ¥12.00');
  assert.equal(getAdjustmentTagType(-12), 'warning');
  assert.equal(getAdjustmentText(8), '建议补收 ¥8.00');
  assert.equal(getAdjustmentTagType(8), 'danger');
  assert.equal(getAdjustmentText(0), '无需调整');
  assert.equal(getAdjustmentTagType(0), 'success');
});
