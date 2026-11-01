<template>
  <view v-if="visible" class="life-stage-sheet-mask" @tap="emit('close')">
    <view class="life-stage-sheet" @tap.stop>
      <view class="life-stage-sheet__head">
        <text class="life-stage-sheet__title">选择生命阶段版本</text>
        <text class="life-stage-sheet__close" @tap="emit('close')">×</text>
      </view>
      <view class="life-stage-sheet__body">
        <view
          v-for="option in versions"
          :key="option.lifeStage"
          class="life-stage-sheet__option"
          :class="{ active: option.lifeStage === selected }"
          @tap="selected = option.lifeStage"
        >
          <view class="life-stage-sheet__copy">
            <text class="life-stage-sheet__name">
              {{ option.label || buildVersionOptionLabel(option.lifeStage) }}
            </text>
            <text class="life-stage-sheet__subtitle">
              {{ buildVersionOptionSubtitle(option.lifeStage) }}
            </text>
            <text v-if="option.note" class="life-stage-sheet__note">{{ option.note }}</text>
          </view>
          <text v-if="option.lifeStage === matchedStage" class="life-stage-sheet__tag">
            按档案匹配
          </text>
          <text v-if="option.lifeStage === currentStage" class="life-stage-sheet__tag life-stage-sheet__tag--current">
            当前
          </text>
        </view>
      </view>
      <view class="life-stage-sheet__footer">
        <button
          class="life-stage-sheet__confirm button-reset"
          :disabled="!selected"
          @tap="confirm"
        >用这个版本</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { buildVersionOptionLabel, buildVersionOptionSubtitle } from '@/utils/life-stage-ui'

const props = withDefaults(
  defineProps<{
    visible: boolean
    versions: Array<{ lifeStage: string; label?: string | null; recipeId?: string | null; note?: string | null }>
    currentStage?: string | null
    matchedStage?: string | null
  }>(),
  {
    currentStage: null,
    matchedStage: null,
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'select', lifeStage: string): void
}>()

const selected = ref('')

watch(
  () => props.visible,
  (visible) => {
    if (visible) selected.value = props.currentStage || ''
  },
  { immediate: true },
)

function confirm() {
  if (!selected.value) return
  emit('select', selected.value)
  emit('close')
}
</script>

<style scoped lang="scss">
.life-stage-sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 900;
  display: flex;
  align-items: flex-end;
}

.life-stage-sheet {
  width: 100%;
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  padding: 28rpx 32rpx 40rpx;
  box-sizing: border-box;
}

.life-stage-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.life-stage-sheet__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #3f3222;
}

.life-stage-sheet__close {
  font-size: 40rpx;
  color: #9b8d7a;
  padding: 0 8rpx;
}

.life-stage-sheet__body {
  margin-top: 16rpx;
}

.life-stage-sheet__option {
  display: flex;
  align-items: center;
  padding: 22rpx 20rpx;
  border-radius: 18rpx;
  border: 1px solid #eee3d4;
  margin-top: 14rpx;
}

.life-stage-sheet__option.active {
  border-color: #b45309;
  background: #fffaf3;
}

.life-stage-sheet__copy {
  flex: 1;
  min-width: 0;
}

.life-stage-sheet__name {
  display: block;
  font-size: 27rpx;
  font-weight: 600;
  color: #3f3222;
}

.life-stage-sheet__subtitle {
  display: block;
  font-size: 22rpx;
  color: #8a7a66;
  margin-top: 4rpx;
}

.life-stage-sheet__note {
  display: block;
  font-size: 21rpx;
  color: #b45309;
  margin-top: 4rpx;
}

.life-stage-sheet__tag {
  font-size: 20rpx;
  color: #6b7f5a;
  margin-left: 12rpx;
}

.life-stage-sheet__tag--current {
  color: #b45309;
}

.life-stage-sheet__footer {
  margin-top: 28rpx;
}

.life-stage-sheet__confirm {
  width: 100%;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  background: #b45309;
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}

.life-stage-sheet__confirm[disabled] {
  background: #d9cfc3;
}
</style>
