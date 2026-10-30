import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  partialCoreNote,
  stepPlanTitle,
  stepRowNote,
  stepStatusLabel,
  stepWhenText,
  stepWindowText,
} from './status'
import type { VaccineStep } from './types'

const titerStep = (status: 'DONE' | 'OVERDUE'): VaccineStep =>
  ({
    key: 'core-titer-review',
    kind: 'core',
    kindLabel: '核心疫苗',
    kindShort: '核心',
    label: '评估',
    layer: 'MUST',
    windowStart: '2025-05-01',
    windowEnd: '2025-05-01',
    status,
    statusLabel: status === 'OVERDUE' ? '建议复查' : '已完成',
    titer: { testedAt: '2024-05-01', nextReviewAt: '2025-05-01' },
    titerable: true,
    products: [],
  }) as VaccineStep

const read = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../components/vaccine/${name}`, import.meta.url)),
    'utf8',
  )

describe('F-A · 抗体复查文案（V1/V11）', () => {
  it('过期后说“建议复查（已过）”，不再说“下次评估”', () => {
    const step = titerStep('OVERDUE')
    expect(stepWhenText(step)).toContain('建议复查')
    expect(stepWhenText(step)).toContain('已过')
    expect(stepWhenText(step)).not.toContain('下次评估')
    expect(stepWindowText(step).sub).toBe('已过')
  })

  it('角标写“建议复查”，不写“已完成”', () => {
    expect(stepStatusLabel(titerStep('DONE'))).toBe('建议复查')
    expect(stepStatusLabel(titerStep('OVERDUE'))).toBe('建议复查')
  })

  it('标题写“抗体复查”，不写“评估”', () => {
    expect(stepPlanTitle(titerStep('OVERDUE'))).toContain('抗体复查')
    expect(stepPlanTitle(titerStep('DONE'))).toContain('抗体复查')
  })

  it('过期行不再说“这次不用打”，改说“建议复查”', () => {
    const note = stepRowNote(titerStep('OVERDUE'))
    expect(note.text).toContain('建议复查')
    expect(note.text).not.toContain('这次不用打')
    expect(note.overdue).toBe(true)
  })
})

describe('F-A · 单病种/二联提示（#3）', () => {
  it('只含部分核心病种 → 明说不能顶核心一针', () => {
    const note = partialCoreNote({
      components: ['cdv', 'cpv'],
      componentLabels: ['犬瘟热', '犬细小病毒'],
    })
    expect(note).toContain('不能顶核心一针')
    expect(note).toContain('补打')
  })

  it('完整核心/非核心/没成分 → 不提示', () => {
    expect(
      partialCoreNote({
        components: ['cdv', 'cav', 'cpv'],
        componentLabels: ['犬瘟热', '犬传染性肝炎', '犬细小病毒'],
      }),
    ).toBe('')
    expect(
      partialCoreNote({
        components: ['lepto'],
        componentLabels: ['钩端螺旋体'],
      }),
    ).toBe('')
    expect(partialCoreNote({})).toBe('')
  })
})

describe('F-A · 文案源检查', () => {
  it('忽略弹层写清“推迟 30 天”，不再说“只跳过这一针/行为一致”', () => {
    const source = read('IgnoreSheet.vue')
    expect(source).toContain('30 天')
    expect(source).not.toContain('只跳过这一针')
    expect(source).not.toContain('两个选项**行为一致**')
  })

  it('下一针卡片给“先测抗体”，并显示 30 天后的日期', () => {
    const source = read('NextCard.vue')
    expect(source).toContain('先测抗体')
    expect(source).toContain('snoozeUntil')
  })

  it('记录区用 partialCoreNote 显示单病种提示', () => {
    expect(read('RecordList.vue')).toContain('partialCoreNote')
  })
})
