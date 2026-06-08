<template>
  <view class="recipe-designer-publish-page">
    <view v-if="loading" class="section state-block">
      <text>生成营养报告中...</text>
    </view>

    <view v-else>
      <view class="section recipe-summary-section">
        <view class="summary-title-row">
          <view class="summary-title-main">
            <image class="summary-logo" src="/static/logo.png" mode="aspectFit" />
            <text class="page-title">基础信息</text>
          </view>
        </view>
        <view class="summary-row">
          <text class="summary-label">食谱名称</text>
          <text class="summary-value recipe-name-value">{{ recipeName }}</text>
        </view>
        <view class="summary-row">
          <text class="summary-label">用户名称</text>
          <text class="summary-value user-name-value">{{ userName }}</text>
        </view>
        <view class="summary-row">
          <text class="summary-label">遵循标准</text>
          <text class="summary-value standard-name-value">{{ standardName }}</text>
        </view>
      </view>

      <view v-if="canPublishRecipe && publishRequiresReview" class="section review-section">
        <text class="section-title">审核说明</text>
        <view class="review-alert">
          <text class="review-alert-title">当前配方需要审核</text>
          <text v-for="row in reviewIssueRows" :key="row.key" class="review-alert-row">{{ row.label }}</text>
        </view>
        <textarea
          v-model="reviewNote"
          class="review-note-input"
          maxlength="300"
          placeholder="填写审核说明后可发布为后台草稿"
        />
      </view>

      <view class="report-heading">
        <text class="report-title">营养报告</text>
      </view>

      <view class="section">
        <text class="section-title">食谱原料清单</text>
        <view class="compact-report-table-wrap">
          <view class="report-table ingredient-table compact-report-table">
            <view class="table-row table-head">
              <text class="table-cell ingredient-name-cell">原料</text>
              <text class="table-cell amount-cell">用量</text>
              <text class="table-cell percent-cell">重量占比</text>
            </view>
            <view v-for="row in report.ingredientRows" :key="row.ingredientName" class="table-row">
              <text class="table-cell ingredient-name-cell">{{ row.ingredientName }}</text>
              <text class="table-cell amount-cell">{{ row.amountLabel }}</text>
              <text class="table-cell percent-cell">{{ row.weightPercentLabel }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="section">
        <text class="section-title">宏量营养分析</text>
        <view class="compact-report-table-wrap">
          <view class="report-table macro-table compact-report-table">
            <view class="table-row table-head">
              <text class="table-cell nutrient-name-cell">项目</text>
              <text class="table-cell report-number-cell">占配方</text>
              <text class="table-cell report-number-cell">占干物质</text>
              <text class="table-cell report-number-cell">占热量</text>
            </view>
            <view v-for="row in report.macroRows" :key="row.key" class="table-row">
              <text class="table-cell nutrient-name-cell">{{ row.name }}</text>
              <text class="table-cell report-number-cell">{{ row.weightPercentLabel }}</text>
              <text class="table-cell report-number-cell">{{ row.dryMatterLabel }}</text>
              <text class="table-cell report-number-cell">{{ row.energyPercentLabel }}</text>
            </view>
          </view>
        </view>
        <view class="energy-density-list">
          <view v-for="row in report.energyDensityRows" :key="row.label" class="energy-density-row">
            <text class="energy-density-label">能量密度</text>
            <text class="energy-density-value">{{ row.value }}</text>
          </view>
        </view>
      </view>

      <view v-for="section in nutrientSectionList" :key="section.key" class="section">
        <text class="section-title">{{ section.title }}</text>
        <scroll-view scroll-x class="report-table-scroll">
          <view class="report-table nutrient-table">
            <view class="table-row table-head">
              <text class="table-cell nutrient-name-cell">营养素</text>
              <text class="table-cell unit-cell">单位</text>
              <view class="table-cell report-number-cell stacked-head">
                <text>标准下限</text>
                <text>/1,000kcal</text>
              </view>
              <view class="table-cell report-number-cell stacked-head">
                <text>标准上限</text>
                <text>/1,000kcal</text>
              </view>
              <text class="table-cell report-number-cell">食谱含量</text>
              <text class="table-cell report-number-cell">{{ section.dryMatterHeader || '/100gDM' }}</text>
            </view>
            <view v-if="section.rows.length === 0" class="table-row">
              <text class="table-cell empty-cell">暂无数据</text>
            </view>
            <view v-for="row in section.rows" :key="row.key || row.name" :class="['table-row', row.statusClass]">
              <text class="table-cell nutrient-name-cell">{{ row.name }}</text>
              <text class="table-cell unit-cell">{{ row.unit }}</text>
              <text class="table-cell report-number-cell">{{ row.minLabel }}</text>
              <text class="table-cell report-number-cell">{{ row.maxLabel }}</text>
              <text class="table-cell report-number-cell report-current-cell">{{ row.currentLabel }}</text>
              <text class="table-cell report-number-cell">{{ row.dryMatterLabel }}</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <view class="footer-actions">
      <button class="secondary-btn" @tap="goBack">返回编辑</button>
      <button class="share-btn" open-type="share" :disabled="loading">分享</button>
      <button v-if="canPublishRecipe" class="primary-btn" :disabled="loading || publishing" @tap="handlePublishTap">
        {{ publishing ? '提交中...' : '提交后台草稿' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import { recipeDesignerApi } from '../../api/recipe-designer'
import { CURRENT_SHARE_CONFIG } from '../../config/share.config'
import { getScenarioLabel } from './assessment'
import { buildPublishNutritionReport } from './publish-report'

const draftId = ref('')
const routeRecipeName = ref('')
const draft = ref<any>(null)
const assessment = ref<any>(null)
const loading = ref(false)
const publishing = ref(false)
const currentUserRole = ref('')
const storedUserName = ref('')
const reviewNote = ref('')
const reportSectionTitleOrder = ['微量元素', '维生素', '氨基酸', '脂肪酸']

const recipeName = computed(() => {
  return draft.value?.name || routeRecipeName.value || '未命名食谱'
})

const standardName = computed(() => {
  const baseName =
    assessment.value?.standardName ||
    assessment.value?.nutritionStandardName ||
    assessment.value?.standard ||
    'FEDIAF 2025'
  const scenario = assessment.value?.scenario || draft.value?.fediafDogScenario || draft.value?.scenario
  return `${baseName} · ${getScenarioLabel(scenario)}`
})

const userName = computed(() => {
  return (
    storedUserName.value ||
    cleanText(draft.value?.user?.nickname) ||
    cleanText(draft.value?.createdBy?.nickname) ||
    cleanText(draft.value?.customer?.nickname) ||
    '未设置'
  )
})

const canPublishRecipe = computed(() => currentUserRole.value === 'ADMIN')

const publishRequiresReview = computed(() => {
  const status =
    cleanText(assessment.value?.overallStatus) ||
    cleanText(draft.value?.assessmentSummary?.overallStatus) ||
    cleanText(draft.value?.status)
  return Boolean(status && status !== 'COMPLIANT')
})

const reviewIssueRows = computed(() => {
  const entries = Array.isArray(assessment.value?.groupedEntries)
    ? assessment.value.groupedEntries
    : Array.isArray(assessment.value?.entries)
      ? assessment.value.entries
      : []
  return entries
    .filter((entry: any) => ['DEFICIENT', 'EXCESS', 'MISSING_DATA'].includes(cleanText(entry?.status)))
    .map((entry: any) => ({
      key: cleanText(entry?.nutrientKey || entry?.key || entry?.label),
      label: buildReviewIssueLabel(entry),
    }))
})

const report = computed(() =>
  buildPublishNutritionReport({
    draft: draft.value,
    assessment: assessment.value,
  }),
)

const nutrientSectionList = computed(() => {
  const sections = [
    report.value.nutrientSections.minerals,
    report.value.nutrientSections.vitamins,
    report.value.nutrientSections.aminoAcids,
    report.value.nutrientSections.fattyAcids,
  ]
  return sections.map((section, index) => ({
    ...section,
    title: reportSectionTitleOrder[index] || section.title,
  }))
})

onLoad((options: any) => {
  uni.setNavigationBarTitle({ title: '提交后台草稿' })
  currentUserRole.value = getCurrentUserRole()
  storedUserName.value = getCurrentUserName()
  draftId.value = options?.id || ''
  routeRecipeName.value = decodeURIComponent(options?.name || '')
  if (!draftId.value) {
    uni.showToast({ title: '缺少草稿ID', icon: 'none' })
    return
  }
  void loadPublishReport()
})

onShareAppMessage(() => {
  return {
    title: `${recipeName.value} 营养报告 - Seven的厨房`,
    path: getSharePath(),
    imageUrl: CURRENT_SHARE_CONFIG.recipeImageUrl,
  }
})

async function loadPublishReport() {
  loading.value = true
  try {
    await Promise.all([loadDraft(), loadAssessment()])
  } finally {
    loading.value = false
  }
}

async function loadDraft() {
  try {
    const res: any = await recipeDesignerApi.getDraft(draftId.value)
    draft.value = res?.data ?? res ?? null
  } catch (error) {
    console.error('[RecipeDesignerPublish] Failed to load draft:', error)
    uni.showToast({ title: '加载食谱失败', icon: 'none' })
  }
}

async function loadAssessment() {
  try {
    const res: any = await recipeDesignerApi.assessDraft(draftId.value)
    assessment.value = res?.data ?? res
  } catch (error) {
    console.error('[RecipeDesignerPublish] Failed to build nutrition report:', error)
    uni.showToast({ title: '营养报告生成失败', icon: 'none' })
  }
}

async function handlePublishTap() {
  if (!canPublishRecipe.value) {
    uni.showToast({ title: '仅管理员可发布食谱', icon: 'none' })
    return
  }
  if (publishing.value) {
    return
  }
  publishing.value = true
  try {
    const trimmedReviewNote = reviewNote.value.trim()
    if (publishRequiresReview.value && !trimmedReviewNote) {
      uni.showToast({ title: '请填写审核说明', icon: 'none' })
      return
    }

    await recipeDesignerApi.publishDraft(draftId.value, {
      name: recipeName.value,
      ...(publishRequiresReview.value ? { reviewNote: trimmedReviewNote } : {}),
    })
    uni.showToast({ title: '食谱已保存为后台草稿', icon: 'success' })
    setTimeout(() => {
      uni.redirectTo({ url: '/pages/recipe-designer/list' })
    }, 800)
  } catch (error) {
    console.error('[RecipeDesignerPublish] Failed to publish draft:', error)
    uni.showToast({ title: getErrorMessage(error) || '发布失败，请稍后重试', icon: 'none' })
  } finally {
    publishing.value = false
  }
}

function goBack() {
  uni.navigateBack()
}

function getSharePath() {
  const query = [
    `id=${encodeURIComponent(draftId.value)}`,
    `name=${encodeURIComponent(recipeName.value)}`,
  ].join('&')
  return `/pages/recipe-designer/publish?${query}`
}

function getCurrentUserRole() {
  try {
    const userInfo = readStoredUserInfo()
    return String(userInfo?.role || userInfo?.user?.role || '').toUpperCase()
  } catch (error) {
    console.warn('[RecipeDesignerPublish] Failed to read current user role:', error)
    return ''
  }
}

function getCurrentUserName() {
  try {
    const userInfo = readStoredUserInfo()
    return (
      cleanText(userInfo?.nickname) ||
      cleanText(userInfo?.user?.nickname) ||
      cleanText(userInfo?.name) ||
      cleanText(userInfo?.user?.name)
    )
  } catch (error) {
    console.warn('[RecipeDesignerPublish] Failed to read current user name:', error)
    return ''
  }
}

function readStoredUserInfo() {
  const rawUserInfo = uni.getStorageSync('userInfo') || uni.getStorageSync('user')
  return typeof rawUserInfo === 'string'
    ? rawUserInfo
      ? JSON.parse(rawUserInfo)
      : null
    : rawUserInfo
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildReviewIssueLabel(entry: any) {
  const statusLabelMap: Record<string, string> = {
    DEFICIENT: '不足',
    EXCESS: '过量',
    MISSING_DATA: '缺少数据',
  }
  const status = cleanText(entry?.status)
  const name = cleanText(entry?.label || entry?.nutrientName || entry?.nutrientKey || entry?.key) || '营养项'
  const current = formatReviewNumber(entry?.currentValue ?? entry?.current)
  const min = formatReviewNumber(entry?.minValue ?? entry?.min)
  const max = formatReviewNumber(entry?.maxValue ?? entry?.max)
  const rangeParts = [
    min !== '-' ? `下限 ${min}` : '',
    max !== '-' ? `上限 ${max}` : '',
  ].filter(Boolean)
  const rangeText = rangeParts.length ? `，${rangeParts.join('，')}` : ''
  return `${name}${statusLabelMap[status] || '需审核'}：当前 ${current}${rangeText}`
}

function formatReviewNumber(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return '-'
  const rounded = Math.round(numeric * 100) / 100
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/0+$/, '').replace(/\.$/, '')
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return cleanText(error.message)
  return ''
}
</script>

<style scoped lang="scss">
.recipe-designer-publish-page {
  min-height: 100vh;
  background: #f6f7f9;
  padding: 24rpx 28rpx 164rpx;
  box-sizing: border-box;
}

.section {
  background: #fff;
  border-radius: 8rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(15, 23, 42, 0.04);
}

.state-block {
  text-align: center;
  color: #6b7280;
  font-size: 28rpx;
}

.recipe-summary-section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.summary-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-title-main {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.summary-logo {
  width: 46rpx;
  height: 46rpx;
  border-radius: 8rpx;
}

.page-title,
.report-title {
  color: #111827;
  font-size: 34rpx;
  font-weight: 700;
}

.summary-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
}

.summary-label {
  flex: 0 0 150rpx;
  color: #6b7280;
  font-size: 25rpx;
}

.summary-value {
  flex: 1;
  color: #111827;
  font-size: 27rpx;
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

.report-heading {
  padding: 8rpx 4rpx 20rpx;
}

.review-section {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.review-alert {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 18rpx;
  border-radius: 8rpx;
  background: #fff7ed;
  border: 1rpx solid #fed7aa;
}

.review-alert-title {
  color: #9a3412;
  font-size: 26rpx;
  font-weight: 700;
}

.review-alert-row {
  color: #9a3412;
  font-size: 24rpx;
  line-height: 1.45;
}

.review-note-input {
  width: 100%;
  min-height: 144rpx;
  padding: 18rpx;
  box-sizing: border-box;
  border: 1rpx solid #d1d5db;
  border-radius: 8rpx;
  background: #fff;
  color: #111827;
  font-size: 26rpx;
  line-height: 1.45;
}

.section-title {
  display: block;
  margin-bottom: 20rpx;
  color: #111827;
  font-size: 30rpx;
  font-weight: 700;
}

.report-table-scroll,
.compact-report-table-wrap {
  width: 100%;
}

.report-table {
  min-width: 920rpx;
  border: 1rpx solid #e5e7eb;
  border-bottom: 0;
  border-radius: 8rpx;
  overflow: hidden;
}

.ingredient-table {
  min-width: 760rpx;
}

.macro-table {
  min-width: 860rpx;
}

.nutrient-table {
  min-width: 1120rpx;
}

.compact-report-table {
  width: 100%;
  min-width: 0;
}

.table-row {
  display: flex;
  min-height: 76rpx;
  border-bottom: 1rpx solid #e5e7eb;
  background: #fff;
}

.table-head {
  min-height: 72rpx;
  background: #f3f4f6;
}

.table-cell {
  display: flex;
  align-items: center;
  padding: 14rpx 16rpx;
  box-sizing: border-box;
  color: #1f2937;
  font-size: 24rpx;
  line-height: 1.35;
  border-right: 1rpx solid #e5e7eb;
  min-width: 0;
  white-space: normal;
  word-break: break-word;
}

.table-head .table-cell {
  color: #374151;
  font-weight: 700;
}

.table-cell:last-child {
  border-right: 0;
}

.ingredient-name-cell {
  flex: 1 1 0;
  width: auto;
  white-space: normal;
  word-break: break-word;
}

.amount-cell {
  flex: 0 0 150rpx;
  width: auto;
  justify-content: flex-end;
  text-align: right;
  padding-left: 10rpx;
  padding-right: 10rpx;
}

.nutrient-name-cell {
  width: 220rpx;
}

.unit-cell {
  width: 140rpx;
}

.percent-cell {
  flex: 0 0 134rpx;
  width: auto;
  justify-content: flex-end;
  text-align: right;
  padding-left: 10rpx;
  padding-right: 10rpx;
}

.report-number-cell {
  width: 180rpx;
  justify-content: flex-end;
  text-align: right;
}

.macro-table .nutrient-name-cell {
  flex: 0 0 142rpx;
  width: auto;
  padding-left: 10rpx;
  padding-right: 10rpx;
}

.macro-table .report-number-cell {
  flex: 1 1 0;
  width: auto;
  padding-left: 8rpx;
  padding-right: 8rpx;
}

.stacked-head {
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 2rpx;
}

.status-deficient .nutrient-name-cell,
.status-deficient .report-current-cell,
.status-excess .nutrient-name-cell,
.status-excess .report-current-cell {
  color: #dc2626;
  font-weight: 700;
}

.empty-cell {
  width: 100%;
  color: #9ca3af;
}

.energy-density-list {
  margin-top: 22rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.energy-density-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 18rpx;
  border-radius: 8rpx;
  background: #f8fafc;
}

.energy-density-label {
  color: #64748b;
  font-size: 24rpx;
}

.energy-density-value {
  color: #0f172a;
  font-size: 26rpx;
  font-weight: 700;
}

.footer-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 16rpx;
  padding: 20rpx 32rpx 36rpx;
  background: #fff;
  box-shadow: 0 -4rpx 16rpx rgba(15, 23, 42, 0.08);
}

.primary-btn,
.secondary-btn,
.share-btn {
  flex: 1;
  height: 76rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  line-height: 76rpx;
}

.primary-btn {
  background: #1677ff;
  color: #fff;
}

.secondary-btn {
  background: #eef5ff;
  color: #1677ff;
}

.share-btn {
  background: #ecfdf5;
  color: #047857;
}
</style>
