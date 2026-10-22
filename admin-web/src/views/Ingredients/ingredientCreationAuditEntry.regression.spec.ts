import { describe, expect, it } from 'vitest'
import stepFinishSource from './creation/StepFinish.vue?raw'
import listSource from './index.vue?raw'
import drawerSource from './components/IngredientCreationAuditDrawer.vue?raw'
import creationApiSource from '@/api/ingredientCreation.ts?raw'
import ingredientsApiSource from '@/api/ingredients.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * 这一块靠人工点按钮接入，纯函数之外的行为（确认每一份档案、按钮仅管理员可见、
 * 列表入口只在有审计时出现）没有组件挂载环境可测，沿用仓库里的源码回归测试。
 */
describe('AI 新建原料 · 确认可用与创建记录入口', () => {
  const stepFinish = clean(stepFinishSource)
  const list = clean(listSource)
  const drawer = clean(drawerSource)
  const creationApi = clean(creationApiSource)
  const ingredientsApi = clean(ingredientsApiSource)

  it('完成页的「确认可用」对每一份营养档案逐一点 verify', () => {
    expect(stepFinish).toContain('nutritionFoodApi.verify')
    expect(stepFinish).toContain(
      'for (const nutritionFoodId of nutritionFoodIds)'
    )
    expect(stepFinish).toContain('已可在配方中使用')
    expect(stepFinish).toContain('getApiErrorMessage')
  })

  it('「确认可用」只给管理员看，非管理员看到权限说明', () => {
    expect(stepFinish).toContain('v-if="isAdmin && !verified"')
    expect(stepFinish).toContain('ADMIN_ONLY_TIP')
    expect(stepFinish).toContain('useIsAdmin')
  })

  it('确认成功后完成页从「待验证」切到「已验证」', () => {
    expect(stepFinish).toContain('已验证（VERIFIED）')
    expect(stepFinish).toContain('待验证（PENDING）')
    expect(stepFinish).toContain('verified.value = true')
  })

  it('原料列表只在有创建记录时显示入口，并打开审计抽屉', () => {
    expect(list).toContain('v-if="row.hasCreationAudit"')
    expect(list).toContain('handleOpenCreationAudit')
    expect(list).toContain('<IngredientCreationAuditDrawer')
    expect(list).toContain(':ingredient-id="creationAuditIngredient?.id ?? null"')
  })

  it('抽屉展示提交人/时间、AI 提案与人工改动，空提案有明确文案', () => {
    expect(drawer).toContain('audit.committedBy')
    expect(drawer).toContain('audit.committedAt')
    expect(drawer).toContain('proposalSection.emptyText')
    expect(drawer).toContain('changeRows')
    expect(drawer).toContain('EMPTY_CHANGES_TEXT')
    expect(drawer).toContain('加载创建记录失败（后端返回原文）')
  })

  it('API 客户端接上 verify 与 audit 两个真实接口', () => {
    expect(ingredientsApi).toContain(
      'api.patch(`/nutrition-foods/${id}/verify`)'
    )
    expect(creationApi).toContain('`${BASE}/audits/${ingredientId}`')
  })
})
