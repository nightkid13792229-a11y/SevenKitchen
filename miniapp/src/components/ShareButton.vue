<template>
  <view :class="containerClass">
    <button
      class="share-button"
      :open-type="openType"
      :data-share-path="sharePath"
      :data-share-title="shareTitle"
      :data-share-image="shareImage"
      @tap="handleClick"
      @error="handleError"
    >
      <view class="share-button-content">
        <text class="share-icon">{{ icon }}</text>
        <text v-if="showText" class="share-text">{{ text }}</text>
      </view>
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  // 分享类型：share（触发分享）或 custom（自定义）
  openType?: 'share' | 'sendMessage'
  // 图标
  icon?: string
  // 按钮文字
  text?: string
  // 是否显示文字
  showText?: boolean
  // 尺寸：small, medium, large
  size?: 'small' | 'medium' | 'large'
  // 样式类型：default, primary, plain, icon-only
  type?: 'default' | 'primary' | 'plain' | 'icon-only'
  // 分享路径（可选，默认使用当前页面路径）
  sharePath?: string
  // 分享标题（可选）
  shareTitle?: string
  // 分享图片（可选）
  shareImage?: string
  // 是否禁用
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  openType: 'share',
  icon: '➦', // 默认分享符号
  text: '分享',
  showText: false,
  size: 'medium',
  type: 'icon-only',
  sharePath: '',
  shareTitle: '',
  shareImage: '',
  disabled: false
})

const emit = defineEmits<{
  (e: 'tap', event: any): void
  (e: 'error', error: any): void
}>()

// 计算容器类名
const containerClass = computed(() => {
  return [
    'share-button-container',
    `share-button--${props.size}`,
    `share-button--${props.type}`,
    {
      'share-button--disabled': props.disabled
    }
  ]
})

// 处理点击事件
function handleClick(event: any) {
  if (props.disabled) return

  // 如果是自定义分享，触发tap事件
  if (props.openType !== 'share') {
    emit('tap', event)
  }
}

// 处理错误
function handleError(error: any) {
  console.error('[ShareButton] Share error:', error)
  emit('error', error)
}
</script>

<style scoped>
/* 容器 */
.share-button-container {
  display: inline-block;
}

/* 按钮基础样式 */
.share-button {
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.share-button::after {
  border: none;
}

/* 按钮内容 */
.share-button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

/* 图标 */
.share-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  color: #333;
  transition: transform 0.2s ease;
}

.share-button:active .share-icon {
  transform: scale(0.9);
}

/* 文字 */
.share-text {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

/* ========== 尺寸变体 ========== */

/* 小尺寸 */
.share-button--small .share-button {
  min-width: 56rpx;
  height: 56rpx;
  border-radius: 12rpx;
}

.share-button--small .share-icon {
  font-size: 32rpx;
}

.share-button--small .share-text {
  font-size: 24rpx;
}

/* 中尺寸（默认） */
.share-button--medium .share-button {
  min-width: 72rpx;
  height: 72rpx;
  border-radius: 16rpx;
}

.share-button--medium .share-icon {
  font-size: 40rpx;
}

.share-button--medium .share-text {
  font-size: 28rpx;
}

/* 大尺寸 */
.share-button--large .share-button {
  min-width: 88rpx;
  height: 88rpx;
  border-radius: 20rpx;
}

.share-button--large .share-icon {
  font-size: 48rpx;
}

.share-button--large .share-text {
  font-size: 32rpx;
}

/* ========== 样式变体 ========== */

/* 默认样式 - 浅灰背景 */
.share-button--default .share-button {
  background-color: #f5f5f5;
}

.share-button--default .share-icon,
.share-button--default .share-text {
  color: #333;
}

/* 主样式 - 品牌色背景 */
.share-button--primary .share-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.3);
}

.share-button--primary .share-icon,
.share-button--primary .share-text {
  color: #fff;
}

/* 简约样式 - 边框 */
.share-button--plain .share-button {
  background-color: #fff;
  border: 2rpx solid #e5e5e5;
}

.share-button--plain .share-icon,
.share-button--plain .share-text {
  color: #666;
}

/* 仅图标样式 - 圆形 */
.share-button--icon-only .share-button {
  border-radius: 50%;
  background-color: #f5f5f5;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}

.share-button--icon-only .share-button:active {
  background-color: #e8e8e8;
  box-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.1);
}

/* ========== 禁用状态 ========== */
.share-button--disabled .share-button {
  opacity: 0.5;
  pointer-events: none;
}

/* ========== 特殊效果 ========== */

/* 波纹效果（仅非icon-only） */
.share-button--primary .share-button::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width 0.3s, height 0.3s;
}

.share-button--primary .share-button:active::before {
  width: 200%;
  height: 200%;
}
</style>
