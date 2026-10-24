<template>
  <!--
    全营养标准背书 banner（2026-10-24）
    交付页与 DIY 配置页共用：卖点式一条，点"说明"展开解释。
    年份不能写死 —— 读食谱自己的 nutritionStandard。
  -->
  <view v-if="label" class="nutrition-standard">
    <view class="nutrition-standard__card" @tap="toggle">
      <view class="nutrition-standard__main">
        <text class="nutrition-standard__badge">✓</text>
        <view class="nutrition-standard__copy">
          <text class="nutrition-standard__title">符合 {{ label }}</text>
          <text class="nutrition-standard__sub">全营养标准</text>
        </view>
      </view>
      <text class="nutrition-standard__toggle">{{ open ? '收起' : '说明' }}</text>
    </view>
    <view v-if="open" class="nutrition-standard__explain">
      <text class="nutrition-standard__explain-text">{{ explain }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  getNutritionStandardExplain,
  getNutritionStandardLabel,
} from '@/utils/label-mapping'

const props = withDefaults(
  defineProps<{
    /** 食谱的营养标准代码（如 FEDIAF_2025）；为空则整块不显示 */
    standard?: string | null
  }>(),
  { standard: null },
)

const open = ref(false)
const label = computed(() => {
  const value = String(props.standard || '').trim()
  return value ? getNutritionStandardLabel(value) : ''
})
const explain = computed(() =>
  getNutritionStandardExplain(String(props.standard || '')),
)

const toggle = () => {
  open.value = !open.value
}
</script>

<style scoped lang="scss">
.nutrition-standard {
  margin: 20rpx 24rpx 0;
}

.nutrition-standard__card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 26rpx;
  background: linear-gradient(150deg, #fdf8ee 0%, #f6efe0 100%);
  border: 1rpx solid rgba(176, 141, 79, 0.5);
  border-radius: 20rpx;
  box-shadow: 0 10rpx 26rpx rgba(176, 141, 79, 0.14);
}

.nutrition-standard__main {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.nutrition-standard__badge {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #d8bc85;
  font-size: 26rpx;
  font-weight: 700;
  text-align: center;
  line-height: 44rpx;
  flex-shrink: 0;
}

.nutrition-standard__copy {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.nutrition-standard__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.nutrition-standard__sub {
  font-size: 22rpx;
  color: #968f6d;
}

.nutrition-standard__toggle {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 24rpx;
  color: #b08d4f;
}

.nutrition-standard__explain {
  margin-top: 10rpx;
  padding: 20rpx 24rpx;
  background-color: #f2f4ea;
  border-radius: 14rpx;
}

.nutrition-standard__explain-text {
  font-size: 24rpx;
  line-height: 1.7;
  color: #6b6653;
}
</style>
