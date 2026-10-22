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
      '参与评估原料',
      '总重量',
      '能量密度',
      '参与评估补剂',
      '制作步骤',
      '完整营养报告'
    ]) {
      expect(clean(helperSource)).toContain(`label: '${label}'`)
    }
  })

  it('阻断项展示 itemId / field 定位提示和原始 code', () => {
    expect(drawer).toContain('v-for="(blocker, index) in readiness.blockers"')
    expect(drawer).toContain('launchIssueFieldLabel(blocker.field)')
    expect(drawer).toContain('launchIssueItemLabel(blocker.itemId)')
    expect(drawer).toContain(':title="blocker.field"')
    expect(drawer).toContain(':title="blocker.itemId"')
    expect(drawer).toContain('{{ blocker.code }}')
  })

  it('提醒项独立展示，不与阻断混在一起', () => {
    expect(drawer).toContain('v-for="(warning, index) in readiness.warnings"')
    expect(drawer).toContain('launchIssueFieldLabel(warning.field)')
    expect(drawer).toContain('launchIssueItemLabel(warning.itemId)')
    expect(drawer).toContain('{{ warning.code }}')
    expect(drawer).toContain('提醒项')
  })

  it('加载失败展示内联错误与重试按钮，并防止旧响应覆盖', () => {
    expect(drawer).toContain('error')
    expect(drawer).toContain('上线检查加载失败，请稍后重试')
    expect(drawer).toContain('el-skeleton')
    expect(drawer).toContain('重试')
    expect(drawer).toContain('requestSeq')
    expect(drawer).toContain('if (seq !== requestSeq) return')
  })

  it('模式说明明确订单与产品线共用共享门槛、订单分支专属检查暂未接入', () => {
    expect(drawer).toContain('launchReadinessModeNote(readiness.designMode)')
    expect(clean(helperSource)).toContain('共用同一套上线门槛')
    expect(clean(helperSource)).toContain('订单分支专属检查')
    expect(clean(helperSource)).toContain('暂未接入')
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

  it('按钮 title 说明共享门槛与订单分支专属检查尚未接入', () => {
    expect(editor).toContain('产品线与本单设计共用同一套上线门槛')
    expect(editor).toContain('订单分支专属检查暂未接入')
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

  it('没保存成功的修改会提示检查可能不是最新，而不是静默打开', () => {
    expect(editor).toContain('还有改动尚未保存成功')
    expect(editor).toContain('本次上线检查基于服务器上已保存的版本')
  })
})
