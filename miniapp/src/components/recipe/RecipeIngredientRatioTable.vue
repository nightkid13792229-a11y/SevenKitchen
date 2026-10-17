<template>
  <!--
    食材占比表 · 交付第 1 页 + 详情页共用（2026-10-18 抽出）

    ## 为什么它是**独立的一个组件**，不是"表格组件加个参数"

    用量的表和占比的表长得像，但回答的问题完全不同：
      · 这一张回答「**这道食谱里有什么、各占多少**」→ 顾客在确认"是不是我想的那样"
      · 用量表回答「**这次要下多少克**」→ 顾客在动手做

    老板 2026-10-18 定：**做成两个组件，不做参数开关**。
    一个组件加 `showPreparation` / `showAmount` 两个开关，
    比两个组件更容易出现"某一页漏传导致多一列"。

    ## 固定两列

    名称 + 占比。**不显示制备方法**（那是制作单的事）。
  -->
  <view class="ratio-table">
    <view class="ratio-table__head">
      <text class="ratio-table__th-name">食材</text>
      <text class="ratio-table__th-ratio">占比</text>
    </view>
    <view
      v-for="(item, index) in rows"
      :key="index"
      class="ratio-table__row"
    >
      <text class="ratio-table__name">{{ item.name }}</text>
      <text class="ratio-table__ratio">{{ formatRatio(item.ratioPercent) }}</text>
    </view>
    <view v-if="!rows.length" class="ratio-table__empty">
      <text class="ratio-table__empty-text">这道食谱还没有登记食材</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 只传食材行（`ingredientType === 'FOOD'`）—— 补剂与包材不进这张表 */
    items?: Array<{ name: string; ratioPercent?: number | null }>
  }>(),
  { items: () => [] },
)

const rows = computed(() => (props.items || []).filter((item) => !!item?.name))

/**
 * 占比只显示整数百分比。
 *
 * 后端存的是 `40`（表示 40%）；拿不到就给「—」而不是 0 ——
 * `0%` 会被读成"这道菜里没有这个食材"，而它明明在表里。
 */
function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return `${Math.round(num)}%`
}
</script>

<style scoped lang="scss">
.ratio-table {
  background: #fff;
  border: 1px solid #ede0d0;
  border-radius: 24rpx;
  padding: 8rpx 24rpx 16rpx;
}

.ratio-table__head {
  display: flex;
  padding: 16rpx 0 12rpx;
  border-bottom: 1px solid #f0e6d8;
}

.ratio-table__th-name {
  flex: 1;
  font-size: 20rpx;
  color: #a9967e;
}

.ratio-table__th-ratio {
  width: 130rpx;
  text-align: right;
  font-size: 20rpx;
  color: #a9967e;
}

.ratio-table__row {
  display: flex;
  align-items: baseline;
  padding: 16rpx 0;
  border-bottom: 1px dashed #f4ebe0;
}

.ratio-table__row:last-child {
  border-bottom: 0;
}

.ratio-table__name {
  flex: 1;
  font-size: 25rpx;
  color: #3f3222;
}

.ratio-table__ratio {
  width: 130rpx;
  text-align: right;
  font-size: 25rpx;
  font-weight: 700;
  color: #b45309;
}

.ratio-table__empty {
  padding: 30rpx 0;
  display: flex;
  justify-content: center;
}

.ratio-table__empty-text {
  font-size: 23rpx;
  color: #b3a492;
}
</style>
