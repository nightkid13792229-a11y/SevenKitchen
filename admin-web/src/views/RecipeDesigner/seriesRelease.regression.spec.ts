import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/SeriesReleaseDrawer.vue?raw'
import indexSource from '@/views/RecipeDesigner/index.vue?raw'
import editorSource from '@/views/RecipeDesigner/Editor.vue?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import typeSource from '@/types/recipeDesigner.ts?raw'
import utilsSource from '@/utils/recipeDesigner/seriesRelease.ts?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('系列发布 · API 与类型契约', () => {
  it('三个接口路径与后端 controller 一致', () => {
    expect(apiSource).toContain('getSeriesReleaseReadiness')
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/release-readiness`'
    )
    expect(apiSource).toContain('updateSeriesReleaseSettings')
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/release-settings`'
    )
    expect(apiSource).toContain('releaseSeries')
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/release`'
    )
  })

  it('下架接口与后端 POST /series/:id/unpublish 一致', () => {
    expect(apiSource).toContain('unpublishSeries')
    expect(apiSource).toContain(
      '`/recipe-designer/series/${seriesId}/unpublish`'
    )
    expect(typeSource).toContain('SeriesUnpublishResult')
    expect(typeSource).toContain('unpublishedRecipeCount')
    expect(typeSource).toContain('remainingPublicRecipeCount')
  })

  it('类型覆盖四档阶段状态、问题归属与设置 payload', () => {
    for (const status of ["'EMPTY'", "'DRAFT'", "'READY'", "'PUBLIC'"]) {
      expect(typeSource).toContain(status)
    }
    expect(typeSource).toContain(
      "export type SeriesReleaseStageStatus ="
    )
    expect(typeSource).toContain('SeriesReleaseBlockerCode')
    expect(typeSource).toContain('COVER_IMAGE_REQUIRED')
    expect(typeSource).toContain('SELLING_POINT_REQUIRED')
    expect(typeSource).toContain('SeriesReleaseWarningCode')
    expect(typeSource).toContain('COVER_BADGE_MISSING')
    for (const field of [
      'coverImageUrl?: string | null',
      'coverTitle?: string | null',
      'sellingPoint?: string | null'
    ]) {
      expect(typeSource).toContain(field)
    }
    const settingsPayloadStart = typeSource.indexOf(
      'export interface UpdateRecipeSeriesReleaseSettingsPayload'
    )
    expect(settingsPayloadStart).toBeGreaterThan(-1)
    const settingsPayload = typeSource.slice(
      settingsPayloadStart,
      typeSource.indexOf('}', settingsPayloadStart)
    )
    expect(settingsPayload.length).toBeGreaterThan(0)
    expect(settingsPayload).not.toContain('requiredLifeStages')
    expect(settingsPayload).not.toContain('targetHealthTags')
    expect(typeSource).toContain('latestRecipeVersion?: number | null')
    expect(typeSource).not.toContain(
      'requiredStages: SeriesReleaseStageReadiness[]'
    )
    expect(typeSource).toContain('actionable: boolean')
    expect(typeSource).toContain('canRelease: boolean')
    expect(typeSource).toContain('coverBadges: string[]')
    for (const field of [
      'totalStageCount: number',
      'publishableStageCount: number',
      'pendingStageCount: number',
      'publishedStageCount: number',
      'upToDateStageCount: number',
      'designedStageCount: number',
      'actionableStageCount: number'
    ]) {
      expect(typeSource).toContain(field)
    }
    expect(typeSource).toContain('blockers: SeriesReleaseBlocker[]')
    expect(typeSource).toContain('warnings: SeriesReleaseWarning[]')
  })

  it('类型覆盖重新发布 / 下架新增字段', () => {
    expect(typeSource).toContain(
      "export type SeriesReleaseState ="
    )
    for (const state of [
      "'UNPUBLISHED'",
      "'PUBLISHED'",
      "'NEEDS_UPDATE'"
    ]) {
      expect(typeSource).toContain(state)
    }
    for (const field of [
      'businessStatus: string',
      'releaseState: SeriesReleaseState',
      'hasPendingUpdates: boolean',
      'pendingStageCodes: string[]',
      'pendingStageCount: number',
      'publishedRecipeVersion?: number | null',
      'hasPendingUpdate?: boolean'
    ]) {
      expect(typeSource).toContain(field)
    }
  })
})

describe('系列发布抽屉', () => {
  const drawer = clean(drawerSource)

  it('打开即并行拉门槛与封面角标，并展示阶段清单 / 最新版本 / 阻断与提醒', () => {
    expect(drawer).toContain('recipeDesignerApi.getSeriesReleaseReadiness(')
    expect(drawer).toContain('recipeSeriesCoverBadgeApi')
    expect(drawer).toContain('.get(props.seriesId)')
    expect(drawer).toContain('Promise.all')
    expect(drawer).toContain('buildSeriesReleaseForm(')
    expect(drawer).toContain('v-for="stage in readiness.stages"')
    expect(drawer).toContain('seriesReleaseStageStatusLabel(stage.status)')
    expect(drawer).toContain('formatSeriesReleaseStageVersion(stage)')
    expect(drawer).toContain('blockerGroups')
    expect(drawer).toContain('warningGroups')
    expect(drawer).toContain('readiness.blockers.length')
    expect(drawer).toContain('readiness.warnings.length')
    expect(drawer).toContain('seriesReleaseProgress(readiness.value)')
  })

  it('uses stage scope selection instead of required life stages', () => {
    expect(drawer).toContain('selectedStageCodes')
    expect(drawer).toContain('v-model="selectedStageCodes"')
    expect(drawer).toContain('resolveSeriesReleaseDefaultSelectedStageCodes')
    expect(drawer).toContain('seriesReleaseStageScopeLabel(stage)')
    expect(drawer).not.toContain('form.requiredLifeStages')
    expect(drawer).not.toContain('requiredLifeStages')
  })

  it('首次发布不渲染勾选框，更新时只勾选可操作阶段', () => {
    // 勾选框与 isFirstRelease / actionable 必须写在同一个 v-if 里：
    // 首次发布整行不渲染，更新时非可操作阶段也不渲染
    expect(drawer).toContain('v-if="!isFirstRelease && stage.actionable"')
    expect(drawer).toContain('resolveSeriesReleaseActionableStages(')
    expect(drawer).toContain('readiness.summary.publishableStageCount')
  })

  it('edits cover, badge and selling point only, with upload-only cover', () => {
    // 封面只读展示（封面框 + 顾客预览），只能通过 el-upload 上传
    expect(drawer).toContain(':src="form.coverImageUrl"')
    expect(drawer).toContain('v-model="form.sellingPoint"')
    expect(drawer).toContain('v-model="form.coverBadgeHealthTagIds"')
    expect(drawer).toContain('eligibleHealthTags')
    expect(drawer).toContain('coverBadgeEligible')
    expect(drawer).toContain('hiddenBadges')
    expect(drawer).toContain(':multiple-limit="2"')
    expect(drawer).toContain('recipeHealthTagApi.list()')
    expect(drawer).toContain('recipeSeriesCoverBadgeApi')
    expect(drawer).toContain('recipeApi.uploadImage(file)')
    expect(drawer).toContain('最多 2 个；不选就不显示')
    // 不提供外链粘贴输入（设计稿：封面只能走系统上传）
    expect(drawer).not.toContain('v-model="form.coverImageUrl"')
    expect(drawer).not.toContain('或粘贴已有封面图地址')
    expect(drawer).not.toContain('form.coverTitle')
    expect(drawer).not.toContain('form.targetHealthTags')
  })

  it('保留封面上传与卖点长度限制', () => {
    expect(drawer).toContain('handleCoverUpload')
    expect(drawer).toContain('recipeApi.uploadImage(file)')
    expect(drawer).toContain('RECIPE_PRESENTATION_LIMITS.sellingPoint')
    expect(drawer).toContain('accept="image/jpeg,image/png,image/webp"')
  })

  it('previews the customer cover and sends selected stages', () => {
    expect(drawer).toContain('顾客看到的样子')
    expect(drawer).toContain('coverBadgeText')
    expect(drawer).toContain('releaseSeries(props.seriesId, { stageCodes')
    expect(drawer).toContain('releaseSeries(props.seriesId)')
    expect(drawer).toContain('readiness.canRelease')
    expect(drawer).toContain('seriesReleasePrimaryActionVerb(')
    expect(drawer).not.toContain('seriesReleasePrimaryActionLabel')
    expect(drawer).toContain('selectedStageCodes.length === 0')
  })

  it('保存先设置后角标，角标失败不回滚设置', () => {
    expect(drawer).toContain('buildSeriesReleaseSettingsPatch(form, baseline.value)')
    expect(drawer).toContain('isSeriesReleaseBadgesDirty(form, baseline.value)')
    expect(drawer).toContain('recipeDesignerApi.updateSeriesReleaseSettings(')
    expect(drawer).toContain('recipeSeriesCoverBadgeApi.save(')
    const saveFn = drawer.slice(
      drawer.indexOf('async function saveSettings'),
      drawer.indexOf('async function handleRelease')
    )
    expect(saveFn).toContain('await loadReadiness(true)')
    expect(saveFn.indexOf('updateSeriesReleaseSettings(')).toBeGreaterThan(-1)
    expect(saveFn.indexOf('updateSeriesReleaseSettings(')).toBeLessThan(
      saveFn.indexOf('recipeSeriesCoverBadgeApi.save(')
    )
    expect(saveFn).toContain('设置已保存，但角标未保存成功，请重试')
    // 只有角标变化时也必须能保存：提前返回只允许在「设置和角标都没变」时发生
    expect(saveFn).toContain('if (!hasSettingsPatch && !hasBadgePatch)')
  })

  it('保存后刷新只保留仍可操作的阶段勾选', () => {
    expect(drawer).toContain('syncSelectedStageCodes(')
    const syncFn = drawer.slice(
      drawer.indexOf('function syncSelectedStageCodes'),
      drawer.indexOf('async function loadReadiness')
    )
    expect(syncFn).toContain('selectedStagesInitialized')
    // 首次打开按后端默认值（更新 = 全部可操作阶段）
    expect(syncFn).toContain(
      'resolveSeriesReleaseDefaultSelectedStageCodes(result)'
    )
    // 下架后回到首次发布，勾选清空
    expect(syncFn).toContain("resolveSeriesReleaseState(result) === 'UNPUBLISHED'")
    // 刷新 / 保存后只保留仍 actionable 的用户勾选，不重新全选
    expect(syncFn).toContain('selectedStageCodes.value.filter(')
    expect(syncFn).toContain('actionable.has(stageCode)')
    const loadFn = drawer.slice(
      drawer.indexOf('async function loadReadiness'),
      drawer.indexOf('async function loadHealthTags')
    )
    expect(loadFn).toContain('syncSelectedStageCodes(result)')
  })

  it('发布 / 更新确认框列出本次涉及的阶段', () => {
    const releaseFn = drawer.slice(
      drawer.indexOf('async function handleRelease'),
      drawer.indexOf('async function handleUnpublish')
    )
    // 首次发布只列 READY 阶段，更新只列勾选的阶段；
    // 把更新分支改成「所有阶段」或去掉 READY 过滤，这里都会红。
    const stageCodesFn = drawer.slice(
      drawer.indexOf('const releaseStageCodes = computed'),
      drawer.indexOf('const releaseStageLabels = computed')
    )
    expect(stageCodesFn).toMatch(
      /isFirstRelease\.value\s*\?\s*\(readiness\.value\?\.stages \?\? \[\]\)[\s\S]*?stage\.status === 'READY'[\s\S]*?:\s*selectedStageCodes\.value/
    )
    expect(stageCodesFn).toContain("stage.status === 'READY'")
    expect(stageCodesFn).toMatch(/:\s*selectedStageCodes\.value/)
    expect(drawer).toContain('const releaseStageLabels = computed(')
    expect(releaseFn).toContain(
      "const stageList = releaseStageLabels.value.join('、')"
    )
    expect(releaseFn).toContain('将更新「${seriesName}」的 ${releaseStageCount.value} 个阶段：${stageList}')
    expect(releaseFn).toContain('将发布「${seriesName}」的 ${releaseStageCount.value} 个阶段：${stageList}')
    expect(releaseFn).toContain('await ElMessageBox.confirm(message')
  })

  it('只有管理员能发布；按钮文案与禁用条件跟随 canRelease / 勾选', () => {
    expect(drawer).toContain('useIsAdmin')
    expect(drawer).toContain('ADMIN_ONLY_TIP')
    expect(drawer).toContain(
      ':disabled="dirty || !readiness.canRelease || (isUpdate && selectedStageCodes.length === 0)'
    )
    expect(drawer).toContain('recipeDesignerApi.releaseSeries(')
    expect(drawer).toContain("emit('released', result)")
    expect(drawer).toContain('seriesReleasePrimaryActionVerb(')
  })

  it('头部展示状态与「已是最新 / 可发布 / 可更新 / 未就绪」', () => {
    expect(drawer).toContain('releaseStateLabel')
    expect(drawer).toContain('releaseStateTagType')
    expect(drawer).toContain('seriesReleaseStateLabel(')
    expect(drawer).toContain('resolveSeriesReleaseState(')
    expect(drawer).toContain('已是最新')
    expect(drawer).toContain('可发布')
    expect(drawer).toContain('可更新')
    expect(drawer).toContain('未就绪')
    expect(drawer).toContain('待更新 {{ pendingStageCount }} 个阶段')

    // 「已是最新」只在已上线、没有待更新、也没有可操作阶段时出现。
    // 三个条件必须按顺序用 && 组合：把 && 改成 || 或删掉任一条，这里都会红。
    const tagFn = drawer.slice(
      drawer.indexOf('const availabilityTag = computed'),
      drawer.indexOf('const canUnpublish = computed')
    )
    expect(tagFn).toMatch(
      /isUpdate\.value\s*&&\s*pendingStageCount\.value === 0\s*&&\s*actionableStageCodes\.value\.length === 0/
    )
    // canRelease 门必须存在：没就绪 / 没可操作阶段时不能显示可发布 / 可更新
    expect(tagFn).toContain('if (readiness.value.canRelease)')
    expect(tagFn).toContain("label: '已是最新'")
    expect(tagFn).toContain("label: isFirstRelease.value ? '可发布' : '可更新'")
    expect(tagFn).toContain("label: '未就绪'")
  })

  it('底部提示按 dirty / 阻断 / 无可用阶段 / 待更新 / 将发布顺序展示', () => {
    const dirtyIndex = drawer.indexOf('发布设置还有未保存的修改')
    const blockersIndex = drawer.indexOf('readiness.blockers.length > 0')
    const emptyIndex = drawer.indexOf('releaseStageCount === 0')
    const pendingIndex = drawer.indexOf('v-else-if="pendingStageCount > 0"')
    const actionIndex = drawer.indexOf('将{{ actionVerb }}')

    expect(dirtyIndex).toBeGreaterThan(-1)
    expect(blockersIndex).toBeGreaterThan(dirtyIndex)
    expect(emptyIndex).toBeGreaterThan(blockersIndex)
    expect(pendingIndex).toBeGreaterThan(emptyIndex)
    expect(actionIndex).toBeGreaterThan(pendingIndex)
  })

  it('阶段清单展示发布范围、提示与版本', () => {
    expect(drawer).toContain('isSeriesReleaseStagePendingUpdate(stage)')
    expect(drawer).toContain('有更新')
    expect(drawer).toContain('seriesReleaseStageHint(stage)')
    expect(drawer).toContain('全选')
    expect(drawer).toContain('清空')
    expect(drawer).toContain('还没有可发布的阶段')
  })

  it('管理员可下架已上线 / 待重新发布系列，确认后调用下架接口', () => {
    expect(drawer).toContain('canUnpublishSeries(')
    expect(drawer).toContain('v-if="isAdmin && canUnpublish"')
    expect(drawer).toContain('下架整个系列')
    expect(drawer).toContain('recipeDesignerApi.unpublishSeries(')
    expect(drawer).toContain("emit('updated', result)")
    // 下架后重新拉门槛，保证抽屉里「未上线」状态与列表一致
    const unpublishFn = drawer.slice(
      drawer.indexOf('async function handleUnpublish'),
      drawer.indexOf('async function handleBeforeClose')
    )
    expect(unpublishFn).toContain('await loadReadiness(')
  })
})

describe('食谱设计器列表 · 系列发布入口', () => {
  const index = clean(indexSource)

  it('CATALOG 卡片挂载共用抽屉，入口文案按状态显示「更新 / 发布」', () => {
    expect(index).toContain(
      "import SeriesReleaseDrawer from './components/SeriesReleaseDrawer.vue'"
    )
    expect(index).toContain('@click="openSeriesReleaseDrawer(card)"')
    expect(index).toContain(':series-id="releaseDrawerSeriesId"')
    expect(index).toContain('@released="handleSeriesReleased"')
    expect(index).toContain('未发布的阶段可在「发布 / 更新」里查看')

    const labelFn = index.slice(
      index.indexOf('function seriesReleaseEntryLabel'),
      index.indexOf('function openSeriesReleaseDrawer')
    )
    expect(labelFn).toContain(
      "card.businessStatus === 'PUBLIC' ? '更新' : '发布'"
    )
    expect(labelFn).not.toContain('重新发布系列')
    expect(labelFn).not.toContain("'系列发布'")
  })

  it('卡片直接显示阶段进度（已发布 x/y），发布成功刷新列表', () => {
    expect(index).toContain('stageProgressLabel(card)')
    expect(index).toContain('card.publishedStageCount')
    expect(index).toContain('card.stages.length')
    const releasedFn = index.slice(
      index.indexOf('async function handleSeriesReleased'),
      index.indexOf('}', index.indexOf('async function handleSeriesReleased'))
    )
    expect(releasedFn).toContain('await loadSeries(true)')
  })

  it('卡片入口按 businessStatus 切换文案，有数据时才显示待更新数量', () => {
    expect(index).toContain('seriesReleaseEntryLabel(card)')
    expect(index).toContain("card.businessStatus === 'PUBLIC'")
    expect(index).toContain('cardPendingStageCount(card)')
    expect(index).toContain('hasCardPendingUpdates(card)')
    expect(index).toContain('待重新发布')
    expect(index).toContain('@updated="handleSeriesUpdated"')
    const updatedFn = index.slice(
      index.indexOf('async function handleSeriesUpdated'),
      index.indexOf('async function handleSeriesUpdated') + 200
    )
    expect(updatedFn).toContain('await loadSeries(true)')
  })

  it('不破坏现有阶段打开 / 复制 / 重命名 / 删除', () => {
    expect(index).toContain('@click="openStage(card, stage)"')
    expect(index).toContain("handleCardCommand('duplicate', card)")
    expect(index).toContain("handleCardCommand('rename', card)")
    expect(index).toContain("handleCardCommand('delete', card)")
    expect(index).toContain('command="duplicateStage"')
    expect(index).toContain('handleStageCommand(cmd, card, stage)')
  })
})

describe('编辑器 · 发布入口收口到食谱列表', () => {
  const editor = clean(editorSource)
  const list = clean(indexSource)

  it('编辑器不再挂载系列发布抽屉，也不再有顶部发布入口', () => {
    expect(editor).not.toContain(
      "import SeriesReleaseDrawer from './components/SeriesReleaseDrawer.vue'"
    )
    expect(editor).not.toContain('seriesReleaseVisible')
    expect(editor).not.toContain('handleSeriesReleased')
    expect(editor).not.toContain('发布 / 更新')
  })

  it('列表页仍是系列发布的唯一入口', () => {
    expect(list).toContain('<SeriesReleaseDrawer')
    expect(list).toContain('openSeriesReleaseDrawer(card)')
    expect(list).toContain('seriesReleaseEntryLabel')
  })

  it('上线检查里的发布入口改成去食谱列表，不再刷新当前草稿', () => {
    expect(editor).toContain('@go-to-series-list="goToSeriesListFromCheck"')
    const fnStart = editor.indexOf('function goToSeriesListFromCheck')
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = editor.indexOf('\n}\n', fnStart)
    const handler = editor.slice(fnStart, fnEnd)
    expect(handler).toContain('launchReadinessVisible.value = false')
    expect(handler).toContain("router.push('/recipe-designer')")
    expect(handler).not.toContain('loadDraft')
  })
})
