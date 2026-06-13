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
  const miniappCopy = read('miniapp/src/pages/diy-sheet/copy.ts')

  assert.equal((adminForm.match(/value="IHERB"/g) || []).length, 2)
  assert.match(adminTypes, /platform: .*["']IHERB["']/)
  assert.match(backendTypes, /platform: .*["']IHERB["']/)
  assert.match(miniappSheet, /iherb\.com/)
  assert.match(miniappSheet, /iherb\.cn/)
  assert.match(miniappCopy, /已复制 iHerb 商品链接/)
})

test('admin mini program product paths are optional when AppID is configured', () => {
  const adminForm = read('admin-web/src/views/Ingredients/IngredientForm.vue')

  assert.doesNotMatch(adminForm, /请同时填写目标小程序 AppID 和商品页路径/)
  assert.match(adminForm, /商品页路径可留空/)
  assert.match(adminForm, /!miniProgramAppId && miniProgramPath/)
  assert.match(adminForm, /!appId && path/)
})
