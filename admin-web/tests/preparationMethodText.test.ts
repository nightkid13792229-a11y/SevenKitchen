import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendPreparationMethodText,
  getDefaultPreparationMethodFromHistory,
} from '../src/utils/preparationMethodText.ts';

test('appends overlapping historical phrases instead of treating substrings as duplicates', () => {
  assert.equal(
    appendPreparationMethodText('蒸熟后压泥', '蒸熟'),
    '蒸熟后压泥、蒸熟',
  );
});

test('appends only genuinely new history segments from compound history chips', () => {
  assert.equal(
    appendPreparationMethodText('去皮', '去皮、蒸熟'),
    '去皮、蒸熟',
  );
});

test('defaults a blank preparation method to the most recent history item', () => {
  assert.equal(
    getDefaultPreparationMethodFromHistory('', [
      { text: '去皮、蒸熟', usageCount: 2, lastUsedAt: '2026-05-26T01:00:00.000Z' },
      { text: '切丁', usageCount: 1, lastUsedAt: '2026-05-20T01:00:00.000Z' },
    ]),
    '去皮、蒸熟',
  );
});

test('does not overwrite an existing preparation method when history loads', () => {
  assert.equal(
    getDefaultPreparationMethodFromHistory('已手动填写', [
      { text: '去皮、蒸熟', usageCount: 2, lastUsedAt: '2026-05-26T01:00:00.000Z' },
    ]),
    '已手动填写',
  );
});
