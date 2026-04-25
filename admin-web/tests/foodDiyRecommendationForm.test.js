import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('food DIY recommendation image field uses upload flow instead of raw URL editing', () => {
  const formVue = read('admin-web/src/views/Ingredients/IngredientForm.vue')

  assert.match(formVue, /class="rp-image-panel"/)
  assert.match(formVue, /:before-upload="handleRpImageUpload"/)
  assert.match(formVue, /handleRemoveRpImage/)
  assert.match(formVue, /const rpImageUploading = ref\(false\)/)
  assert.match(formVue, /cropImageFileToSquare\(rawFile as File\)/)
  assert.match(formVue, /ingredientApi\.uploadIngredientDiyImage\(croppedFile\)/)
  assert.match(formVue, /cleanupUncommittedRpImage/)
  assert.doesNotMatch(formVue, /placeholder="产品图片URL"/)
})

test('food DIY recommendation editor omits nutrition highlights and display unit fields', () => {
  const formVue = read('admin-web/src/views/Ingredients/IngredientForm.vue')

  assert.doesNotMatch(formVue, /<el-form-item label="营养卖点">/)
  assert.doesNotMatch(formVue, /<el-form-item label="展示单位">/)
  assert.doesNotMatch(formVue, /展示单位：\{\{ rp\.displayUnit \}\}/)
  assert.doesNotMatch(formVue, /已配置营养卖点/)
  assert.doesNotMatch(formVue, /rpFormNutrients/)
  assert.doesNotMatch(formVue, /buildNutrientsFromList/)
})
