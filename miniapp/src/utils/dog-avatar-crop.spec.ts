import { describe, expect, it } from 'vitest'
import {
  clampDogAvatarCropState,
  computeDogAvatarCropRect,
  createDogAvatarCropState,
} from './dog-avatar-crop'

describe('dog-avatar-crop utils', () => {
  it('creates a cover layout that fully fills the square crop frame', () => {
    expect(
      createDogAvatarCropState({
        imageWidth: 1200,
        imageHeight: 800,
        frameSize: 240,
      }),
    ).toEqual({
      imageWidth: 1200,
      imageHeight: 800,
      frameSize: 240,
      renderedWidth: 360,
      renderedHeight: 240,
      scale: 1,
      minScale: 1,
      maxScale: 4,
      offsetX: 0,
      offsetY: 0,
    })
  })

  it('clamps drag offsets and scale so the crop frame never exposes empty space', () => {
    expect(
      clampDogAvatarCropState({
        imageWidth: 1200,
        imageHeight: 800,
        frameSize: 240,
        renderedWidth: 360,
        renderedHeight: 240,
        scale: 0.6,
        minScale: 1,
        maxScale: 4,
        offsetX: 200,
        offsetY: 80,
      }),
    ).toEqual({
      imageWidth: 1200,
      imageHeight: 800,
      frameSize: 240,
      renderedWidth: 360,
      renderedHeight: 240,
      scale: 1,
      minScale: 1,
      maxScale: 4,
      offsetX: 60,
      offsetY: 0,
    })
  })

  it('computes the source-image crop rectangle from the current zoom and drag state', () => {
    expect(
      computeDogAvatarCropRect({
        imageWidth: 1200,
        imageHeight: 800,
        frameSize: 240,
        renderedWidth: 360,
        renderedHeight: 240,
        scale: 1.5,
        minScale: 1,
        maxScale: 4,
        offsetX: 30,
        offsetY: -10,
      }),
    ).toEqual({
      sourceX: 266.6666666666667,
      sourceY: 155.55555555555557,
      sourceWidth: 533.3333333333334,
      sourceHeight: 533.3333333333334,
    })
  })
})
