import assert from 'node:assert/strict';
import test from 'node:test';

import { validateElementForm } from '../src/utils/elementFormValidation.ts';

test('returns false when no form instance is available', async () => {
  assert.equal(await validateElementForm(undefined), false);
});

test('returns true when Element Plus validation succeeds', async () => {
  const form = {
    validate: async () => true,
  };

  assert.equal(await validateElementForm(form), true);
});

test('returns false when Element Plus validation rejects with invalid fields', async () => {
  const form = {
    validate: async () => {
      throw { name: [{ message: '请输入食谱名称' }] };
    },
  };

  assert.equal(await validateElementForm(form), false);
});
