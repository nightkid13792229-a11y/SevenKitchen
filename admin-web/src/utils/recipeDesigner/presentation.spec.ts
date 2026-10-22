import { describe, expect, it } from 'vitest'
import {
  buildPresentationForm,
  buildPresentationPatch,
  buildPresentationTargetPatch,
  clonePresentationForm,
  emptyPresentationForm,
  formatOrderQuantityLabel,
  hasPresentationPatch,
  isPresentationDirty,
  isSameStringSet,
  normalizePresentationDetailImages,
  normalizePresentationDesignMode,
  resolveOrderPresentationInfo,
  validatePresentationCoverFile
} from './presentation'

const draft = {
  coverImageUrl: ' https://img.example.com/cover.jpg ',
  coverTitle: ' 鸡肉成犬 ',
  description: ' 鲜鸡肉为主料。 ',
  sellingPoint: ' 鲜肉低敏 ',
  applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
  targetHealthTags: ['tag-joint', 'tag-skin']
}

describe('产品展示 · 草稿与表单', () => {
  it('读取草稿时 trim 文本并归一化数组', () => {
    expect(buildPresentationForm(draft)).toEqual({
      coverImageUrl: 'https://img.example.com/cover.jpg',
      coverTitle: '鸡肉成犬',
      description: '鲜鸡肉为主料。',
      sellingPoint: '鲜肉低敏',
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
      targetHealthTags: ['tag-joint', 'tag-skin']
    })
  })

  it('旧草稿缺字段时全部归一成空值', () => {
    expect(buildPresentationForm(null)).toEqual(emptyPresentationForm())
    expect(buildPresentationForm({})).toEqual(emptyPresentationForm())
  })

  it('detailImages 是 JSON，非数组或非字符串项直接忽略', () => {
    expect(
      normalizePresentationDetailImages([
        'https://img.example.com/1.jpg',
        '  ',
        123,
        null
      ])
    ).toEqual(['https://img.example.com/1.jpg'])
    expect(normalizePresentationDetailImages({ url: 'x' })).toEqual([])
  })

  it('深拷贝表单，保存后继续编辑不会污染基线', () => {
    const form = buildPresentationForm(draft)
    const clone = clonePresentationForm(form)
    clone.targetHealthTags.push('tag-new')

    expect(form.targetHealthTags).toEqual(['tag-joint', 'tag-skin'])
  })
})

describe('产品展示 · PATCH 差异', () => {
  it('只返回真正变化的字段，空字符串按 null 清空', () => {
    const baseline = buildPresentationForm(draft)
    const form = {
      ...clonePresentationForm(baseline),
      coverTitle: '  新标题 ',
      description: '',
      sellingPoint: baseline.sellingPoint
    }

    expect(buildPresentationPatch(form, baseline)).toEqual({
      coverTitle: '新标题',
      description: null
    })
  })

  it('没有变化时不产生 PATCH，避免无意义地递增内容版本', () => {
    const baseline = buildPresentationForm(draft)
    expect(buildPresentationPatch(baseline, baseline)).toEqual({})
    expect(hasPresentationPatch(buildPresentationPatch(baseline, baseline))).toBe(
      false
    )
  })

  it('生命阶段 / 健康标签按集合比较，顺序变化不算修改', () => {
    const baseline = buildPresentationForm(draft)
    const reordered = {
      ...clonePresentationForm(baseline),
      targetHealthTags: ['tag-skin', 'tag-joint']
    }

    expect(isSameStringSet(reordered.targetHealthTags, baseline.targetHealthTags)).toBe(
      true
    )
    expect(buildPresentationTargetPatch(reordered, baseline)).toEqual({})
  })

  it('产品线字段变化只进入草稿 PATCH，不进入展示 PATCH', () => {
    const baseline = buildPresentationForm(draft)
    const form = {
      ...clonePresentationForm(baseline),
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT', 'REPRODUCTION'],
      targetHealthTags: ['tag-joint']
    }

    expect(buildPresentationPatch(form, baseline)).toEqual({})
    expect(buildPresentationTargetPatch(form, baseline)).toEqual({
      applicableLifeStages: ['HIGH_ACTIVITY_ADULT', 'REPRODUCTION'],
      targetHealthTags: ['tag-joint']
    })
  })

  it('isPresentationDirty 对订单分支忽略产品线字段', () => {
    const baseline = buildPresentationForm(draft)
    const catalogChanged = {
      ...clonePresentationForm(baseline),
      targetHealthTags: ['tag-joint']
    }

    expect(isPresentationDirty(catalogChanged, baseline, true)).toBe(true)
    expect(isPresentationDirty(catalogChanged, baseline, false)).toBe(false)

    const coverChanged = {
      ...clonePresentationForm(baseline),
      coverTitle: '新标题'
    }
    expect(isPresentationDirty(coverChanged, baseline, false)).toBe(true)
  })
})

describe('产品展示 · 本单信息', () => {
  it('订单号 / 份数来自系列，顾客爱犬来自草稿', () => {
    expect(
      resolveOrderPresentationInfo({
        customerDogId: 'dog-1',
        series: { orderId: 'order-1', orderQuantity: 2 }
      } as any)
    ).toEqual({
      orderId: 'order-1',
      orderQuantity: 2,
      customerDogId: 'dog-1'
    })
  })

  it('缺失订单信息时保持 null，不伪造成 0', () => {
    expect(
      resolveOrderPresentationInfo({
        customerDogId: null,
        series: { orderId: null, orderQuantity: null }
      } as any)
    ).toEqual({
      orderId: null,
      orderQuantity: null,
      customerDogId: null
    })
    expect(formatOrderQuantityLabel(0)).toBe('未设置')
    expect(formatOrderQuantityLabel(null)).toBe('未设置')
    expect(formatOrderQuantityLabel(2)).toBe('2 份')
  })

  it('设计模式缺省按产品线处理', () => {
    expect(normalizePresentationDesignMode('order')).toBe('ORDER')
    expect(normalizePresentationDesignMode('CATALOG')).toBe('CATALOG')
    expect(normalizePresentationDesignMode(null)).toBe('CATALOG')
  })
})

describe('产品展示 · 封面上传校验', () => {
  it('只允许 JPG / PNG / WebP 且不超过 5MB', () => {
    expect(
      validatePresentationCoverFile({ type: 'image/jpeg', size: 1024 })
    ).toBeNull()
    expect(
      validatePresentationCoverFile({ type: 'image/png', size: 5 * 1024 * 1024 })
    ).toBeNull()
    expect(
      validatePresentationCoverFile({ type: 'image/gif', size: 1024 })
    ).toContain('JPG')
    expect(
      validatePresentationCoverFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 })
    ).toContain('5MB')
    expect(validatePresentationCoverFile({ type: 'image/jpeg', size: 0 })).toContain(
      '为空'
    )
  })
})
