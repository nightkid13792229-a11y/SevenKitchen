import { describe, expect, it } from 'vitest'
import {
  applyPreparationMethodSuggestion,
  filterPreparationMethodOptions,
  resolvePreparationMethodCommitText,
  resolvePreparationMethodDisplayText
} from './preparationMethodField'

const options = [
  { id: 'method-peel', name: '去皮' },
  { id: 'method-bone', name: '去骨' },
  { id: 'method-dice', name: '切块' },
  { id: 'method-mince', name: '打碎' }
]

describe('预处理输入框 · 显示文字', () => {
  it('优先显示已经解析好的字典名称', () => {
    expect(
      resolvePreparationMethodDisplayText('3bfe6db8-uuid', '去皮')
    ).toBe('去皮')
  })

  it('没有字典名称时回退到原始值', () => {
    expect(resolvePreparationMethodDisplayText('去皮切块', null)).toBe(
      '去皮切块'
    )
  })

  it('历史数据里存的是字典 id 时，用选项列表兜底显示名称', () => {
    expect(
      resolvePreparationMethodDisplayText('method-peel', null, options)
    ).toBe('去皮')
  })

  it('空值显示空串，不显示 null / undefined', () => {
    expect(resolvePreparationMethodDisplayText(null, null)).toBe('')
    expect(resolvePreparationMethodDisplayText(undefined, undefined)).toBe('')
    expect(resolvePreparationMethodDisplayText('  ', '  ')).toBe('')
  })
})

describe('预处理输入框 · 提交文字', () => {
  it('自由文本原样保存，逗号统一成顿号', () => {
    expect(resolvePreparationMethodCommitText('去皮，切块', options)).toEqual({
      value: '去皮、切块',
      text: '去皮、切块'
    })
  })

  it('输入与字典名称完全一致时保存字典 id', () => {
    expect(resolvePreparationMethodCommitText('去皮', options)).toEqual({
      value: 'method-peel',
      text: '去皮'
    })
  })

  it('名称前后有空格也能匹配字典', () => {
    expect(resolvePreparationMethodCommitText('  去骨  ', options)).toEqual({
      value: 'method-bone',
      text: '去骨'
    })
  })

  it('空白输入表示清空', () => {
    expect(resolvePreparationMethodCommitText('   ', options)).toEqual({
      value: null,
      text: ''
    })
    expect(resolvePreparationMethodCommitText(null, options)).toEqual({
      value: null,
      text: ''
    })
  })
})

describe('预处理输入框 · 下拉建议', () => {
  it('没有关键词时返回全部，最多 20 条', () => {
    expect(filterPreparationMethodOptions(options, '').map((item) => item.name))
      .toEqual(['去皮', '去骨', '切块', '打碎'])

    const many = Array.from({ length: 30 }, (_, index) => ({
      id: `method-${index}`,
      name: `方式${index}`
    }))
    expect(filterPreparationMethodOptions(many, '')).toHaveLength(20)
  })

  it('按名称包含过滤', () => {
    expect(
      filterPreparationMethodOptions(options, '去').map((item) => item.name)
    ).toEqual(['去皮', '去骨'])
  })

  it('多段文字只按最后一段过滤，方便继续补写', () => {
    expect(
      filterPreparationMethodOptions(options, '去皮、切').map(
        (item) => item.name
      )
    ).toEqual(['切块'])
  })

  it('英文名称大小写不敏感', () => {
    const english = [
      { id: 'method-dice', name: 'Dice' },
      { id: 'method-peel', name: 'Peel' }
    ]
    expect(
      filterPreparationMethodOptions(english, 'dice').map((item) => item.name)
    ).toEqual(['Dice'])
  })
})

describe('预处理输入框 · 选中建议后保留前面的分段', () => {
  it('空输入直接填入建议', () => {
    expect(applyPreparationMethodSuggestion('', '去皮')).toBe('去皮')
  })

  it('只有一个未完成分段时直接替换', () => {
    expect(applyPreparationMethodSuggestion('切', '切块')).toBe('切块')
  })

  it('已经输入多段时只替换最后一段', () => {
    expect(applyPreparationMethodSuggestion('去皮、切', '切块')).toBe(
      '去皮、切块'
    )
  })

  it('末尾已经打了顿号时追加，不吞掉前一段', () => {
    expect(applyPreparationMethodSuggestion('去皮、', '去骨')).toBe(
      '去皮、去骨'
    )
  })
})
