import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const packageJson = JSON.parse(
  readFileSync(resolve(root, 'admin-web/package.json'), 'utf8'),
)
const viteConfig = readFileSync(resolve(root, 'admin-web/vite.config.ts'), 'utf8')
const mainSource = readFileSync(resolve(root, 'admin-web/src/main.ts'), 'utf8')

test('admin-web dependencies do not include server-only packages', () => {
  const dependencies = packageJson.dependencies ?? {}

  for (const packageName of [
    '@nestjs/platform-express',
    'multer',
    'cos-nodejs-sdk-v5',
  ]) {
    assert.equal(
      packageName in dependencies,
      false,
      `${packageName} belongs in a backend package, not admin-web`,
    )
  }
})

test('vite production build uses Element Plus component auto resolution', () => {
  assert.match(viteConfig, /ElementPlusResolver/)
  assert.match(viteConfig, /unplugin-vue-components\/vite/)
  assert.doesNotMatch(viteConfig, /manualChunks/)
})

test('admin-web does not install the full Element Plus component bundle', () => {
  assert.doesNotMatch(mainSource, /import\s+ElementPlus\s+from\s+['"]element-plus['"]/)
  assert.doesNotMatch(mainSource, /app\.use\(ElementPlus/)
  assert.match(mainSource, /element-plus\/dist\/index\.css/)
})
