import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('recipe detail copy guardrails', () => {
  const recipeDetailSource = readFileSync(
    resolve(__dirname, './recipe-detail/index.vue'),
    'utf8',
  );
  const snapshotModalSource = readFileSync(
    resolve(__dirname, '../components/RecipeSnapshotModal.vue'),
    'utf8',
  );

  it('clarifies supplement nutrient targets as per kg food ingredient basis', () => {
    expect(recipeDetailSource).toContain('每kg食材添加');
    expect(recipeDetailSource).not.toContain('每kg添加');
    expect(snapshotModalSource).toContain('每kg食材添加');
    expect(snapshotModalSource).not.toContain('每kg添加');
  });
});
