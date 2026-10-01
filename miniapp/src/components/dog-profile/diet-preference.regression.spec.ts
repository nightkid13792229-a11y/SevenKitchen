import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 饮食偏好结构化 + 变更历史（2026-10-01，第五期）。
 *
 * 老板第 9 条：饮食偏好的变化要能看到历史。
 *
 * 这组测试重点锁"保守做法"：
 *   · 旧的两个自由文本框不能被删掉（配方设计还在用）
 *   · 从旧文本整理成条目必须**顾客确认**，不能自动分词
 *   · 过敏 ≠ 不爱吃这条边界不能糊
 */
describe('饮食偏好 · 界面', () => {
  function readSection() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/DietPreferenceSection.vue'),
      'utf-8',
    )
  }

  it('第 9 条：有变更历史板块', () => {
    const section = readSection()

    expect(section).toContain('偏好变化')
    expect(section).toContain('history')
    expect(section).toContain("item.action === 'ADDED' ? '新增' : '去掉'")
  })

  it('如实说明历史从什么时候开始有', () => {
    const section = readSection()

    expect(section).toContain('historyNote')
  })

  it('结构化成条目：爱吃的与不吃的分开，可加可删', () => {
    const section = readSection()

    expect(section).toContain('爱吃的')
    expect(section).toContain('不吃的 / 挑食')
    expect(section).toContain("addItem('LIKED')")
    expect(section).toContain("addItem('DISLIKED')")
    expect(section).toContain("removeItem('LIKED'")
  })

  it('整理旧文本：给候选、顾客确认后才写库，且承诺不改原文', () => {
    const section = readSection()

    expect(section).toContain('把以前填的整理成条目')
    expect(section).toContain('原来的文字不会被改动')
    expect(section).toContain('confirmImport')
    expect(section).toContain('先不整理')
    // 默认全选，顾客只需取消不要的
    expect(section).toContain('liked: [...suggestions.value.liked]')
  })

  it('过敏 ≠ 不爱吃：这句边界必须留在界面上', () => {
    const section = readSection()

    expect(section).toContain('真正的过敏请记在「过敏」板块')
    expect(section).toContain('两件事不能混')
  })
})

describe('饮食偏好 · 与旧字段并存', () => {
  it('旧的两个文本框保留在页面上（配方设计还在用）', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('v-model="form.preferredFoods"')
    expect(page).toContain('v-model="form.pickyFoods"')
    expect(page).toContain('原来的文字描述')
    // 底部保存按钮仍然保存旧文本框
    expect(page).toContain('saveDietReminders')
  })

  it('结构化板块挂在饮食书签下', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    // 2026-10-01：内嵌进健康管理页时传 embedded（用来隐藏数量那行）
    expect(page).toContain('<DietPreferenceSection embedded :dog-id="dogId" />')
  })

  it('API 层四个接口都在（列 / 加 / 删 / 整理）', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

    expect(api).toContain('/dogs/${dogId}/diet-preferences')
    expect(api).toContain('diet-preferences/import-legacy')
    expect(api).toContain('removeDietPreference')
  })
})

describe('体检备注（第五期补的字段）', () => {
  it('体检记录的备注列已经在上游打通', () => {
    const utils = readFileSync(
      resolve(process.cwd(), 'src/utils/health-records.ts'),
      'utf-8',
    )

    // 体检配置里的 notesKey 不再是 null
    const checkupBlock = utils.slice(
      utils.indexOf("kind: 'checkup',"),
      utils.indexOf("kind: 'checkup',") + 700,
    )
    expect(checkupBlock).toContain("notesKey: 'notes'")
  })
})
