export interface DogAvatarCropState {
  imageWidth: number
  imageHeight: number
  frameSize: number
  renderedWidth: number
  renderedHeight: number
  scale: number
  minScale: number
  maxScale: number
  offsetX: number
  offsetY: number
}

export interface DogAvatarCropRect {
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
}

const DEFAULT_MAX_SCALE = 4

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createDogAvatarCropState(params: {
  imageWidth: number
  imageHeight: number
  frameSize: number
  maxScale?: number
}): DogAvatarCropState {
  const imageWidth = Math.max(1, params.imageWidth)
  const imageHeight = Math.max(1, params.imageHeight)
  const frameSize = Math.max(1, params.frameSize)
  const coverRatio = Math.max(frameSize / imageWidth, frameSize / imageHeight)

  return {
    imageWidth,
    imageHeight,
    frameSize,
    renderedWidth: imageWidth * coverRatio,
    renderedHeight: imageHeight * coverRatio,
    scale: 1,
    minScale: 1,
    maxScale: Math.max(1, params.maxScale ?? DEFAULT_MAX_SCALE),
    offsetX: 0,
    offsetY: 0,
  }
}

export function clampDogAvatarCropState(state: DogAvatarCropState): DogAvatarCropState {
  const scale = clamp(state.scale, state.minScale, state.maxScale)
  const scaledWidth = state.renderedWidth * scale
  const scaledHeight = state.renderedHeight * scale
  const maxOffsetX = Math.max(0, (scaledWidth - state.frameSize) / 2)
  const maxOffsetY = Math.max(0, (scaledHeight - state.frameSize) / 2)

  return {
    ...state,
    scale,
    offsetX: clamp(state.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clamp(state.offsetY, -maxOffsetY, maxOffsetY),
  }
}

export function computeDogAvatarCropRect(state: DogAvatarCropState): DogAvatarCropRect {
  const normalizedState = clampDogAvatarCropState(state)
  const scaledWidth = normalizedState.renderedWidth * normalizedState.scale
  const scaledHeight = normalizedState.renderedHeight * normalizedState.scale
  const imageLeft =
    (normalizedState.frameSize - scaledWidth) / 2 + normalizedState.offsetX
  const imageTop =
    (normalizedState.frameSize - scaledHeight) / 2 + normalizedState.offsetY
  const visibleX = Math.max(0, -imageLeft)
  const visibleY = Math.max(0, -imageTop)
  const ratioX = normalizedState.imageWidth / scaledWidth
  const ratioY = normalizedState.imageHeight / scaledHeight

  return {
    sourceX: visibleX * ratioX,
    sourceY: visibleY * ratioY,
    sourceWidth: normalizedState.frameSize * ratioX,
    sourceHeight: normalizedState.frameSize * ratioY,
  }
}
