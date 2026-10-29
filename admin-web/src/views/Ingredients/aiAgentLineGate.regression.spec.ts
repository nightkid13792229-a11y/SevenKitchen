import { describe, expect, it } from 'vitest'
import pageSource from './ai-agent/index.vue?raw'
import streamSource from './ai-agent/agentStream.ts?raw'
import routerSource from '@/router/index.ts?raw'
import apiSource from '@/api/ingredientCreation.ts?raw'

function clean(source: string) {
  return source.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * 「AI 添加原料」的线路闸门。
 *
 * 页面只负责展示与传输入，判定在 lineEntry.ts（单独有 10 条用例）；
 * 这里用仓库惯用的源码回归，钉住「闸门还在、请求真的带了线路」这两件事，
 * 防止以后有人为了省事把闸门拆掉、让补剂又按食材跑。
 */
describe('AI 添加原料 · 线路闸门', () => {
  const page = clean(pageSource)

  it('进页面先定线路，用决议函数而不是自己拍', () => {
    expect(page).toContain('resolveLineEntry')
    expect(page).toContain('这次添加的是哪一类原料')
  })

  it('补剂给出「未开放」的闸门，而不是偷偷按食材跑', () => {
    expect(page).toContain('补剂线还没开放')
    expect(page).toContain('改回食材')
  })

  it('没建草稿之前可以换线路', () => {
    expect(page).toContain('换线路')
    expect(page).toContain('canSwitchLine')
  })

  it('起草请求带上线路', () => {
    expect(streamSource).toContain('line?: IngredientLine')
    expect(page).toContain('line: sentLine')
  })

  it('线路没定或选了补剂时不能发送', () => {
    expect(page).toContain("line.value === 'FOOD'")
  })

  it('入口预选只消费一次，不从 URL 每帧重算', () => {
    expect(page).toContain('createLineEntryState')
    expect(page).toContain('toLineEntryInput')
    expect(page).not.toContain('entryLine:')
  })

  it('「改回食材」直接落到食材线', () => {
    expect(page).toContain('@click="revertToFood"')
  })

  it('旧判断页的地址被重定向到唯一入口', () => {
    expect(routerSource).toContain('path: "ingredients/ai-create"')
    expect(routerSource).toContain('redirect')
    expect(routerSource).not.toContain('IngredientAiCreate')
  })

  it('前端不再保留没有调用方的判断接口', () => {
    expect(apiSource).not.toContain('classifyIntake')
  })
})
