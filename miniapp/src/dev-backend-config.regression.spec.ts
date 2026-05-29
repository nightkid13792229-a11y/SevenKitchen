import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')
const readRepoFile = (path: string) =>
  readFileSync(resolve(repoRoot, path), 'utf-8')

describe('miniapp development backend configuration', () => {
  it('keeps DevTools, doctor, and backend startup aligned on port 3011', () => {
    const doctorScript = readRepoFile('miniapp/scripts/doctor.sh')
    const backendPackage = JSON.parse(readRepoFile('backend/package.json'))

    expect(doctorScript).toContain(
      'DEFAULT_URL="http://127.0.0.1:3011/api/v1"',
    )
    expect(doctorScript).toContain('BACKEND_URL="http://127.0.0.1:3011"')
    expect(doctorScript).toContain('npm run start:dev:miniapp')
    expect(doctorScript).toContain('/api/v1/global-config')
    expect(doctorScript).toContain('/api/v1/recipes/filter-options')
    expect(doctorScript).toContain('/api/v1/recipes?page=1&pageSize=1')
    expect(backendPackage.scripts['start:dev:miniapp']).toContain(
      'PORT=${PORT:-3011}',
    )
    expect(backendPackage.scripts['start:check:miniapp']).toContain(
      'PORT=${PORT:-3011}',
    )
  })
})
