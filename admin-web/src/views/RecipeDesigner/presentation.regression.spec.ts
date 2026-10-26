import { describe, expect, it } from 'vitest'
import panelSource from '@/views/RecipeDesigner/components/PresentationPanel.vue?raw'
import drawerSource from '@/views/RecipeDesigner/components/LaunchReadinessDrawer.vue?raw'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import typeSource from '@/types/recipeDesigner.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('产品展示 · API 与类型契约', () => {
  it('展示字段走 PATCH presentation，并带 patch semantics 类型', () => {
    expect(apiSource).toContain('updateDraftPresentation')
    expect(apiSource).toContain(
      '`/recipe-designer/drafts/${draftId}/presentation`'
    )
    for (const field of [
      'coverImageUrl?: string | null',
      'coverTitle?: string | null',
      'description?: string | null',
      'sellingPoint?: string | null',
      'detailImages?: string[] | null',
      'videoUrl?: string | null'
    ]) {
      expect(typeSource).toContain(field)
    }
  })

  it('适用生命阶段 / 健康标签走既有草稿 PATCH', () => {
    expect(apiSource).toContain('updateDraft: (')
    expect(typeSource).toContain('applicableLifeStages?: string[]')
    expect(typeSource).toContain('targetHealthTags?: string[]')
  })

  it('草稿详情类型包含展示字段与订单上下文', () => {
    for (const field of [
      'coverImageUrl?: string | null',
      'coverTitle?: string | null',
      'description?: string | null',
      'sellingPoint?: string | null',
      'detailImages?: string[] | null',
      'videoUrl?: string | null',
      'customerDogId?: string | null',
      'orderId?: string | null',
      'orderQuantity?: number | null'
    ]) {
      expect(typeSource).toContain(field)
    }
  })

  it('上线检查问题带可选 scope 与分支代码', () => {
    expect(typeSource).toContain(
      "export type LaunchReadinessScope ="
    )
    expect(typeSource).toContain('scope?: LaunchReadinessScope')
    for (const code of [
      'COVER_IMAGE_REQUIRED',
      'COVER_TITLE_REQUIRED',
      'DESCRIPTION_REQUIRED',
      'SELLING_POINT_REQUIRED',
      'APPLICABLE_LIFE_STAGES_REQUIRED',
      'ORDER_ID_REQUIRED',
      'ORDER_QUANTITY_INVALID',
      'CUSTOMER_DOG_REQUIRED',
      'TARGET_HEALTH_TAGS_MISSING'
    ]) {
      expect(typeSource).toContain(`'${code}'`)
    }
  })
})

describe('产品展示 · 面板', () => {
  const panel = clean(panelSource)

  it('两种分支都有封面图上传与封面标题，上传复用 recipeApi.uploadImage', () => {
    expect(panel).toContain(
      'const result = await recipeApi.uploadImage(file)'
    )
    expect(panel).toContain('封面图')
    expect(panel).toContain('封面标题')
    expect(panel).toContain('v-model="form.coverTitle"')
    expect(panel).toContain('validatePresentationCoverFile(file)')
  })

  it('产品线分支只保留卖点，不再编辑目标健康标签', () => {
    expect(panel).toContain('<template v-if="isCatalog">')
    expect(panel).not.toContain('v-model="form.description"')
    expect(panel).not.toContain('适用生命阶段')
    expect(panel).toContain('v-model="form.sellingPoint"')
    expect(panel).not.toContain('目标健康标签')
    expect(panel).not.toContain('v-model="form.targetHealthTags"')
    // 标签字典与加载/错误状态一并移除，面板不再发健康标签请求
    expect(panel).not.toContain('recipeHealthTagApi')
    expect(panel).not.toContain('healthTags')
    expect(panel).toContain('ORDER_DESIGN_LIFE_STAGE_LABELS')
    expect(panel).toContain('RECIPE_PRESENTATION_LIMITS.coverTitle')
    expect(panel).toContain('RECIPE_PRESENTATION_LIMITS.sellingPoint')
  })

  it('订单分支只读展示订单号 / 份数 / 顾客爱犬', () => {
    expect(panel).toContain('订单信息')
    expect(panel).toContain('orderInfo.orderId')
    expect(panel).toContain('orderQuantityLabel')
    expect(panel).toContain('orderInfo.customerDogId')
    expect(panel).toContain('resolveOrderPresentationInfo')
    expect(panel).toContain('订单信息来自本单，只读')
  })

  it('保存时只 PATCH 展示字段，并通知抽屉刷新', () => {
    expect(panel).toContain('recipeDesignerApi.updateDraftPresentation(')
    expect(panel).not.toContain('recipeDesignerApi.updateDraft(props.draftId')
    expect(panel).toContain('buildPresentationPatch(form, baseline.value)')
    expect(panel).not.toContain('buildPresentationTargetPatch')
    expect(panel).not.toContain('targetHealthTags')
    expect(panel).toContain('保存展示资料')
    expect(panel).toContain("emit('saved'")
  })
})

describe('上线检查抽屉 · 产品展示与分支分组', () => {
  const drawer = clean(drawerSource)

  it('嵌入产品展示面板，保存后重新拉上线检查', () => {
    expect(drawer).toContain(
      "import PresentationPanel from './PresentationPanel.vue'"
    )
    expect(drawer).toContain('<PresentationPanel')
    expect(drawer).toContain(':draft-id="draftId"')
    expect(drawer).toContain(':design-mode="readiness.designMode"')
    expect(drawer).toContain('@saved="handlePresentationSaved"')
    const handler = drawer.slice(
      drawer.indexOf('async function handlePresentationSaved'),
      drawer.indexOf('}\n', drawer.indexOf('async function handlePresentationSaved'))
    )
    expect(handler).toContain('await loadReadiness()')
  })

  it('阻断 / 提醒按 共用 / 展示资料 / 产品线 / 订单 分组', () => {
    expect(drawer).toContain('groupLaunchReadinessIssues(')
    expect(drawer).toContain('blockerGroups')
    expect(drawer).toContain('warningGroups')
    expect(drawer).toContain('buildLaunchPassedChecks(readiness.value)')
  })
})

describe('编辑器 · 分支按钮', () => {
  const editor = clean(editorSource)

  it('产品线入仓与订单待提交都在上线检查抽屉', () => {
    const drawer = clean(drawerSource)
    expect(editor).not.toContain('保存到系列仓库')
    expect(editor).not.toContain('发布到产品线')
    expect(drawer).toContain('加入本单待提交')
    expect(drawer).toContain('canStageOrder')
  })
})
