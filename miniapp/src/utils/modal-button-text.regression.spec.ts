import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * 微信小程序 `wx.showModal`（以及 uni.showModal）的硬限制：
 * `confirmText` / `cancelText` **最多 4 个汉字**。
 *
 * 超过 4 个字时，弹窗**既不显示、也不报错**，只走 fail 回调——
 * 表现就是顾客点了按钮「没有任何反应」。
 *
 * 2026-09-22 实际踩过两次：
 *   1. DIY 配置页「取消自定义分装」用了 `cancelText: '继续自定义'`（5 字）→ 点了没反应；
 *   2. `confirmLifeStageMismatch` 用了 `confirmText: '我已知晓，继续'`（7 字）→
 *      弹窗失败后 `resolve(false)`，调用方直接 return，
 *      导致「生成制作单」「确认订单」对生命阶段不匹配的狗狗点了没反应。
 *
 * 这条断言把限制固化成测试，避免以后再犯。
 */

const SRC_ROOT = resolve(process.cwd(), 'src')
const SCAN_EXTENSIONS = ['.vue', '.ts']
const MAX_LENGTH = 4

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, acc)
      continue
    }
    if (entry.endsWith('.spec.ts')) continue
    if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      acc.push(full)
    }
  }
  return acc
}

interface Violation {
  file: string
  field: string
  text: string
}

function findViolations(): Violation[] {
  const violations: Violation[] = []
  const pattern = /(confirmText|cancelText)\s*:\s*'([^']*)'/g

  for (const file of collectFiles(SRC_ROOT)) {
    const source = readFileSync(file, 'utf-8')
    for (const match of source.matchAll(pattern)) {
      const [, field, text] = match
      if ([...text].length > MAX_LENGTH) {
        violations.push({
          file: relative(process.cwd(), file),
          field,
          text,
        })
      }
    }
  }

  return violations
}

describe('modal button text regressions', () => {
  it('keeps every showModal confirmText / cancelText within 4 characters', () => {
    const violations = findViolations()

    expect(
      violations,
      violations
        .map((v) => `${v.file} → ${v.field}: '${v.text}'（${[...v.text].length} 字，最多 ${MAX_LENGTH} 字）`)
        .join('\n'),
    ).toEqual([])
  })

  it('keeps the DIY cancel-custom confirmation inside the limit', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )

    expect(source).toContain("confirmText: '仍要取消'")
    expect(source).toContain("cancelText: '继续编辑'")
    expect(source).not.toContain('继续自定义')
  })

  it('keeps the life-stage confirmation inside the limit', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/utils/life-stage-match.ts'),
      'utf-8',
    )

    expect(source).toContain("confirmText: '我已知晓'")
    expect(source).not.toContain('我已知晓，继续')
  })
})
