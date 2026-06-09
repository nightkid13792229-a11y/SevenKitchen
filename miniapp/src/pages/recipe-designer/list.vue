<template>
  <view class="recipe-designer-list-page">
    <view class="toolbar">
      <view class="toolbar-title-block">
        <text class="page-title">食谱设计器</text>
        <text class="page-subtitle">{{ listSubtitle }}</text>
      </view>
      <view class="toolbar-actions">
        <button v-if="canManageSupplementLibrary" class="library-btn" @tap="goToSupplementLibrary">补剂库</button>
        <button class="new-btn" :disabled="creating" @tap="openCreateDraftSheet">
          新建食谱
        </button>
      </view>
    </view>

    <view v-if="loading" class="state-block">
      <text>加载中...</text>
    </view>

    <view v-else-if="series.length === 0" class="state-block">
      <text class="empty-title">{{ emptyTitle }}</text>
      <text class="empty-subtitle">{{ emptySubtitle }}</text>
    </view>

    <view v-else class="series-list">
      <view
        v-for="seriesItem in series"
        :key="seriesItem.id"
        class="series-card"
      >
        <view class="series-header">
          <view class="series-title-block">
            <text class="series-name">{{ seriesItem.name || '未命名食谱' }}</text>
            <text class="series-meta">
              {{ formatSeriesMeta(seriesItem) }}
            </text>
          </view>
          <view class="series-actions" @tap.stop>
            <button
              class="series-more-btn"
              :disabled="renamingSeriesId === seriesItem.id || deletingSeriesId === seriesItem.id"
              @tap.stop="openSeriesActionSheet(seriesItem)"
            >
              ⋯
            </button>
          </view>
        </view>

        <view class="stage-list">
          <view
            v-for="stage in getSeriesStages(seriesItem)"
            :key="`${seriesItem.id}-${stage.lifeStage}`"
            class="stage-row"
            @tap.stop="openSeriesStage(seriesItem, stage)"
          >
            <view class="stage-copy">
              <text class="stage-label">{{ stage.label || getScenarioLabel(stage.scenario) }}</text>
              <text class="stage-scenario">{{ getScenarioLabel(stage.scenario) }}</text>
            </view>
            <view class="stage-status-block">
              <text class="status-badge" :class="getStageStatusClass(stage)">
                {{ getStageStatusLabel(stage) }}
              </text>
              <text class="stage-updated">{{ formatDateTime(stage.updatedAt) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view v-if="createSheetVisible" class="create-sheet-mask" @tap="closeCreateDraftSheet">
      <view class="create-sheet-panel" @tap.stop>
        <view class="sheet-header">
          <text class="sheet-title">新建食谱</text>
        </view>

        <view class="scenario-section">
          <text class="sheet-label scenario-section-label">生命阶段</text>
          <view class="scenario-option-list">
            <view
              v-for="option in scenarioOptions"
              :key="option.value"
              class="scenario-option"
              :class="{ 'scenario-option-active': option.value === newDraftScenario }"
              @tap="selectScenarioOption(option.value)"
            >
              <view class="scenario-option-main">
                <text class="scenario-option-title">{{ option.label }}</text>
                <text v-if="option.value === newDraftScenario" class="scenario-option-check">✓</text>
              </view>
              <text v-if="getScenarioDescription(option.value)" class="scenario-option-desc">
                {{ getScenarioDescription(option.value) }}
              </text>
            </view>
          </view>
        </view>

        <view class="sheet-actions">
          <button class="cancel-btn" :disabled="creating" @tap="closeCreateDraftSheet">取消</button>
          <button class="confirm-btn" :disabled="creating" @tap="createSeries">
            {{ creating ? '创建中' : '开始设计' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  FEDIAF_DOG_SCENARIO_DESCRIPTIONS,
  FEDIAF_DOG_SCENARIO_LABELS,
  recipeDesignerApi,
  type FediafDogScenario,
  type RecipeDesignerSeriesCard,
  type RecipeDesignerSeriesStage,
  type RecipeSeriesStageStatus,
} from '../../api/recipe-designer'
import { getScenarioLabel } from './assessment'

const defaultSeriesStages: RecipeDesignerSeriesStage[] = [
  {
    lifeStage: 'EARLY_GROWTH_REPRODUCTION',
    label: FEDIAF_DOG_SCENARIO_LABELS.EARLY_GROWTH_REPRODUCTION,
    scenario: 'EARLY_GROWTH_REPRODUCTION',
    status: 'NOT_DESIGNED',
  },
  {
    lifeStage: 'LATE_GROWTH',
    label: FEDIAF_DOG_SCENARIO_LABELS.LATE_GROWTH,
    scenario: 'LATE_GROWTH',
    status: 'NOT_DESIGNED',
  },
  {
    lifeStage: 'ADULT_MER_95',
    label: FEDIAF_DOG_SCENARIO_LABELS.ADULT_MER_95,
    scenario: 'ADULT_MER_95',
    status: 'NOT_DESIGNED',
  },
  {
    lifeStage: 'ADULT_MER_110',
    label: FEDIAF_DOG_SCENARIO_LABELS.ADULT_MER_110,
    scenario: 'ADULT_MER_110',
    status: 'NOT_DESIGNED',
  },
  {
    lifeStage: 'REPRODUCTION',
    label: FEDIAF_DOG_SCENARIO_LABELS.REPRODUCTION,
    scenario: 'REPRODUCTION',
    status: 'NOT_DESIGNED',
  },
]

const seriesStageStatusLabels: Record<RecipeSeriesStageStatus, string> = {
  NOT_DESIGNED: '未设计',
  DRAFT: '草稿',
  MODIFIED: '已修改',
  IN_REVIEW: '审核中',
  PUBLISHED: '已发布',
  NEEDS_CHANGES: '需修改',
}

const series = ref<RecipeDesignerSeriesCard[]>([])
const loading = ref(false)
const creating = ref(false)
const deletingSeriesId = ref('')
const renamingSeriesId = ref('')
const openingStageKey = ref('')
const createSheetVisible = ref(false)
const newDraftScenario = ref<FediafDogScenario>('ADULT_MER_110')
const currentUserRole = ref('')

const scenarioOptions: Array<{ label: string; value: FediafDogScenario }> = [
  { label: FEDIAF_DOG_SCENARIO_LABELS.EARLY_GROWTH_REPRODUCTION, value: 'EARLY_GROWTH_REPRODUCTION' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.LATE_GROWTH, value: 'LATE_GROWTH' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.ADULT_MER_95, value: 'ADULT_MER_95' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.ADULT_MER_110, value: 'ADULT_MER_110' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.REPRODUCTION, value: 'REPRODUCTION' },
]

const isCustomerMode = computed(() => {
  return currentUserRole.value !== 'STAFF' && currentUserRole.value !== 'ADMIN'
})

const canManageSupplementLibrary = computed(() => !isCustomerMode.value)

const listSubtitle = computed(() =>
  isCustomerMode.value ? '按生命阶段维护通用食谱草稿' : '食谱系列与生命阶段',
)

const emptyTitle = computed(() =>
  isCustomerMode.value ? '暂无食谱草稿' : '暂无食谱系列',
)

const emptySubtitle = computed(() =>
  isCustomerMode.value ? '点击新建食谱开始设计' : '点击新建食谱开始设计',
)

onShow(() => {
  currentUserRole.value = getCurrentUserRole()
  loadSeries()
})

async function loadSeries() {
  loading.value = true
  try {
    const res: any = await recipeDesignerApi.listSeries()
    const data = res?.data ?? res
    series.value = Array.isArray(data) ? data : data?.items || data?.series || []
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to load series:', error)
    uni.showToast({ title: '加载食谱系列失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function openCreateDraftSheet() {
  if (creating.value) return
  createSheetVisible.value = true
}

function closeCreateDraftSheet() {
  if (creating.value) return
  createSheetVisible.value = false
}

function selectScenarioOption(value: FediafDogScenario) {
  if (creating.value) return
  newDraftScenario.value = value
}

function getScenarioDescription(value: FediafDogScenario) {
  return FEDIAF_DOG_SCENARIO_DESCRIPTIONS[value] || ''
}

async function createSeries() {
  if (creating.value) return

  creating.value = true
  try {
    const res: any = await recipeDesignerApi.createSeries({
      name: '未命名食谱',
      scenario: newDraftScenario.value,
    })
    const created = res?.data ?? res
    const draftId = extractInitialDraftId(created)
    createSheetVisible.value = false
    newDraftScenario.value = 'ADULT_MER_110'
    if (draftId) {
      uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draftId}` })
      return
    }
    await loadSeries()
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to create series:', error)
    uni.showToast({ title: '创建食谱失败', icon: 'none' })
  } finally {
    creating.value = false
  }
}

function extractInitialDraftId(payload: any) {
  return (
    payload?.initialDraftId ||
    payload?.draftId ||
    payload?.draft?.id ||
    payload?.initialDraft?.id ||
    payload?.stages?.find((stage: any) => stage?.draftId)?.draftId ||
    ''
  )
}

function getSeriesStages(seriesItem: RecipeDesignerSeriesCard) {
  const stages = Array.isArray(seriesItem.stages) ? seriesItem.stages : []
  return defaultSeriesStages.map((defaultStage) => {
    const stage = stages.find(
      (candidate) =>
        candidate.lifeStage === defaultStage.lifeStage ||
        candidate.scenario === defaultStage.scenario,
    )
    return {
      ...defaultStage,
      ...(stage || {}),
    }
  })
}

async function openSeriesStage(seriesItem: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  const stageKey = `${seriesItem.id}:${stage.lifeStage}`
  if (openingStageKey.value) return

  const draftId = getCustomerStageDraftId(stage)
  if (draftId) {
    uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draftId}` })
    return
  }

  const templateStages = isCustomerMode.value ? [] : getPublishedTemplateStages(seriesItem, stage)
  if (templateStages.length > 0) {
    openStageTemplateSheet(seriesItem, stage, templateStages)
    return
  }

  await createSeriesStageDraft(seriesItem, stage)
}

function openStageTemplateSheet(
  seriesItem: RecipeDesignerSeriesCard,
  stage: RecipeDesignerSeriesStage,
  templateStages: RecipeDesignerSeriesStage[],
) {
  uni.showActionSheet({
    title: '选择起始方式',
    itemList: ['空白开始', ...templateStages.map((template) => `复制${getStageTemplateLabel(template)}`)],
    success: (result: any) => {
      const selectedTemplate = templateStages[result.tapIndex - 1]
      void createSeriesStageDraft(seriesItem, stage, selectedTemplate)
    },
  })
}

async function createSeriesStageDraft(
  seriesItem: RecipeDesignerSeriesCard,
  stage: RecipeDesignerSeriesStage,
  selectedTemplate?: RecipeDesignerSeriesStage,
) {
  const stageKey = `${seriesItem.id}:${stage.lifeStage}`
  openingStageKey.value = stageKey
  try {
    const payload = selectedTemplate?.draftId
      ? { scenario: stage.scenario, sourceDraftId: selectedTemplate.draftId }
      : { scenario: stage.scenario }
    const res: any = await recipeDesignerApi.createSeriesStageDraft(seriesItem.id, payload)
    const draft = res?.data ?? res
    const draftId = draft?.id || draft?.draftId || draft?.draft?.id
    if (!draftId) {
      uni.showToast({ title: '进入阶段失败', icon: 'none' })
      await loadSeries()
      return
    }
    uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draftId}` })
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to open series stage:', error)
    uni.showToast({ title: '进入阶段失败', icon: 'none' })
  } finally {
    openingStageKey.value = ''
  }
}

function formatSeriesMeta(seriesItem: RecipeDesignerSeriesCard) {
  const editedText = `最近编辑 ${formatDateTime(seriesItem.updatedAt)}`
  if (isCustomerMode.value) {
    return editedText
  }
  return `${editedText} · 已发布 ${seriesItem.publishedStageCount || 0}/5`
}

function getCustomerStageDraftId(stage: RecipeDesignerSeriesStage) {
  if (isCustomerMode.value && stage.status === 'PUBLISHED') {
    return ''
  }
  return stage.draftId || ''
}

function getStageStatusLabel(stage: RecipeDesignerSeriesStage) {
  if (isCustomerMode.value && stage.status === 'PUBLISHED') {
    return seriesStageStatusLabels.NOT_DESIGNED
  }
  return seriesStageStatusLabels[stage.status] || stage.status
}

function getStageStatusClass(stage: RecipeDesignerSeriesStage) {
  const status = isCustomerMode.value && stage.status === 'PUBLISHED'
    ? 'NOT_DESIGNED'
    : stage.status
  return `stage-status-${status}`
}

function getPublishedTemplateStages(
  seriesItem: RecipeDesignerSeriesCard,
  targetStage: RecipeDesignerSeriesStage,
) {
  return getSeriesStages(seriesItem).filter(
    (stage) =>
      stage.lifeStage !== targetStage.lifeStage &&
      stage.status === 'PUBLISHED' &&
      Boolean(stage.draftId),
  )
}

function getStageTemplateLabel(stage: RecipeDesignerSeriesStage) {
  return stage.label || getScenarioLabel(stage.scenario)
}

function openSeriesActionSheet(seriesItem: RecipeDesignerSeriesCard) {
  if (renamingSeriesId.value === seriesItem.id || deletingSeriesId.value === seriesItem.id) return

  uni.showActionSheet({
    itemList: ['重命名', '删除'],
    success: (result: any) => {
      if (result.tapIndex === 0) {
        renameSeries(seriesItem)
        return
      }
      if (result.tapIndex === 1) {
        deleteSeries(seriesItem)
      }
    },
  })
}

function renameSeries(seriesItem: RecipeDesignerSeriesCard) {
  if (renamingSeriesId.value) return

  const currentName = seriesItem.name || '未命名食谱'
  uni.showModal({
    title: '重命名食谱',
    content: `当前名称：${currentName}`,
    editable: true,
    placeholderText: '请输入食谱名称',
    confirmText: '保存',
    cancelText: '取消',
    success: async (result: any) => {
      if (!result.confirm) return

      const nextName = String(result.content || '').trim()
      if (!nextName) {
        uni.showToast({ title: '请输入食谱名称', icon: 'none' })
        return
      }
      if (nextName === currentName) return

      renamingSeriesId.value = seriesItem.id
      try {
        await recipeDesignerApi.renameSeries(seriesItem.id, { name: nextName })
        series.value = series.value.map((candidate) =>
          candidate.id === seriesItem.id
            ? { ...candidate, name: nextName, updatedAt: new Date().toISOString() }
            : candidate,
        )
        uni.showToast({ title: '已重命名', icon: 'success' })
      } catch (error) {
        console.error('[RecipeDesignerList] Failed to rename series:', error)
        uni.showToast({ title: '重命名失败', icon: 'none' })
      } finally {
        renamingSeriesId.value = ''
      }
    },
  })
}

function deleteSeries(seriesItem: RecipeDesignerSeriesCard) {
  if (deletingSeriesId.value) return

  const seriesName = seriesItem.name || '未命名食谱'
  uni.showModal({
    title: '删除食谱系列',
    content: `删除「${seriesName}」会移除用户可见的整个系列。请输入完整名称确认。`,
    editable: true,
    placeholderText: seriesName,
    confirmText: '删除',
    confirmColor: '#cf1322',
    cancelText: '取消',
    success: async (result: any) => {
      if (!result.confirm) return

      const confirmName = String(result.content || '').trim()
      if (confirmName !== seriesName) {
        uni.showToast({ title: '名称不匹配', icon: 'none' })
        return
      }

      deletingSeriesId.value = seriesItem.id
      try {
        await recipeDesignerApi.deleteSeries(seriesItem.id, {
          confirmName,
          confirmUserVisibleRemoval: true,
        })
        await loadSeries()
        uni.showToast({ title: '已删除', icon: 'success' })
      } catch (error) {
        console.error('[RecipeDesignerList] Failed to delete series:', error)
        uni.showToast({ title: '删除失败', icon: 'none' })
      } finally {
        deletingSeriesId.value = ''
      }
    },
  })
}

function goToSupplementLibrary() {
  uni.navigateTo({ url: '/pages/recipe-designer/supplement-library' })
}

function getCurrentUserRole() {
  try {
    const rawUserInfo = uni.getStorageSync('userInfo') || uni.getStorageSync('user')
    const userInfo =
      typeof rawUserInfo === 'string'
        ? rawUserInfo
          ? JSON.parse(rawUserInfo)
          : null
        : rawUserInfo
    return String(userInfo?.role || userInfo?.user?.role || '').toUpperCase()
  } catch (error) {
    console.warn('[RecipeDesignerList] Failed to read current user role:', error)
    return ''
  }
}

function formatDateTime(value?: string) {
  if (!value) return '未更新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}
</script>

<style scoped lang="scss">
.recipe-designer-list-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx 32rpx 48rpx;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  margin-bottom: 24rpx;
}

.toolbar-title-block {
  flex: 1;
  min-width: 0;
}

.toolbar-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.page-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #222;
}

.page-subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #777;
}

.new-btn,
.library-btn {
  flex-shrink: 0;
  height: 72rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 12rpx;
  font-size: 26rpx;
  line-height: 72rpx;
}

.new-btn {
  background: #1890ff;
  color: #fff;
}

.library-btn {
  background: #fff;
  color: #1677ff;
  border: 1rpx solid #b7d9ff;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 360rpx;
  color: #888;
  font-size: 28rpx;
}

.empty-title {
  color: #333;
  font-size: 30rpx;
  margin-bottom: 12rpx;
}

.empty-subtitle {
  color: #999;
  font-size: 24rpx;
}

.series-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.series-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 28rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.series-header,
.series-actions,
.stage-row,
.stage-status-block {
  display: flex;
  align-items: center;
}

.series-header {
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 20rpx;
}

.series-title-block {
  flex: 1;
  min-width: 0;
}

.series-name {
  display: block;
  overflow: hidden;
  color: #222;
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.series-meta {
  display: block;
  margin-top: 8rpx;
  color: #777;
  font-size: 23rpx;
  line-height: 1.4;
}

.series-actions {
  flex-shrink: 0;
}

.series-more-btn {
  flex-shrink: 0;
  width: 56rpx;
  height: 56rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  background: #f0f6ff;
  color: #1677ff;
  font-size: 32rpx;
  font-weight: 700;
  line-height: 48rpx;
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.stage-row {
  justify-content: space-between;
  gap: 18rpx;
  min-height: 92rpx;
  padding: 16rpx 18rpx;
  border: 1rpx solid #edf0f5;
  border-radius: 10rpx;
  background: #fbfcfe;
  box-sizing: border-box;
}

.stage-copy {
  flex: 1;
  min-width: 0;
}

.stage-label {
  display: block;
  overflow: hidden;
  color: #222;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-scenario,
.stage-updated {
  display: block;
  margin-top: 6rpx;
  color: #888;
  font-size: 22rpx;
  line-height: 1.35;
}

.stage-status-block {
  flex-shrink: 0;
  flex-direction: column;
  align-items: flex-end;
}

.status-badge {
  flex-shrink: 0;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  background: #edf4ff;
  color: #1677ff;
  font-size: 22rpx;
}

.stage-status-NOT_DESIGNED {
  background: #f5f5f5;
  color: #777;
}

.stage-status-DRAFT {
  background: #fff7e6;
  color: #d46b08;
}

.stage-status-MODIFIED {
  background: #fffbe6;
  color: #ad8b00;
}

.stage-status-IN_REVIEW {
  background: #f0f6ff;
  color: #1677ff;
}

.stage-status-PUBLISHED {
  background: #f6ffed;
  color: #389e0d;
}

.stage-status-NEEDS_CHANGES {
  background: #fff1f0;
  color: #cf1322;
}

.create-sheet-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.38);
}

.create-sheet-panel {
  width: 100%;
  max-height: 86vh;
  overflow-y: auto;
  padding: 28rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  border-radius: 24rpx 24rpx 0 0;
  background: #fff;
  box-sizing: border-box;
}

.sheet-header,
.sheet-actions {
  display: flex;
  align-items: center;
}

.sheet-header {
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 28rpx;
}

.sheet-title {
  display: block;
  color: #222;
  font-size: 34rpx;
  font-weight: 700;
}

.sheet-label {
  flex-shrink: 0;
  color: #666;
  font-size: 26rpx;
}

.scenario-section {
  padding-top: 24rpx;
  border-top: 1rpx solid #f0f0f0;
}

.scenario-section-label {
  display: block;
  margin-bottom: 16rpx;
}

.scenario-option-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.scenario-option {
  padding: 18rpx 20rpx;
  border: 1rpx solid #edf0f5;
  border-radius: 12rpx;
  background: #fbfcfe;
  box-sizing: border-box;
}

.scenario-option-active {
  border-color: #91caff;
  background: #eef8ff;
}

.scenario-option-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.scenario-option-title {
  flex: 1;
  min-width: 0;
  color: #222;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1.35;
}

.scenario-option-check {
  flex-shrink: 0;
  color: #1677ff;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1;
}

.scenario-option-desc {
  display: block;
  margin-top: 8rpx;
  color: #777;
  font-size: 23rpx;
  line-height: 1.45;
}

.sheet-actions {
  gap: 16rpx;
  margin-top: 28rpx;
}

.cancel-btn,
.confirm-btn {
  flex: 1;
  height: 76rpx;
  margin: 0;
  border-radius: 10rpx;
  font-size: 28rpx;
  line-height: 76rpx;
}

.cancel-btn {
  background: #f0f6ff;
  color: #1677ff;
}

.confirm-btn {
  background: #1890ff;
  color: #fff;
}
</style>
