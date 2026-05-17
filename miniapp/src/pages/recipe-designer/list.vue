<template>
  <view class="recipe-designer-list-page">
    <view class="toolbar">
      <view>
        <text class="page-title">食谱设计器</text>
        <text class="page-subtitle">草稿配方与评估状态</text>
      </view>
      <button class="new-btn" :disabled="creating" @tap="createDraft">
        {{ creating ? '创建中' : '新建草稿' }}
      </button>
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
        @tap="openEditor(draft.id)"
      >
        <view class="draft-header">
          <text class="draft-name">{{ draft.name || '未命名草稿' }}</text>
          <text class="status-badge">{{ getDraftStatusLabel(draft.status) }}</text>
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
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { recipeDesignerApi, type FediafDogScenario } from '../../api/recipe-designer'
import { getScenarioLabel } from './assessment'

interface DesignerDraft {
  id: string
  name?: string
  scenario?: string
  fediafDogScenario?: string
  status?: string
  totalWeightG?: number
  energyDensityKcalPerKg?: number | null
  updatedAt?: string
}

const drafts = ref<DesignerDraft[]>([])
const loading = ref(false)
const creating = ref(false)

onMounted(() => {
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

async function createDraft() {
  if (creating.value) return
  creating.value = true
  try {
    const res: any = await recipeDesignerApi.createDraft({
      name: '未命名配方',
      scenario: 'ADULT_MER_110',
    })
    const draft = res?.data ?? res
    const draftId = draft?.id
    if (draftId) {
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

function openEditor(id: string) {
  uni.navigateTo({ url: `/pages/recipe-designer/editor?id=${id}` })
}

function getDraftStatusLabel(status?: string) {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    ASSESSING: '评估中',
    COMPLIANT: '已达标',
    NEEDS_REVIEW: '需审核',
    PUBLISHED: '已发布',
  }
  return map[status || ''] || status || '草稿'
}

function getDraftScenario(draft: DesignerDraft): FediafDogScenario | undefined {
  return (draft.scenario || draft.fediafDogScenario) as FediafDogScenario | undefined
}

function formatWeight(value?: number) {
  return `总量 ${Number(value || 0).toFixed(0)}g`
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

.new-btn {
  flex-shrink: 0;
  height: 72rpx;
  padding: 0 28rpx;
  border-radius: 12rpx;
  background: #1890ff;
  color: #fff;
  font-size: 26rpx;
  line-height: 72rpx;
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
.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.draft-header {
  margin-bottom: 18rpx;
}

.draft-name {
  flex: 1;
  min-width: 0;
  font-size: 32rpx;
  font-weight: 700;
  color: #222;
}

.status-badge {
  flex-shrink: 0;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  background: #edf4ff;
  color: #1677ff;
  font-size: 22rpx;
}

.meta-row {
  color: #666;
  font-size: 24rpx;
  line-height: 1.8;
}
</style>
