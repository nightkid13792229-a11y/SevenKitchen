<template>
  <view v-if="visible" class="dog-avatar-cropper">
    <view class="dog-avatar-cropper__mask" @tap="handleClose"></view>
    <view class="dog-avatar-cropper__sheet" @tap.stop>
      <view class="dog-avatar-cropper__header">
        <text class="dog-avatar-cropper__button" @tap="handleClose">取消</text>
        <text class="dog-avatar-cropper__title">{{ title }}</text>
        <text
          class="dog-avatar-cropper__button dog-avatar-cropper__button--confirm"
          :class="{ 'dog-avatar-cropper__button--disabled': isBusy || !cropState }"
          @tap="handleConfirm"
        >
          {{ confirmText }}
        </text>
      </view>

      <view class="dog-avatar-cropper__body">
        <view
          class="dog-avatar-cropper__stage"
          :style="stageStyle"
          @touchstart.stop.prevent="onTouchStart"
          @touchmove.stop.prevent="onTouchMove"
          @touchend.stop.prevent="onTouchEnd"
          @touchcancel.stop.prevent="onTouchEnd"
        >
          <image
            v-if="cropState"
            class="dog-avatar-cropper__image"
            :src="sourcePath"
            :style="cropImageStyle"
            mode="scaleToFill"
          />
          <view
            v-if="cropState"
            class="dog-avatar-cropper__frame-mask dog-avatar-cropper__frame-mask--top"
            :style="frameMaskTopStyle"
          ></view>
          <view
            v-if="cropState"
            class="dog-avatar-cropper__frame-mask dog-avatar-cropper__frame-mask--bottom"
            :style="frameMaskBottomStyle"
          ></view>
          <view
            v-if="cropState"
            class="dog-avatar-cropper__frame-mask dog-avatar-cropper__frame-mask--left"
            :style="frameMaskLeftStyle"
          ></view>
          <view
            v-if="cropState"
            class="dog-avatar-cropper__frame-mask dog-avatar-cropper__frame-mask--right"
            :style="frameMaskRightStyle"
          ></view>
          <view
            v-if="cropState"
            class="dog-avatar-cropper__frame-window"
            :style="frameWindowStyle"
          ></view>
          <view v-if="isPreparing" class="dog-avatar-cropper__loading">
            <text class="dog-avatar-cropper__loading-text">正在加载图片...</text>
          </view>
        </view>

        <view class="dog-avatar-cropper__controls">
          <text class="dog-avatar-cropper__hint">单指拖动，双指缩放</text>
          <text
            class="dog-avatar-cropper__reset"
            :class="{ 'dog-avatar-cropper__reset--disabled': isBusy || !cropState }"
            @tap="handleReset"
          >
            重置
          </text>
        </view>
      </view>

      <canvas
        canvas-id="dogAvatarCropExportCanvas"
        class="dog-avatar-cropper__export-canvas"
        :style="exportCanvasStyle"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from 'vue'
import {
  clampDogAvatarCropState,
  computeDogAvatarCropRect,
  createDogAvatarCropState,
  type DogAvatarCropState,
} from '../../utils/dog-avatar-crop'

const EXPORT_CANVAS_ID = 'dogAvatarCropExportCanvas'
const EXPORT_SIZE = 800

const props = withDefaults(defineProps<{
  visible: boolean
  sourcePath: string
  title?: string
  confirmText?: string
  submitting?: boolean
}>(), {
  title: '裁切头像',
  confirmText: '使用头像',
  submitting: false,
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm', tempFilePath: string): void
  (event: 'error', message: string): void
}>()

const componentInstance = getCurrentInstance()?.proxy as any
const systemInfo = uni.getSystemInfoSync()
const frameSize = Math.max(220, Math.min((systemInfo.screenWidth || 375) - 48, 320))
const maxStageWidth = Math.max(frameSize + 48, (systemInfo.screenWidth || 375) - 24)
const maxStageHeight = Math.max(
  frameSize + 48,
  Math.min((systemInfo.windowHeight || systemInfo.screenHeight || 667) - 220, 500),
)
const cropState = ref<DogAvatarCropState | null>(null)
const isPreparing = ref(false)
const isExporting = ref(false)
const exportCanvasStyle = {
  width: `${EXPORT_SIZE}px`,
  height: `${EXPORT_SIZE}px`,
}

let requestId = 0
let activeGesture: 'none' | 'drag' | 'pinch' = 'none'
let startOffsetX = 0
let startOffsetY = 0
let startPointX = 0
let startPointY = 0
let startDistance = 0
let startScale = 1

const isBusy = computed(() => isPreparing.value || isExporting.value || props.submitting)
const stageDimensions = computed(() => {
  const renderedWidth = cropState.value?.renderedWidth || frameSize
  const renderedHeight = cropState.value?.renderedHeight || frameSize

  return {
    width: Math.max(frameSize + 48, Math.min(maxStageWidth, renderedWidth + 32)),
    height: Math.max(frameSize + 48, Math.min(maxStageHeight, renderedHeight + 32)),
  }
})
const frameBounds = computed(() => {
  const left = (stageDimensions.value.width - frameSize) / 2
  const top = (stageDimensions.value.height - frameSize) / 2

  return {
    left,
    top,
    right: left + frameSize,
    bottom: top + frameSize,
  }
})
const stageStyle = computed(() => ({
  width: `${stageDimensions.value.width}px`,
  height: `${stageDimensions.value.height}px`,
}))
const frameWindowStyle = computed(() => ({
  width: `${frameSize}px`,
  height: `${frameSize}px`,
  left: `${frameBounds.value.left}px`,
  top: `${frameBounds.value.top}px`,
}))
const frameMaskTopStyle = computed(() => ({
  height: `${frameBounds.value.top}px`,
}))
const frameMaskBottomStyle = computed(() => ({
  top: `${frameBounds.value.bottom}px`,
  height: `${stageDimensions.value.height - frameBounds.value.bottom}px`,
}))
const frameMaskLeftStyle = computed(() => ({
  top: `${frameBounds.value.top}px`,
  width: `${frameBounds.value.left}px`,
  height: `${frameSize}px`,
}))
const frameMaskRightStyle = computed(() => ({
  top: `${frameBounds.value.top}px`,
  left: `${frameBounds.value.right}px`,
  width: `${stageDimensions.value.width - frameBounds.value.right}px`,
  height: `${frameSize}px`,
}))
const cropImageStyle = computed(() => {
  if (!cropState.value) {
    return {}
  }

  const scaledWidth = cropState.value.renderedWidth * cropState.value.scale
  const scaledHeight = cropState.value.renderedHeight * cropState.value.scale
  const left = (stageDimensions.value.width - scaledWidth) / 2 + cropState.value.offsetX
  const top = (stageDimensions.value.height - scaledHeight) / 2 + cropState.value.offsetY

  return {
    width: `${scaledWidth}px`,
    height: `${scaledHeight}px`,
    left: `${left}px`,
    top: `${top}px`,
  }
})

watch(
  () => [props.visible, props.sourcePath] as const,
  ([visible, sourcePath]) => {
    if (!visible || !String(sourcePath || '').trim()) {
      resetCropperState()
      return
    }

    void prepareCropper(String(sourcePath).trim())
  },
  { immediate: true },
)

function resetCropperState() {
  requestId += 1
  cropState.value = null
  isPreparing.value = false
  isExporting.value = false
  activeGesture = 'none'
}

function showError(message: string) {
  emit('error', message)
}

async function prepareCropper(sourcePath: string) {
  const nextRequestId = ++requestId
  isPreparing.value = true
  activeGesture = 'none'

  try {
    const imageInfo = await new Promise<UniApp.GetImageInfoSuccessData>((resolve, reject) => {
      uni.getImageInfo({
        src: sourcePath,
        success: resolve,
        fail: reject,
      })
    })

    if (nextRequestId !== requestId) {
      return
    }

    cropState.value = createDogAvatarCropState({
      imageWidth: imageInfo.width,
      imageHeight: imageInfo.height,
      frameSize,
    })
  } catch (error: any) {
    if (nextRequestId !== requestId) {
      return
    }

    showError(error?.message || '读取图片失败，请重新选择')
    emit('close')
  } finally {
    if (nextRequestId === requestId) {
      isPreparing.value = false
    }
  }
}

function normalizeTouches(event: any) {
  return Array.isArray(event?.touches) ? event.touches : []
}

function touchDistance(touches: any[]) {
  if (touches.length < 2) {
    return 0
  }

  const [firstTouch, secondTouch] = touches
  const deltaX = Number(secondTouch.clientX || 0) - Number(firstTouch.clientX || 0)
  const deltaY = Number(secondTouch.clientY || 0) - Number(firstTouch.clientY || 0)
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY)
}

function updateCropState(patch: Partial<DogAvatarCropState>) {
  if (!cropState.value) {
    return
  }

  cropState.value = clampDogAvatarCropState({
    ...cropState.value,
    ...patch,
  })
}

function onTouchStart(event: any) {
  if (!cropState.value || isBusy.value) {
    return
  }

  const touches = normalizeTouches(event)
  if (touches.length >= 2) {
    activeGesture = 'pinch'
    startDistance = touchDistance(touches)
    startScale = cropState.value.scale
    startOffsetX = cropState.value.offsetX
    startOffsetY = cropState.value.offsetY
    return
  }

  if (touches.length === 1) {
    activeGesture = 'drag'
    startPointX = Number(touches[0].clientX || 0)
    startPointY = Number(touches[0].clientY || 0)
    startOffsetX = cropState.value.offsetX
    startOffsetY = cropState.value.offsetY
  }
}

function onTouchMove(event: any) {
  if (!cropState.value || isBusy.value) {
    return
  }

  const touches = normalizeTouches(event)
  if (activeGesture === 'pinch' && touches.length >= 2 && startDistance > 0) {
    updateCropState({
      scale: startScale * (touchDistance(touches) / startDistance),
      offsetX: startOffsetX,
      offsetY: startOffsetY,
    })
    return
  }

  if (activeGesture === 'drag' && touches.length === 1) {
    updateCropState({
      offsetX: startOffsetX + Number(touches[0].clientX || 0) - startPointX,
      offsetY: startOffsetY + Number(touches[0].clientY || 0) - startPointY,
    })
  }
}

function onTouchEnd() {
  activeGesture = 'none'
}

function handleReset() {
  if (!cropState.value || isBusy.value) {
    return
  }

  cropState.value = createDogAvatarCropState({
    imageWidth: cropState.value.imageWidth,
    imageHeight: cropState.value.imageHeight,
    frameSize,
    maxScale: cropState.value.maxScale,
  })
}

function handleClose() {
  if (isBusy.value) {
    return
  }

  emit('close')
}

async function handleConfirm() {
  if (!cropState.value || isBusy.value) {
    return
  }

  isExporting.value = true

  try {
    const tempFilePath = await exportCroppedAvatar(cropState.value)
    emit('confirm', tempFilePath)
  } catch (error: any) {
    showError(error?.message || '裁切失败，请重试')
  } finally {
    isExporting.value = false
  }
}

async function exportCroppedAvatar(state: DogAvatarCropState): Promise<string> {
  const cropRect = computeDogAvatarCropRect(state)
  const context = uni.createCanvasContext(EXPORT_CANVAS_ID, componentInstance)

  context.setFillStyle('#ffffff')
  context.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
  context.drawImage(
    props.sourcePath,
    cropRect.sourceX,
    cropRect.sourceY,
    cropRect.sourceWidth,
    cropRect.sourceHeight,
    0,
    0,
    EXPORT_SIZE,
    EXPORT_SIZE,
  )

  return new Promise((resolve, reject) => {
    context.draw(false, () => {
      setTimeout(() => {
        uni.canvasToTempFilePath(
          {
            canvasId: EXPORT_CANVAS_ID,
            width: EXPORT_SIZE,
            height: EXPORT_SIZE,
            destWidth: EXPORT_SIZE,
            destHeight: EXPORT_SIZE,
            fileType: 'jpg',
            quality: 0.9,
            success: (result) => resolve(result.tempFilePath),
            fail: reject,
          },
          componentInstance,
        )
      }, 80)
    })
  })
}
</script>

<style scoped lang="scss">
.dog-avatar-cropper {
  position: fixed;
  inset: 0;
  z-index: 1200;
}

.dog-avatar-cropper__mask {
  position: absolute;
  inset: 0;
  background: rgba(6, 10, 13, 0.72);
}

.dog-avatar-cropper__sheet {
  position: absolute;
  inset: 0;
  padding: 32rpx 28rpx calc(env(safe-area-inset-bottom) + 32rpx);
  display: flex;
  flex-direction: column;
  background: rgba(13, 20, 25, 0.96);
}

.dog-avatar-cropper__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.dog-avatar-cropper__title {
  flex: 1;
  text-align: center;
  font-size: 30rpx;
  font-weight: 700;
  color: #ffffff;
}

.dog-avatar-cropper__button {
  min-width: 96rpx;
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.82);
}

.dog-avatar-cropper__button--confirm {
  text-align: right;
  font-weight: 700;
  color: #7be2ad;
}

.dog-avatar-cropper__button--disabled {
  color: rgba(255, 255, 255, 0.34);
}

.dog-avatar-cropper__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 32rpx;
}

.dog-avatar-cropper__stage {
  position: relative;
  overflow: hidden;
  border-radius: 32rpx;
  background: rgba(255, 255, 255, 0.08);
}

.dog-avatar-cropper__image {
  position: absolute;
}

.dog-avatar-cropper__frame-mask {
  position: absolute;
  left: 0;
  right: 0;
  background: rgba(7, 10, 14, 0.48);
}

.dog-avatar-cropper__frame-mask--left,
.dog-avatar-cropper__frame-mask--right {
  right: auto;
}

.dog-avatar-cropper__frame-window {
  position: absolute;
  border-radius: 28rpx;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-sizing: border-box;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.dog-avatar-cropper__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 20, 25, 0.4);
}

.dog-avatar-cropper__loading-text {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.88);
}

.dog-avatar-cropper__controls {
  width: 100%;
  max-width: 640rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.dog-avatar-cropper__hint {
  font-size: 22rpx;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.62);
}

.dog-avatar-cropper__reset {
  flex-shrink: 0;
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
}

.dog-avatar-cropper__reset--disabled {
  color: rgba(255, 255, 255, 0.34);
}

.dog-avatar-cropper__export-canvas {
  position: fixed;
  left: -9999px;
  top: -9999px;
  opacity: 0;
  pointer-events: none;
}
</style>
