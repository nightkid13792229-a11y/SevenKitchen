import { describe, expect, it } from 'vitest'
import {
  requiredFieldMeta,
  requiredMissingRows
} from './requiredFields'

describe('必填项展示', () => {
  it('把后端 missing 键翻译成字段名和区块', () => {
    expect(requiredFieldMeta('name')).toEqual({
      label: '原料名称',
      section: 'basic'
    })
    expect(requiredFieldMeta('shelfLifeMonths')).toEqual({
      label: '原厂保质期',
      section: 'retail'
    })
    expect(requiredFieldMeta('linkUrl')).toBeNull()
    expect(requiredFieldMeta('platform')).toEqual({
      label: 'DIY 平台',
      section: 'diy'
    })
    expect(requiredFieldMeta('groupId')).toEqual({
      label: '等价组意向',
      section: 'equivalence'
    })
  })

  it('只返回认识的缺失项，未知键不吓人', () => {
    expect(requiredMissingRows(['name', 'groupId', 'unknown'])).toEqual([
      { key: 'name', label: '原料名称', section: 'basic' },
      { key: 'groupId', label: '等价组意向', section: 'equivalence' }
    ])
    expect(requiredMissingRows([])).toEqual([])
  })
})
