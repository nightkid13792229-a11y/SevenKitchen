import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 爱犬概览上的过敏原要能增删（2026-10-04 老板定）。
 *
 * 健康管理里的「过敏」标签已经下线，过敏录入统一在定制食谱流程；
 * 概览页承担"回头看一眼、顺手补一条 / 删一条"的职责 ——
 * "我的狗到底不能吃什么"是家长最常来确认的一件事。
 */
describe('爱犬概览 · 过敏原能增能删', () => {
  const page = () =>
    readFileSync(resolve(process.cwd(), 'src/pages/dog-profile-overview/index.vue'), 'utf-8')

  it('不再是"有条目才显示"的只读块', () => {
    const source = page()

    // 外层不再挂 v-if="allergyNames.length > 0"（空的时候也要给"添加"入口）
    expect(source).not.toContain('v-if="allergyNames.length > 0" class="allergy-tags"')
    expect(source).toContain('class="allergy-tags__add"')
    expect(source).toContain('还没记过敏原')
  })

  it('每条都能删，且删除是二次确认过的', () => {
    const source = page()

    expect(source).toContain('class="allergy-tags__remove"')
    expect(source).toContain('function removeAllergyFromOverview')
    expect(source).toContain("title: '删除这条过敏原？'")
    expect(source).toContain("confirmText: '删除'")
  })

  it('增删直接调过敏记录接口，不改数组了事', () => {
    const source = page()

    // 过敏是独立记录（有自己的 id）：只改 form 数组的话，档案页的"保存"不含这一块，
    // 点了也不会落库 —— 这正是过去"编辑态是坏的"那个坑
    expect(source).toContain('dogApi.healthRecords.allergy.create')
    expect(source).toContain('dogApi.healthRecords.allergy.delete')
    expect(source).toContain('async function reloadAllergyRecords')
  })

  it('添加走输入弹窗，且挡住重复项', () => {
    const source = page()

    expect(source).toContain('function addAllergyFromOverview')
    expect(source).toContain('editable: true')
    expect(source).toContain("title: '这一条已经有了'")
  })
})
