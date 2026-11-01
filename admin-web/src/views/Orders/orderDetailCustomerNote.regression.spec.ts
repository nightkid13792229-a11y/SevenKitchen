import { describe, expect, it } from 'vitest'
/**
 * 顾客备注在订单详情页可见（2026-11-02）
 *
 * 背景：小程序确认订单页一直有「订单备注」，但以前这条备注只送去算价，
 * 没有跟着订单落库，后台订单详情里根本看不到 —— 顾客写的过敏提醒、
 * 分装标签全部石沉大海。现在后端把备注存进订单明细的 customRequirements，
 * 详情页必须把它显式展示出来，而且要和员工内部的「管理员备注」区分开，
 * 不能让客服把两条混为一谈。
 *
 * admin-web 的 vitest 是 node 环境（没有 jsdom），页面挂不起来，
 * 所以接线用 `?raw` 读源码断言。
 */
import detailPage from '@/views/Orders/Detail.vue?raw'

/** 剥注释后再断言 —— 注释里常引用被删掉的旧实现（本项目栽过多次） */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('订单详情 · 顾客备注', () => {
  const clean = stripComments(detailPage)

  it('单独展示顾客备注，而不是只留一行"定制要求"', () => {
    expect(clean).toContain('顾客备注')
    expect(clean).toContain('customerNoteText')
    expect(clean).toContain('customRequirements')
  })

  it('顾客备注与员工内部的管理员备注是两个区块', () => {
    expect(clean).toContain('管理员备注')
    // 内部备注的可编辑输入框仍在（不能因为加顾客备注把内部备注弄丢）
    expect(clean).toContain('v-model="remarkDraft"')
    expect(clean).toContain('仅供内部使用')
  })

  it('顾客没填备注时说清楚，不留空白让客服猜', () => {
    expect(clean).toContain('顾客未填写备注')
  })

  it('多条明细的备注合并展示并去重', () => {
    expect(clean).toContain('indexOf(note) === index')
    expect(clean).toContain("join('；')")
  })
})
