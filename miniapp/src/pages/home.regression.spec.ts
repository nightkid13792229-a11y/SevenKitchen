import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('home runtime regressions', () => {
  it('keeps the feedback quick action entry on the home page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('建议反馈')
    expect(source).toContain('@tap="goToFeedback"')
    expect(source).toContain("/pages/feedback-list/index")
  })
})
