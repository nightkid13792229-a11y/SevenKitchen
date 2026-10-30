import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 制作设备推荐守卫（2026-10-18 · 需求 2.4.2 ⑦ / V56 / 附录 B #12）
 *
 * 老板："也需要有制作设备推荐的板块"；2026-10-24 先下线，等做好再上线。
 * 附录 B #12 记着：DIY 制作单里**功能做完了但被 `v-if="false"` 关掉**。
 *
 * 2026-10-24：交付第 2 页删除，设备推荐只保留在 DIY 制作单这一处
 * （顾客做饭时才会想看设备，交付页不再重复）。
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

  it('★ 2026-10-24 暂时下线，代码保留，等做好后改开关恢复', () => {
    expect(diy).toContain('SHOW_EQUIPMENT_RECOMMENDATION = false')
    expect(diy).toContain('v-if="SHOW_EQUIPMENT_RECOMMENDATION"')
    expect(diy).toContain('equipment-card')
    expect(diy).toContain('handleShowEquipmentList')
  })

  it('★ 设备清单来自全局配置（不是每份食谱各存一份）', () => {
    expect(diy).toContain('equipmentRecommendations')
  })
})
