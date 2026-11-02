<template>
  <view
    v-if="state !== 'legacy'"
    class="life-stage-bar"
    :class="[`tone-${tone}`]"
  >
    <view class="life-stage-bar__main">
      <text class="life-stage-bar__title">{{ copy.title }}</text>
      <text class="life-stage-bar__subtitle">
        {{ busy ? '正在切换…' : copy.subtitle }}
      </text>
    </view>
    <text
      v-if="copy.actionLabel && !busy"
      class="life-stage-bar__action"
      @tap="onAction"
    >{{ copy.actionLabel }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  buildLifeStageBarCopy,
  describeMatchedStage,
  type LifeStageUiState,
} from '@/utils/life-stage-ui'

const props = withDefaults(
  defineProps<{
    state: LifeStageUiState
    dogName?: string | null
    dogAgeText?: string | null
    dogStage?: string | null
    dogStageLabel?: string | null
    currentLabel?: string | null
    suggestedLabel?: string | null
    suggestedStage?: string | null
    versionCount?: number
    matchReason?: string | null
    busy?: boolean
  }>(),
  {
    dogName: null,
    dogAgeText: null,
    dogStage: null,
    dogStageLabel: null,
    currentLabel: null,
    suggestedLabel: null,
    suggestedStage: null,
    versionCount: 0,
    matchReason: null,
    busy: false,
  },
)

const emit = defineEmits<{
  (event: 'open-selector'): void
  (event: 'select', lifeStage: string): void
  (event: 'see-suitable'): void
  (event: 'retry'): void
  (event: 'add-dog'): void
}>()

const copy = computed(() =>
  buildLifeStageBarCopy(props.state, {
    dogName: props.dogName,
    dogAgeText: props.dogAgeText,
    dogStage: props.dogStage,
    dogStageLabel: props.dogStageLabel,
    currentLabel: props.currentLabel,
    suggestedLabel: props.suggestedLabel,
    versionCount: props.versionCount,
    matchReason: props.matchReason || describeMatchedStage(props.dogStage),
  }),
)

const tone = computed(() => {
  switch (props.state) {
    case 'manual_high':
    case 'fallback_high':
      return 'danger'
    case 'manual_low':
    case 'fallback_low':
      return 'warn'
    case 'unknown':
    case 'no_dog':
      return 'muted'
    default:
      return 'neutral'
  }
})

function onAction() {
  const action = copy.value.action
  if (action === 'switch') {
    emit('open-selector')
    return
  }
  if (action === 'restore') {
    if (props.suggestedStage) emit('select', props.suggestedStage)
    return
  }
  if (action === 'suitable') {
    emit('see-suitable')
    return
  }
  if (action === 'retry') {
    emit('retry')
    return
  }
  if (action === 'add_dog') {
    emit('add-dog')
  }
}
</script>

<style scoped lang="scss">
.life-stage-bar {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid #ede0d0;
  border-radius: 22rpx;
  padding: 20rpx 24rpx;
  margin-top: 16rpx;
}

.life-stage-bar__main {
  flex: 1;
  min-width: 0;
}

.life-stage-bar__title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #3f3222;
}

.life-stage-bar__subtitle {
  display: block;
  font-size: 22rpx;
  color: #8a7a66;
  line-height: 1.55;
  margin-top: 6rpx;
}

.life-stage-bar__action {
  flex: 0 0 auto;
  margin-left: 16rpx;
  font-size: 23rpx;
  font-weight: 700;
  color: #b45309;
}

.tone-warn {
  background: #fffcf7;
  border-color: #f0dfc4;
}

.tone-danger {
  background: #fffbfa;
  border-color: #f0c8bc;
}

.tone-danger .life-stage-bar__title {
  color: #a33a2c;
}

.tone-muted {
  background: #f7f7f5;
  border-color: #e6e4df;
}

.tone-muted .life-stage-bar__action {
  color: #7a736a;
}
</style>
