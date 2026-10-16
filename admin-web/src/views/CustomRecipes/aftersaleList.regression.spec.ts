import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 售后待办页 · 守卫（2026-10-16，批次 3.1）
 *
 * ## 这一页最容易出的两类错
 *
 * **一、前端自己排顺序。** 排序规则（等太久的排前面；同等的"调整食谱"
 * 比"问个问题"急）在后端领域层，前端再排一次就会出现两套口径。
 *
 * **二、前端自己判断"现在能做什么"。** 后端每条都给了 `actions` 清单，
 * 前端照着渲染即可 —— 自己写 `status === 'PENDING'` 就又变成三处维护。
 *
 * （这两条与顾客侧渲染契约是同一套思路，所以守卫也照同一套写。）
 */

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8')
}

/** 剥注释再断言 —— 本项目被"注释骗过断言"坑过 4 次 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '')
}

const PAGE = 'src/views/CustomRecipes/AftersaleList.vue'

describe('售后待办页 · 顺序与动作都由后端定', () => {
  const raw = read(PAGE)
  const page = stripComments(raw)

  it('★ 前端不自己排序（排序规则在后端领域层）', () => {
    expect(page).not.toContain('.sort(')
    expect(page).not.toContain('.sortBy')
    // 顺序直接用后端给的数组
    expect(page).toContain('data?.items')
  })

  it('★ 按钮清单来自后端，前端不判断状态', () => {
    expect(page).toContain('item.actions')
    // 不许在渲染逻辑里按状态决定显示哪些按钮
    expect(page).not.toContain("status === 'PENDING'")
    expect(page).not.toContain("status === 'ACCEPTED'")
    expect(page).not.toContain("status === 'PROCESSING'")
  })

  it('★ 处理说明必填（前端先拦一道，后端也会拦）', () => {
    // 说明没填时按钮不可点 —— 免得白跑一次才知道
    expect(page).toContain('resolveForm.handleNote.trim()')
    expect(page).toContain('给顾客的处理说明')
  })

  it('★ 不受理的原因必填', () => {
    expect(page).toContain('rejectForm.reason.trim()')
    expect(page).toContain('为什么不受理')
  })

  it('失败了显示后端给的原因，不是通用文案', () => {
    expect(page).toContain('toastApiError')
    // toastApiError 会把后端的 message 提出来
    expect(page).toContain("'处理失败'")
  })

  it('★ "等了多久"用后端算好的，前端不自己减时间', () => {
    expect(page).toContain('item.hoursWaiting')
    // 不许在页面里拿 createdAt 去算等待时长
    expect(page).not.toContain('item.createdAt')
  })

  it('受理 / 标记处理中要有二次确认（避免手滑）', () => {
    expect(page).toContain('ElMessageBox.confirm')
    expect(page).toContain('再想想')
  })

  it('路由与菜单都挂上了', () => {
    const router = read('src/router/index.ts')
    const layout = read('src/layouts/MainLayout.vue')
    expect(router).toContain('custom-recipes/aftersales')
    expect(router).toContain('AftersaleList.vue')
    expect(layout).toContain('/custom-recipes/aftersales')
  })

  it('API 层调的是后台地址（不是顾客端那个）', () => {
    const api = read('src/api/customRecipe.ts')
    expect(api).toContain('/admin/custom-recipe/aftersales')
    // 受理 / 处理完成 / 不受理三个动作都要有
    expect(api).toContain('/accept')
    expect(api).toContain('/resolve')
    expect(api).toContain('/reject')
  })
})
