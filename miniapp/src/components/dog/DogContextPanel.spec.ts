import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../../architecture/source-text'

/**
 * DogContextPanel · 三页共用的狗狗选择面板（2026-11-07 抽出）
 *
 * 抽之前它被写了三遍：
 *   · 成品订购页：胶囊 + 六项读数
 *   · DIY 配置页：同一份照搬（连样式数值都一样），已经漂移出「296g/天」
 *   · 食谱详情页：只显示胶囊的第三套
 * 三个页面的「没有档案 / 加载失败」也各写一份，文案还不一致。
 *
 * 下面几条是它的契约：
 *   ① 只做展示：不拉列表、不调接口、不算饭量、不写缓存
 *   ② 显示什么由两个开关决定：facts（六项 / 不显示）、panel（灰绿底 / 直接铺）
 *   ③ 六项顺序与文案固定，每日饭量不带「/天」
 *   ④ 四种状态各有各的样子，失败不能伪装成“没有档案”
 *   ⑤ 六个格子是读数不是按钮：不许再给每格加底色和圆角
 *   ⑥ 组件 wxss 不许出现标签/ID/属性选择器（微信只允许类选择器）
 */
describe('DogContextPanel · 狗狗选择面板', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/dog/DogContextPanel.vue'),
    'utf-8',
  )
  const template = source.slice(0, source.indexOf('<script setup'))
  const style = source.slice(source.indexOf('<style'), source.length)
  // “不许出现某说法”的断言先剥注释 —— 注释里正解释着“以前写成 296g/天”
  const bare = stripComments(source)

  /** 取出某条规则的声明体，用来检查“有没有底色/圆角”这类视觉契约 */
  function ruleBody(selector: string): string {
    const at = style.indexOf(`${selector} {`)
    if (at < 0) return ''
    return style.slice(at, style.indexOf('}', at))
  }

  it('★ 只做展示：不拉列表、不调接口、不算饭量、不写缓存', () => {
    expect(source).not.toContain('uni.request')
    expect(source).not.toContain('calc-for-recipe')
    expect(source).not.toContain('setStorageSync')
    expect(source).not.toContain('useDogSelection(')
    // 列表和数字都由页面传进来
    expect(source).toContain('dogs?: DogLike[]')
    expect(source).toContain('selectedId?: string')
    expect(source).toContain('dailyIntakeG?: number')
    expect(source).toContain('perMealG?: number')
  })

  it('★ 只发意图事件：选狗 / 去建档 / 重试', () => {
    expect(source).toContain("(event: 'select', dogId: string): void")
    expect(source).toContain("(event: 'create-dog'): void")
    expect(source).toContain("(event: 'retry'): void")
    // 组件自己不改选中项
    expect(source).not.toContain('selectedId = ')
    expect(source).not.toContain('selectedId.value =')
  })

  it('★ 六项：顺序固定、每日饭量不带「/天」', () => {
    const labels = [...source.matchAll(/label: '([^']+)'/g)].map((m) => m[1])
    expect(labels.slice(0, 6)).toEqual([
      '年龄',
      '性别',
      '体重',
      '每日餐次',
      '每日饭量',
      '每餐约',
    ])
    expect(bare).toContain('`${Math.round(props.dailyIntakeG)}g`')
    expect(bare).toContain('`${Math.round(props.perMealG)}g`')
    expect(bare).not.toContain('/天')
  })

  it('★ 两个开关：facts=none 只显示胶囊；panel=false 不加灰绿底', () => {
    expect(source).toContain("facts?: 'full' | 'none'")
    expect(source).toContain('panel?: boolean')
    expect(source).toContain("props.facts === 'full'")
    expect(source).toContain("'dog-panel' : 'dog-plain'")
  })

  it('★ 四种状态各有各的样子，失败不伪装成“没有档案”', () => {
    expect(source).toContain("state?: 'loading' | 'error' | 'empty' | 'ready'")
    expect(template).toContain("state === 'loading'")
    expect(template).toContain("state === 'error'")
    expect(template).toContain("state === 'empty'")

    const errorCopy = template.slice(
      template.indexOf("state === 'error'"),
      template.indexOf("state === 'empty'"),
    )
    expect(errorCopy).toContain('狗狗档案加载失败')
    expect(errorCopy).toContain('避免重复建档')
    expect(errorCopy).not.toContain('暂无')

    const emptyCopy = template.slice(template.indexOf("state === 'empty'"))
    expect(emptyCopy).toContain('请先创建狗狗档案')
    expect(emptyCopy).toContain('创建狗狗档案')
  })

  it('★ 选中项自动滑进可视区（狗多时也能看见自己选的）', () => {
    expect(template).toContain('scroll-into-view')
    expect(source).toContain('dog-chip-${props.selectedId}')
    expect(source).toContain('scroll-with-animation')
  })

  it('★ 六个格子是读数不是按钮：没有底色、没有圆角、用竖线分隔', () => {
    const facts = ruleBody('.dog-facts')
    expect(facts).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))')

    const fact = ruleBody('.dog-fact')
    expect(fact).toContain('border-left')
    expect(fact).not.toContain('background')
    expect(fact).not.toContain('border-radius')

    // 第一格不加竖线（用 --first 类，不用 :first-child：小程序 wxss 不保证支持伪类）
    expect(template).toContain("'dog-fact--first': index === 0")
    expect(ruleBody('.dog-fact--first')).toContain('border-left: 0')
  })

  it('★ 事件接线：选狗 / 去建档 / 重试都真的接到 emit 上', () => {
    // 2026-11-07 复审：只在类型里声明 emit 不算数，按钮没接线照样能过
    expect(template).toContain("@tap=\"emit('select', dog.id)\"")
    expect(template).toContain("@tap=\"emit('create-dog')\"")
    expect(template).toContain("@tap=\"emit('retry')\"")
  })

  it('★ 读数、滚动、骨架都真的绑到了实现上', () => {
    expect(template).toContain('v-if="showFacts"')
    expect(template).toContain(':scroll-into-view="scrollAnchor"')
    // 详情页没有面板，加载中的骨架也不该是灰绿底卡片
    expect(template).toContain("{ 'dog-skeleton--plain': !panel }")
    expect(style).toContain('.dog-skeleton--plain')
  })

  it('★ 样式只用类选择器（组件 wxss 的硬限制）', () => {
    const blocks = [...style.matchAll(/(^|\n)\s*([^@\n{}][^{}\n]*)\{/g)].map((m) => m[2].trim())
    expect(blocks.length).toBeGreaterThan(5)
    for (const block of blocks) {
      for (const part of block.split(',')) {
        const selector = part.trim()
        expect(selector.startsWith('.')).toBe(true)
        expect(selector).not.toContain('#')
        expect(selector).not.toContain('[')
      }
    }
  })
})
