import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/LaunchReadinessDrawer.vue?raw'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import typesSource from '@/types/recipeDesigner.ts?raw'
import helperSource from '@/utils/recipeDesigner/launchReadiness.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('上线检查 · API 与类型契约', () => {
  it('按草稿读取 GET launch-readiness，返回 DraftLaunchReadiness', () => {
    expect(apiSource).toContain('getDraftLaunchReadiness')
    expect(apiSource).toContain(
      'getDraftLaunchReadiness: (draftId: string): Promise<DraftLaunchReadiness>'
    )
    expect(apiSource).toContain(
      '`/recipe-designer/drafts/${draftId}/launch-readiness`'
    )
    expect(apiSource).toContain(
      'api.get(`/recipe-designer/drafts/${draftId}/launch-readiness`)'
    )
  })

  it('响应字段与后端共享门槛一致', () => {
    for (const field of [
      'draftId: string',
      'designMode: DesignRecipeDesignMode',
      'ready: boolean',
      'blockers: LaunchReadinessBlocker[]',
      'warnings: LaunchReadinessWarning[]',
      'summary: DraftLaunchReadinessSummary'
    ]) {
      expect(typesSource).toContain(field)
    }

    for (const field of [
      'itemCount: number',
      'foodItemCount: number',
      'totalWeightG: number',
      'energyDensityKcalPerKg: number | null',
      'supplementCount: number',
      'stepCount: number',
      'reportAvailable: boolean'
    ]) {
      expect(typesSource).toContain(field)
    }

    // 阻断代码与后端 launch-readiness.ts 对齐，避免 UI 只识别旧代码
    expect(typesSource).toContain("'SUPPLEMENT_TARGETS_REQUIRED'")
    expect(typesSource).toContain("'PREPARATION_METHOD_REQUIRED'")
    expect(typesSource).toContain("'PRODUCTION_STEPS_REQUIRED'")
    expect(typesSource).toContain("'NUTRITION_REPORT_UNAVAILABLE'")
    expect(typesSource).toContain("'REVIEW_REQUIRED'")
    expect(typesSource).toContain("'MISSING_NUTRITION_DATA'")
    expect(typesSource).toContain("'NUTRIENT_OUT_OF_RANGE'")
  })
})

describe('上线检查抽屉 · 加载 / 刷新 / 状态', () => {
  const drawer = clean(drawerSource)

  it('以 draftId 打开并支持手动刷新，不跳转路由', () => {
    expect(drawer).toContain('props.modelValue')
    expect(drawer).toContain('props.draftId')
    expect(drawer).toContain(
      'recipeDesignerApi.getDraftLaunchReadiness(props.draftId)'
    )
    expect(drawer).toContain('@click="loadReadiness"')
    expect(drawer).toContain('刷新检查')
    expect(drawer).toContain("emit('update:modelValue', value)")
    expect(drawer).toContain('v-model="visible"')

    // 抽屉只查看结果：不允许改路由
    expect(drawer).not.toContain('useRouter')
    expect(drawer).not.toContain('router.push')
    expect(drawer).toContain('v-loading="loading"')
  })

  it('标题展示 ready / blocked / loading / error 状态', () => {
    expect(drawer).toContain('launchReadinessStatusLabel(readiness.ready)')
    expect(drawer).toContain(
      ":type=\"readiness.ready ? 'success' : 'danger'\""
    )
    expect(drawer).toContain('检查中…')
    expect(drawer).toContain('检查失败')
  })

  it('概要展示原料 / 重量 / 能量 / 补剂 / 步骤 / 报告', () => {
    expect(drawer).toContain('buildLaunchSummaryRows(readiness.value.summary)')
    expect(drawer).toContain('v-for="row in summaryRows"')
    expect(drawer).toContain(':label="row.label"')
    expect(drawer).toContain('{{ row.value }}')

    for (const label of [
      '参与评估项',
      '参与评估食材',
      '能量密度（每kg干物质）',
      '参与评估补剂',
      '制作步骤',
      '完整营养报告'
    ]) {
      expect(clean(helperSource)).toContain(`label: '${label}'`)
    }
  })

  it('阻断项按 共用 / 展示资料 / 产品线 分组，并保留 itemId / field 定位', () => {
    expect(drawer).toContain('v-for="group in blockerGroups"')
    expect(drawer).toContain('v-for="(blocker, index) in group.issues"')
    expect(drawer).toContain('groupLaunchReadinessIssues(')
    expect(drawer).toContain('{{ group.label }}')
    expect(drawer).toContain('launchIssueFieldLabel(blocker.field)')
    expect(drawer).toContain('launchIssueItemLabel(blocker.itemId)')
    expect(drawer).toContain(':title="blocker.field"')
    expect(drawer).toContain(':title="blocker.itemId"')
    expect(drawer).toContain('{{ blocker.code }}')
  })

  it('提醒项独立展示并按归属分组，不与阻断混在一起', () => {
    expect(drawer).toContain('v-for="group in warningGroups"')
    expect(drawer).toContain('v-for="(warning, index) in group.issues"')
    expect(drawer).toContain('launchIssueFieldLabel(warning.field)')
    expect(drawer).toContain('launchIssueItemLabel(warning.itemId)')
    expect(drawer).toContain('{{ warning.code }}')
    expect(drawer).toContain('提醒项')
  })

  it('已通过清单使用共享 helper，并带归属标签', () => {
    expect(drawer).toContain('buildLaunchPassedChecks(readiness.value)')
    expect(drawer).toContain('v-for="check in passedChecks"')
    expect(drawer).toContain('{{ check.label }}')
    expect(drawer).toContain('{{ check.scopeLabel }}')
  })

  it('加载失败展示内联错误与重试按钮，并防止旧响应覆盖', () => {
    expect(drawer).toContain('error')
    expect(drawer).toContain('上线检查加载失败，请稍后重试')
    expect(drawer).toContain('el-skeleton')
    expect(drawer).toContain('重试')
    expect(drawer).toContain('requestSeq')
    expect(drawer).toContain('if (seq !== requestSeq) return')
  })

  it('模式说明分别解释产品线与订单的分支检查', () => {
    expect(drawer).toContain('launchReadinessModeNote(readiness.designMode)')
    expect(clean(helperSource)).toContain('公共门槛 + 展示资料')
    expect(clean(helperSource)).toContain('订单信息')
    expect(clean(helperSource)).toContain('上架文案')
  })
})

describe('编辑器 · 上线检查入口', () => {
  const editor = clean(editorSource)

  it('头部提供「上线检查」按钮，产品线与本单设计都可用', () => {
    expect(editor).toContain(
      "import LaunchReadinessDrawer from './components/LaunchReadinessDrawer.vue'"
    )
    expect(editor).toContain('@click="openLaunchReadiness"')
    expect(editor).toContain('>上线检查</el-button>')
    expect(editor).toContain(':icon="CircleCheck"')

    const clickIndex = editor.indexOf('@click="openLaunchReadiness"')
    const tagStart = editor.lastIndexOf('<el-button', clickIndex)
    const tagEnd = editor.indexOf('>', clickIndex)
    const buttonTag = editor.slice(tagStart, tagEnd)

    expect(buttonTag).toContain(':disabled="!draft"')
    // 不跟随「发布配方」的 v-if="!orderId"，本单设计也必须能打开
    expect(buttonTag).not.toContain('v-if="!orderId"')
    expect(buttonTag).not.toContain('v-if="orderId"')
  })

  it('按钮 title 说明公共门槛 / 展示资料 / 分支条件', () => {
    expect(editor).toContain('公共门槛 + 展示资料 + 分支条件')
  })

  it('产品线入仓动作已移入上线检查抽屉，不再在编辑器头部', () => {
    const drawer = clean(drawerSource)
    expect(drawer).toContain('保存到系列仓库')
    expect(editor).not.toContain('保存到系列仓库')
    expect(drawer).not.toContain('发布到产品线')
    expect(editor).toContain('加入本单待提交')
  })

  it('打开前先刷保存队列，再打开抽屉；不跳转路由', () => {
    const fnIndex = editor.indexOf('async function openLaunchReadiness()')
    expect(fnIndex).toBeGreaterThan(-1)
    const fnEnd = editor.indexOf('\n}\n', fnIndex)
    expect(fnEnd).toBeGreaterThan(fnIndex)
    const openBlock = editor.slice(fnIndex, fnEnd)

    expect(openBlock).toContain('await flushNow()')
    expect(openBlock).toContain('waitForSaveIdle()')
    expect(openBlock).toContain('launchReadinessVisible.value = true')
    expect(openBlock.indexOf('await flushNow()')).toBeLessThan(
      openBlock.indexOf('launchReadinessVisible.value = true')
    )
    expect(openBlock).not.toContain('router.push')
    expect(openBlock).not.toContain('goPublish')
    expect(editor).toContain('v-model="launchReadinessVisible"')
    expect(editor).toContain(':draft-id="currentDraftId"')
  })

  it('没保存成功的修改会阻止打开，并提示等保存完成后再试', () => {
    expect(editor).toContain('还有改动尚未保存成功，已停止本次上线检查')
    expect(editor).toContain('请等待保存完成后再试')
    // 2409580d 起不再「带旧数据继续打开」，而是直接停止
    expect(editor).not.toContain('本次上线检查基于服务器上已保存的版本')
  })
})
