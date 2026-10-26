<template>
  <!--
    食材用量表 · 交付第 2 页 + DIY 制作单共用（2026-10-18 抽出）

    ## 跟占比表为什么是两个组件

    这一张回答「**这次要下多少克**」。所以：
      · 单位是克，不是百分比
      · **保留部位 / 状态 / 预处理**（"切丁煮熟"是动手时真要看的）
      · 底部给「合计净重」

    ## 为什么没有"采购量"列

    2026-10-18 老板定：**只给净用量，买多少顾客自己判断**。
    损耗率是经验估算，不同食材差很多（肉几乎不损耗、叶菜损耗大），
    乘进去当"建议采购量"等于用估算冒充精算。
    所以这张表**没有**采购量列，也不显示任何损耗说明。
  -->
  <view class="usage-table">
    <view class="usage-table__head">
      <text class="usage-table__th-name">原料名称</text>
      <text class="usage-table__th-prep">部位 / 状态 / 预处理</text>
      <text class="usage-table__th-amount">净用量</text>
    </view>
    <view
      v-for="(item, index) in rows"
      :key="index"
      class="usage-table__row"
    >
      <text class="usage-table__name">{{ item.name }}</text>
      <text class="usage-table__prep">{{ item.preparation || '—' }}</text>
      <text class="usage-table__amount">{{ formatAmount(item.netG) }}</text>
    </view>
    <view v-if="rows.length" class="usage-table__total">
      <text class="usage-table__total-label">合计净重</text>
      <text class="usage-table__total-value">{{ formatAmount(totalNetG) }}</text>
    </view>
    <view v-if="!rows.length" class="usage-table__empty">
      <text class="usage-table__empty-text">暂时算不出用量，请联系客服</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 只传食材行（`ingredientType === 'FOOD'`） */
    items?: Array<{
      name: string
      netG?: number | null
      preparation?: string | null
    }>
  }>(),
  { items: () => [] },
)

const rows = computed(() => (props.items || []).filter((item) => !!item?.name))

/**
 * 合计由**传进来的各行相加**得到 —— 不是另外算一遍业务逻辑。
 * 后端也给了 `totalNetG`，两处应当一致；这里用前端相加是为了
 * 让组件在"只有 lines 没有 total"的场合（比如 DIY 制作单）也能用。
 */
const totalNetG = computed(() =>
  rows.value.reduce((sum, item) => sum + (Number(item.netG) || 0), 0),
)

/** 缺失给「—」不给 0 —— `0 克` 会被读成"这道菜不放这个" */
function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  // 一位小数、去掉末尾 .0（1600.0 → 1600）
  return `${Math.round(num * 10) / 10}`
}
</script>

<style scoped lang="scss">
.usage-table {
  background: #fff;
  border: 1px solid #ede0d0;
  border-radius: 24rpx;
  padding: 8rpx 24rpx 16rpx;
}

.usage-table__head {
  display: flex;
  padding: 16rpx 0 12rpx;
  border-bottom: 1px solid #f0e6d8;
}

.usage-table__th-name {
  flex: 1;
  font-size: 20rpx;
  color: #a9967e;
}

.usage-table__th-prep {
  width: 180rpx;
  font-size: 20rpx;
  color: #a9967e;
}

.usage-table__th-amount {
  width: 150rpx;
  text-align: right;
  font-size: 20rpx;
  color: #a9967e;
}

.usage-table__row {
  display: flex;
  align-items: baseline;
  padding: 16rpx 0;
  border-bottom: 1px dashed #f4ebe0;
}

.usage-table__name {
  flex: 1;
  font-size: 25rpx;
  color: #3f3222;
}

.usage-table__prep {
  width: 180rpx;
  font-size: 22rpx;
  color: #8a7a66;
}

.usage-table__amount {
  width: 150rpx;
  text-align: right;
  font-size: 25rpx;
  font-weight: 700;
  color: #b45309;
}

.usage-table__total {
  display: flex;
  align-items: baseline;
  padding: 18rpx 0 4rpx;
  border-top: 1px solid #f0e6d8;
  margin-top: 6rpx;
}

.usage-table__total-label {
  flex: 1;
  font-size: 23rpx;
  font-weight: 700;
  color: #6e5f4b;
}

.usage-table__total-value {
  font-size: 26rpx;
  font-weight: 800;
  color: #1e5b35;
}

.usage-table__empty {
  padding: 30rpx 0;
  display: flex;
  justify-content: center;
}

.usage-table__empty-text {
  font-size: 23rpx;
  color: #b3a492;
}
</style>
