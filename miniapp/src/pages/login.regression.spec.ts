import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('login page regressions', () => {
  it('does not expose the runtime API base URL on the customer login screen', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/login/index.vue'),
      'utf-8',
    )

    expect(source).not.toContain('当前API')
    expect(source).not.toContain('dev-api-info')
    expect(source).not.toContain('currentApiBaseUrl')
  })
})
