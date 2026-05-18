import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = join(import.meta.dirname, '..')

test('Agent settings test emits the current unsaved form payload', () => {
  const drawerSource = readFileSync(
    join(
      root,
      'src/views/NutritionGovernance/components/AgentSettingsDrawer.vue'
    ),
    'utf8'
  )

  assert.match(drawerSource, /function emitTest\(\)/)
  assert.match(drawerSource, /emit\('test', buildPayload\(\)\)/)
  assert.doesNotMatch(drawerSource, /\$emit\('test'\)/)
  assert.match(drawerSource, /复核模型/)
  assert.match(drawerSource, /form\.reviewModel/)
  assert.match(drawerSource, /deepseek-v4-pro/)
  assert.match(drawerSource, /reviewModel:\s*form\.reviewModel\.trim\(\)/)
})

test('Agent settings test saves the current payload before calling the test endpoint', () => {
  const pageSource = readFileSync(
    join(root, 'src/views/NutritionGovernance/index.vue'),
    'utf8'
  )

  const handlerStart = pageSource.indexOf(
    'async function handleTestAgentSettings('
  )
  assert.notEqual(handlerStart, -1)

  const handlerEnd = pageSource.indexOf('\nasync function ', handlerStart + 1)
  const handlerSource = pageSource.slice(
    handlerStart,
    handlerEnd === -1 ? undefined : handlerEnd
  )

  assert.match(handlerSource, /payload\?: UpdateAgentProviderSettingsPayload/)
  assert.ok(
    handlerSource.indexOf('updateAgentSettings(payload)') <
      handlerSource.indexOf('testAgentSettings()'),
    'settings must be saved before the connection test runs'
  )
})
