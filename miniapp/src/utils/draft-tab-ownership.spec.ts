import { describe, expect, it } from 'vitest'
import { doesDraftBelongToTab } from './health-records'

/**
 * 草稿归属（2026-10-03 老板报的 bug）。
 *
 * 现象：在「就诊」标签下新建一个空的**手动填写**表单，切到「体检」和「过敏」
 * 也能看到它。原因：三个记录标签共用一个组件，而组件里"当前类型"在合并模式下
 * 恒等于 medical，于是"保留未保存草稿"那段逻辑把空草稿一路带到了别的标签。
 *
 * 这组测试锁判定规则本身 —— 归属章优先，其次看就诊/体检章，都没有的（服务器
 * 来的记录）算本标签。
 */
describe('未保存草稿归哪个标签', () => {
  it('就诊标签新建的草稿：只属于就诊', () => {
    const draft = { __tabKind: 'medical', __visitKind: 'medical', diagnosis: '胆汁淤积' }

    expect(doesDraftBelongToTab(draft, { tabKind: 'medical', visitKind: 'medical' })).toBe(true)
    // ✅ 关键：不能出现在体检、过敏标签里
    expect(doesDraftBelongToTab(draft, { tabKind: 'checkup', visitKind: 'checkup' })).toBe(false)
    expect(doesDraftBelongToTab(draft, { tabKind: 'allergy', visitKind: 'medical' })).toBe(false)
  })

  it('体检标签新建的草稿：只属于体检', () => {
    const draft = { __tabKind: 'checkup', __visitKind: 'checkup' }

    expect(doesDraftBelongToTab(draft, { tabKind: 'checkup', visitKind: 'checkup' })).toBe(true)
    expect(doesDraftBelongToTab(draft, { tabKind: 'medical', visitKind: 'medical' })).toBe(false)
    expect(doesDraftBelongToTab(draft, { tabKind: 'allergy', visitKind: 'medical' })).toBe(false)
  })

  it('过敏记录（不带任何章）：只属于过敏标签', () => {
    const allergyRecord = { id: 'a1', allergen: '鸡肉' }

    expect(doesDraftBelongToTab(allergyRecord, { tabKind: 'allergy' })).toBe(true)
    // 服务器来的就诊记录也带过敏记录这种形状（没有就诊/体检章）→ 在本标签里算自己的
    expect(doesDraftBelongToTab(allergyRecord, { tabKind: 'medical', visitKind: 'medical' })).toBe(true)
  })

  it('没有标签章、只有就诊/体检章的本地草稿：按就诊/体检归属判', () => {
    expect(
      doesDraftBelongToTab({ __visitKind: 'checkup' }, { tabKind: 'checkup', visitKind: 'checkup' }),
    ).toBe(true)
    expect(
      doesDraftBelongToTab({ __visitKind: 'checkup' }, { tabKind: 'medical', visitKind: 'medical' }),
    ).toBe(false)
    // 过敏标签不装带就诊/体检章的草稿
    expect(
      doesDraftBelongToTab({ __visitKind: 'medical' }, { tabKind: 'allergy', visitKind: 'medical' }),
    ).toBe(false)
  })

  it('空对象/空值不炸', () => {
    expect(doesDraftBelongToTab(null, { tabKind: 'medical' })).toBe(true)
    expect(doesDraftBelongToTab({}, { tabKind: 'checkup', visitKind: 'checkup' })).toBe(true)
  })
})
