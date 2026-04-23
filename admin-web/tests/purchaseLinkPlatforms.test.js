import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')

const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('family DIY recommendation purchase links expose iHerb across admin, backend and miniapp', () => {
  const adminForm = read('admin-web/src/views/Ingredients/IngredientForm.vue')
  const adminTypes = read('admin-web/src/types/ingredient.ts')
  const backendTypes = read('backend/src/domain/ingredient/types.ts')
  const miniappSheet = read('miniapp/src/pages/diy-sheet/index.vue')

  assert.equal((adminForm.match(/value="IHERB"/g) || []).length, 2)
  assert.match(adminTypes, /platform: .*'IHERB'/)
  assert.match(backendTypes, /platform: .*'IHERB'/)
  assert.match(miniappSheet, /iherb\.com/)
  assert.match(miniappSheet, /iherb\.cn/)
  assert.match(miniappSheet, /已复制 iHerb 购买链接/)
})
