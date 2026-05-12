import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('nutrition governance types expose Agent review and hard-gate fields', () => {
  const types = read('admin-web/src/types/nutritionGovernance.ts')

  assert.match(types, /NutritionCandidateAgentReview/)
  assert.match(types, /CandidateHardGateResults/)
  assert.match(types, /reviewGroup\?:/)
  assert.match(types, /ediblePortionLabel\?:/)
})

test('nutrition governance API exposes Agent review and batch confirmation', () => {
  const api = read('admin-web/src/api/nutritionGovernance.ts')

  assert.match(api, /reviewCandidateWithAgent/)
  assert.match(api, /batchConfirmCandidates/)
  assert.match(api, /ConfirmNutritionCandidatePayload/)
})

test('nutrition governance workbench shows review queue controls and detail drawer', () => {
  const page = read('admin-web/src/views/NutritionGovernance/index.vue')
  const table = read('admin-web/src/views/NutritionGovernance/components/FoodCandidatesTable.vue')
  const drawer = read('admin-web/src/views/NutritionGovernance/components/CandidateReviewDrawer.vue')

  assert.match(page, /reviewGroupFilter/)
  assert.match(page, /handleBatchConfirm/)
  assert.match(table, /Agent建议/)
  assert.match(table, /硬闸门/)
  assert.match(drawer, /营养状态/)
  assert.match(drawer, /确认为主档案/)
  assert.match(drawer, /确认为次级档案/)
})
