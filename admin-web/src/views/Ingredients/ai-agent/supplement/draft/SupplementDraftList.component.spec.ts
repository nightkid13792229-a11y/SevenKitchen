// @vitest-environment jsdom
/**
 * 草稿列表的组件测试（jsdom + @vue/test-utils）。
 *
 * 列表只做四件事：空状态给新建入口、列名称/完成度、继续带出 id、放弃带出整条摘要
 * （摘要里有名字，父级确认框才能说出「放弃哪一条」）。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type { SupplementDraftSummary } from '@/api/supplementDrafts'
import SupplementDraftList from './SupplementDraftList.vue'

function summary(
  overrides: Partial<SupplementDraftSummary> = {}
): SupplementDraftSummary {
  return {
    id: 'draft-1',
    name: '铜',
    updatedAt: '2026-11-21T02:30:00.000Z',
    completeness: { totalRequired: 15, filledRequired: 9, missing: [] },
    ...overrides
  }
}

async function mountList(
  drafts: SupplementDraftSummary[],
  loading = false,
  error = ''
) {
  const wrapper = mount(SupplementDraftList, {
    props: { drafts, loading, error },
    global: { plugins: [ElementPlus] }
  })
  // el-table 在挂载后的下一个宏任务里才完成列宽/表体布局；jsdom 没有布局引擎，
  // 这里等一拍再断言，否则会拿到一张只有表头的空表。
  await new Promise((resolve) => setTimeout(resolve, 0))
  return wrapper
}

describe('补剂草稿列表', () => {
  it('没有草稿时给出空状态和新建入口', async () => {
    const wrapper = await mountList([])

    expect(wrapper.text()).toContain('还没有草稿')
    const newButton = wrapper.find('[data-action="new-empty"]')
    expect(newButton.exists()).toBe(true)

    await newButton.trigger('click')
    expect(wrapper.emitted('new')).toHaveLength(1)
  })

  it('按行列出草稿名与完成度，空名字显示未命名补剂', async () => {
    const wrapper = await mountList([
      summary(),
      summary({
        id: 'draft-2',
        name: '',
        completeness: { totalRequired: 12, filledRequired: 3, missing: [] }
      })
    ])

    const text = wrapper.text()
    expect(text).toContain('铜')
    expect(text).toContain('未命名补剂')
    expect(text).toContain('9/15')
    expect(text).toContain('3/12')
  })

  it('每行状态固定显示「草稿」，不 invent 后端字段', async () => {
    const wrapper = await mountList([
      summary(),
      summary({ id: 'draft-2' })
    ])

    expect(wrapper.findAll('[data-status="draft"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('草稿')
  })

  it('加载失败时显示失败原因而不是空状态，并可重试', async () => {
    const wrapper = await mountList([], false, '加载草稿列表失败')

    expect(wrapper.text()).toContain('加载草稿列表失败')
    expect(wrapper.text()).not.toContain('还没有草稿')

    await wrapper.find('[data-action="retry"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('点继续带出草稿 id', async () => {
    const wrapper = await mountList([summary()])

    await wrapper.find('[data-action="continue"]').trigger('click')
    expect(wrapper.emitted('continue')).toEqual([['draft-1']])
  })

  it('点放弃带出整条草稿摘要', async () => {
    const first = summary()
    const wrapper = await mountList([first])

    await wrapper.find('[data-action="discard"]').trigger('click')
    expect(wrapper.emitted('discard')).toEqual([[first]])
  })

  it('加载中不显示空状态，避免让人以为草稿都没了', async () => {
    const wrapper = await mountList([], true)

    expect(wrapper.text()).toContain('正在加载草稿')
    expect(wrapper.text()).not.toContain('还没有草稿')
  })
})
