<template>
  <!--
    生命阶段版本卡 · 四页共用（2026-10-18 抽出）

    ## 为什么它值得抽出来

    这一块在**四个页面**里各写了一遍（食谱详情 / 成品订购 / DIY 配置 / DIY 制作单），
    四份实现加起来 21 个 computed + 13 个函数，长得还不完全一样 ——
    同一个 `matchType`，四个页面可能给出四种说法。

    ## 后端的 5 种 matchType，在这里合成 3 种界面状态

    | matchType | 界面状态 | 顾客看到的 |
    |---|---|---|
    | `MATCHED` | 匹配 | 「已匹配：成犬版」（中性绿） |
    | `MANUAL_MISMATCH` | 手动换过 | 「你正在看：幼犬版」（提示色，不吓人） |
    | `FALLBACK_ADULT` / `FALLBACK_FIRST` | 没有完全匹配 | 「没有完全匹配的版本」（警示红） |
    | `LEGACY` | 不分版本 | **整块不显示**（这张食谱本来就没有版本之分） |

    ## 文案优先用后端给的

    `verdict.message` 由后端算出来（它知道"为什么没匹配上"）。
    前端只在**后端没给**的时候兜底 —— 兜底文案按三种状态各一句。
  -->
  <view
    v-if="visible"
    class="life-stage-card"
    :class="`life-stage-card--${visualState}`"
  >
    <view class="life-stage-card__main">
      <view class="life-stage-card__head">
        <text
          v-if="visualState === 'mismatch'"
          class="life-stage-card__warn"
        >!</text>
        <text class="life-stage-card__title">{{ title }}</text>
      </view>
      <text class="life-stage-card__copy">{{ copy }}</text>
    </view>
    <text
      v-if="hasVersions"
      class="life-stage-card__action"
      @tap="emit('open-selector')"
    >切换 ›</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isLifeStageMismatch } from '@/utils/life-stage-match'

const props = withDefaults(
  defineProps<{
    /** 后端 `lifeStageMatch.matchType` */
    matchType?: string | null
    /** 后端 `lifeStageMatch.message`（有就优先用） */
    message?: string | null
    /** 当前展示的是哪一版（中文名，如「成犬版」）。为空时用「当前版本」 */
    selectedLabel?: string | null
    /** 可选版本数量 —— 大于 1 才显示「切换 ›」 */
    versionCount?: number
    /** 狗狗名字（兜底文案里用） */
    dogName?: string | null
  }>(),
  {
    matchType: null,
    message: null,
    selectedLabel: null,
    versionCount: 0,
    dogName: null,
  },
)

const emit = defineEmits<{ (event: 'open-selector'): void }>()

/** 3 种界面状态；LEGACY 与未知一律不显示 */
const visualState = computed<'matched' | 'manual' | 'mismatch' | 'hidden'>(() => {
  const type = props.matchType
  if (!type || type === 'LEGACY') return 'hidden'
  if (type === 'MATCHED') return 'matched'
  if (type === 'MANUAL_MISMATCH') return 'manual'
  // FALLBACK_ADULT / FALLBACK_FIRST → 同一种"没有完全匹配"
  if (isLifeStageMismatch(type)) return 'mismatch'
  return 'hidden'
})

const visible = computed(() => visualState.value !== 'hidden')

/**
 * 标题按三态给。
 *
 * 「已匹配」加前缀是有意的：顾客切到别版之后回到匹配态，
 * 这行字是他确认"现在看的是对的那一版"的唯一凭据。
 */
const title = computed(() => {
  const label = (props.selectedLabel || '').trim() || '当前版本'
  return visualState.value === 'matched' ? `已匹配：${label}` : label
})

/**
 * 正文：后端给什么用什么。
 *
 * 后端没给时按状态兜底 —— 但**兜底文案不能说"不匹配"这么绝对**，
 * 因为它可能只是这张食谱没配全版本。
 */
const copy = computed(() => {
  const fromBackend = (props.message || '').trim()
  if (fromBackend) return fromBackend

  const dog = (props.dogName || '').trim()
  const dogText = dog ? `「${dog}」` : '当前狗狗'

  switch (visualState.value) {
    case 'manual':
      return '你正在看的不是按它档案匹配的那一版。'
    case 'mismatch':
      return `${dogText}没有完全匹配的版本，已展示一份可用的替代版本。`
    case 'matched':
      return '这一版是按它的档案匹配出来的。'
    default:
      return ''
  }
})

const hasVersions = computed(() => (props.versionCount || 0) > 1)
</script>

<style scoped lang="scss">
.life-stage-card {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid #ede0d0;
  border-radius: 22rpx;
  padding: 20rpx 24rpx;
}

/* 匹配 · 中性绿 */
.life-stage-card--matched {
  background: #f7fbf8;
  border-color: #cfe3d5;
}

/* 手动换过 · 提示黄（不吓人，只是提醒） */
.life-stage-card--manual {
  background: #fffcf7;
  border-color: #f0dfc4;
}

/* 没有完全匹配 · 警示（用告警色，顾客需要注意到） */
.life-stage-card--mismatch {
  background: #fffbfa;
  border-color: #f0c8bc;
}

.life-stage-card__main {
  flex: 1;
  min-width: 0;
}

.life-stage-card__head {
  display: flex;
  align-items: center;
}

.life-stage-card__warn {
  width: 26rpx;
  height: 26rpx;
  border-radius: 50%;
  background: #b4453a;
  color: #fff;
  font-size: 18rpx;
  font-weight: 800;
  text-align: center;
  line-height: 26rpx;
  margin-right: 10rpx;
}

.life-stage-card__title {
  font-size: 25rpx;
  font-weight: 700;
  color: #3f3222;
}

.life-stage-card__copy {
  display: block;
  font-size: 22rpx;
  color: #8a7a66;
  line-height: 1.55;
  margin-top: 6rpx;
}

.life-stage-card__action {
  font-size: 23rpx;
  font-weight: 700;
  color: #b45309;
  margin-left: 16rpx;
  flex: 0 0 auto;
}
</style>
