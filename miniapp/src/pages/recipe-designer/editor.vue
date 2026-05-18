<template>
  <view class="recipe-designer-editor-page">
    <view class="section metadata-section">
      <view class="field-row">
        <text class="field-label">配方名称</text>
        <input
          class="name-input"
          v-model="draftName"
          maxlength="40"
          placeholder="输入配方名称"
          @blur="flushMetadataAutosave"
          @confirm="flushMetadataAutosave"
        />
      </view>

      <picker
        mode="selector"
        range-key="label"
        :range="scenarioOptions"
        :value="selectedScenarioIndex"
        @change="onScenarioChange"
      >
        <view class="field-row picker-row">
          <text class="field-label">生命阶段</text>
          <text class="field-value">{{ currentScenarioLabel }}</text>
        </view>
      </picker>

      <view class="action-row">
        <text class="save-state" :class="metadataSaveClass">{{ metadataSaveLabel }}</text>
        <button class="primary-btn" @tap="goToPublish">发布</button>
      </view>
    </view>

    <view class="section">
      <view class="section-header">
        <view class="section-heading">
          <text class="section-title">原料</text>
          <text class="section-total">总量 {{ currentTotalWeightG.toFixed(0) }}g</text>
        </view>
        <button class="link-btn" @tap="openIngredientPicker">添加原料</button>
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
          <button class="icon-text-btn" @tap="removeIngredient(item)">删除</button>
        </view>
      </view>
    </view>

    <view v-if="ingredientPickerVisible" class="ingredient-picker-mask" @tap="closeIngredientPicker">
      <view class="ingredient-picker-panel" @tap.stop>
        <view class="picker-header">
          <view>
            <text class="picker-title">添加原料</text>
            <text class="picker-subtitle">选择标准原料，必要时切换营养档案</text>
          </view>
          <button class="picker-close" @tap="closeIngredientPicker">×</button>
        </view>

        <view class="search-row">
          <input
            class="search-input"
            v-model="ingredientSearchKeyword"
            confirm-type="search"
            placeholder="搜索原料名称"
            @confirm="searchIngredientOptions"
          />
        </view>

        <scroll-view scroll-y class="ingredient-list">
          <view v-if="ingredientLoading && ingredientOptions.length === 0" class="picker-state">
            <text>加载原料中...</text>
          </view>

          <view v-else-if="ingredientOptions.length === 0" class="picker-state">
            <text>暂无可用原料</text>
          </view>

          <view
            v-for="option in ingredientOptions"
            :key="option.id"
            class="food-option"
            :class="{ selected: selectedIngredientOption?.id === option.id }"
            @tap="selectIngredientOption(option)"
          >
            <view class="food-option-mainline">
              <view class="food-main">
                <text class="food-name">{{ option.name }}</text>
                <text class="food-meta">{{ getIngredientOptionMeta(option) }}</text>
              </view>
            </view>

            <view
              v-if="selectedIngredientOption?.id === option.id && option.nutritionProfiles.length > 1"
              class="profile-options"
            >
              <view
                v-for="profile in option.nutritionProfiles"
                :key="profile.nutritionFoodId"
                class="profile-option"
                :class="{ active: selectedNutritionProfile?.nutritionFoodId === profile.nutritionFoodId }"
                @tap.stop="selectNutritionProfile(profile)"
              >
                <text class="profile-name">{{ profile.name }}</text>
                <text class="profile-meta">{{ getNutritionProfileMeta(profile) }}</text>
              </view>
            </view>
          </view>

          <button
            v-if="ingredientOptionHasMore"
            class="load-more-btn"
            :disabled="ingredientLoading"
            @tap="loadMoreIngredientOptions"
          >
            {{ ingredientLoading ? '加载中' : '加载更多' }}
          </button>
        </scroll-view>

        <view class="picker-footer">
          <view class="selected-info">
            <text class="selected-label">已选原料</text>
            <text class="selected-name">{{ selectedIngredientOption?.name || '请选择' }}</text>
            <text class="selected-profile">
              营养档案：{{ selectedNutritionProfile?.name || '请选择' }}
            </text>
          </view>
          <view class="add-weight-row">
            <input
              class="add-weight-input"
              type="digit"
              v-model="newItemWeightInput"
              placeholder="克重"
            />
            <text class="weight-unit">g</text>
            <button
              class="primary-btn add-btn"
              :disabled="addingItem || !selectedNutritionProfile"
              @tap="confirmAddIngredient"
            >
              {{ addingItem ? '加入中' : '加入' }}
            </button>
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
            <text class="entry-name">{{ entry.label || entry.name || entry.nutrientName || entry.key || entry.nutrientKey }}</text>
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
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  recipeDesignerApi,
  type FediafDogScenario,
  type IngredientNutritionProfileOption,
  type IngredientOptionListResponse,
  type RecipeDesignerIngredientOption,
} from '../../api/recipe-designer'
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
  ingredient?: {
    name?: string
  }
  nutritionFoodName?: string
  nutritionFood?: {
    name?: string
  }
  weightG?: number
  ratioPercent?: number
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
const metadataSaveState = ref<'idle' | 'dirty' | 'saving' | 'saved' | 'failed'>('idle')
const assessmentExpanded = ref(false)
const ingredientPickerVisible = ref(false)
const ingredientLoading = ref(false)
const addingItem = ref(false)
const ingredientSearchKeyword = ref('')
const ingredientOptions = ref<RecipeDesignerIngredientOption[]>([])
const selectedIngredientOption = ref<RecipeDesignerIngredientOption | null>(null)
const selectedNutritionProfile = ref<IngredientNutritionProfileOption | null>(null)
const newItemWeightInput = ref('100')
const ingredientOptionPage = ref(1)
const ingredientOptionHasMore = ref(false)
const ingredientOptionPageSize = 20
let ingredientSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let metadataAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let pendingIngredientOptionsReset = false
let metadataHydrated = false
let pendingMetadataSave = false

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

const metadataSaveLabel = computed(() => {
  const map = {
    idle: '待编辑',
    dirty: '待保存',
    saving: '保存中',
    saved: '已保存',
    failed: '保存失败',
  }
  return map[metadataSaveState.value]
})

const metadataSaveClass = computed(() => `save-state-${metadataSaveState.value}`)

const summaryCounts = computed(() => {
  return normalizeAssessmentSummary(assessment.value?.summary)
})

const overallStatus = computed(() => {
  return assessment.value?.overallStatus || assessment.value?.status
})

const assessmentEntries = computed(() => {
  return assessment.value?.groupedEntries || assessment.value?.entries || assessment.value?.nutrients || []
})

onLoad((options: any) => {
  draftId.value = options?.id || ''
  if (!draftId.value) {
    uni.showToast({ title: '缺少草稿ID', icon: 'none' })
    return
  }
  loadDraft()
})

watch(ingredientSearchKeyword, () => {
  if (!ingredientPickerVisible.value) return
  clearIngredientSearchDebounce()
  ingredientSearchDebounceTimer = setTimeout(() => {
    void loadIngredientOptions(true)
  }, 300)
})

watch([draftName, scenario], () => {
  if (!metadataHydrated || loading.value) return
  scheduleMetadataAutosave()
})

onUnmounted(() => {
  clearIngredientSearchDebounce()
  clearMetadataAutosave()
})

async function loadDraft() {
  loading.value = true
  metadataHydrated = false
  try {
    const res: any = await recipeDesignerApi.listDrafts()
    const data = res?.data ?? res
    const drafts = Array.isArray(data) ? data : data?.items || data?.drafts || []
    const draft = drafts.find((item: any) => item.id === draftId.value)
    if (draft) {
      draftName.value = draft.name || '未命名配方'
      scenario.value = getDraftScenario(draft)
      items.value = draft.items || []
    }
    await refreshAssessment()
    metadataSaveState.value = 'saved'
    await nextTick()
    metadataHydrated = true
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
    items.value = mergeAssessedItems(items.value, assessedItems)
  }
}

function onScenarioChange(event: any) {
  const index = Number(event.detail.value || 0)
  scenario.value = scenarioOptions[index]?.value || 'ADULT_MER_110'
}

function scheduleMetadataAutosave() {
  clearMetadataAutosave()
  metadataSaveState.value = 'dirty'
  metadataAutosaveTimer = setTimeout(() => {
    void autoSaveDraftMetadata()
  }, 600)
}

function clearMetadataAutosave() {
  if (!metadataAutosaveTimer) return
  clearTimeout(metadataAutosaveTimer)
  metadataAutosaveTimer = null
}

function flushMetadataAutosave() {
  if (!metadataHydrated) return
  clearMetadataAutosave()
  void autoSaveDraftMetadata()
}

async function autoSaveDraftMetadata() {
  if (!draftId.value) return
  if (saving.value) {
    pendingMetadataSave = true
    return
  }
  const name = draftName.value.trim()
  if (!name) {
    metadataSaveState.value = 'failed'
    return
  }

  saving.value = true
  metadataSaveState.value = 'saving'
  try {
    await recipeDesignerApi.updateDraft(draftId.value, { name, scenario: scenario.value })
    metadataSaveState.value = 'saved'
    await refreshAssessment()
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to save draft:', error)
    metadataSaveState.value = 'failed'
  } finally {
    saving.value = false
    if (pendingMetadataSave) {
      pendingMetadataSave = false
      scheduleMetadataAutosave()
    }
  }
}

function onWeightInput(item: DesignerItem, event: any) {
  item.weightG = Number(event.detail.value || 0)
}

async function updateWeight(item: DesignerItem) {
  const weightG = Number(item.weightG || 0)
  if (weightG < 0) {
    uni.showToast({ title: '克重不能小于0', icon: 'none' })
    return
  }

  try {
    await recipeDesignerApi.updateItem(item.id, { weightG })
    await refreshAssessment()
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to update item weight:', error)
    uni.showToast({ title: '更新克重失败', icon: 'none' })
  }
}

async function openIngredientPicker() {
  ingredientPickerVisible.value = true
  selectedIngredientOption.value = null
  selectedNutritionProfile.value = null
  newItemWeightInput.value = '100'
  if (ingredientOptions.value.length === 0) {
    await loadIngredientOptions(true)
  }
}

function closeIngredientPicker() {
  if (addingItem.value) return
  clearIngredientSearchDebounce()
  ingredientPickerVisible.value = false
}

async function searchIngredientOptions() {
  clearIngredientSearchDebounce()
  await loadIngredientOptions(true)
}

async function loadMoreIngredientOptions() {
  if (!ingredientOptionHasMore.value || ingredientLoading.value) return
  await loadIngredientOptions(false)
}

async function loadIngredientOptions(reset: boolean) {
  if (ingredientLoading.value) {
    if (reset) pendingIngredientOptionsReset = true
    return
  }
  ingredientLoading.value = true
  try {
    const nextPage = reset ? 1 : ingredientOptionPage.value + 1
    const res: any = await recipeDesignerApi.listIngredientOptions({
      search: ingredientSearchKeyword.value.trim(),
      page: nextPage,
      pageSize: ingredientOptionPageSize,
    })
    const data = (res?.data ?? res) as IngredientOptionListResponse
    const options = Array.isArray(data?.data) ? data.data : []
    ingredientOptions.value = reset ? options : [...ingredientOptions.value, ...options]
    ingredientOptionPage.value = data?.page || nextPage
    ingredientOptionHasMore.value = Boolean(data?.hasMore)
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to load ingredient options:', error)
    uni.showToast({ title: '加载原料失败', icon: 'none' })
  } finally {
    ingredientLoading.value = false
    if (pendingIngredientOptionsReset) {
      pendingIngredientOptionsReset = false
      await loadIngredientOptions(true)
    }
  }
}

function clearIngredientSearchDebounce() {
  if (!ingredientSearchDebounceTimer) return
  clearTimeout(ingredientSearchDebounceTimer)
  ingredientSearchDebounceTimer = null
}

function selectIngredientOption(option: RecipeDesignerIngredientOption) {
  selectedIngredientOption.value = option
  selectedNutritionProfile.value = getDefaultNutritionProfile(option)
}

function selectNutritionProfile(profile: IngredientNutritionProfileOption) {
  selectedNutritionProfile.value = profile
}

async function confirmAddIngredient() {
  if (!selectedIngredientOption.value || !selectedNutritionProfile.value) {
    uni.showToast({ title: '请选择原料', icon: 'none' })
    return
  }

  const weightG = Number(newItemWeightInput.value || 0)
  if (!Number.isFinite(weightG) || weightG <= 0) {
    uni.showToast({ title: '请输入大于0的克重', icon: 'none' })
    return
  }

  addingItem.value = true
  try {
    const res: any = await recipeDesignerApi.addItem(draftId.value, {
      ingredientId: selectedIngredientOption.value.id,
      nutritionFoodId: selectedNutritionProfile.value.nutritionFoodId,
      weightG,
      sortOrder: items.value.length,
    })
    const item = res?.data ?? res
    if (item?.id) {
      items.value = [...items.value, item]
    }
    ingredientPickerVisible.value = false
    selectedIngredientOption.value = null
    selectedNutritionProfile.value = null
    await refreshAssessment()
    uni.showToast({ title: '已加入配方', icon: 'success' })
  } catch (error) {
    console.error('[RecipeDesignerEditor] Failed to add ingredient:', error)
    uni.showToast({ title: '添加原料失败', icon: 'none' })
  } finally {
    addingItem.value = false
  }
}

function removeIngredient(item: DesignerItem) {
  uni.showModal({
    title: '删除原料',
    content: `确认从配方中删除「${getItemName(item)}」吗？`,
    confirmText: '删除',
    confirmColor: '#cf1322',
    success: async (result: any) => {
      if (!result.confirm) return
      try {
        await recipeDesignerApi.removeItem(item.id)
        items.value = items.value.filter((candidate) => candidate.id !== item.id)
        await refreshAssessment()
        uni.showToast({ title: '已删除', icon: 'success' })
      } catch (error) {
        console.error('[RecipeDesignerEditor] Failed to remove item:', error)
        uni.showToast({ title: '删除失败', icon: 'none' })
      }
    },
  })
}

function goToPublish() {
  uni.navigateTo({ url: `/pages/recipe-designer/publish?id=${draftId.value}` })
}

function getItemName(item: DesignerItem) {
  return (
    item.name ||
    item.ingredientName ||
    item.ingredient?.name ||
    item.nutritionFoodName ||
    item.nutritionFood?.name ||
    '未命名原料'
  )
}

function getIngredientOptionMeta(option: RecipeDesignerIngredientOption) {
  const defaultProfile = getDefaultNutritionProfile(option)
  const profileCount = option.nutritionProfiles.length
  if (!defaultProfile) return '尚未配置营养档案'
  const suffix = profileCount > 1 ? ` · 共${profileCount}个档案` : ''
  return `默认：${defaultProfile.name}${suffix}`
}

function getDefaultNutritionProfile(option: RecipeDesignerIngredientOption) {
  return (
    option.nutritionProfiles.find(
      (profile) => profile.nutritionFoodId === option.defaultNutritionFoodId,
    ) ||
    option.nutritionProfiles.find((profile) => profile.isPrimary) ||
    option.nutritionProfiles[0] ||
    null
  )
}

function getNutritionProfileMeta(profile: IngredientNutritionProfileOption) {
  const parts = [profile.dataSource, profile.category]
  return parts.filter(Boolean).join(' / ')
}

function formatItemWeightInput(value?: number) {
  return value === null || value === undefined ? '' : String(value)
}

function formatAssessmentDetail(entry: any) {
  const current = entry.currentValue ?? entry.current ?? entry.actual ?? entry.value
  const targetMin = entry.minValue ?? entry.targetMin ?? entry.min
  const targetMax = entry.maxValue ?? entry.targetMax ?? entry.max
  const unit = entry.unit || ''
  const detailCount = Number(entry.detailCount || entry.details?.length || 0)
  const parts = []
  if (entry.expressionBasis) parts.push(formatExpressionBasis(entry.expressionBasis))
  if (current !== undefined && current !== null) parts.push(`当前 ${formatAssessmentNumber(current)}${unit}`)
  if ((targetMin !== undefined && targetMin !== null) || (targetMax !== undefined && targetMax !== null)) {
    parts.push(`目标 ${formatAssessmentNumber(targetMin) ?? '-'}-${formatAssessmentNumber(targetMax) ?? '-'}${unit}`)
  }
  if (detailCount > 1) parts.push(`含${detailCount}个基准`)
  return parts.join(' / ') || '暂无数值'
}

function formatExpressionBasis(value: string) {
  const map: Record<string, string> = {
    PER_1000_KCAL_ME: '每1000kcal',
    PER_MJ_ME: '每MJ',
    PER_100G_DRY_MATTER: '干物质',
    RATIO: '比例',
  }
  return map[value] || value
}

function getDraftScenario(draft: any): FediafDogScenario {
  return (draft?.scenario || draft?.fediafDogScenario || 'ADULT_MER_110') as FediafDogScenario
}

function mergeAssessedItems(currentItems: DesignerItem[], assessedItems: DesignerItem[]) {
  const currentById = new Map(currentItems.map((item) => [item.id, item]))
  return assessedItems.map((item) => {
    const current = currentById.get(item.id)
    return {
      ...current,
      ...item,
      preparationMethod: item.preparationMethod ?? current?.preparationMethod,
      nutritionFood: item.nutritionFood ?? current?.nutritionFood,
    }
  })
}

function formatAssessmentNumber(value: unknown) {
  if (value === undefined || value === null) return undefined
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return String(value)
  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(2)
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
.item-row,
.drawer-handle,
.assessment-entry {
  display: flex;
  align-items: center;
}

.field-row,
.picker-row,
.section-header,
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

.save-state {
  flex: 1;
  min-width: 0;
  color: #888;
  font-size: 24rpx;
  text-align: right;
}

.save-state-saving,
.save-state-dirty {
  color: #d46b08;
}

.save-state-saved {
  color: #389e0d;
}

.save-state-failed {
  color: #cf1322;
}

.primary-btn,
.secondary-btn,
.link-btn,
.icon-text-btn,
.picker-close,
.load-more-btn {
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

.icon-text-btn {
  flex-shrink: 0;
  width: 88rpx;
  padding: 0;
  background: #fff1f0;
  color: #cf1322;
  font-size: 24rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #222;
}

.section-heading {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}

.section-total {
  color: #777;
  font-size: 24rpx;
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
  width: 160rpx;
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
  width: 92rpx;
  text-align: right;
  font-size: 28rpx;
  color: #222;
}

.weight-unit {
  color: #777;
  font-size: 24rpx;
}

.ingredient-picker-mask {
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

.ingredient-picker-panel {
  width: 100%;
  max-height: 86vh;
  padding: 28rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  border-radius: 24rpx 24rpx 0 0;
  background: #fff;
  box-sizing: border-box;
}

.picker-header,
.search-row,
.food-option-mainline,
.picker-footer,
.add-weight-row {
  display: flex;
  align-items: center;
}

.picker-header,
.food-option-mainline,
.picker-footer {
  justify-content: space-between;
  gap: 20rpx;
}

.picker-title {
  display: block;
  color: #222;
  font-size: 32rpx;
  font-weight: 700;
}

.picker-subtitle {
  display: block;
  margin-top: 8rpx;
  color: #888;
  font-size: 24rpx;
}

.picker-close {
  flex-shrink: 0;
  width: 68rpx;
  padding: 0;
  background: #f5f5f5;
  color: #555;
  font-size: 34rpx;
}

.search-row {
  margin-top: 28rpx;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: 10rpx;
  background: #f7f8fa;
  color: #222;
  font-size: 26rpx;
  box-sizing: border-box;
}

.ingredient-list {
  height: 540rpx;
  margin-top: 20rpx;
  border-top: 1rpx solid #f0f0f0;
  border-bottom: 1rpx solid #f0f0f0;
}

.picker-state {
  padding: 96rpx 0;
  color: #999;
  font-size: 26rpx;
  text-align: center;
}

.food-option {
  padding: 22rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.food-option-mainline {
  width: 100%;
}

.food-option.selected .food-name {
  color: #1677ff;
}

.food-main {
  flex: 1;
  min-width: 0;
}

.food-name {
  display: block;
  color: #222;
  font-size: 27rpx;
  font-weight: 600;
  line-height: 1.35;
}

.food-meta {
  display: block;
  margin-top: 8rpx;
  color: #888;
  font-size: 22rpx;
}

.profile-options {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 16rpx;
  padding: 12rpx;
  border-radius: 10rpx;
  background: #f7f8fa;
}

.profile-option {
  padding: 14rpx 16rpx;
  border: 1rpx solid #e8e8e8;
  border-radius: 8rpx;
  background: #fff;
}

.profile-option.active {
  border-color: #1677ff;
  background: #edf4ff;
}

.profile-name,
.profile-meta,
.selected-profile {
  display: block;
}

.profile-name {
  color: #222;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1.35;
}

.profile-meta {
  margin-top: 6rpx;
  color: #777;
  font-size: 21rpx;
}

.load-more-btn {
  width: 100%;
  margin: 18rpx 0;
  background: #f7f8fa;
  color: #555;
}

.picker-footer {
  padding-top: 22rpx;
}

.selected-info {
  flex: 1;
  min-width: 0;
}

.selected-label {
  display: block;
  color: #888;
  font-size: 22rpx;
}

.selected-name {
  display: block;
  margin-top: 6rpx;
  color: #222;
  font-size: 26rpx;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-profile {
  margin-top: 6rpx;
  color: #777;
  font-size: 22rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-weight-row {
  flex-shrink: 0;
  gap: 8rpx;
}

.add-weight-input {
  width: 116rpx;
  height: 68rpx;
  padding: 0 14rpx;
  border-radius: 10rpx;
  background: #f7f8fa;
  text-align: right;
  color: #222;
  font-size: 28rpx;
  box-sizing: border-box;
}

.add-btn {
  width: 104rpx;
  padding: 0;
}

.assessment-drawer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
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
