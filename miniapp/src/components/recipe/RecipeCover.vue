<template>
  <!--
    食谱封面 · 四页共用（2026-10-18 抽出）

    ## 它解决的问题

    交付第 1 页、详情页、DIY 配置页原来各画一份封面，三份长得不一样：
      · 详情页有图时叠食谱名，没图时是"灰底大字 = 食谱名首字母"
      · 交付页有图时叠三行，没图时干脆留白
    老板审原型时定了三条：
      ① 没封面**不用首字母**，用品牌深色块 + 完整文字
      ② 详情页**只叠食谱名**，交付页叠三行
      ③ 组件不做复杂参数 —— 就是"给几行文字"

    ## 所以参数只有三个

    `coverImageUrl`（可空）、`title`（必填）、`subtitles`（0~N 行）。
    详情页传 0 行 subtitle，交付页传 2 行。**没有布尔开关** ——
    少一个参数，就少一处"某一页漏传导致多一行字"的坑。

    ## 兜底为什么是深色块而不是首字母

    只有一个首字母等于什么都没说 —— 顾客看到"低"字猜不出这道菜是什么。
    深色块 + 完整食谱名至少把"这是什么"说全了。
  -->
  <view class="recipe-cover" :class="{ 'recipe-cover--fallback': !hasImage }">
    <image
      v-if="hasImage"
      class="recipe-cover__image"
      :src="coverImageUrl || ''"
      mode="aspectFill"
    />
    <!-- 压暗层：有图时保证白字可读，没图时盖在深色渐变上（视觉一致） -->
    <view class="recipe-cover__scrim" />
    <view class="recipe-cover__text">
      <text class="recipe-cover__title">{{ title }}</text>
      <text
        v-for="(line, index) in visibleSubtitles"
        :key="index"
        class="recipe-cover__subtitle"
        :class="{ 'recipe-cover__subtitle--facts': index > 0 }"
      >{{ line }}</text>
    </view>
    <!-- 角标：版本 + 交付日期（交付页用，其它页不传就不显示） -->
    <view v-if="badge" class="recipe-cover__badge">
      <text class="recipe-cover__badge-text">{{ badge }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 封面图地址；为空或加载失败时走深色兜底 */
    coverImageUrl?: string | null
    /** 食谱名 —— 永远显示，兜底时也一样 */
    title: string
    /** 叠在标题下面的几行（详情页 0 行，交付页「为谁定制 / 品种年龄体重」两行） */
    subtitles?: string[]
    /** 左上角角标（如「第 1 版 · 10-17 交付」），不传不显示 */
    badge?: string | null
  }>(),
  {
    coverImageUrl: null,
    subtitles: () => [],
    badge: null,
  },
)

const hasImage = computed(
  () => typeof props.coverImageUrl === 'string' && props.coverImageUrl.length > 0,
)

/**
 * 去掉空字符串 —— 后端某个字段缺失时（比如狗没有品种），
 * 不该在封面上留一行空白。
 */
const visibleSubtitles = computed(() =>
  (props.subtitles || []).filter(
    (line) => typeof line === 'string' && line.trim().length > 0,
  ),
)
</script>

<style scoped lang="scss">
.recipe-cover {
  position: relative;
  height: 392rpx;
  border-radius: 30rpx;
  overflow: hidden;
  /* 有图时这层看不到；图还没加载出来的那一瞬露出品牌色，不会闪白 */
  background: linear-gradient(145deg, #24483a, #16261f 62%, #0e1a15);
}

.recipe-cover__image {
  width: 100%;
  height: 100%;
  display: block;
}

/* 兜底：品牌深色块。不用首字母 —— 只有一个字等于什么都没说 */
.recipe-cover--fallback {
  background: linear-gradient(145deg, #24483a, #16261f 62%, #0e1a15);
}

.recipe-cover__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(18, 12, 6, 0) 26%,
    rgba(18, 12, 6, 0.3) 48%,
    rgba(18, 12, 6, 0.72) 74%,
    rgba(18, 12, 6, 0.92) 100%
  );
}

.recipe-cover__text {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 28rpx 30rpx;
  display: flex;
  flex-direction: column;
}

.recipe-cover__title {
  font-size: 44rpx;
  font-weight: 800;
  line-height: 1.25;
  color: #fff;
  /* 双阴影：一层压边保证在浅色食物照片上也看得清，一层散开做柔和过渡 */
  text-shadow:
    0 2rpx 6rpx rgba(0, 0, 0, 0.55),
    0 4rpx 24rpx rgba(0, 0, 0, 0.45);
}

.recipe-cover__subtitle {
  font-size: 25rpx;
  color: #fff;
  margin-top: 12rpx;
  text-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.6);
}

/* 第二行起是"事实信息"（品种/年龄/体重），压暗一档做层次 */
.recipe-cover__subtitle--facts {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.82);
  margin-top: 4rpx;
}

.recipe-cover__badge {
  position: absolute;
  top: 22rpx;
  left: 24rpx;
  background: rgba(0, 0, 0, 0.42);
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
}

.recipe-cover__badge-text {
  font-size: 19rpx;
  color: rgba(255, 255, 255, 0.94);
}
</style>
