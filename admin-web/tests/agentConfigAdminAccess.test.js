import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('agent config route and menu are restricted to admin users in admin web', () => {
  const routerSource = read('admin-web/src/router/index.ts')
  const layoutSource = read('admin-web/src/layouts/MainLayout.vue')
  const storeSource = read('admin-web/src/store/user.ts')

  assert.match(routerSource, /path: 'agent-config'[\s\S]*requiresRole: 'ADMIN'/)
  assert.match(routerSource, /const requiredRole = to\.meta\.requiresRole/)
  assert.match(layoutSource, /v-if="isAdminUser"[\s\S]*index="\/agent-config"/)
  assert.match(layoutSource, /const isAdminUser = computed/)
  assert.match(storeSource, /localStorage\.getItem\('admin_user'\)/)
  assert.match(storeSource, /localStorage\.setItem\('admin_user'/)
})
