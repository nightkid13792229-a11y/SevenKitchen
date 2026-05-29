<template>
  <view class="recipe-designer-list-page">
    <view class="toolbar">
      <view class="toolbar-title-block">
        <text class="page-title">食谱设计器</text>
        <text class="page-subtitle">草稿食谱与评估状态</text>
      </view>
      <view class="toolbar-actions">
        <button class="library-btn" @tap="goToSupplementLibrary">补剂库</button>
        <button class="new-btn" :disabled="creating" @tap="openCreateDraftSheet">
          新建食谱
        </button>
      </view>
    </view>

    <view v-if="loading" class="state-block">
      <text>加载中...</text>
    </view>

    <view v-else-if="drafts.length === 0" class="state-block">
      <text class="empty-title">暂无草稿</text>
      <text class="empty-subtitle">点击新建草稿开始设计</text>
    </view>

    <view v-else class="draft-list">
      <view
        v-for="draft in drafts"
        :key="draft.id"
        class="draft-card"
        @tap="openDraft(draft)"
      >
        <view class="draft-header">
          <view class="draft-title-row">
            <text class="draft-name">{{ draft.name || '未命名食谱' }}</text>
            <button
              v-if="canEditDraft(draft)"
              class="rename-draft-btn"
              :disabled="renamingDraftId === draft.id"
              @tap.stop="renameDraft(draft)"
            >
              {{ renamingDraftId === draft.id ? '...' : '改名' }}
            </button>
          </view>
          <view class="draft-actions">
            <text class="status-badge">{{ getDraftStatusLabel(draft) }}</text>
            <button
              v-if="hasVersionHistory(draft)"
              class="version-history-btn"
              @tap.stop="openVersionHistory(draft)"
            >
              版本
            </button>
            <button
              v-if="isPublishedDraft(draft)"
              class="revision-draft-btn"
              :disabled="revisingDraftId === draft.id"
              @tap.stop="reviseDraft(draft)"
            >
              {{ revisingDraftId === draft.id ? '创建中' : '修订' }}
            </button>
            <button
              v-if="canDeleteDraft(draft)"
              class="delete-btn"
              :disabled="deletingDraftId === draft.id"
              @tap.stop="deleteDraft(draft)"
            >
              {{ deletingDraftId === draft.id ? '删除中' : '删除' }}
            </button>
          </view>
        </view>
        <view class="meta-row">
          <text>{{ getScenarioLabel(getDraftScenario(draft)) }}</text>
          <text>{{ formatWeight(draft.totalWeightG) }}</text>
        </view>
        <view class="meta-row">
          <text>能量密度 {{ formatEnergyDensity(draft.energyDensityKcalPerKg) }}</text>
          <text>{{ formatDateTime(draft.updatedAt) }}</text>
        </view>
      </view>
    </view>

    <view v-if="historyDraft" class="history-sheet-mask" @tap="closeVersionHistory">
      <view class="history-sheet-panel" @tap.stop>
        <view class="history-sheet-header">
          <text class="sheet-title">版本历史</text>
          <button class="history-close-btn" @tap="closeVersionHistory">关闭</button>
        </view>
        <view class="history-list">
          <view
            v-for="item in getVersionHistory(historyDraft)"
            :key="item.id"
            class="history-item"
            @tap="openHistoryDraft(item)"
          >
            <view class="history-main-row">
              <text class="history-name">{{ item.name || '未命名食谱' }}</text>
              <text class="status-badge">{{ getDraftStatusLabel(item) }}</text>
            </view>
            <view class="history-meta-row">
              <text>{{ getScenarioLabel(getDraftScenario(item)) }}</text>
              <text>{{ formatDateTime(item.updatedAt) }}</text>
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
          <button class="confirm-btn" :disabled="creating" @tap="createDraft">
            {{ creating ? '创建中' : '开始设计' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  FEDIAF_DOG_SCENARIO_DESCRIPTIONS,
  FEDIAF_DOG_SCENARIO_LABELS,
  recipeDesignerApi,
  type FediafDogScenario,
} from '../../api/recipe-designer'
import { getScenarioLabel } from './assessment'

interface DesignerDraft {
  id: string
  name?: string
  scenario?: string
  fediafDogScenario?: string
  status?: string
  totalWeightG?: number
  energyDensityKcalPerKg?: number | null
  publishedRecipeId?: string | null
  publishedRecipeVersion?: number | null
  publishedAt?: string | null
  revisionOfDesignRecipeId?: string | null
  revisionBaseRecipeId?: string | null
  revisionChangeState?: 'NOT_REVISION' | 'UNCHANGED' | 'CHANGED'
  updatedAt?: string
  versionHistory?: DesignerDraft[]
}

const drafts = ref<DesignerDraft[]>([])
const loading = ref(false)
const creating = ref(false)
const deletingDraftId = ref('')
const renamingDraftId = ref('')
const revisingDraftId = ref('')
const historyDraft = ref<DesignerDraft | null>(null)
const createSheetVisible = ref(false)
const newDraftScenario = ref<FediafDogScenario>('ADULT_MER_110')

const scenarioOptions: Array<{ label: string; value: FediafDogScenario }> = [
  { label: FEDIAF_DOG_SCENARIO_LABELS.EARLY_GROWTH_REPRODUCTION, value: 'EARLY_GROWTH_REPRODUCTION' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.LATE_GROWTH, value: 'LATE_GROWTH' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.ADULT_MER_95, value: 'ADULT_MER_95' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.ADULT_MER_110, value: 'ADULT_MER_110' },
  { label: FEDIAF_DOG_SCENARIO_LABELS.REPRODUCTION, value: 'REPRODUCTION' },
]

onShow(() => {
  loadDrafts()
})

async function loadDrafts() {
  loading.value = true
  try {
    const res: any = await recipeDesignerApi.listDrafts()
    const data = res?.data ?? res
    drafts.value = Array.isArray(data) ? data : data?.items || data?.drafts || []
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to load drafts:', error)
    uni.showToast({ title: '加载草稿失败', icon: 'none' })
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

async function createDraft() {
  if (creating.value) return

  creating.value = true
  try {
    const res: any = await recipeDesignerApi.createDraft({
      name: '未命名食谱',
      scenario: newDraftScenario.value,
    })
    const draft = res?.data ?? res
    const draftId = draft?.id
    if (draftId) {
      createSheetVisible.value = false
      newDraftScenario.value = 'ADULT_MER_110'
      uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draftId}` })
      return
    }
    await loadDrafts()
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to create draft:', error)
    uni.showToast({ title: '创建草稿失败', icon: 'none' })
  } finally {
    creating.value = false
  }
}

function openDraft(draft: DesignerDraft) {
  uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draft.id}` })
}

function hasVersionHistory(draft: DesignerDraft) {
  return getVersionHistory(draft).length > 1
}

function getVersionHistory(draft: DesignerDraft | null) {
  if (!draft?.versionHistory || !Array.isArray(draft.versionHistory)) return []
  return draft.versionHistory
}

function openVersionHistory(draft: DesignerDraft) {
  if (!hasVersionHistory(draft)) return
  historyDraft.value = draft
}

function closeVersionHistory() {
  historyDraft.value = null
}

function openHistoryDraft(draft: DesignerDraft) {
  closeVersionHistory()
  openDraft(draft)
}

function goToSupplementLibrary() {
  uni.navigateTo({ url: '/pages/recipe-designer/supplement-library' })
}

function isPublishedDraft(draft: DesignerDraft) {
  return draft.status === 'PUBLISHED' || Boolean(draft.publishedRecipeId || draft.publishedAt)
}

function isRevisionDraft(draft: DesignerDraft) {
  return !isPublishedDraft(draft) && Boolean(draft.revisionBaseRecipeId || draft.revisionOfDesignRecipeId)
}

function canEditDraft(draft: DesignerDraft) {
  return !isPublishedDraft(draft)
}

function canDeleteDraft(draft: DesignerDraft) {
  return !isPublishedDraft(draft)
}

function renameDraft(draft: DesignerDraft) {
  if (!canEditDraft(draft) || renamingDraftId.value) return

  const currentName = draft.name || '未命名食谱'
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

      renamingDraftId.value = draft.id
      try {
        await recipeDesignerApi.updateDraft(draft.id, { name: nextName })
        drafts.value = drafts.value.map((candidate) =>
          candidate.id === draft.id
            ? { ...candidate, name: nextName, updatedAt: new Date().toISOString() }
            : candidate,
        )
        uni.showToast({ title: '已重命名', icon: 'success' })
      } catch (error) {
        console.error('[RecipeDesignerList] Failed to rename draft:', error)
        uni.showToast({ title: '重命名失败', icon: 'none' })
      } finally {
        renamingDraftId.value = ''
      }
    },
  })
}

async function reviseDraft(draft: DesignerDraft) {
  if (!isPublishedDraft(draft) || revisingDraftId.value) return

  revisingDraftId.value = draft.id
  try {
    const res: any = await recipeDesignerApi.createRevisionDraft(draft.id)
    const revision = res?.data ?? res
    const revisionId = revision?.id
    if (revisionId) {
      uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${revisionId}` })
      return
    }
    await loadDrafts()
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to create revision draft:', error)
    uni.showToast({ title: '创建修订草稿失败', icon: 'none' })
  } finally {
    revisingDraftId.value = ''
  }
}

function deleteDraft(draft: DesignerDraft) {
  if (!canDeleteDraft(draft) || deletingDraftId.value) return

  const draftName = draft.name || '未命名食谱'
  uni.showModal({
    title: '删除草稿',
    content: `确认删除「${draftName}」吗？删除后不可恢复。`,
    confirmText: '删除',
    confirmColor: '#cf1322',
    success: async (result: any) => {
      if (!result.confirm) return

      deletingDraftId.value = draft.id
      try {
        await recipeDesignerApi.deleteDraft(draft.id)
        await loadDrafts()
        uni.showToast({ title: '已删除', icon: 'success' })
      } catch (error) {
        console.error('[RecipeDesignerList] Failed to delete draft:', error)
        uni.showToast({ title: '删除草稿失败', icon: 'none' })
      } finally {
        deletingDraftId.value = ''
      }
    },
  })
}

function getDraftStatusLabel(draft: DesignerDraft) {
  if (isRevisionDraft(draft)) {
    if (draft.revisionChangeState === 'UNCHANGED') {
      return '无改动'
    }
    return '修订中'
  }
  if (isPublishedDraft(draft) && draft.publishedRecipeVersion) {
    return `已发布 v${draft.publishedRecipeVersion}`
  }

  const map: Record<string, string> = {
    DRAFT: '草稿',
    ASSESSING: '评估中',
    COMPLIANT: '已达标',
    NEEDS_REVIEW: '需审核',
    PUBLISHED: '已发布',
  }
  const status = draft.status
  return map[status || ''] || status || '草稿'
}

function getDraftScenario(draft: DesignerDraft): FediafDogScenario | undefined {
  return (draft.scenario || draft.fediafDogScenario) as FediafDogScenario | undefined
}

function formatWeight(value?: number) {
  return `总重量 ${Number(value || 0).toFixed(0)}g`
}

function formatEnergyDensity(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return `${Number(value).toFixed(0)} kcal/kg`
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

.draft-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.draft-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 28rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.draft-header,
.draft-actions,
.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.draft-header {
  margin-bottom: 18rpx;
}

.draft-title-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.draft-name {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  font-size: 32rpx;
  font-weight: 700;
  color: #222;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-draft-btn,
.revision-draft-btn,
.version-history-btn {
  flex-shrink: 0;
  height: 48rpx;
  margin: 0;
  padding: 0 14rpx;
  border-radius: 8rpx;
  background: #f0f6ff;
  color: #1677ff;
  font-size: 22rpx;
  line-height: 48rpx;
}

.revision-draft-btn {
  background: #f6ffed;
  color: #389e0d;
}

.version-history-btn {
  background: #f7f7f7;
  color: #555;
}

.draft-actions {
  flex-shrink: 0;
  justify-content: flex-end;
  gap: 12rpx;
}

.status-badge {
  flex-shrink: 0;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  background: #edf4ff;
  color: #1677ff;
  font-size: 22rpx;
}

.delete-btn {
  flex-shrink: 0;
  height: 52rpx;
  margin: 0;
  padding: 0 16rpx;
  border-radius: 8rpx;
  background: #fff1f0;
  color: #cf1322;
  font-size: 22rpx;
  line-height: 52rpx;
}

.meta-row {
  color: #666;
  font-size: 24rpx;
  line-height: 1.8;
}

.history-sheet-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 22;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.38);
}

.history-sheet-panel {
  width: 100%;
  max-height: 70vh;
  overflow-y: auto;
  padding: 28rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  border-radius: 24rpx 24rpx 0 0;
  background: #fff;
  box-sizing: border-box;
}

.history-sheet-header,
.history-main-row,
.history-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.history-sheet-header {
  margin-bottom: 20rpx;
}

.history-close-btn {
  flex-shrink: 0;
  height: 52rpx;
  margin: 0;
  padding: 0 18rpx;
  border-radius: 8rpx;
  background: #f5f5f5;
  color: #555;
  font-size: 24rpx;
  line-height: 52rpx;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.history-item {
  padding: 18rpx;
  border: 1rpx solid #f0f0f0;
  border-radius: 10rpx;
  background: #fbfbfb;
}

.history-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #222;
  font-size: 28rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta-row {
  margin-top: 10rpx;
  color: #777;
  font-size: 23rpx;
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
.sheet-field,
.sheet-actions {
  display: flex;
  align-items: center;
}

.sheet-header,
.sheet-field {
  justify-content: space-between;
  gap: 20rpx;
}

.sheet-header {
  margin-bottom: 28rpx;
}

.sheet-title {
  display: block;
  color: #222;
  font-size: 34rpx;
  font-weight: 700;
}

.sheet-field {
  min-height: 84rpx;
  border-top: 1rpx solid #f0f0f0;
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
