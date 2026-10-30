import { beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/index', () => ({ default: transport }))

import { orderRecipeDesignApi } from '@/api/orderRecipeDesign'

describe('订单设计 API 路径', () => {
  beforeEach(() => {
    transport.get.mockReset()
    transport.post.mockReset()
    transport.patch.mockReset()
    transport.delete.mockReset()
  })

  it('模板搜索带 keyword / kind 查询参数', async () => {
    transport.get.mockResolvedValue([])
    await orderRecipeDesignApi.listTemplates({
      keyword: '鸡肉',
      kind: 'CUSTOM',
    })

    expect(transport.get).toHaveBeenCalledWith(
      '/recipe-designer/recipe-templates',
      { params: { keyword: '鸡肉', kind: 'CUSTOM' } },
    )
  })

  it('模板阶段比较走订单维度，sourceRecipeId 放查询参数', async () => {
    transport.get.mockResolvedValue({ matches: true })
    await orderRecipeDesignApi.getTemplateStage('CR20261022001', 'recipe-1')

    expect(transport.get).toHaveBeenCalledWith(
      '/recipe-designer/orders/CR20261022001/design-template-stage',
      { params: { sourceRecipeId: 'recipe-1' } },
    )
  })

  it('读取工作台', async () => {
    transport.get.mockResolvedValue({ slots: [] })
    await orderRecipeDesignApi.getWorkspace('CR20261022001')

    expect(transport.get).toHaveBeenCalledWith(
      '/recipe-designer/orders/CR20261022001/workspace',
    )
  })

  it('从模板创建订单草稿', async () => {
    transport.post.mockResolvedValue({ seriesId: 's1', draftId: 'd1' })
    await orderRecipeDesignApi.createFromTemplate('CR20261022001', {
      sourceRecipeId: 'recipe-1',
      name: 'Foxy 第一份',
    })

    expect(transport.post).toHaveBeenCalledWith(
      '/recipe-designer/orders/CR20261022001/designs/from-template',
      { sourceRecipeId: 'recipe-1', name: 'Foxy 第一份' },
    )
  })

  it('创建空白订单草稿', async () => {
    transport.post.mockResolvedValue({ seriesId: 's1', draftId: 'd1' })
    await orderRecipeDesignApi.createBlank('CR20261022001')

    expect(transport.post).toHaveBeenCalledWith(
      '/recipe-designer/orders/CR20261022001/designs/blank',
    )
  })

  it('加入本单待提交走 ready 接口', async () => {
    transport.post.mockResolvedValue({ status: 'READY' })
    await orderRecipeDesignApi.markReady('CR20261022001', 'design-1')

    expect(transport.post).toHaveBeenCalledWith(
      '/recipe-designer/orders/CR20261022001/designs/design-1/ready',
    )
  })

  it('切换生命阶段走 stage 接口，只带 scenario（原地换，不换草稿）', async () => {
    transport.patch.mockResolvedValue({ status: 'EDITING' })
    await orderRecipeDesignApi.switchStage(
      'CR20261022001',
      'design-1',
      'ADULT_MER_110',
    )

    expect(transport.patch).toHaveBeenCalledWith(
      '/recipe-designer/orders/CR20261022001/designs/design-1/stage',
      { scenario: 'ADULT_MER_110' },
    )
  })

  it('移除未交付槽位走 DELETE', async () => {
    transport.delete.mockResolvedValue(null)
    await orderRecipeDesignApi.removeDesign('CR20261022001', 'design-1')

    expect(transport.delete).toHaveBeenCalledWith(
      '/recipe-designer/orders/CR20261022001/designs/design-1',
    )
  })

  it('管理员最终提交走 admin/custom-recipe 的 submit-designs', async () => {
    transport.post.mockResolvedValue({ status: 'DELIVERED' })
    await orderRecipeDesignApi.submitDesigns('CR20261022001')

    expect(transport.post).toHaveBeenCalledWith(
      '/admin/custom-recipe/orders/CR20261022001/submit-designs',
    )
  })

  it('订单号 / 设计 id 做 URL 编码，避免特殊字符拼坏路径', async () => {
    transport.delete.mockResolvedValue(null)
    await orderRecipeDesignApi.removeDesign('CR 001', 'design/1')

    expect(transport.delete).toHaveBeenCalledWith(
      '/recipe-designer/orders/CR%20001/designs/design%2F1',
    )
  })
})
