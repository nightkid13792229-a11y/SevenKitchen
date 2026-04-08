<template>
  <view class="dimension-rating">
    <view class="rating-row" v-for="dim in dimensions" :key="dim.key">
      <text class="dim-label">{{ dim.label }}</text>
      <view class="stars-row">
        <view
          v-for="star in 5"
          :key="star"
          class="star"
          :class="{ active: getCurrentRating(dim.key) >= star, readonly }"
          @tap.stop="!readonly && setRating(dim.key, star)"
        >
          <text class="star-icon">{{ getCurrentRating(dim.key) >= star ? '★' : '☆' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: { ease: number; value: number; taste: number }
  readonly?: boolean
  size?: string
}>(), {
  modelValue: () => ({ ease: 0, value: 0, taste: 0 }),
  readonly: false,
  size: 'normal',
})

const emit = defineEmits<{
  'update:modelValue': [value: { ease: number; value: number; taste: number }]
}>()

const dimensions = [
  { key: 'ease' as const, label: '容易制作' },
  { key: 'value' as const, label: '性价比高' },
  { key: 'taste' as const, label: '小狗爱吃' },
]

function getCurrentRating(key: keyof typeof props.modelValue): number {
  return props.modelValue[key] || 0
}

function setRating(key: keyof typeof props.modelValue, value: number) {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: value,
  })
}
</script>

<style scoped>
.dimension-rating {
  width: 100%;
  overflow: hidden;
}

.rating-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0;
  width: 100%;
  box-sizing: border-box;
}

.dim-label {
  font-size: 26rpx;
  color: #333;
  flex-shrink: 0;
  margin-right: 16rpx;
}

.stars-row {
  display: flex;
  flex-shrink: 0;
}

.star {
  padding: 2rpx;
}

.star-icon {
  font-size: 32rpx;
  color: #d0d0d0;
  line-height: 1;
}

.star.active .star-icon {
  color: #FFB800;
}

.star:not(.readonly) {
  cursor: pointer;
}
</style>
