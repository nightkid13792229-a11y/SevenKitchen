<template>
  <view class="recipe-designer-editor-page">
    <view class="section metadata-section">
      <view class="field-row">
        <text class="field-label">配方名称</text>
        <input class="name-input" v-model="draftName" placeholder="输入配方名称" />
      </view>

      <picker
        mode="selector"
        range-key="label"
        :range="scenarioOptions"
        :value="selectedScenarioIndex"
        @change="onScenarioChange"
      >
        <view class="field-row picker-row">
          <text class="field-label">评估场景</text>
          <text class="field-value">{{ currentScenarioLabel }}</text>
        </view>
      </picker>

      <view class="action-row">
        <button class="secondary-btn" :disabled="saving" @tap="saveDraftMetadata">
          {{ saving ? '保存中' : '保存' }}
        </button>
        <button class="primary-btn" @tap="goToPublish">发布</button>
      </view>
    </view>

    <view class="total-bar">
      <text>当前总量</text>
      <text class="total-value">{{ currentTotalWeightG.toFixed(0) }}g</text>
    </view>

    <view class="section">
      <view class="section-header">
        <text class="section-title">原料</text>
        <button class="link-btn" @tap="showIngredientPlaceholder">添加原料</button>
      </view>

      <view v-if="loading" class="state-block">
        <text>加载中...</text>
      </view>

      <view v-else-if="items.length === 0" class="state-block">
        <text>暂无原料</text>
      </view>

      <view v-else class="item-list">
        <view v-for="item in items" :key="item.id" class="item-row">
          <view class="item-main">
            <text class="item-name">{{ getItemName(item) }}</text>
            <text class="item-meta">{{ item.preparationMethod || '未设置处理方式' }}</text>
          </view>
          <view class="weight-editor">
            <input
              class="weight-input"
              type="digit"
              :value="formatItemWeightInput(item.weightG)"
              @input="onWeightInput(item, $event)"
              @blur="updateWeight(item)"
              @confirm="updateWeight(item)"
            />
            <text class="weight-unit">g</text>
          </view>
        </view>
      </view>
    </view>

    <view class="assessment-drawer" :class="{ expanded: assessmentExpanded }">
      <view class="drawer-handle" @tap="assessmentExpanded = !assessmentExpanded">
        <view>
          <text class="drawer-title">营养评估</text>
          <text class="drawer-status" :class="getAssessmentStatusClass(overallStatus)">
            {{ getOverallStatusLabel(overallStatus) }}
          </text>
        </view>
        <text class="drawer-toggle">{{ assessmentExpanded ? '收起' : '展开' }}</text>
      </view>

      <view class="summary-grid">
        <view class="summary-item">
          <text class="summary-value">{{ summaryCounts.compliant }}</text>
          <text class="summary-label">达标</text>
        </view>
        <view class="summary-item">
          <text class="summary-value">{{ summaryCounts.deficient }}</text>
          <text class="summary-label">缺口</text>
        </view>
        <view class="summary-item">
          <text class="summary-value">{{ summaryCounts.excess }}</text>
          <text class="summary-label">超标</text>
        </view>
        <view class="summary-item">
          <text class="summary-value">{{ summaryCounts.missingData }}</text>
          <text class="summary-label">缺数据</text>
        </view>
      </view>

      <view v-if="assessmentExpanded" class="assessment-list">
        <view v-if="assessmentEntries.length === 0" class="assessment-empty">
          <text>暂无评估条目</text>
        </view>
        <view v-for="entry in assessmentEntries" :key="entry.key || entry.nutrientKey" class="assessment-entry">
          <view>
            <text class="entry-name">{{ entry.name || entry.nutrientName || entry.key || entry.nutrientKey }}</text>
            <text class="entry-detail">{{ formatAssessmentDetail(entry) }}</text>
          </view>
          <text class="entry-status" :class="getAssessmentStatusClass(entry.status)">
            {{ getAssessmentStatusLabel(entry.status) }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { recipeDesignerApi, type FediafDogScenario } from '../../api/recipe-designer'
import {
  getAssessmentStatusClass,
  getAssessmentStatusLabel,
  getOverallStatusLabel,
  normalizeAssessmentSummary,
} from './assessment'

interface DesignerItem {
  id: string
  name?: string
  ingredientName?: string
  nutritionFoodName?: string
  weightG?: number
  preparationMethod?: string
}

const scenarioOptions: Array<{ label: string; value: FediafDogScenario }> = [
  { label: '<14周幼犬 / 繁殖期', value: 'EARLY_GROWTH_REPRODUCTION' },
  { label: '>=14周幼犬', value: 'LATE_GROWTH' },
  { label: '成年犬 MER 95', value: 'ADULT_MER_95' },
  { label: '成年犬 MER 110', value: 'ADULT_MER_110' },
]

const draftId = ref('')
const draftName = ref('未命名配方')
const scenario = ref<FediafDogScenario>('ADULT_MER_110')
const items = ref<DesignerItem[]>([])
const assessment = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const assessmentExpanded = ref(false)

const selectedScenarioIndex = computed(() => {
  const index = scenarioOptions.findIndex((option) => option.value === scenario.value)
  return index >= 0 ? index : 0
})

const currentScenarioLabel = computed(() => {
  return scenarioOptions[selectedScenarioIndex.value]?.label || '成年犬 MER 110'
})

const currentTotalWeightG = computed(() => {
  return items.value.reduce((sum, item) => sum + Number(item.weightG || 0), 0)
})

const summaryCounts = computed(() => {
  return normalizeAssessmentSummary(assessment.value?.summary)
})

const overallStatus = computed(() => {
  return assessment.value?.overallStatus || assessment.value?.status
})

const assessmentEntries = computed(() => {
  return assessment.value?.entries || assessment.value?.nutrients || []
})

onLoad((options: any) => {
  draftId.value = options?.id || ''
  if (!draftId.value) {
    uni.showToast({ title: '缺少草稿ID', icon: 'none' })
    return
  }
  loadDraft()
})

async function loadDraft() {
  loading.value = true
  try {
    const res: any = await recipeDesignerApi.listDrafts()
    const data = res?.data ?? res
    const drafts = Array.isArray(data) ? data : data?.items || data?.drafts || []
    const draft = drafts.find((item: any) => item.id === draftId.value)
    if (draft) {
      draftName.value = draft.name || '未命名配方'
      scenario.value = draft.scenario || 'ADULT_MER_110'
      items.value = draft.items || []
    }
    await refreshAssessment()
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to load draft:', error)
    uni.showToast({ title: '加载配方失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function refreshAssessment() {
  const res: any = await recipeDesignerApi.assessDraft(draftId.value)
  const data = res?.data ?? res
  assessment.value = data
  const assessedItems = data?.items || data?.draft?.items
  if (Array.isArray(assessedItems)) {
    items.value = assessedItems
  }
}

function onScenarioChange(event: any) {
  const index = Number(event.detail.value || 0)
  scenario.value = scenarioOptions[index]?.value || 'ADULT_MER_110'
}

async function saveDraftMetadata() {
  if (!draftId.value || saving.value) return
  saving.value = true
  try {
    await recipeDesignerApi.updateDraft(draftId.value, { name: draftName.value, scenario: scenario.value })
    uni.showToast({ title: '已保存', icon: 'success' })
    await refreshAssessment()
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to save draft:', error)
    uni.showToast({ title: '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function onWeightInput(item: DesignerItem, event: any) {
  item.weightG = Number(event.detail.value || 0)
}

async function updateWeight(item: DesignerItem) {
  const weightG = Number(item.weightG || 0)
  await recipeDesignerApi.updateItem(item.id, { weightG })
  await refreshAssessment()
}

function showIngredientPlaceholder() {
  uni.showToast({ title: '原料选择稍后接入', icon: 'none' })
}

function goToPublish() {
  uni.navigateTo({ url: `/pages/recipe-designer/publish?id=${draftId.value}` })
}

function getItemName(item: DesignerItem) {
  return item.name || item.ingredientName || item.nutritionFoodName || '未命名原料'
}

function formatItemWeightInput(value?: number) {
  return value === null || value === undefined ? '' : String(value)
}

function formatAssessmentDetail(entry: any) {
  const current = entry.current ?? entry.actual ?? entry.value
  const targetMin = entry.targetMin ?? entry.min
  const targetMax = entry.targetMax ?? entry.max
  const unit = entry.unit || ''
  const parts = []
  if (current !== undefined) parts.push(`当前 ${current}${unit}`)
  if (targetMin !== undefined || targetMax !== undefined) {
    parts.push(`目标 ${targetMin ?? '-'}-${targetMax ?? '-'}${unit}`)
  }
  return parts.join(' / ') || '暂无数值'
}
</script>

<style scoped lang="scss">
.recipe-designer-editor-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx 32rpx 260rpx;
}

.section {
  background: #fff;
  border-radius: 12rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.metadata-section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.field-row,
.picker-row,
.section-header,
.action-row,
.total-bar,
.item-row,
.drawer-handle,
.assessment-entry {
  display: flex;
  align-items: center;
}

.field-row,
.picker-row,
.section-header,
.total-bar,
.drawer-handle,
.assessment-entry {
  justify-content: space-between;
  gap: 20rpx;
}

.field-label {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #666;
}

.name-input,
.field-value {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 28rpx;
  color: #222;
}

.action-row {
  justify-content: flex-end;
  gap: 16rpx;
}

.primary-btn,
.secondary-btn,
.link-btn {
  height: 68rpx;
  border-radius: 10rpx;
  font-size: 26rpx;
  line-height: 68rpx;
  margin: 0;
}

.primary-btn {
  background: #1890ff;
  color: #fff;
}

.secondary-btn {
  background: #f0f6ff;
  color: #1677ff;
}

.link-btn {
  padding: 0 18rpx;
  background: #fff;
  border: 1rpx solid #d9d9d9;
  color: #333;
}

.total-bar {
  height: 92rpx;
  padding: 0 28rpx;
  border-radius: 12rpx;
  background: #fff;
  color: #555;
  font-size: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.total-value {
  color: #222;
  font-size: 34rpx;
  font-weight: 700;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #222;
}

.state-block {
  padding: 80rpx 0;
  text-align: center;
  color: #999;
  font-size: 26rpx;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-top: 20rpx;
}

.item-row {
  justify-content: space-between;
  gap: 20rpx;
  padding: 20rpx 0;
  border-top: 1rpx solid #f0f0f0;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-name {
  display: block;
  font-size: 28rpx;
  color: #222;
  font-weight: 600;
}

.item-meta {
  display: block;
  margin-top: 8rpx;
  color: #888;
  font-size: 22rpx;
}

.weight-editor {
  flex-shrink: 0;
  width: 180rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8rpx;
  padding: 0 16rpx;
  background: #f7f8fa;
  border-radius: 10rpx;
}

.weight-input {
  width: 110rpx;
  text-align: right;
  font-size: 28rpx;
  color: #222;
}

.weight-unit {
  color: #777;
  font-size: 24rpx;
}

.assessment-drawer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 24rpx 32rpx 36rpx;
  background: #fff;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.08);
  border-radius: 20rpx 20rpx 0 0;
}

.drawer-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #222;
  margin-bottom: 8rpx;
}

.drawer-status,
.entry-status {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.drawer-toggle {
  color: #1677ff;
  font-size: 24rpx;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12rpx;
  margin-top: 20rpx;
}

.summary-item {
  padding: 16rpx 8rpx;
  background: #f7f8fa;
  border-radius: 10rpx;
  text-align: center;
}

.summary-value {
  display: block;
  color: #222;
  font-size: 30rpx;
  font-weight: 700;
}

.summary-label {
  display: block;
  margin-top: 6rpx;
  color: #777;
  font-size: 22rpx;
}

.assessment-list {
  max-height: 520rpx;
  overflow-y: auto;
  margin-top: 20rpx;
  border-top: 1rpx solid #f0f0f0;
}

.assessment-empty {
  padding: 36rpx 0 12rpx;
  color: #999;
  text-align: center;
  font-size: 24rpx;
}

.assessment-entry {
  padding: 18rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.entry-name {
  display: block;
  color: #222;
  font-size: 26rpx;
}

.entry-detail {
  display: block;
  margin-top: 6rpx;
  color: #888;
  font-size: 22rpx;
}

.status-compliant {
  background: #f6ffed;
  color: #389e0d;
}

.status-deficient {
  background: #fff7e6;
  color: #d46b08;
}

.status-excess {
  background: #fff1f0;
  color: #cf1322;
}

.status-missing,
.status-pending {
  background: #f5f5f5;
  color: #777;
}
</style>
