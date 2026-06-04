import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const recipeFormSource = readFileSync(
  resolve(__dirname, '../src/views/Recipes/RecipeForm.vue'),
  'utf8',
);

test('recipe ingredient rows use a row-level key so duplicate ingredients delete safely', () => {
  assert.doesNotMatch(recipeFormSource, /item-key="ingredientId"/);
  assert.match(recipeFormSource, /:item-key="getRecipeIngredientRowKey"/);
  assert.match(recipeFormSource, /@click="removeIngredient\(item, index\)"/);
});
