import assert from 'node:assert/strict';
import test from 'node:test';

import { appendPreparationMethodText } from '../src/utils/preparationMethodText.ts';

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
