import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')

test('vite api proxy follows the local 3011 backend used by this workspace', () => {
  const viteConfig = readFileSync(resolve(root, 'admin-web/vite.config.ts'), 'utf8')

  assert.match(viteConfig, /VITE_API_BASE_URL/)
  assert.match(viteConfig, /localhost:3011/)
  assert.match(viteConfig, /target:\s*apiProxyTarget/)
  assert.doesNotMatch(viteConfig, /target:\s*['"]http:\/\/localhost:3001['"]/)
})
