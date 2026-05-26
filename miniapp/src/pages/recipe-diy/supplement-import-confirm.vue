<template>
  <view class="confirm-page">
    <view class="page-header">
      <view class="title-block">
        <text class="page-title">确认补剂识别结果</text>
        <text class="page-subtitle">请核对原料、规格和营养档案后再入库。</text>
      </view>
      <text v-if="draft.status" class="status-badge">{{ draft.status }}</text>
    </view>

    <view v-if="loading" class="state-panel">
      <text class="state-text">正在加载识别草稿...</text>
    </view>

    <view v-else class="content-stack">
      <view v-if="riskFlags.length" class="notice-panel warning-panel">
        <text class="section-title">识别风险提示</text>
        <view
          v-for="(flag, index) in riskFlags"
          :key="`${formatRiskFlag(flag)}-${index}`"
          class="notice-row"
        >
          <text class="notice-dot">!</text>
          <text class="notice-text">{{ formatRiskFlag(flag) }}</text>
        </view>
      </view>

      <view v-if="allValidationErrors.length" class="notice-panel error-panel">
        <text class="section-title">validationErrors</text>
        <view
          v-for="(error, index) in allValidationErrors"
          :key="`${formatValidationError(error)}-${index}`"
          class="notice-row"
        >
          <text class="notice-dot">!</text>
          <text class="notice-text">{{ formatValidationError(error) }}</text>
        </view>
      </view>

      <view class="section-panel">
        <text class="section-title">基础信息</text>
        <view class="form-grid">
          <view class="form-item">
            <text class="form-label">原料名称</text>
            <input v-model="normalizedDraft.ingredient.name" class="form-input" placeholder="请输入原料名称" />
          </view>
          <view class="form-item">
            <text class="form-label">原料类型</text>
            <input v-model="normalizedDraft.ingredient.type" class="form-input" placeholder="SUPPLEMENT" />
          </view>
          <view class="form-item form-item-wide">
            <text class="form-label">备注说明</text>
            <textarea
              v-model="normalizedDraft.ingredient.notes"
              class="form-textarea"
              placeholder="补充识别依据、适用说明或人工核对备注"
            />
          </view>
          <view class="form-item">
            <text class="form-label">基准单位</text>
            <input v-model="normalizedDraft.ingredient.baseUnit" class="form-input" placeholder="g / ml / 粒" />
          </view>
          <view class="form-item">
            <text class="form-label">标准单位展示名</text>
            <input v-model="normalizedDraft.ingredient.unitDisplayLabel" class="form-input" placeholder="每粒 / 每勺" />
          </view>
          <view class="form-item">
            <text class="form-label">单个重量</text>
            <input
              v-model="normalizedDraft.ingredient.weightG"
              class="form-input"
              type="digit"
              placeholder="例如 0.5"
            />
          </view>
          <view class="form-item">
            <text class="form-label">产品品牌</text>
            <input v-model="normalizedDraft.ingredient.brand" class="form-input" placeholder="请输入品牌" />
          </view>
          <view class="form-item">
            <text class="form-label">产品规格</text>
            <input v-model="normalizedDraft.ingredient.productSpec" class="form-input" placeholder="规格、型号或净含量" />
          </view>
          <view class="form-item">
            <text class="form-label">添加时机</text>
            <input v-model="normalizedDraft.ingredient.addTiming" class="form-input" placeholder="混合前 / 出餐前" />
          </view>
          <view class="form-item">
            <text class="form-label">生产损耗率</text>
            <input
              v-model="normalizedDraft.ingredient.productionLossRate"
              class="form-input"
              type="digit"
              placeholder="例如 0.03"
            />
          </view>
        </view>
      </view>

      <view v-if="duplicateCandidates.length" class="section-panel">
        <text class="section-title">重复候选</text>
        <view class="resolution-row">
          <button
            class="choice-button"
            :class="{ active: normalizedDraft.duplicateResolution?.action === 'CREATE_NEW' }"
            @tap="setDuplicateResolution('CREATE_NEW')"
          >
            CREATE_NEW
          </button>
          <button
            class="choice-button"
            :class="{ active: normalizedDraft.duplicateResolution?.action === 'UPDATE_EXISTING' }"
            @tap="setDuplicateResolution('UPDATE_EXISTING')"
          >
            UPDATE_EXISTING
          </button>
        </view>
        <view class="candidate-list">
          <view
            v-for="candidate in duplicateCandidates"
            :key="candidate.id || candidate.ingredientId || candidate.name"
            class="candidate-card"
            :class="{ selected: isSelectedDuplicateCandidate(candidate) }"
            @tap="selectDuplicateCandidate(candidate)"
          >
            <text class="candidate-name">{{ candidate.name || candidate.ingredientName || '未命名补剂' }}</text>
            <text class="candidate-meta">
              {{ [candidate.brand, candidate.productSpec, candidate.matchReason].filter(Boolean).join(' · ') || '点击选择此候选' }}
            </text>
          </view>
        </view>
      </view>

      <view class="section-panel">
        <view class="section-heading-row">
          <text class="section-title">营养档案</text>
          <text class="section-count">{{ nutritionRows.length }} 项</text>
        </view>
        <view v-if="nutritionRows.length === 0" class="empty-panel">
          <text class="empty-text">暂无可录入的营养项。</text>
        </view>
        <view v-else class="nutrition-stack">
          <view
            v-for="group in nutritionGroups"
            :key="group.key"
            v-show="group.rows.length"
            class="nutrition-group"
          >
            <text class="group-title">{{ group.label }}</text>
            <view
              v-for="row in group.rows"
              :key="row.rowKey"
              class="nutrition-row"
            >
              <view class="nutrition-main">
                <text class="nutrition-name">{{ row.name }}</text>
                <text class="nutrition-value">{{ formatNutritionValue(row.item) }}</text>
              </view>
              <button class="remove-nutrition-button" @tap="removeNutritionItem(group.key, row.itemKey)">删除</button>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="bottom-bar">
      <button class="secondary-button" :disabled="saving || confirming || loading" @tap="saveDraftChanges()">
        {{ saving ? '保存中...' : '保存修改' }}
      </button>
      <button
        class="primary-button"
        :disabled="!canConfirm"
        @tap="confirmDraft"
      >
        {{ confirming ? '入库中...' : '确认入库' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  canShowSupplementImportEntry,
  supplementImportApi,
} from '../../utils/supplement-import'

type DuplicateResolutionAction = 'CREATE_NEW' | 'UPDATE_EXISTING'

const draftId = ref('')
const recipeId = ref('')
const draft = ref<any>({})
const normalizedDraft = ref<any>(createEmptyNormalizedDraft())
const loading = ref(false)
const saving = ref(false)
const confirming = ref(false)

const riskFlags = computed(() => normalizeList(
  normalizedDraft.value?.riskFlags ||
  draft.value?.riskFlags ||
  draft.value?.normalizedDraft?.riskFlags,
))

const allValidationErrors = computed(() => normalizeList(
  normalizedDraft.value?.validationErrors ||
  draft.value?.validationErrors ||
  draft.value?.normalizedDraft?.validationErrors,
))

const duplicateCandidates = computed(() => normalizeList(
  normalizedDraft.value?.duplicateCandidates ||
  draft.value?.duplicateCandidates ||
  draft.value?.normalizedDraft?.duplicateCandidates,
))

const hasValidDuplicateResolution = computed(() => {
  return hasValidDuplicateResolutionFor(normalizedDraft.value, duplicateCandidates.value)
})

function hasValidDuplicateResolutionFor(source: any, candidates: any[]) {
  if (candidates.length === 0) {
    return true
  }

  const resolution = source?.duplicateResolution
  if (resolution?.action === 'CREATE_NEW') {
    return true
  }

  if (resolution?.action === 'UPDATE_EXISTING') {
    return Boolean(resolution.candidateId || resolution.ingredientId)
  }

  return false
}

const nutritionProfile = computed(() => normalizedDraft.value?.nutritionProfile || {})

const nutritionGroups = computed(() => {
  return nutritionGroupDefinitions.map((definition) => ({
    ...definition,
    rows: normalizeNutritionRows(definition.key, nutritionProfile.value?.[definition.key]),
  }))
})

const nutritionRows = computed(() => nutritionGroups.value.flatMap(group => group.rows))

const canConfirm = computed(() => {
  return draft.value?.status === 'READY_TO_CONFIRM' &&
    allValidationErrors.value.length === 0 &&
    hasValidDuplicateResolution.value &&
    !saving.value &&
    !confirming.value
})

onMounted(async () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  draftId.value = currentPage?.options?.draftId || ''
  recipeId.value = currentPage?.options?.recipeId || ''

  if (!ensureAdminAccess()) {
    return
  }

  if (!draftId.value) {
    uni.showToast({ title: '缺少识别草稿 ID', icon: 'none' })
    returnToSafePage()
    return
  }

  await loadDraft()
})

function createEmptyNormalizedDraft() {
  return {
    ingredient: {
      name: '',
      type: 'SUPPLEMENT',
      notes: '',
      baseUnit: '',
      unitDisplayLabel: '',
      weightG: '',
      brand: '',
      productSpec: '',
      addTiming: '',
      productionLossRate: '',
    },
    duplicateResolution: null,
    nutritionProfile: {
      macros: {},
      minerals: {},
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    },
  }
}

function ensureAdminAccess(): boolean {
  if (canShowSupplementImportEntry()) {
    return true
  }

  uni.showToast({ title: '仅管理员可确认补剂识别结果', icon: 'none' })
  setTimeout(returnToSafePage, 600)
  return false
}

function returnToSafePage() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }

  uni.redirectTo({ url: '/pages/recipe-list/index' })
}

async function loadDraft() {
  loading.value = true
  try {
    const response: any = await supplementImportApi.getDraft(draftId.value)
    draft.value = response.data || {}
    normalizedDraft.value = normalizeDraftForEditing(response.data?.normalizedDraft)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载识别草稿失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function normalizeDraftForEditing(source: any) {
  const empty = createEmptyNormalizedDraft()
  const next = {
    ...empty,
    ...(source || {}),
    ingredient: {
      ...empty.ingredient,
      ...(source?.ingredient || {}),
    },
    duplicateResolution: {
      ...empty.duplicateResolution,
      ...(source?.duplicateResolution || {}),
    },
    nutritionProfile: {
      ...empty.nutritionProfile,
      ...(source?.nutritionProfile || {}),
    },
  }

  next.ingredient.addTiming = next.ingredient.addTiming ||
    next.ingredient.properties?.addTiming ||
    next.ingredient.properties?.add_timing ||
    ''
  next.ingredient.productionLossRate = next.ingredient.productionLossRate ??
    next.ingredient.properties?.productionLossRate ??
    next.ingredient.properties?.production_loss_rate ??
    ''

  return next
}

function normalizeDraftBeforeSave(source: any) {
  const next = {
    ...source,
    ingredient: {
      ...(source?.ingredient || {}),
    },
  }

  next.ingredient.weightG = toOptionalNumber(next.ingredient.weightG)
  next.ingredient.productionLossRate = toOptionalNumber(next.ingredient.productionLossRate)
  next.ingredient.properties = {
    ...(next.ingredient.properties || {}),
    addTiming: next.ingredient.addTiming || '',
    add_timing: next.ingredient.addTiming || '',
    productionLossRate: next.ingredient.productionLossRate,
    production_loss_rate: next.ingredient.productionLossRate,
  }

  return next
}

async function saveDraftChanges(options: { showSuccessToast?: boolean } = {}) {
  if (!draftId.value || saving.value) {
    return null
  }

  const showSuccessToast = options.showSuccessToast !== false
  saving.value = true
  try {
    const response: any = await supplementImportApi.updateDraft(
      draftId.value,
      normalizeDraftBeforeSave(normalizedDraft.value),
    )
    draft.value = response.data || {}
    normalizedDraft.value = normalizeDraftForEditing(response.data?.normalizedDraft)
    if (showSuccessToast) {
      uni.showToast({ title: '已保存', icon: 'success' })
    }
    return draft.value
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存识别草稿失败', icon: 'none' })
    throw error
  } finally {
    saving.value = false
  }
}

async function confirmDraft() {
  if (!canConfirm.value || confirming.value) {
    return
  }

  confirming.value = true
  let saved = false
  try {
    const savedDraft = await saveDraftChanges({ showSuccessToast: false })
    saved = true
    if (!canConfirmSavedDraft(savedDraft)) {
      uni.showToast({ title: '请先处理校验问题', icon: 'none' })
      return
    }

    const response: any = await supplementImportApi.confirmDraft(draftId.value)
    const confirmedIngredientId = response.data?.confirmedIngredientId || ''
    uni.showToast({ title: '已入库', icon: 'success' })
    uni.redirectTo({
      url: `/pages/recipe-diy/supplement-library?recipeId=${encodeURIComponent(recipeId.value)}&ingredientId=${encodeURIComponent(confirmedIngredientId)}`,
    })
  } catch (error: any) {
    if (saved) {
      uni.showToast({ title: error?.message || '确认补剂入库失败', icon: 'none' })
    }
  } finally {
    confirming.value = false
  }
}

function canConfirmSavedDraft(savedDraft: any): boolean {
  const savedNormalizedDraft = savedDraft?.normalizedDraft || {}
  return savedDraft?.status === 'READY_TO_CONFIRM' &&
    normalizeList(savedDraft?.validationErrors || savedNormalizedDraft.validationErrors).length === 0 &&
    hasValidDuplicateResolutionFor(
      savedNormalizedDraft,
      normalizeList(savedNormalizedDraft.duplicateCandidates || savedDraft?.duplicateCandidates),
    )
}

function setDuplicateResolution(action: DuplicateResolutionAction) {
  normalizedDraft.value.duplicateResolution = {
    ...(normalizedDraft.value.duplicateResolution || {}),
    action,
  }
}

function selectDuplicateCandidate(candidate: any) {
  setDuplicateResolution('UPDATE_EXISTING')
  normalizedDraft.value.duplicateResolution = {
    ...(normalizedDraft.value.duplicateResolution || {}),
    candidateId: candidate.id || candidate.ingredientId || '',
    ingredientId: candidate.ingredientId || candidate.id || '',
  }
}

function isSelectedDuplicateCandidate(candidate: any): boolean {
  const selected = normalizedDraft.value?.duplicateResolution?.candidateId ||
    normalizedDraft.value?.duplicateResolution?.ingredientId
  return Boolean(selected && selected === (candidate.id || candidate.ingredientId))
}

function removeNutritionItem(groupKey: string, itemKey: string | number) {
  const profile = {
    ...(normalizedDraft.value.nutritionProfile || {}),
  }
  const group = profile[groupKey]

  if (Array.isArray(group)) {
    profile[groupKey] = group.filter((_, index) => index !== Number(itemKey))
  } else if (group && typeof group === 'object') {
    const nextGroup = { ...group }
    delete nextGroup[itemKey]
    profile[groupKey] = nextGroup
  }

  normalizedDraft.value = {
    ...normalizedDraft.value,
    nutritionProfile: profile,
  }
}

function normalizeList(value: any): any[] {
  if (Array.isArray(value)) {
    return value
  }

  if (!value) {
    return []
  }

  return [value]
}

function isBlockingValidationError(error: any): boolean {
  const level = String(error?.level || error?.severity || error?.type || '').toUpperCase()
  if (!level) {
    return true
  }

  return ['BLOCKING', 'ERROR', 'REQUIRED', 'FATAL'].includes(level)
}

function formatValidationError(error: any): string {
  if (typeof error === 'string') {
    return error
  }

  return error?.message || error?.field || JSON.stringify(error)
}

function formatRiskFlag(flag: any): string {
  const riskLabels: Record<string, string> = {
    PHOTO_BLUR: '照片模糊，请核对识别结果',
    BLURRY_PHOTO: '照片模糊，请核对识别结果',
    INCOMPLETE_INFO: '信息不全，请补充包装或成分表缺失项',
    OCR_RISK: '识别风险，请人工复核数值和单位',
  }

  if (typeof flag === 'string') {
    return riskLabels[flag] || flag
  }

  return flag?.message || riskLabels[flag?.code] || flag?.code || '识别风险，请人工复核'
}

function normalizeNutritionRows(groupKey: string, groupValue: any) {
  if (Array.isArray(groupValue)) {
    return groupValue.map((item, index) => ({
      item,
      itemKey: index,
      rowKey: `${groupKey}-${index}`,
      name: item?.name || item?.label || item?.key || `营养项 ${index + 1}`,
    }))
  }

  if (groupValue && typeof groupValue === 'object') {
    return Object.entries(groupValue).map(([key, item]) => ({
      item,
      itemKey: key,
      rowKey: `${groupKey}-${key}`,
      name: (item as any)?.name || (item as any)?.label || key,
    }))
  }

  return []
}

function formatNutritionValue(item: any): string {
  if (item == null) {
    return ''
  }

  if (typeof item !== 'object') {
    return String(item)
  }

  const value = item.value ?? item.amount ?? item.quantity ?? item.per100g ?? item.perServing ?? ''
  const unit = item.unit || item.normalizedUnit || item.displayUnit || ''
  const basis = item.basis || item.per || item.source || ''
  return [value, unit, basis].filter(valuePart => valuePart !== '').join(' ')
}

function toOptionalNumber(value: any) {
  if (value === '' || value === null || value === undefined) {
    return undefined
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : value
}

const nutritionGroupDefinitions = [
  { key: 'macros', label: '宏量营养' },
  { key: 'minerals', label: '矿物质' },
  { key: 'vitamins', label: '维生素' },
  { key: 'fattyAcids', label: '脂肪酸' },
  { key: 'aminoAcids', label: '氨基酸' },
  { key: 'customItems', label: '自定义营养项' },
]
</script>

<style scoped>
.confirm-page {
  min-height: 100vh;
  padding: 32rpx 28rpx 156rpx;
  background: #f6f7fb;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.title-block,
.content-stack,
.nutrition-stack,
.candidate-list {
  display: flex;
  flex-direction: column;
}

.title-block {
  flex: 1;
  gap: 8rpx;
  min-width: 0;
}

.page-title {
  color: #20232a;
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1.25;
}

.page-subtitle,
.state-text,
.empty-text,
.candidate-meta,
.nutrition-value {
  color: #6b7280;
  font-size: 24rpx;
  line-height: 1.4;
}

.status-badge {
  flex-shrink: 0;
  padding: 8rpx 14rpx;
  border-radius: 8rpx;
  background: #e8f0ff;
  color: #245fd6;
  font-size: 22rpx;
  font-weight: 600;
}

.content-stack,
.nutrition-stack,
.candidate-list {
  gap: 18rpx;
}

.section-panel,
.notice-panel,
.state-panel,
.empty-panel {
  padding: 24rpx;
  border: 2rpx solid #e8edf5;
  border-radius: 8rpx;
  background: #fff;
}

.section-title {
  display: block;
  margin-bottom: 18rpx;
  color: #20232a;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.3;
}

.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-count {
  color: #6b7280;
  font-size: 24rpx;
}

.warning-panel {
  border-color: #f3d38a;
  background: #fffaf0;
}

.error-panel {
  border-color: #f0b8b8;
  background: #fff6f6;
}

.notice-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-top: 12rpx;
}

.notice-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  background: #f59e0b;
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
}

.error-panel .notice-dot {
  background: #dc2626;
}

.notice-text {
  flex: 1;
  color: #374151;
  font-size: 26rpx;
  line-height: 1.45;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18rpx;
}

.form-item {
  min-width: 0;
}

.form-item-wide {
  grid-column: 1 / -1;
}

.form-label {
  display: block;
  margin-bottom: 10rpx;
  color: #4b5563;
  font-size: 24rpx;
  font-weight: 600;
}

.form-input,
.form-textarea {
  width: 100%;
  border: 2rpx solid #dbe3ef;
  border-radius: 8rpx;
  background: #fff;
  color: #20232a;
  font-size: 28rpx;
  box-sizing: border-box;
}

.form-input {
  height: 78rpx;
  padding: 0 22rpx;
}

.form-textarea {
  min-height: 144rpx;
  padding: 18rpx 22rpx;
  line-height: 1.4;
}

.resolution-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.choice-button,
.remove-nutrition-button,
.secondary-button,
.primary-button {
  border-radius: 8rpx;
  font-weight: 600;
}

.choice-button {
  height: 72rpx;
  border: 2rpx solid #cfd8e7;
  background: #fff;
  color: #1f2937;
  font-size: 24rpx;
  line-height: 72rpx;
}

.choice-button.active {
  border-color: #2f6fed;
  background: #e8f0ff;
  color: #245fd6;
}

.candidate-card {
  padding: 20rpx;
  border: 2rpx solid #e8edf5;
  border-radius: 8rpx;
  background: #f9fbff;
}

.candidate-card.selected {
  border-color: #2f6fed;
  background: #eef5ff;
}

.candidate-name,
.nutrition-name {
  color: #20232a;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.35;
}

.nutrition-group {
  padding-top: 6rpx;
}

.group-title {
  display: block;
  margin-bottom: 12rpx;
  color: #374151;
  font-size: 26rpx;
  font-weight: 700;
}

.nutrition-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 16rpx 0;
  border-top: 2rpx solid #eef2f7;
}

.nutrition-main {
  flex: 1;
  min-width: 0;
}

.remove-nutrition-button {
  flex-shrink: 0;
  width: 108rpx;
  height: 58rpx;
  border: 2rpx solid #f0b8b8;
  background: #fff;
  color: #dc2626;
  font-size: 24rpx;
  line-height: 58rpx;
}

.bottom-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18rpx;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
  border-top: 2rpx solid #e8edf5;
  background: #fff;
  box-sizing: border-box;
}

.secondary-button,
.primary-button {
  height: 84rpx;
  font-size: 28rpx;
  line-height: 84rpx;
}

.secondary-button {
  border: 2rpx solid #cfd8e7;
  background: #fff;
  color: #1f2937;
}

.primary-button {
  border: 2rpx solid #2f6fed;
  background: #2f6fed;
  color: #fff;
}

.choice-button::after,
.remove-nutrition-button::after,
.secondary-button::after,
.primary-button::after {
  border: 0;
}

button[disabled] {
  opacity: 0.55;
}

@media (max-width: 480px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
