import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 订单状态标签 · 守卫
 *
 * 这个组件的存在意义是**把"显示什么状态"这件事锁在后端**。
 * 一旦有人在组件里写 `if (status === 'DELIVERED' && hasAftersale)`，
 * 硬边界就被破了 —— 前端出现第二个判断点。
 */
describe('OrderStatusBadge · 订单状态标签', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/custom-recipe/OrderStatusBadge.vue'),
    'utf-8',
  )

  it('★ 只认 tone，不认状态码', () => {
    /**
     * 组件不该知道 `DELIVERED` / `AFTERSALE_OPEN` 这些码。
     * 它收到的只有 `{ label, tone }` 两个字符串。
     */
    /**
     * ⚠️ 断言前剥掉注释 —— 组件顶部的说明里就在讲"不要判断状态码"，
     * 直接搜字符串会被那段话绊倒。
     */
    const rendered = source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(rendered).not.toContain('DELIVERED')
    expect(rendered).not.toContain('PENDING_PAYMENT')
    expect(rendered).not.toContain('AFTERSALE')
    // 也不该自己数售后单
    expect(rendered).not.toContain('aftersaleCount')
  })

  it('★ 文案直接用后端给的 label，不自己拼', () => {
    expect(source).toContain('{{ label }}')
    // 不能出现"根据状态拼中文"的映射表
    expect(source).not.toMatch(/label:\s*'已交付'/)
    expect(source).not.toMatch(/label:\s*'售后中'/)
  })

  it('6 档颜色都定义了（老板 2026-10-18 定）', () => {
    for (const tone of ['warning', 'progress', 'success', 'danger', 'info', 'muted']) {
      expect(source).toContain(`order-status-badge--${tone}`)
    }
  })

  it('未知 tone 回落到灰色，不会变透明', () => {
    // 默认灰写在基类上 —— 后端将来加了新 tone，前端也不会显示成空白
    expect(source).toContain('background: #efeae3')
  })
})
