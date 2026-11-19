<template>
  <view class="page">
    <text class="page-hint">
      改名会影响历史记录（记录跟着类别走）；删除 = 停用，已经用过的类别建议「合并到」别的类别，历史记录一起搬过去。
    </text>

    <view v-if="loading && categories.length === 0" class="skeleton">
      <view v-for="n in 5" :key="n" class="sk-row"></view>
    </view>

    <view v-else-if="error && categories.length === 0" class="state">
      <text class="state-title">类别加载失败</text>
      <text class="state-hint">{{ error }}</text>
      <button class="state-retry" @tap="loadCategories">重试</button>
    </view>

    <view v-else class="list">
      <view v-for="category in categories" :key="category.id" class="row">
        <view class="row-main">
          <view class="row-head">
            <text class="row-name">{{ category.name }}</text>
            <text v-if="isSystemCategory(category)" class="tag tag--system">系统</text>
            <text v-if="!category.isActive" class="tag tag--off">已停用</text>
          </view>
          <text class="row-meta">使用 {{ category.usageCount }} 次</text>
        </view>

        <view class="row-actions">
          <text class="action" @tap="openRename(category)">改名</text>
          <text
            v-if="!isSystemCategory(category)"
            class="action"
            @tap="openMerge(category)"
          >
            合并到
          </text>
          <text
            v-if="!isSystemCategory(category) && category.isActive"
            class="action action--quiet"
            @tap="confirmDeactivate(category)"
          >
            停用
          </text>
        </view>
      </view>

      <text v-if="error" class="stale-hint">刷新失败，当前显示的是上次的数据</text>
      <text class="list-hint">
        系统类别（食材/补剂/包材/快递/支付手续费/其它）只能改名，不能合并或停用。
      </text>
    </view>

    <!-- 合并到：选一个目标类别，源类别的历史记录一起搬过去 -->
    <view v-if="mergeSource" class="mask" @tap="closeMerge">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <text class="sheet-title">把「{{ mergeSource.name }}」合并到</text>
          <text class="sheet-close" @tap="closeMerge">关闭</text>
        </view>
        <text class="sheet-hint">
          合并后这条类别停用，它的账单/模板/手工记录全部改成目标类别，报表也合并。
        </text>

        <scroll-view class="sheet-body" scroll-y>
          <view
            v-for="target in mergeTargets"
            :key="target.id"
            class="merge-row"
            @tap="confirmMerge(target)"
          >
            <text class="merge-name">{{ target.name }}</text>
            <text class="merge-meta">使用 {{ target.usageCount }} 次 ›</text>
          </view>
          <text v-if="mergeTargets.length === 0" class="sheet-hint">
            没有可合并的目标类别
          </text>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  staffFinanceApi,
  type FinanceCategoryOption,
} from '../../api/staff-finance'
import { getStoredUser } from '../../utils/account'

/**
 * 费用类别管理（2026-11-19 类别字典，设计文档 §2 / 页面要求 §三.6）。
 *
 * 入口在「固定费用」页右上角。这里只做三件事：
 * - 改名（系统类别也允许，历史记录跟着变）；
 * - 合并到（历史账单/模板/手工记录一起搬，源类别停用）；
 * - 停用（不物理删）。
 *
 * 系统类别（`isSystem`，以及 `selectable === false` 的「其它」）只允许改名：
 * 合并/停用会让系统内置口径对不上，按钮直接不显示。
 *
 * 新建类别不在这里：记账时「输入即建」，老板不用先来管类别。
 */
const categories = ref<FinanceCategoryOption[]>([])
const loading = ref(false)
const error = ref('')

const mergeSource = ref<FinanceCategoryOption | null>(null)

/** 系统类别：内置类别，以及后端标记「不可选」的「其它」（只用于历史数据） */
function isSystemCategory(category: FinanceCategoryOption): boolean {
  return Boolean(category.isSystem) || category.selectable === false
}

/**
 * 合并目标：除自己以外的启用类别（合并到已停用的类别没有意义）。
 * 系统类别和「其它」也不能当目标：后端会直接 400 拒绝
 * （自动来源按 code 找系统类别，「其它」给报销映射用）。
 */
const mergeTargets = computed(() =>
  categories.value.filter(
    (option) =>
      option.isActive &&
      !isSystemCategory(option) &&
      option.id !== mergeSource.value?.id,
  ),
)

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string } | null)?.errMsg
  return typeof errMsg === 'string' && errMsg ? errMsg : '请稍后重试'
}

function toast(title: string, icon: 'none' | 'success' = 'none') {
  uni.showToast({ title, icon, duration: icon === 'none' ? 2500 : 1500 })
}

async function loadCategories() {
  loading.value = true
  error.value = ''
  try {
    // 管理页要看全部：停用/已合并的类别也要列出（否则没法解释历史记录）
    const rows = await staffFinanceApi.listCategories(true)
    categories.value = Array.isArray(rows) ? rows : []
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}

/** 改名：弹窗输入，系统类别也允许（历史记录自动显示新名字） */
function openRename(category: FinanceCategoryOption) {
  uni.showModal({
    title: '类别改名',
    editable: true,
    content: category.name,
    placeholderText: '输入新名称',
    confirmText: '保存',
    confirmColor: '#1E3A2F',
    success: async (res) => {
      if (!res.confirm) return
      const name = String(res.content ?? '').trim()
      if (!name) {
        toast('类别名称不能为空')
        return
      }
      if (name === category.name) return
      try {
        await staffFinanceApi.renameCategory(category.id, name)
        toast('已改名', 'success')
        await loadCategories()
      } catch (err) {
        toast(errorMessage(err))
      }
    },
  })
}

function openMerge(category: FinanceCategoryOption) {
  mergeSource.value = category
}

function closeMerge() {
  mergeSource.value = null
}

/** 合并前二次确认，把「历史记录一起搬」说清楚 */
function confirmMerge(target: FinanceCategoryOption) {
  const source = mergeSource.value
  if (!source) return
  uni.showModal({
    title: '合并类别',
    content: `「${source.name}」的记录会全部改成「${target.name}」，「${source.name}」随即停用。`,
    confirmText: '合并',
    confirmColor: '#1E3A2F',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const result = await staffFinanceApi.mergeCategory(source.id, target.id)
        mergeSource.value = null
        const moved = Number(result?.moved) || 0
        toast(moved > 0 ? `已合并，搬了 ${moved} 条` : '已合并', 'success')
        await loadCategories()
      } catch (err) {
        toast(errorMessage(err))
      }
    },
  })
}

/** 停用前二次确认：删除 = 停用，历史记录仍然显示这个名字 */
function confirmDeactivate(category: FinanceCategoryOption) {
  uni.showModal({
    title: '停用类别',
    content: `「${category.name}」不再出现在记账选项里，历史记录不变。已经用过的类别建议用「合并到」。`,
    confirmText: '停用',
    confirmColor: '#1E3A2F',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await staffFinanceApi.deactivateCategory(category.id)
        toast('已停用', 'success')
        await loadCategories()
      } catch (err) {
        toast(errorMessage(err))
      }
    },
  })
}

onShow(() => {
  // 与财务其它页一致：非 ADMIN 直接输地址先拦下，连请求都不发
  if (getStoredUser()?.role !== 'ADMIN') {
    uni.showToast({ title: '权限不足', icon: 'none' })
    setTimeout(() => {
      uni.navigateBack({
        fail: () => {
          uni.reLaunch({ url: '/pages/staff-workbench/index' })
        },
      })
    }, 600)
    return
  }
  loadCategories()
})
</script>

<style scoped lang="scss">
@import '../../styles/staff-tokens.scss';

.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 24rpx $staff-gutter calc(48rpx + env(safe-area-inset-bottom));
  background: $staff-bg;
}

.page-hint {
  display: block;
  padding: 0 4rpx 16rpx;
  font-size: $staff-font-caption;
  line-height: 1.6;
  color: $staff-ink-2;
}

.list {
  margin-top: 8rpx;
}

.row {
  margin-top: 16rpx;
  padding: 20rpx $staff-card-padding;
  background: $staff-surface;
  border: 1rpx solid $staff-line;
  border-radius: $staff-radius-card;
  box-shadow: $staff-shadow-card;
}

.row-main {
  display: flex;
  flex-direction: column;
}

.row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12rpx;
}

.row-name {
  font-size: $staff-font-h2;
  font-weight: 600;
  color: $staff-ink;
}

/* 系统类别：浅绿小标；已停用：中性灰，不抢正在用的类别 */
.tag {
  flex: none;
  padding: 2rpx 12rpx;
  font-size: $staff-font-caption;
  border-radius: $staff-radius-pill;
}

.tag--system {
  color: $staff-brand;
  background: $staff-brand-soft;
}

.tag--off {
  color: $staff-ink-2;
  background: $staff-line;
}

.row-meta {
  margin-top: 6rpx;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
  font-variant-numeric: tabular-nums;
}

/* 行内动作：88rpx 触控高度，文字动作不用红色（停用不是删除数据） */
.row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8rpx;
  margin-top: 12rpx;
}

.action {
  display: inline-flex;
  align-items: center;
  min-height: 88rpx;
  padding: 0 20rpx;
  font-size: $staff-font-sub;
  font-weight: 600;
  color: $staff-brand;
  background: $staff-brand-soft;
  border-radius: $staff-radius-pill;
}

.action--quiet {
  color: $staff-ink-2;
  background: $staff-bg;
  border: 1rpx solid $staff-line-strong;
}

.stale-hint {
  display: block;
  padding-top: 12rpx;
  font-size: $staff-font-caption;
  color: $staff-gold-ink;
}

.list-hint {
  display: block;
  padding-top: 16rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: $staff-ink-2;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;
}

.state-title {
  font-size: $staff-font-h2;
  font-weight: 700;
  color: $staff-ink;
}

.state-hint {
  margin-top: 12rpx;
  font-size: $staff-font-sub;
  line-height: 1.5;
  text-align: center;
  color: $staff-ink-2;
}

.state-retry {
  min-width: 200rpx;
  min-height: 88rpx;
  margin-top: 32rpx;
  padding: 0 48rpx;
  font-size: $staff-font-body;
  line-height: 88rpx;
  color: $staff-cream;
  background: $staff-brand;
  border-radius: $staff-radius-control;
}

.state-retry::after {
  border: none;
}

.skeleton {
  margin-top: 8rpx;
}

.sk-row {
  height: 160rpx;
  margin-bottom: 16rpx;
  background: $staff-line;
  border-radius: $staff-radius-card;
}

/* 合并目标选择：底部抽屉 */
.mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  background: rgba(20, 30, 24, 0.45);
}

.sheet {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 80vh;
  padding: 24rpx $staff-gutter calc(24rpx + env(safe-area-inset-bottom));
  background: $staff-bg;
  border-radius: 28rpx 28rpx 0 0;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8rpx;
}

.sheet-title {
  flex: 1;
  min-width: 0;
  font-size: $staff-font-h2;
  font-weight: 700;
  color: $staff-ink;
  @include staff-ellipsis;
}

.sheet-close {
  flex: none;
  min-height: 88rpx;
  padding: 0 8rpx;
  font-size: $staff-font-sub;
  line-height: 88rpx;
  color: $staff-ink-2;
}

.sheet-hint {
  display: block;
  padding: 8rpx 0;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: $staff-ink-2;
}

.sheet-body {
  max-height: 52vh;
  margin-top: 8rpx;
}

.merge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 96rpx;
  padding: 0 20rpx;
  margin-bottom: 12rpx;
  background: $staff-surface;
  border: 1rpx solid $staff-line;
  border-radius: $staff-radius-control;
}

.merge-name {
  flex: 1;
  min-width: 0;
  font-size: $staff-font-body;
  font-weight: 600;
  color: $staff-ink;
  @include staff-ellipsis;
}

.merge-meta {
  flex: none;
  margin-left: 16rpx;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}
</style>
