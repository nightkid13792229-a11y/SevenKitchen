import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('search governance route and sidebar entry exist', () => {
  const router = read('src/router/index.ts')
  const layout = read('src/layouts/MainLayout.vue')

  assert.match(router, /path:\s*"search-governance"/)
  assert.match(router, /name:\s*"SearchGovernance"/)
  assert.match(router, /title:\s*"搜索治理"/)
  assert.match(layout, /index="\/search-governance"/)
  assert.match(layout, /搜索治理/)
})

test('search governance API exposes alias groups, insights, and suggestions', () => {
  const api = read('src/api/searchGovernance.ts')

  assert.match(api, /listAliasGroups/)
  assert.match(api, /createAliasGroup/)
  assert.match(api, /updateAliasGroup/)
  assert.match(api, /disableAliasGroup/)
  assert.match(api, /getQueryInsights/)
  assert.match(api, /generateSuggestions/)
  assert.match(api, /approveSuggestion/)
  assert.match(api, /rejectSuggestion/)
})

test('search governance page includes all operational tabs', () => {
  const page = read('src/views/SearchGovernance/index.vue')

  assert.match(page, /搜索概览/)
  assert.match(page, /词库管理/)
  assert.match(page, /搜索洞察/)
  assert.match(page, /Agent 建议/)
  assert.match(page, /应用范围/)
  assert.match(page, /handleApproveSuggestion/)
  assert.match(page, /handleRejectSuggestion/)
  assert.match(page, /aliasFormVisible/)
})

test('search governance overview is global and confirmation cancels quietly', () => {
  const page = read('src/views/SearchGovernance/index.vue')

  assert.match(page, /全局概览/)
  assert.doesNotMatch(page, /selectedDomainLabel/)
  assert.match(page, /confirmOperatorAction/)
  assert.match(page, /return false/)
})
