import { describe, expect, it } from 'vitest'
// admin-web 的 vitest 是 node 环境（没有 jsdom），Element Plus 页面挂不起来，
// 所以页面接线用"读源码断言"锁住 —— 这是本项目既有做法
// （见 CustomRecipes/customRecipeOrderPage.regression.spec.ts 的文件头）。
import page from '@/views/PlatformOptions/index.vue?raw'
import apiSource from '@/api/platformOptions.ts?raw'

/**
 * 剥掉注释再判断（本项目 2026-10-14 一天之内被这个坑骗过四次）。
 *
 * ⚠️ 页面与 api 文件里**故意**写了大量解释性注释，里面会提到
 * `OPTION_TONES`、`ROSTER` 这类词。不剥注释，"没有硬编码清单"这条断言
 * 会被它自己的说明文字触发 —— **越解释越误报**。
 * 详见 `miniapp/src/architecture/source-text.ts` 的文件头。
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const pageCode = stripComments(page)
const apiCode = stripComments(apiSource)

/**
 * 选项字典维护页（2026-10-16，批次 1.3.6）
 *
 * 这一页存在的意义就是把「前端各写一份枚举中文」这件事**从根上取消掉**。
 * 所以这个回归测试的重点不是"页面长什么样"，而是：
 * **页面有没有偷偷又写死一份业务清单**。
 */
describe('选项字典维护页 · 接线回归', () => {
  describe('所有清单都来自后端（这一页的核心价值）', () => {
    it('色彩档位来自后端，页面里没有写死一份档位清单', () => {
      // 从接口拿
      expect(pageCode).toContain('tones.value = data.tones')
      // 用后端给的渲染
      expect(pageCode).toContain('v-for="tone in tones"')

      // 反面：页面里不该出现"六个档位"这类字面量清单
      expect(pageCode).not.toMatch(/\[\s*'neutral'\s*,\s*'info'/)
      expect(pageCode).not.toMatch(/OPTION_TONES\s*=\s*\[/)
    })

    it('选项集清单来自后端，页面里没有写死集名', () => {
      expect(pageCode).toContain('sets.value = data.sets')
      expect(pageCode).toContain('v-for="set in sets"')

      // 反面：不该出现具体的选项集码作为字面量
      expect(pageCode).not.toContain("'custom_recipe_status'")
      expect(pageCode).not.toContain('"custom_recipe_status"')
      expect(pageCode).not.toContain("'custom_recipe_goal'")
    })

    it('「能不能增删」由后端算好，前端不自己判断 sourceType', () => {
      // 用后端给的 canAddOrRemove
      expect(pageCode).toContain('set.canAddOrRemove')
      expect(pageCode).toContain('canAddOrRemove')
      // 反面：前端不该拿 sourceType 自己推断
      expect(pageCode).not.toMatch(/sourceType\s*===\s*'DATA'/)
    })

    it('API 层也不写死清单（它只是转发）', () => {
      expect(apiCode).not.toMatch(/OPTION_TONES\s*=\s*\[/)
      expect(apiCode).not.toMatch(/'custom_recipe_status'/)
    })
  })

  describe('接口路径正确（写错了会 404，但只有点下去才发现）', () => {
    it('列表 / 详情 / 改 / 增 / 删 五个动作都对', () => {
      expect(apiCode).toContain("api.get('/admin/options')")
      expect(apiCode).toContain('api.get(`/admin/options/${encodeURIComponent(setCode)}`)')
      expect(apiCode).toContain('api.put(')
      expect(apiCode).toContain('api.post(')
      expect(apiCode).toContain('api.delete(')
    })

    it('路径参数做了转义（码里有特殊字符时不会把路径截断）', () => {
      expect(apiCode).toContain('encodeURIComponent(setCode)')
      expect(apiCode).toContain('encodeURIComponent(code)')
    })
  })

  describe('权限：前端只是提前置灰，后端仍然再拦一次', () => {
    it('非管理员看不到能点的保存/新增/删除', () => {
      expect(pageCode).toContain('useIsAdmin')
      expect(pageCode).toContain('ADMIN_ONLY_TIP')
      expect(pageCode).toContain('v-if="!isAdmin"')
    })

    it('锁住的选项集给的是「为什么」而不是一个灰按钮', () => {
      expect(pageCode).toContain('这个选项集的取值由代码定义，不能新增')
    })
  })

  describe('删除前把后果讲清楚（删字典行不等于删业务数据）', () => {
    it('确认框写明：历史数据不会消失，但会显示英文码', () => {
      expect(pageCode).toContain('已经用到这个码的历史数据不会消失')
      expect(pageCode).toContain('建议改成「停用」')
    })

    it('ENUM 类根本不渲染删除按钮（后端也会拒，双保险）', () => {
      expect(pageCode).toContain('<template v-if="canAddOrRemove">')
    })
  })

  describe('「没配中文」的项要显眼', () => {
    it('标签还等于码本身时高亮并给出原因', () => {
      expect(pageCode).toContain("row.label === row.code")
      expect(pageCode).toContain('还没配中文，界面上会显示这串英文码')
    })
  })

  describe('剥注释这件事本身是有效的（否则上面几条可能被自己的注释骗）', () => {
    it('源码里提到过这些词，但剥掉注释后判定不受影响', () => {
      const raw = page as string
      expect(raw).not.toBe(stripComments(raw))
      // 注释里写了「不是具体颜色值」「由后端给」等说明，剥掉后代码依然干净
      expect(stripComments(raw)).not.toMatch(/\[\s*'neutral'\s*,\s*'info'/)
    })
  })
})
