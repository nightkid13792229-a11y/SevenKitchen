import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8')

/**
 * 过敏 / 饮食偏好信息的用途告知（2026-10-05 老板拍板）。
 *
 * 背景：定制页原来有个「我同意将本次录入的信息写入狗狗档案」的勾选
 * （老板此前的决策 9：医疗信息入档必须知情同意）。老板这次要求**彻底删掉**，
 * 界面上不再有任何提示 —— 于是补在《用户协议》《隐私政策》里：
 * 「您提交的过敏、饮食偏好等信息会用于食谱设计、健康档案留存与推荐过滤。」
 *
 * 这两页是纯静态文案，没有任何逻辑能"顺便"测到它，所以单独钉住：
 * 谁把这句话删了/改了，这里就要红。
 */
describe('用户协议 / 隐私政策 · 信息用途告知', () => {
  const privacy = () => read('src/pages/privacy/index.vue')
  const terms = () => read('src/pages/terms/index.vue')

  it('两页都写明：过敏、饮食偏好等信息用于食谱设计、健康档案留存与推荐过滤', () => {
    for (const page of [privacy(), terms()]) {
      expect(page).toContain('食谱设计、健康档案留存与推荐过滤')
      expect(page).toContain('避开您填写的过敏原')
    }
  })

  it('隐私政策：收集范围里列出宠物健康与饮食信息（含过敏检测报告）', () => {
    const page = privacy()

    expect(page).toContain('宠物健康与饮食信息')
    expect(page).toContain('过敏原（含您上传的过敏检测报告）')
    // 必须是"可选择性地提供"：不填也能正常下单（老板口径：这些是可选信息）
    expect(page).toContain('仅在您主动填写或上传时收集')
  })

  it('隐私政策：写清这些信息给谁看、不拿来做什么', () => {
    const page = privacy()

    expect(page).toContain('营养师在为您设计食谱时查阅')
    expect(page).toContain('不会用于与宠物饮食无关的用途')
  })

  it('用户协议：单列一节，并指向《隐私政策》看细节', () => {
    const page = terms()

    expect(page).toContain('六、宠物健康与饮食信息')
    expect(page).toContain('请见《隐私政策》')
    // 自愿提供 + 可随时修改删除（与档案页的删除能力一致）
    expect(page).toContain('由您自愿提供')
    expect(page).toContain('随时在爱犬档案中修改或删除')
  })

  it('两页都更新了生效日期（改过内容不能还挂着老日期）', () => {
    for (const page of [privacy(), terms()]) {
      expect(page).toContain('更新日期：2026年10月5日')
      expect(page).toContain('生效日期：2026年10月5日')
    }
  })

  it('用户协议的小节序号连续，没有重号或跳号', () => {
    const titles = Array.from(terms().matchAll(/section-title">([^<]+)</g)).map(
      (match) => match[1],
    )
    const numbered = titles.filter((title) => /^[一二三四五六七八九十]、/.test(title))

    const order = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    expect(numbered.map((title) => title.split('、')[0])).toEqual(
      order.slice(0, numbered.length),
    )
  })
})
