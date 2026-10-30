import { describe, expect, it } from 'vitest'
import {
  filterPreparationHistory,
  resolvePreparationHistorySuggestions,
  resolvePreparationMethodCommitText,
  resolvePreparationMethodDisplayText
} from './preparationMethodField'

describe('预处理输入框 · 显示文字', () => {
  it('优先显示后端解析好的名称', () => {
    expect(resolvePreparationMethodDisplayText('原料值', '去皮')).toBe('去皮')
  })

  it('没有名称时回退到原始值', () => {
    expect(resolvePreparationMethodDisplayText('去皮切块', null)).toBe(
      '去皮切块'
    )
  })

  it('空值显示空串，不显示 null / undefined', () => {
    expect(resolvePreparationMethodDisplayText(null, null)).toBe('')
    expect(resolvePreparationMethodDisplayText(undefined, undefined)).toBe('')
    expect(resolvePreparationMethodDisplayText('  ', '  ')).toBe('')
  })
})

describe('预处理输入框 · 提交文字', () => {
  it('自由文本原样保存，逗号统一成顿号', () => {
    expect(resolvePreparationMethodCommitText('去皮，切块')).toEqual({
      value: '去皮、切块',
      text: '去皮、切块'
    })
  })

  it('与字典同名的文字也只保存自由文本', () => {
    expect(resolvePreparationMethodCommitText('去皮')).toEqual({
      value: '去皮',
      text: '去皮'
    })
  })

  it('名称前后有空格时只归一化文字', () => {
    expect(resolvePreparationMethodCommitText('  去骨  ')).toEqual({
      value: '去骨',
      text: '去骨'
    })
  })

  it('空白输入表示清空', () => {
    expect(resolvePreparationMethodCommitText('   ')).toEqual({
      value: null,
      text: ''
    })
    expect(resolvePreparationMethodCommitText(null)).toEqual({
      value: null,
      text: ''
    })
  })
})

describe('预处理输入框 · 历史下拉', () => {
  const history = [
    '牛里脊/生/去油',
    '牛里脊/生/去筋膜',
    '牛里脊/熟/切块',
    '牛腩/生/切块'
  ]

  it('空输入返回最近 3 条', () => {
    expect(filterPreparationHistory(history, '')).toEqual([
      '牛里脊/生/去油',
      '牛里脊/生/去筋膜',
      '牛里脊/熟/切块'
    ])
  })

  it('按最后一段过滤，支持斜杠', () => {
    expect(filterPreparationHistory(history, '牛里脊/生/去')).toEqual([
      '牛里脊/生/去油',
      '牛里脊/生/去筋膜'
    ])
  })

  it('最多返回 3 条', () => {
    expect(filterPreparationHistory(history, '', 3)).toHaveLength(3)
  })

  it('匹配不到时退回最近 3 条，保证下拉始终能看到历史', () => {
    expect(resolvePreparationHistorySuggestions(history, '完全不存在的词')).toEqual([
      '牛里脊/生/去油',
      '牛里脊/生/去筋膜',
      '牛里脊/熟/切块'
    ])
  })
})
