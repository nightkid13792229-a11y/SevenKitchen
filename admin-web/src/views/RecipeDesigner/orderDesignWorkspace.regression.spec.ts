import { describe, expect, it } from 'vitest'
import workspace from '@/views/RecipeDesigner/OrderDesignWorkspace.vue?raw'
import router from '@/router/index.ts?raw'

describe('订单设计工作台 · 路由与入口', () => {
  it('新增 /order-design/:orderId 路由', () => {
    expect(router).toContain('order-design/:orderId')
    expect(router).toContain('OrderDesignWorkspace')
  })
})

describe('订单设计工作台 · 本单进度', () => {
  it('页头展示订单号 / 狗狗 / 本单份数', () => {
    expect(workspace).toContain('订单 {{ orderId }}')
    expect(workspace).toContain('workspace.dogName')
    expect(workspace).toContain('本单 {{ progress.total }} 份')
  })

  it('进度条用已就绪 / 已交付数量，不靠员工自己数卡片', () => {
    expect(workspace).toContain('{{ progress.text }}')
    expect(workspace).toContain(':percentage="progress.percent"')
    expect(workspace).toContain('buildOrderDesignProgress')
    expect(workspace).toContain('workspace.value.readyCount')
  })

  it('0 个槽位时说明老订单仍可在订单页交付', () => {
    expect(workspace).toContain('slots.length === 0')
    expect(workspace).toContain('老订单')
    expect(workspace).toContain('订单页')
  })
})

describe('订单设计工作台 · 槽位列表', () => {
  it('逐份展示状态、更新时间、模板阶段提示', () => {
    expect(workspace).toContain('v-for="(slot, index) in slots"')
    expect(workspace).toContain('orderDesignStatusLabel(slot.status)')
    expect(workspace).toContain('v-if="slot.stageWarning"')
    expect(workspace).toContain(':title="slot.stageWarning"')
    expect(workspace).toContain('formatDateTime(slot.updatedAt)')
  })

  it('每个未交付槽位都能打开编辑器和移除', () => {
    expect(workspace).toContain('@click="openSlotEditor(slot)"')
    expect(workspace).toContain('打开编辑器')
    expect(workspace).toContain('@click="removeSlot(slot)"')
    expect(workspace).toContain("slot.status !== 'DELIVERED'")
  })
})

describe('订单设计工作台 · 新建槽位', () => {
  it('从模板新建打开模板抽屉', () => {
    expect(workspace).toContain('<TemplatePickerDrawer')
    expect(workspace).toContain(
      "import TemplatePickerDrawer from './components/TemplatePickerDrawer.vue'",
    )
    expect(workspace).toContain('v-model="templatePickerVisible"')
    expect(workspace).toContain('@click="openTemplatePicker"')
    expect(workspace).toContain('从模板新建')
  })

  it('空白草稿直接创建本单槽位', () => {
    expect(workspace).toContain('@click="createBlank"')
    expect(workspace).toContain('空白草稿')
    expect(workspace).toContain('orderRecipeDesignApi.createBlank(targetOrderId)')
  })

  it('建满 N 份后禁用新建，并说明要替换先移除', () => {
    expect(workspace).toContain(':disabled="!canAddSlot"')
    expect(workspace).toContain('canAddSlot')
    expect(workspace).toContain('请先移除')
  })

  it('本单已交付后不再显示新建入口（后端会拒绝已交付订单）', () => {
    expect(workspace).toContain('const isDelivered = computed')
    expect(workspace).toContain('!isDelivered.value &&')
    expect(workspace).toContain('v-if="!isDelivered"')
  })
})

describe('订单设计工作台 · 管理员最终提交 / 员工等待', () => {
  it('只有管理员看得到最终提交按钮', () => {
    expect(workspace).toContain('useIsAdmin')
    expect(workspace).toContain('const isAdmin = useIsAdmin()')
    expect(workspace).toContain('v-if="isAdmin && progress.ready === progress.total"')
    expect(workspace).toContain('@click="submitDesigns"')
    expect(workspace).toContain('最终提交并交付')
  })

  it('员工看到等待管理员文案，而不是一个点不动的按钮', () => {
    expect(workspace).toContain('等待管理员最终提交并交付')
    expect(workspace).toContain('员工不能触发首次交付')
    expect(workspace).not.toContain(':disabled="!isAdmin"')
  })

  it('员工进入工作台就知道「加入待提交」也需要管理员', () => {
    expect(workspace).toContain('v-if="!isAdmin"')
    expect(workspace).toContain('加入本单待提交')
    expect(workspace).toContain('需要管理员')
  })

  it('最终提交前二次确认，并说明顾客只收到一条通知', () => {
    expect(workspace).toContain("confirmButtonText: '确认提交并交付'")
    expect(workspace).toContain('一条通知')
    expect(workspace).toContain('orderRecipeDesignApi.submitDesigns(targetOrderId)')
  })
})
