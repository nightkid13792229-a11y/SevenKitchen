import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('nutrition governance types expose DeepSeek Agent settings and batch jobs', () => {
  const types = read('admin-web/src/types/nutritionGovernance.ts')

  assert.match(types, /AgentProviderSettings/)
  assert.match(types, /UpdateAgentProviderSettingsPayload/)
  assert.match(types, /NutritionAgentReviewJob/)
  assert.match(types, /BatchAgentReviewPayload/)
  assert.match(types, /apiKeyConfigured/)
  assert.doesNotMatch(types, /apiKey:\s*string/)
})

test('nutrition governance API exposes DeepSeek settings and batch Agent review endpoints', () => {
  const api = read('admin-web/src/api/nutritionGovernance.ts')

  assert.match(api, /getAgentSettings/)
  assert.match(api, /updateAgentSettings/)
  assert.match(api, /testAgentSettings/)
  assert.match(api, /startBatchAgentReview/)
  assert.match(api, /getLatestAgentReviewJob/)
  assert.match(api, /\/admin\/nutrition-governance\/agent-settings/)
  assert.match(api, /\/admin\/nutrition-governance\/candidates\/batch-agent-review/)
})

test('nutrition governance page wires DeepSeek settings and batch review controls', () => {
  const page = read('admin-web/src/views/NutritionGovernance/index.vue')
  const settingsDrawer = read(
    'admin-web/src/views/NutritionGovernance/components/AgentSettingsDrawer.vue',
  )
  const batchPanel = read(
    'admin-web/src/views/NutritionGovernance/components/AgentBatchReviewPanel.vue',
  )

  assert.match(page, /AgentSettingsDrawer/)
  assert.match(page, /AgentBatchReviewPanel/)
  assert.match(page, /handleSaveAgentSettings/)
  assert.match(page, /handleStartBatchAgentReview/)
  assert.match(settingsDrawer, /DeepSeek/)
  assert.match(settingsDrawer, /apiKeyLast4/)
  assert.match(settingsDrawer, /autocomplete="new-password"/)
  assert.match(batchPanel, /批量 Agent 匹配/)
  assert.match(batchPanel, /forceRerun/)
})
