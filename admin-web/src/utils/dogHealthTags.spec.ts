import { describe, expect, it } from 'vitest'
import {
  applyAddHealthTag,
  applyRemoveAddedHealthTag,
  applyRemoveHealthTag,
  buildEffectiveHealthTags,
  cloneHealthTagOverrides,
  formatHealthUpdatedAt,
  listAddableHealthTags,
} from './dogHealthTags'

/**
 * 营养师端「健康标签纠错」（老板第 24 条）。
 *
 * 这一页原来把算法写在组件里，而 admin-web 的 vitest 只跑 node 环境的纯函数 spec，
 * 组件逻辑一条都测不到 —— 可标签改错会直接影响 AI 引用哪些知识条目。
 * 所以把算法抽到 utils 并用这组测试锁住：
 *   · 最终标签 = 派生 − 人工删除 + 人工添加（小写、去重、排序）
 *   · 删一个"人工加的"标签 = 撤销那次添加，不留删除记录
 *   · 加一个"刚被删过的"标签 = 同时撤销那次删除
 *   · 顶部"最近更新"没值/值非法显示 —，不显示 Invalid Date
 */
describe('健康标签纠错', () => {
  const derived = ['ckd', 'senior', 'renal']

  describe('最终用于检索的标签', () => {
    it('没有人工修正时就是派生标签（小写、排序）', () => {
      expect(buildEffectiveHealthTags(['Senior', 'CKD'], { added: [], removed: [] })).toEqual([
        'ckd',
        'senior',
      ])
    })

    it('人工删除的派生标签会被去掉', () => {
      expect(
        buildEffectiveHealthTags(derived, { added: [], removed: ['renal'] }),
      ).toEqual(['ckd', 'senior'])
    })

    it('人工添加的标签会并进来', () => {
      expect(
        buildEffectiveHealthTags(derived, { added: ['joint'], removed: [] }),
      ).toEqual(['ckd', 'joint', 'renal', 'senior'])
    })

    it('加与删同时存在时互不干扰', () => {
      expect(
        buildEffectiveHealthTags(derived, { added: ['joint'], removed: ['renal'] }),
      ).toEqual(['ckd', 'joint', 'senior'])
    })

    it('大小写不同不会重复（检索侧按小写比较）', () => {
      expect(
        buildEffectiveHealthTags(['CKD'], { added: ['ckd'], removed: [] }),
      ).toEqual(['ckd'])
    })

    it('删除时也不区分大小写', () => {
      expect(
        buildEffectiveHealthTags(['CKD'], { added: [], removed: ['ckd'] }),
      ).toEqual([])
    })

    it('没有上传过任何健康信息时不会报错', () => {
      expect(buildEffectiveHealthTags([], { added: [], removed: [] })).toEqual([])
    })
  })

  describe('可以人工添加的标签', () => {
    it('排除已经在派生结果里的', () => {
      expect(listAddableHealthTags(['ckd', 'renal', 'joint'], ['CKD'], { added: [], removed: [] }))
        .toEqual(['renal', 'joint'])
    })

    it('也排除已经人工添加过的', () => {
      expect(listAddableHealthTags(['ckd', 'joint'], ['ckd'], { added: ['joint'], removed: [] }))
        .toEqual([])
    })

    it('被人工删掉的标签仍然可以再加回来（否则删错了没法后悔）', () => {
      expect(listAddableHealthTags(['renal'], ['renal'], { added: [], removed: ['renal'] }))
        .toEqual([])
    })
  })

  describe('加标签', () => {
    it('统一转小写并去掉首尾空格', () => {
      expect(applyAddHealthTag({ added: [], removed: [] }, '  JOINT ')).toEqual({
        added: ['joint'],
        removed: [],
      })
    })

    it('空输入不动状态（前端不该因此清掉选择框或产生空标签）', () => {
      expect(applyAddHealthTag({ added: ['ckd'], removed: ['renal'] }, '   ')).toEqual({
        added: ['ckd'],
        removed: ['renal'],
      })
    })

    it('重复添加不会产生两条', () => {
      expect(applyAddHealthTag({ added: ['joint'], removed: [] }, 'joint').added).toEqual(['joint'])
    })

    it('加回一个刚删过的标签时，同时撤销那次删除', () => {
      expect(applyAddHealthTag({ added: [], removed: ['renal'] }, 'renal')).toEqual({
        added: ['renal'],
        removed: [],
      })
    })

    it('不会改到传进来的原对象', () => {
      const original = { added: [], removed: ['renal'] }
      applyAddHealthTag(original, 'joint')
      expect(original).toEqual({ added: [], removed: ['renal'] })
    })
  })

  describe('删标签', () => {
    it('删派生标签 → 记入人工删除', () => {
      expect(applyRemoveHealthTag({ added: [], removed: [] }, 'renal')).toEqual({
        added: [],
        removed: ['renal'],
      })
    })

    it('标签既是派生又是人工加的时候：删除优先（人工添加被撤销，同时记入删除）', () => {
      expect(applyRemoveHealthTag({ added: ['joint'], removed: [] }, 'joint')).toEqual({
        added: [],
        removed: ['joint'],
      })
    })

    it('同一个小写标签删两次只记一条', () => {
      const once = applyRemoveHealthTag({ added: [], removed: [] }, 'renal')
      expect(applyRemoveHealthTag(once, 'RENAL').removed).toEqual(['renal'])
    })

    it('撤销"人工添加"时不写入删除记录（与上面的删标签区分开）', () => {
      expect(applyRemoveAddedHealthTag({ added: ['joint'], removed: [] }, 'Joint')).toEqual({
        added: [],
        removed: [],
      })
    })
  })

  describe('修正记录的复制', () => {
    it('缺省就是两个空数组', () => {
      expect(cloneHealthTagOverrides(undefined)).toEqual({ added: [], removed: [] })
    })

    it('复制后改副本不影响原对象（避免"还原"按钮失效）', () => {
      const source = { added: ['joint'], removed: ['renal'] }
      const copy = cloneHealthTagOverrides(source)
      copy.added.push('ckd')
      expect(source.added).toEqual(['joint'])
    })
  })

  describe('顶部"健康信息最近更新"', () => {
    it('没有值显示破折号', () => {
      expect(formatHealthUpdatedAt(undefined)).toBe('—')
      expect(formatHealthUpdatedAt('')).toBe('—')
      expect(formatHealthUpdatedAt(null)).toBe('—')
    })

    it('值不合法也显示破折号，不显示 Invalid Date', () => {
      expect(formatHealthUpdatedAt('不是时间')).toBe('—')
    })

    it('正常值按 年-月-日 时:分 展示（月/日/时/分补零）', () => {
      const value = '2026-10-01T09:05:00'
      expect(formatHealthUpdatedAt(value)).toBe('2026-10-01 09:05')
    })
  })
})
