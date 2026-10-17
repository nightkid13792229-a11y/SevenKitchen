import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 选狗 composable · 守卫
 *
 * 三条口径必须守住：
 *   ① **"没选"≠"选了第一只"** —— `selectedDog` 找不到时返回 null，不替顾客做主
 *   ② **必须校验存在性** —— 顾客删了狗、或链接带别人的狗 id，不能停在无效选中项
 *   ③ **只管选哪只，不管怎么拉列表** —— 拉列表各页不同，塞进来会变成巨型函数
 */
describe('useDogSelection · 选狗公共状态', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/composables/useDogSelection.ts'),
    'utf-8',
  )

  it('★ 找不到选中项时返回 null，不返回 dogs[0]', () => {
    expect(source).toContain('|| null')
    // 不能悄悄替顾客选第一只
    expect(source).not.toMatch(/selectedDog[\s\S]{0,120}return dogs\.value\[0\]/)
  })

  it('★ setDogs 会校验并校正选中项（防"选中一只不存在的狗"）', () => {
    expect(source).toContain('const valid = candidates.find')
    expect(source).toContain('selectedDogId.value = valid ??')
  })

  it('★ syncFromMatch 校验存在性，列表外的不采纳', () => {
    expect(source).toContain('if (dogs.value.length > 0 && !dogs.value.some')
  })

  it('★ 持久化写 storage，且 key 可配（默认 dogId）', () => {
    expect(source).toContain("options.storageKey ?? 'dogId'")
    expect(source).toContain('uni.setStorageSync(storageKey, id)')
  })

  it('select 允许不持久化（用于回填，不该改全站默认）', () => {
    expect(source).toContain('options.persist !== false')
  })

  it('★ 不含拉列表的请求（那是页面的责任）', () => {
    expect(source).not.toContain('request(')
    expect(source).not.toContain('fetchDogs')
    expect(source).not.toContain('async function')
  })
})
