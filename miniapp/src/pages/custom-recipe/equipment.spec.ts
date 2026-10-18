import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 制作设备推荐守卫（2026-10-18 · 需求 2.4.2 ⑦ / V56 / 附录 B #12）
 *
 * 老板："也需要有制作设备推荐的板块"。
 * 附录 B #12 记着：DIY 制作单里**功能做完了但被 `v-if="false"` 关掉**。
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('制作设备推荐', () => {
  const diy = stripComments(
    readFileSync(resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'), 'utf-8'),
  )
  const delivery = stripComments(
    readFileSync(
      resolve(process.cwd(), 'src/pages/custom-recipe/delivery-shopping.vue'),
      'utf-8',
    ),
  )

  it('★ DIY 制作单里已重新打开（不再是 v-if="false"）', () => {
    expect(diy).not.toContain('v-if="false"')
    expect(diy).toContain('equipment-card')
    expect(diy).toContain('handleShowEquipmentList')
  })

  it('★ 交付第 2 页也有（需求：交付页加 + DIY 重新打开）', () => {
    expect(delivery).toContain('equipmentList')
    expect(delivery).toContain('制作设备')
  })

  it('★ 设备清单来自全局配置，不进交付快照', () => {
    // 快照是冻结契约，设备清单是运营随时会调的
    expect(delivery).toContain("url: '/global-config'")
    expect(delivery).toContain('equipmentRecommendations')
  })

  it('★ 拿不到就整块不画（不占版面、不留空壳）', () => {
    expect(delivery).toContain('v-if="equipmentList.length"')
    expect(delivery).toContain('equipmentList.value = [];')
  })

  it('★ 没有购买链接时不跳转（不弹"暂不支持"这种废话）', () => {
    expect(delivery).toContain('if (!item.purchaseLink) return;')
  })
})
