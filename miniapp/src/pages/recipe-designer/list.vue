<template>
  <view class="recipe-designer-list-page">
    <view
      v-if="activeCustomerMenuSeriesId"
      class="customer-card-menu-backdrop"
      @tap.stop="closeCustomerRecipeMenu"
    ></view>

    <view class="toolbar">
      <view class="toolbar-title-block">
        <text class="page-title">{{ pageTitle }}</text>
        <text class="page-subtitle">{{ listSubtitle }}</text>
      </view>
      <view class="toolbar-actions">
        <button v-if="canManageSupplementLibrary" class="library-btn" @tap="goToSupplementLibrary">补剂库</button>
        <button class="new-btn" :disabled="creating" @tap="openCreateDraftSheet">
          新建食谱
        </button>
      </view>
    </view>

    <view v-if="canUseAdminStatusFilter" class="status-filter-bar">
      <button
        v-for="option in statusFilterOptions"
        :key="option.value || 'ALL'"
        class="status-filter-btn"
        :class="{ 'status-filter-btn-active': selectedSeriesStatusFilter === option.value }"
        @tap="selectSeriesStatusFilter(option.value)"
      >
        {{ option.label }}
      </button>
    </view>

    <view v-if="isCustomerMode" class="customer-dog-filter">
      <button
        v-for="option in dogFilterOptions"
        :key="option.id || 'ALL'"
        class="dog-filter-btn"
        :class="{ 'dog-filter-btn-active': selectedDogFilterId === option.id }"
        @tap="selectDogFilter(option.id)"
      >
        {{ option.name }}
      </button>
    </view>

    <view v-if="loading" class="state-block">
      <text>加载中...</text>
    </view>

    <view v-else-if="visibleSeriesEmpty" class="state-block">
      <text class="empty-title">{{ emptyTitle }}</text>
      <text class="empty-subtitle">{{ emptySubtitle }}</text>
    </view>

    <view v-else-if="isCustomerMode" class="customer-series-list">
      <view
        v-for="seriesItem in customerSeriesCards"
        :key="seriesItem.id"
        class="customer-recipe-card"
        :class="{ 'customer-recipe-card-menu-open': activeCustomerMenuSeriesId === seriesItem.id }"
        @tap="openCustomerRecipeCard(seriesItem)"
      >
        <view class="customer-card-main">
          <view class="customer-card-title-row">
            <text class="customer-status-badge" :class="getCustomerStatusClass(seriesItem)">
              {{ getCustomerStatusLabel(seriesItem) }}
            </text>
            <text class="customer-card-name">{{ seriesItem.name || '未命名食谱' }}</text>
          </view>
          <text class="customer-card-meta">
            {{ getCustomerCardDogName(seriesItem) }} · {{ getCustomerScenarioLabel(seriesItem) }}
          </text>
          <text class="customer-card-meta">最近编辑 {{ formatDateTime(seriesItem.updatedAt) }}</text>
          <text v-if="seriesItem.actionAvailability?.disabledReason" class="customer-disabled-reason">
            {{ seriesItem.actionAvailability.disabledReason }}
          </text>
        </view>
        <view class="customer-card-actions" @tap.stop>
          <view class="customer-card-menu-anchor">
            <button
              class="customer-card-more-btn"
              :disabled="isCustomerSeriesBusy(seriesItem)"
              @tap.stop="toggleCustomerRecipeMenu(seriesItem)"
            >
              ⋯
            </button>
            <view v-if="activeCustomerMenuSeriesId === seriesItem.id" class="customer-card-menu">
              <button class="customer-card-menu-item" @tap.stop="renameCustomerRecipe(seriesItem)">
                重命名
              </button>
              <button
                class="customer-card-menu-item"
                :disabled="!seriesItem.primaryDraftId"
                @tap.stop="duplicateCustomerRecipe(seriesItem)"
              >
                复制
              </button>
              <button
                class="customer-card-menu-item customer-card-menu-delete"
                @tap.stop="deleteCustomerRecipe(seriesItem)"
              >
                删除
              </button>
            </view>
          </view>
          <view class="customer-card-quick-actions">
            <button
              class="customer-quick-btn customer-quick-diy-btn"
              :disabled="!canGenerateDiyFromCustomerCard(seriesItem) || isCustomerSnapshotCreating(seriesItem, 'DIY')"
              @tap.stop="goToCustomerRecipeTarget(seriesItem, 'DIY')"
            >
              {{ isCustomerSnapshotCreating(seriesItem, 'DIY') ? '生成中' : '生成制作单' }}
            </button>
            <button
              class="customer-quick-btn customer-quick-order-btn"
              :disabled="!canOrderFromCustomerCard(seriesItem) || isCustomerSnapshotCreating(seriesItem, 'ORDER')"
              @tap.stop="goToCustomerRecipeTarget(seriesItem, 'ORDER')"
            >
              {{ isCustomerSnapshotCreating(seriesItem, 'ORDER') ? '进入中' : '订购成品' }}
            </button>
          </view>
        </view>
      </view>
    </view>

    <view v-else class="series-list">
      <view
        v-for="seriesItem in internalSeriesCards"
        :key="seriesItem.id"
        class="series-card"
      >
        <view class="series-header">
          <view class="series-title-block">
            <view class="series-name-row">
              <text class="series-name">{{ seriesItem.name || '未命名食谱' }}</text>
              <text class="series-business-badge" :class="getSeriesBusinessStatusClass(seriesItem)">
                {{ getSeriesBusinessStatusLabel(seriesItem) }}
              </text>
            </view>
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
            <button
              v-if="canOpenStageActions(seriesItem, stage)"
              class="stage-more-btn"
              :disabled="isStageActionBusy(seriesItem, stage)"
              @tap.stop="openStageActionSheet(seriesItem, stage)"
            >
              ⋯
            </button>
          </view>
        </view>
      </view>
    </view>

    <view v-if="createSheetVisible" class="create-sheet-mask" @tap="closeCreateDraftSheet">
      <view class="create-sheet-panel" @tap.stop>
        <view class="sheet-header">
          <text class="sheet-title">新建食谱</text>
        </view>

        <view v-if="isCustomerMode" class="customer-create-section">
          <text class="sheet-label">选择狗狗</text>
          <view v-if="dogs.length === 0" class="customer-create-empty">
            <text>请先完善狗狗资料，再开始设计私属食谱。</text>
          </view>
          <view v-else class="customer-create-dog-list">
            <view
              v-for="dog in dogs"
              :key="dog.id"
              class="customer-create-dog-card"
              :class="{ 'customer-create-dog-card-active': String(dog.id || '') === selectedCreateDogId }"
              @tap="selectCreateDog(dog.id)"
            >
              <view class="customer-create-dog-main">
                <text class="customer-create-dog-name">{{ dog.name || '未命名狗狗' }}</text>
                <text class="customer-create-dog-stage">{{ getDogScenarioPreview(dog) }}</text>
              </view>
              <text v-if="String(dog.id || '') === selectedCreateDogId" class="customer-create-dog-check">✓</text>
            </view>
          </view>

          <view class="inferred-scenario-row">
            <text class="inferred-scenario-label">已匹配的生命阶段</text>
            <text class="inferred-scenario-value">{{ inferredScenarioLabel }}</text>
          </view>

          <view class="recipe-name-field">
            <text class="sheet-label">食谱名称</text>
            <input
              class="recipe-name-input"
              v-model="recipeNameInput"
              maxlength="40"
              placeholder="例如 Star 的鲜食食谱"
            />
          </view>
        </view>

        <view v-else class="scenario-section">
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
          <button class="confirm-btn" :disabled="!canStartRecipeCreation" @tap="createSeries">
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
  type RecipeDesignerCustomerSeriesCard,
  type RecipeDesignerNutritionWarning,
  type RecipeDesignerSeriesCard,
  type RecipeDesignerSeriesStage,
  type RecipeDesignerSeriesStatusFilter,
  type RecipeSeriesStageStatus,
} from '../../api/recipe-designer'
import { dogApi } from '../../api/dogs'
import { resolveDogRecipeLifeStage, type DogForLifeStage } from '../../utils/life-stage-match'
import { getScenarioLabel } from './assessment'

type SeriesListItem = RecipeDesignerSeriesCard | RecipeDesignerCustomerSeriesCard

const scenarioByDogRecipeLifeStage: Record<string, FediafDogScenario> = {
  PUPPY_UNDER_14_WEEKS: 'EARLY_GROWTH_REPRODUCTION',
  PUPPY_14_WEEKS_PLUS: 'LATE_GROWTH',
  LOW_ACTIVITY_ADULT_OR_SENIOR: 'ADULT_MER_95',
  HIGH_ACTIVITY_ADULT: 'ADULT_MER_110',
  REPRODUCTION: 'REPRODUCTION',
}

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
  MODIFIED: '已修改',
  SUBMITTED: '已提交',
  PUBLISHED: '已发布',
  PRIVATE_CUSTOM: '私密定制',
}

const statusFilterOptions: Array<{ label: string; value: '' | RecipeDesignerSeriesStatusFilter }> = [
  { label: '全部', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已发布', value: 'PUBLIC' },
  { label: '私密定制', value: 'PRIVATE_CUSTOM' },
]

const seriesBusinessStatusLabels: Record<RecipeDesignerSeriesStatusFilter, string> = {
  DRAFT: '草稿',
  PUBLIC: '已发布',
  PRIVATE_CUSTOM: '私密定制',
}

const series = ref<SeriesListItem[]>([])
const dogs = ref<any[]>([])
const loading = ref(false)
const creating = ref(false)
const deletingSeriesId = ref('')
const duplicatingSeriesId = ref('')
const duplicatingStageKey = ref('')
const copyingStageKey = ref('')
const renamingSeriesId = ref('')
const openingStageKey = ref('')
const activeCustomerMenuSeriesId = ref('')
const customerSnapshotCreatingKey = ref('')
const createSheetVisible = ref(false)
const newDraftScenario = ref<FediafDogScenario>('ADULT_MER_110')
const currentUserRole = ref('')
const selectedSeriesStatusFilter = ref<'' | RecipeDesignerSeriesStatusFilter>('')
const selectedDogFilterId = ref('')
const selectedCreateDogId = ref('')
const recipeNameInput = ref('')

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

const canUseAdminStatusFilter = computed(() => !isCustomerMode.value)

const pageTitle = computed(() =>
  isCustomerMode.value ? '我的食谱设计' : '食谱设计器',
)

const listSubtitle = computed(() =>
  isCustomerMode.value ? '按狗狗查看私属食谱草稿' : '食谱系列与生命阶段',
)

const emptyTitle = computed(() =>
  isCustomerMode.value ? '暂无食谱设计' : '暂无食谱系列',
)

const emptySubtitle = computed(() =>
  isCustomerMode.value ? '先选择狗狗，再开始设计专属鲜食' : '点击新建食谱开始设计',
)

const dogFilterOptions = computed(() => [
  { id: '', name: '全部狗狗' },
  ...dogs.value.map((dog) => ({
    id: String(dog.id || ''),
    name: String(dog.name || '未命名狗狗'),
  })),
])

const customerSeriesCards = computed<RecipeDesignerCustomerSeriesCard[]>(() => {
  if (!isCustomerMode.value) return []
  return (series.value as RecipeDesignerCustomerSeriesCard[]).filter((item) =>
    selectedDogFilterId.value ? item.customerDogId === selectedDogFilterId.value : true,
  )
})

const internalSeriesCards = computed<RecipeDesignerSeriesCard[]>(() => {
  return isCustomerMode.value ? [] : (series.value as RecipeDesignerSeriesCard[])
})

const visibleSeriesEmpty = computed(() =>
  isCustomerMode.value ? customerSeriesCards.value.length === 0 : internalSeriesCards.value.length === 0,
)

const inferredScenarioLabel = computed(() =>
  FEDIAF_DOG_SCENARIO_LABELS[newDraftScenario.value] || getScenarioLabel(newDraftScenario.value),
)

const canStartRecipeCreation = computed(() => {
  if (creating.value) return false
  if (!isCustomerMode.value) return true
  return Boolean(selectedCreateDogId.value && recipeNameInput.value.trim())
})

onShow(() => {
  currentUserRole.value = getCurrentUserRole()
  if (isCustomerMode.value) {
    selectedSeriesStatusFilter.value = ''
    void loadDogsForCustomerMode()
  }
  loadSeries()
})

async function loadDogsForCustomerMode() {
  if (!isCustomerMode.value) return
  try {
    const res: any = await dogApi.list()
    const data = res?.data ?? res
    dogs.value = Array.isArray(data) ? data : data?.items || []
    if (selectedDogFilterId.value && !dogs.value.some((dog) => String(dog.id || '') === selectedDogFilterId.value)) {
      selectedDogFilterId.value = ''
    }
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to load dogs:', error)
    dogs.value = []
    uni.showToast({ title: '加载狗狗失败', icon: 'none' })
  }
}

async function loadSeries() {
  loading.value = true
  try {
    const res: any = await recipeDesignerApi.listSeries({
      status: selectedSeriesStatusFilter.value || undefined,
    })
    const data = res?.data ?? res
    series.value = Array.isArray(data) ? data : data?.items || data?.series || []
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to load series:', error)
    uni.showToast({ title: '加载食谱系列失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function selectSeriesStatusFilter(value: '' | RecipeDesignerSeriesStatusFilter) {
  if (selectedSeriesStatusFilter.value === value) return
  selectedSeriesStatusFilter.value = value
  loadSeries()
}

function openCreateDraftSheet() {
  if (creating.value) return
  if (isCustomerMode.value) {
    prepareCustomerCreateSheet()
  }
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

function selectDogFilter(dogId: string) {
  selectedDogFilterId.value = dogId
  activeCustomerMenuSeriesId.value = ''
}

function selectCreateDog(dogId: string) {
  if (creating.value) return
  selectedCreateDogId.value = dogId
  const dog = dogs.value.find((item) => String(item.id || '') === dogId)
  newDraftScenario.value = resolveScenarioForDog(dog)
  recipeNameInput.value = buildDefaultRecipeName(dog)
}

function getScenarioDescription(value: FediafDogScenario) {
  return FEDIAF_DOG_SCENARIO_DESCRIPTIONS[value] || ''
}

async function createSeries() {
  if (creating.value) return

  creating.value = true
  try {
    if (isCustomerMode.value && !selectedCreateDogId.value) {
      uni.showToast({ title: '请选择狗狗', icon: 'none' })
      return
    }
    if (isCustomerMode.value && !recipeNameInput.value.trim()) {
      uni.showToast({ title: '请输入食谱名称', icon: 'none' })
      return
    }

    const createPayload = {
      name: isCustomerMode.value ? recipeNameInput.value.trim() : '未命名食谱',
      scenario: newDraftScenario.value,
      ...(isCustomerMode.value ? { dogId: selectedCreateDogId.value } : {}),
    }
    const res: any = await recipeDesignerApi.createSeries(createPayload)
    const created = res?.data ?? res
    const draftId = extractInitialDraftId(created)
    createSheetVisible.value = false
    resetCreateSheetState()
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
    payload?.id ||
    payload?.primaryDraftId ||
    payload?.draftId ||
    payload?.draft?.id ||
    payload?.initialDraft?.id ||
    payload?.stages?.find((stage: any) => stage?.draftId)?.draftId ||
    ''
  )
}

function prepareCustomerCreateSheet() {
  const firstDogId = selectedCreateDogId.value || selectedDogFilterId.value || String(dogs.value[0]?.id || '')
  selectedCreateDogId.value = firstDogId
  const dog = dogs.value.find((item) => String(item.id || '') === firstDogId)
  newDraftScenario.value = resolveScenarioForDog(dog)
  recipeNameInput.value = buildDefaultRecipeName(dog)
}

function resetCreateSheetState() {
  if (isCustomerMode.value) {
    selectedCreateDogId.value = ''
    recipeNameInput.value = ''
  }
  newDraftScenario.value = 'ADULT_MER_110'
}

function resolveScenarioForDog(dog: DogForLifeStage | null | undefined): FediafDogScenario {
  const recipeLifeStage = resolveDogRecipeLifeStage(dog, [])
  return recipeLifeStage ? scenarioByDogRecipeLifeStage[recipeLifeStage] || 'ADULT_MER_95' : 'ADULT_MER_95'
}

function buildDefaultRecipeName(dog?: any) {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${dog?.name || '爱犬'} 的鲜食食谱 ${mm}/${dd}`
}

function getDogScenarioPreview(dog: any) {
  return FEDIAF_DOG_SCENARIO_LABELS[resolveScenarioForDog(dog)]
}

function getCustomerCardDogName(seriesItem: RecipeDesignerCustomerSeriesCard) {
  if (seriesItem.customerDogName) return seriesItem.customerDogName
  const dog = dogs.value.find((item) => String(item.id || '') === String(seriesItem.customerDogId || ''))
  return dog?.name || '爱犬'
}

function getCustomerScenarioLabel(seriesItem: RecipeDesignerCustomerSeriesCard) {
  if (seriesItem.scenarioLabel) return seriesItem.scenarioLabel
  if (seriesItem.scenario) return FEDIAF_DOG_SCENARIO_LABELS[seriesItem.scenario] || getScenarioLabel(seriesItem.scenario)
  return '待确认阶段'
}

function getCustomerStatusLabel(seriesItem: RecipeDesignerCustomerSeriesCard) {
  const labels: Record<string, string> = {
    EMPTY: '待设计',
    DRAFT: '设计中',
    READY: '可继续',
  }
  return labels[seriesItem.customerStatus || 'DRAFT'] || '设计中'
}

function getCustomerStatusClass(seriesItem: RecipeDesignerCustomerSeriesCard) {
  return `customer-status-${seriesItem.customerStatus || 'DRAFT'}`
}

function openCustomerRecipeCard(seriesItem: RecipeDesignerCustomerSeriesCard) {
  const draftId = seriesItem.primaryDraftId
  if (!draftId) {
    uni.showToast({ title: '暂无可编辑草稿', icon: 'none' })
    return
  }
  uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draftId}` })
}

function isCustomerSeriesBusy(seriesItem: RecipeDesignerCustomerSeriesCard) {
  return (
    renamingSeriesId.value === seriesItem.id ||
    duplicatingSeriesId.value === seriesItem.id ||
    deletingSeriesId.value === seriesItem.id ||
    customerSnapshotCreatingKey.value.startsWith(`${seriesItem.id}:`)
  )
}

function closeCustomerRecipeMenu() {
  activeCustomerMenuSeriesId.value = ''
}

function toggleCustomerRecipeMenu(seriesItem: RecipeDesignerCustomerSeriesCard) {
  if (isCustomerSeriesBusy(seriesItem)) return
  activeCustomerMenuSeriesId.value =
    activeCustomerMenuSeriesId.value === seriesItem.id ? '' : seriesItem.id
}

function renameCustomerRecipe(seriesItem: RecipeDesignerCustomerSeriesCard) {
  closeCustomerRecipeMenu()
  renameSeries(seriesItem as RecipeDesignerSeriesCard)
}

function duplicateCustomerRecipe(seriesItem: RecipeDesignerCustomerSeriesCard) {
  if (duplicatingSeriesId.value) return

  closeCustomerRecipeMenu()
  const seriesName = seriesItem.name || '未命名食谱'
  uni.showModal({
    title: '复制',
    content: `将「${seriesName}」复制为新的可编辑食谱，原食谱不会被修改。`,
    confirmText: '复制',
    cancelText: '取消',
    success: async (result: any) => {
      if (!result.confirm) return

      duplicatingSeriesId.value = seriesItem.id
      try {
        const res: any = await recipeDesignerApi.duplicateSeries(seriesItem.id)
        const copied = res?.data ?? res
        uni.showToast({ title: '已创建副本', icon: 'success' })
        const draftId = extractInitialDraftId(copied)
        if (draftId) {
          uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draftId}` })
          return
        }
        await loadSeries()
      } catch (error) {
        console.error('[RecipeDesignerList] Failed to duplicate customer recipe:', error)
        uni.showToast({ title: '复制食谱失败', icon: 'none' })
      } finally {
        duplicatingSeriesId.value = ''
      }
    },
  })
}

function deleteCustomerRecipe(seriesItem: RecipeDesignerCustomerSeriesCard) {
  if (deletingSeriesId.value) return

  closeCustomerRecipeMenu()
  const seriesName = seriesItem.name || '未命名食谱'
  uni.showModal({
    title: '删除食谱',
    content: `确定要删除「${seriesName}」吗？删除后不可恢复。`,
    confirmText: '删除',
    confirmColor: '#cf1322',
    cancelText: '取消',
    success: async (result: any) => {
      if (!result.confirm) return

      deletingSeriesId.value = seriesItem.id
      try {
        await recipeDesignerApi.deleteSeries(seriesItem.id, {
          confirmName: seriesName,
          confirmUserVisibleRemoval: true,
        })
        await loadSeries()
        uni.showToast({ title: '已删除', icon: 'success' })
      } catch (error) {
        console.error('[RecipeDesignerList] Failed to delete customer recipe:', error)
        uni.showToast({ title: '删除失败', icon: 'none' })
      } finally {
        deletingSeriesId.value = ''
      }
    },
  })
}

function canGenerateDiyFromCustomerCard(seriesItem: RecipeDesignerCustomerSeriesCard) {
  return Boolean(seriesItem.primaryDraftId && seriesItem.actionAvailability?.canGenerateDiy)
}

function canOrderFromCustomerCard(seriesItem: RecipeDesignerCustomerSeriesCard) {
  return Boolean(seriesItem.primaryDraftId && seriesItem.actionAvailability?.canOrder)
}

function getCustomerSnapshotKey(seriesItem: RecipeDesignerCustomerSeriesCard, target: 'ORDER' | 'DIY') {
  return `${seriesItem.id}:${target}`
}

function isCustomerSnapshotCreating(seriesItem: RecipeDesignerCustomerSeriesCard, target: 'ORDER' | 'DIY') {
  return customerSnapshotCreatingKey.value === getCustomerSnapshotKey(seriesItem, target)
}

function getNutritionWarningMessage(warning?: RecipeDesignerNutritionWarning | null) {
  if (!warning?.hasWarning) return ''
  return (
    warning.message ||
    '当前食谱仍有营养项未达标或缺少数据。你可以继续生成制作单/订购，也可以返回调整食谱。'
  )
}

function confirmCustomerNutritionWarning(warning?: RecipeDesignerNutritionWarning | null) {
  const content = getNutritionWarningMessage(warning)
  if (!content) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '营养提醒',
      content,
      confirmText: '继续',
      cancelText: '返回调整',
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    })
  })
}

async function goToCustomerRecipeTarget(seriesItem: RecipeDesignerCustomerSeriesCard, target: 'ORDER' | 'DIY') {
  activeCustomerMenuSeriesId.value = ''
  const draftId = seriesItem.primaryDraftId
  if (!draftId) {
    uni.showToast({ title: '暂无可用草稿', icon: 'none' })
    return
  }
  const allowed = target === 'DIY'
    ? seriesItem.actionAvailability?.canGenerateDiy
    : seriesItem.actionAvailability?.canOrder
  if (!allowed) {
    uni.showToast({
      title: seriesItem.actionAvailability?.disabledReason || '当前食谱还未达到可用条件',
      icon: 'none',
    })
    return
  }
  if (!(await confirmCustomerNutritionWarning(seriesItem.actionAvailability?.nutritionWarning))) {
    return
  }

  const creatingKey = getCustomerSnapshotKey(seriesItem, target)
  if (customerSnapshotCreatingKey.value) return

  customerSnapshotCreatingKey.value = creatingKey
  try {
    const res: any = await recipeDesignerApi.createPrivateRecipeSnapshot(draftId, { target })
    const data = res?.data ?? res
    const fallbackDogId = data?.dogId || seriesItem.customerDogId || ''
    const url = data?.targetUrl || (
      target === 'DIY'
        ? `/pages/recipe-diy/index?recipeId=${data?.recipeId}&dogId=${fallbackDogId}`
        : `/pages/recipe-order/index?recipeId=${data?.recipeId}&dogId=${fallbackDogId}`
    )
    if (!data?.recipeId && !data?.targetUrl) {
      uni.showToast({ title: '暂时无法进入下一步', icon: 'none' })
      return
    }
    uni.navigateTo({ url })
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to open customer recipe target:', error)
    uni.showToast({ title: '暂时无法进入下一步', icon: 'none' })
  } finally {
    customerSnapshotCreatingKey.value = ''
  }
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
  const stageKey = getStageKey(seriesItem, stage)
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

function getStageKey(seriesItem: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  return `${seriesItem.id}:${stage.lifeStage}`
}

function formatSeriesMeta(seriesItem: RecipeDesignerSeriesCard) {
  const editedText = `最近编辑 ${formatDateTime(seriesItem.updatedAt)}`
  if (isCustomerMode.value) {
    return editedText
  }
  return `${editedText} · 已发布 ${seriesItem.publishedStageCount || 0}/5`
}

function getSeriesBusinessStatusLabel(seriesItem: RecipeDesignerSeriesCard) {
  const status = seriesItem.businessStatus
  if (!status) return seriesBusinessStatusLabels.DRAFT
  return seriesItem.businessStatusLabel || seriesBusinessStatusLabels[status] || status
}

function getSeriesBusinessStatusClass(seriesItem: RecipeDesignerSeriesCard) {
  return `series-business-${seriesItem.businessStatus || 'DRAFT'}`
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

function canDuplicateStage(stage: RecipeDesignerSeriesStage) {
  if (isCustomerMode.value && stage.status === 'PUBLISHED') return false
  return Boolean(stage.draftId || stage.recipeId) && stage.status !== 'NOT_DESIGNED'
}

function canCopyIngredientsIntoStage(seriesItem: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  if (isCustomerMode.value) return false
  return (
    stage.status !== 'NOT_DESIGNED' &&
    Boolean(stage.draftId || stage.recipeId) &&
    getCopyableIngredientSourceStages(seriesItem, stage).length > 0
  )
}

function canOpenStageActions(seriesItem: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  return canDuplicateStage(stage) || canCopyIngredientsIntoStage(seriesItem, stage)
}

function isStageActionBusy(seriesItem: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  const stageKey = getStageKey(seriesItem, stage)
  return duplicatingStageKey.value === stageKey || copyingStageKey.value === stageKey
}

function getCopyableIngredientSourceStages(
  seriesItem: RecipeDesignerSeriesCard,
  targetStage: RecipeDesignerSeriesStage,
) {
  return getSeriesStages(seriesItem).filter(
    (stage) =>
      stage.lifeStage !== targetStage.lifeStage &&
      stage.status !== 'NOT_DESIGNED' &&
      Boolean(stage.draftId || stage.recipeId),
  )
}

function buildStageActionItems(seriesItem: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  const items: string[] = []
  if (canDuplicateStage(stage)) {
    items.push('复制此生命阶段')
  }
  if (canCopyIngredientsIntoStage(seriesItem, stage)) {
    items.push('从其他阶段复制原料')
  }
  return items
}

function openStageActionSheet(seriesItem: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  const actionItems = buildStageActionItems(seriesItem, stage)
  if (actionItems.length === 0) return

  uni.showActionSheet({
    itemList: actionItems,
    success: (result: any) => {
      const action = actionItems[result.tapIndex]
      if (action === '复制此生命阶段') {
        duplicateSeriesStage(seriesItem, stage)
        return
      }
      if (action === '从其他阶段复制原料') {
        openStageIngredientCopySheet(seriesItem, stage)
      }
    },
  })
}

function openStageIngredientCopySheet(
  seriesItem: RecipeDesignerSeriesCard,
  stage: RecipeDesignerSeriesStage,
) {
  const sourceStages = getCopyableIngredientSourceStages(seriesItem, stage)
  if (sourceStages.length === 0) {
    uni.showToast({ title: '暂无可复制的来源阶段', icon: 'none' })
    return
  }

  uni.showActionSheet({
    title: '选择来源阶段',
    itemList: sourceStages.map((sourceStage) => `复制${getStageTemplateLabel(sourceStage)}原料`),
    success: (result: any) => {
      const sourceStage = sourceStages[result.tapIndex]
      if (!sourceStage) return
      confirmCopyStageIngredients(seriesItem, stage, sourceStage)
    },
  })
}

function confirmCopyStageIngredients(
  seriesItem: RecipeDesignerSeriesCard,
  stage: RecipeDesignerSeriesStage,
  sourceStage: RecipeDesignerSeriesStage,
) {
  const targetLabel = getStageTemplateLabel(stage)
  const sourceLabel = getStageTemplateLabel(sourceStage)
  uni.showModal({
    title: '覆盖原料列表',
    content: `将用「${sourceLabel}」的原料列表覆盖「${targetLabel}」当前草稿，已发布版本不会直接改变。`,
    confirmText: '覆盖',
    cancelText: '取消',
    success: (result: any) => {
      if (!result.confirm) return
      void copyStageIngredientsFromSource(seriesItem, stage, sourceStage)
    },
  })
}

function openSeriesActionSheet(seriesItem: RecipeDesignerSeriesCard) {
  if (
    renamingSeriesId.value === seriesItem.id ||
    deletingSeriesId.value === seriesItem.id ||
    duplicatingSeriesId.value === seriesItem.id
  ) {
    return
  }

  uni.showActionSheet({
    itemList: buildSeriesActionItems(seriesItem),
    success: (result: any) => {
      const action = buildSeriesActionItems(seriesItem)[result.tapIndex]
      if (action === '重命名') {
        renameSeries(seriesItem)
        return
      }
      if (action === '复制整个系列') {
        duplicateSeries(seriesItem)
        return
      }
      if (action === '删除') {
        deleteSeries(seriesItem)
      }
    },
  })
}

function buildSeriesActionItems(_seriesItem: RecipeDesignerSeriesCard) {
  return ['重命名', '复制整个系列', '删除']
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

function duplicateSeries(seriesItem: RecipeDesignerSeriesCard) {
  if (duplicatingSeriesId.value) return

  const seriesName = seriesItem.name || '未命名食谱'
  uni.showModal({
    title: '复制整个系列',
    content: `将「${seriesName}」复制为新的可编辑食谱系列，原食谱不会被修改。`,
    confirmText: '复制',
    cancelText: '取消',
    success: async (result: any) => {
      if (!result.confirm) return

      duplicatingSeriesId.value = seriesItem.id
      try {
        const res: any = await recipeDesignerApi.duplicateSeries(seriesItem.id)
        const copied = res?.data ?? res
        uni.showToast({ title: '已创建副本', icon: 'success' })
        const draftId = extractInitialDraftId(copied)
        if (draftId) {
          uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draftId}` })
          return
        }
        await loadSeries()
      } catch (error) {
        console.error('[RecipeDesignerList] Failed to duplicate series:', error)
        uni.showToast({ title: '复制系列失败', icon: 'none' })
      } finally {
        duplicatingSeriesId.value = ''
      }
    },
  })
}

async function duplicateSeriesStage(seriesItem: RecipeDesignerSeriesCard, stage: RecipeDesignerSeriesStage) {
  const stageKey = getStageKey(seriesItem, stage)
  if (duplicatingStageKey.value) return

  duplicatingStageKey.value = stageKey
  try {
    const res: any = await recipeDesignerApi.duplicateSeriesStage(seriesItem.id, stage.lifeStage)
    const copied = res?.data ?? res
    const draftId = extractInitialDraftId(copied)
    uni.showToast({ title: '已复制生命阶段', icon: 'success' })
    if (draftId) {
      uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draftId}` })
      return
    }
    await loadSeries()
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to duplicate series stage:', error)
    uni.showToast({ title: '复制生命阶段失败', icon: 'none' })
  } finally {
    duplicatingStageKey.value = ''
  }
}

async function copyStageIngredientsFromSource(
  seriesItem: RecipeDesignerSeriesCard,
  stage: RecipeDesignerSeriesStage,
  sourceStage: RecipeDesignerSeriesStage,
) {
  const stageKey = getStageKey(seriesItem, stage)
  if (copyingStageKey.value) return

  copyingStageKey.value = stageKey
  try {
    const res: any = await recipeDesignerApi.copySeriesStageIngredients(seriesItem.id, stage.lifeStage, {
      sourceLifeStage: sourceStage.lifeStage,
    })
    const draft = res?.data ?? res
    const draftId = extractInitialDraftId(draft)
    uni.showToast({ title: '已复制原料', icon: 'success' })
    if (draftId) {
      uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${draftId}` })
      return
    }
    await loadSeries()
  } catch (error) {
    console.error('[RecipeDesignerList] Failed to copy series stage ingredients:', error)
    uni.showToast({ title: '复制原料失败', icon: 'none' })
  } finally {
    copyingStageKey.value = ''
  }
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

.status-filter-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10rpx;
  margin-bottom: 24rpx;
  padding: 8rpx;
  border-radius: 12rpx;
  background: #fff;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.status-filter-btn {
  height: 60rpx;
  margin: 0;
  padding: 0 8rpx;
  border-radius: 8rpx;
  background: #f5f7fa;
  color: #666;
  font-size: 24rpx;
  line-height: 60rpx;
}

.status-filter-btn-active {
  background: #e6f4ff;
  color: #1677ff;
  font-weight: 700;
}

.customer-dog-filter {
  display: flex;
  gap: 12rpx;
  margin-bottom: 20rpx;
  padding-bottom: 4rpx;
  overflow-x: auto;
  white-space: nowrap;
}

.dog-filter-btn {
  flex: 0 0 auto;
  height: 60rpx;
  margin: 0;
  padding: 0 22rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 999rpx;
  background: #fff;
  color: #475569;
  font-size: 24rpx;
  line-height: 60rpx;
}

.dog-filter-btn-active {
  border-color: #1677ff;
  background: #e6f4ff;
  color: #1677ff;
  font-weight: 700;
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

.customer-series-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.customer-card-menu-backdrop {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 5;
  background: transparent;
}

.customer-recipe-card {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 20rpx;
  padding: 24rpx;
  border: 1rpx solid #eef2f7;
  border-radius: 8rpx;
  background: #fff;
  box-shadow: 0 2rpx 8rpx rgba(15, 23, 42, 0.04);
}

.customer-card-main {
  flex: 1;
  min-width: 0;
}

.customer-card-title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.customer-card-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #111827;
  font-size: 30rpx;
  font-weight: 800;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.customer-status-badge {
  flex: 0 0 auto;
  padding: 6rpx 12rpx;
  border-radius: 8rpx;
  background: #eef5ff;
  color: #1677ff;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 1.2;
}

.customer-status-EMPTY {
  background: #f5f5f5;
  color: #777;
}

.customer-status-READY {
  background: #f6ffed;
  color: #389e0d;
}

.customer-card-meta,
.customer-disabled-reason {
  display: block;
  margin-top: 8rpx;
  overflow: hidden;
  color: #64748b;
  font-size: 23rpx;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.customer-disabled-reason {
  color: #b45309;
}

.customer-card-actions {
  position: relative;
  flex: 0 0 180rpx;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12rpx;
}

.customer-card-menu-anchor {
  position: relative;
  z-index: 7;
  display: flex;
  justify-content: flex-end;
  min-height: 44rpx;
}

.customer-card-more-btn {
  width: 52rpx;
  height: 44rpx;
  margin: 0;
  padding: 0;
  border-radius: 8rpx;
  background: #f8fafc;
  color: #475569;
  font-size: 32rpx;
  font-weight: 800;
  line-height: 38rpx;
}

.customer-card-more-btn[disabled] {
  color: #a8b4c2;
  background: #f3f4f6;
}

.customer-card-menu {
  position: absolute;
  top: 52rpx;
  right: 0;
  z-index: 8;
  width: 184rpx;
  overflow: hidden;
  border: 1rpx solid #e5e7eb;
  border-radius: 8rpx;
  background: #fff;
  box-shadow: 0 10rpx 28rpx rgba(15, 23, 42, 0.14);
}

.customer-card-menu-item {
  width: 100%;
  height: 64rpx;
  margin: 0;
  padding: 0 18rpx;
  border-radius: 0;
  background: #fff;
  color: #1f2937;
  font-size: 24rpx;
  font-weight: 700;
  line-height: 64rpx;
  text-align: left;
}

.customer-card-menu-item + .customer-card-menu-item {
  border-top: 1rpx solid #f1f5f9;
}

.customer-card-menu-item[disabled] {
  color: #94a3b8;
  background: #f8fafc;
}

.customer-card-menu-delete {
  color: #cf1322;
}

.customer-card-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: auto;
}

.customer-quick-btn {
  width: 100%;
  height: 54rpx;
  margin: 0;
  padding: 0 8rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 54rpx;
}

.customer-quick-diy-btn {
  background: #f0f7ff;
  color: #1677ff;
}

.customer-quick-order-btn {
  background: #1677ff;
  color: #fff;
}

.customer-quick-btn[disabled] {
  background: #e5e7eb;
  color: #94a3b8;
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

.series-name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.series-name {
  display: block;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #222;
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.series-business-badge {
  flex-shrink: 0;
  padding: 6rpx 12rpx;
  border-radius: 8rpx;
  background: #fff7e6;
  color: #d46b08;
  font-size: 21rpx;
  line-height: 1.2;
}

.series-business-PUBLIC {
  background: #f6ffed;
  color: #389e0d;
}

.series-business-PRIVATE_CUSTOM {
  background: #fff1f0;
  color: #cf1322;
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

.stage-more-btn {
  flex-shrink: 0;
  width: 48rpx;
  height: 48rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  background: #eef5ff;
  color: #1677ff;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 42rpx;
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

.stage-status-MODIFIED {
  background: #fffbe6;
  color: #ad8b00;
}

.stage-status-SUBMITTED {
  background: #f0f6ff;
  color: #1677ff;
}

.stage-status-PUBLISHED {
  background: #f6ffed;
  color: #389e0d;
}

.stage-status-PRIVATE_CUSTOM {
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

.customer-create-section {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.customer-create-empty {
  padding: 24rpx;
  border-radius: 8rpx;
  background: #f8fafc;
  color: #64748b;
  font-size: 24rpx;
  line-height: 1.5;
}

.customer-create-dog-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.customer-create-dog-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  min-height: 92rpx;
  padding: 18rpx 20rpx;
  border: 1rpx solid #edf0f5;
  border-radius: 8rpx;
  background: #fbfcfe;
  box-sizing: border-box;
}

.customer-create-dog-card-active {
  border-color: #91caff;
  background: #eef8ff;
}

.customer-create-dog-main {
  flex: 1;
  min-width: 0;
}

.customer-create-dog-name,
.customer-create-dog-stage {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.customer-create-dog-name {
  color: #222;
  font-size: 28rpx;
  font-weight: 800;
  line-height: 1.35;
}

.customer-create-dog-stage {
  margin-top: 6rpx;
  color: #667085;
  font-size: 22rpx;
  line-height: 1.35;
}

.customer-create-dog-check {
  flex: 0 0 auto;
  color: #1677ff;
  font-size: 30rpx;
  font-weight: 800;
}

.inferred-scenario-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 18rpx 20rpx;
  border-radius: 8rpx;
  background: #f8fafc;
}

.inferred-scenario-label {
  flex: 0 0 auto;
  color: #667085;
  font-size: 24rpx;
}

.inferred-scenario-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #111827;
  font-size: 25rpx;
  font-weight: 800;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-name-field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.recipe-name-input {
  width: 100%;
  height: 76rpx;
  padding: 0 20rpx;
  border: 1rpx solid #dbe4ef;
  border-radius: 8rpx;
  background: #fff;
  color: #111827;
  font-size: 27rpx;
  box-sizing: border-box;
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
