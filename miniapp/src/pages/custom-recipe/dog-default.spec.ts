import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 定制页默认选哪只狗（2026-10-18 · 需求 2.3.8）
 *
 * 需求原文：
 *   | 多只狗 | 默认选**上次定制的那只**（一只狗直接自动选） |
 *
 * 老板实测报的问题：几十只狗进来，**一只都没选中**，页面几乎空白。
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('定制页 · 默认选中狗狗', () => {
  const code = stripComments(
    readFileSync(
      resolve(process.cwd(), 'src/pages/custom-recipe/index.vue'),
      'utf-8',
    ),
  )

  it('★ 只有一只狗时直接选中', () => {
    expect(code).toContain('dogOptions.value.length === 1')
  })

  it('★ 多只狗时选「上次定制的那只」（查订单，不是查本地缓存）', () => {
    expect(code).toContain('selectDefaultDog')
    // 订单里带 dog.id，用它才叫"上次定制的那只"
    expect(code).toContain("data?.orders?.[0]?.dog?.id")
  })

  it('★ 查不到订单时退回本地记住的那只', () => {
    expect(code).toContain("uni.getStorageSync('dogId')")
  })

  it('★ 都没有时**不替顾客乱选**（替错狗比没选严重）', () => {
    // 只验证"没有兜底到第一只"这一条
    expect(code).not.toContain('dogOptions.value[0]')
  })

  it('★ 没选时把话说全（有几只、点这里选），但不新增说明块', () => {
    // 2026-10-05 老板说过不要那块说明，所以只改选择器里的文案
    expect(code).toContain('请选择狗狗（共')
    expect(code).toContain('点这里选')
    expect(code).not.toContain('pick-dog-hint')
  })
})
