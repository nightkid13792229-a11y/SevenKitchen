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

    ## 三列（2026-10-24 改）

    名称 + 部位 / 状态 / 预处理 + 占比。
    "部位 / 状态 / 预处理"用的是设计器里被重新定义的 `preparationMethod`
    （不是老的"部位 / 状态 / 预处理"，也不是历史字段 `preparationNote`）。
    **整道菜的火候/时间/顺序仍然不在这张表**，那是制作单的"制作步骤"。
  -->
  <view class="ratio-table">
    <view class="ratio-table__head">
      <text class="ratio-table__th-name">食材</text>
      <text class="ratio-table__th-prep">部位 / 状态 / 预处理</text>
      <text class="ratio-table__th-ratio">占比</text>
    </view>
    <view
      v-for="(item, index) in rows"
      :key="index"
      class="ratio-table__row"
    >
      <text class="ratio-table__name">{{ item.name }}</text>
      <text class="ratio-table__prep">{{ item.preparation || '—' }}</text>
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
    items?: Array<{
      name: string;
      ratioPercent?: number | null;
      /** 设计器里的"部位 / 状态 / 预处理"（preparationMethod 的新语义） */
      preparation?: string | null;
    }>
  }>(),
  { items: () => [] },
)

const rows = computed(() => (props.items || []).filter((item) => !!item?.name))

/**
 * 占比保留两位小数（2026-10-24 老板定）。
 *
 * 后端存的是 `40`（表示 40%）；拿不到就给「—」而不是 0 ——
 * `0%` 会被读成"这道菜里没有这个食材"，而它明明在表里。
 *
 * 小于 0.01% 的显示「<0.01%」：两位小数会把它舍成 `0.00%`，
 * 同样会被读成"没放"。这比原来的「<1%」精确，也不会误导。
 */
function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  if (num > 0 && num < 0.01) return '<0.01%'
  return `${num.toFixed(2)}%`
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

.ratio-table__th-prep {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
  font-size: 20rpx;
  color: #a9967e;
}

.ratio-table__th-ratio {
  width: 120rpx;
  text-align: right;
  font-size: 20rpx;
  color: #a9967e;
}

.ratio-table__row {
  display: flex;
  align-items: flex-start;
  padding: 16rpx 0;
  border-bottom: 1px dashed #f4ebe0;
}

.ratio-table__row:last-child {
  border-bottom: 0;
}

.ratio-table__name {
  flex: 1;
  min-width: 0;
  font-size: 25rpx;
  color: #3f3222;
}

/* 部位 / 状态 / 预处理：允许两行，长文本不把占比挤出去 */
.ratio-table__prep {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
  font-size: 22rpx;
  line-height: 1.45;
  color: #6b6653;
  word-break: break-all;
}

.ratio-table__ratio {
  width: 120rpx;
  text-align: right;
  font-size: 24rpx;
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
