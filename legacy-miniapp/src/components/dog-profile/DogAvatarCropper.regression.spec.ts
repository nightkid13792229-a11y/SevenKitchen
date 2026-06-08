import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('DogAvatarCropper runtime regressions', () => {
  it('provides a reusable cropper overlay with touch gestures, dimmed outside masks, and reset support', () => {
    const filePath = resolve(process.cwd(), 'src/components/dog-profile/DogAvatarCropper.vue')

    expect(existsSync(filePath)).toBe(true)
    if (!existsSync(filePath)) {
      return
    }

    const source = readFileSync(filePath, 'utf-8')

    expect(source).toContain('canvas-id="dogAvatarCropExportCanvas"')
    expect(source).toContain('@touchstart.stop.prevent="onTouchStart"')
    expect(source).toContain('@touchmove.stop.prevent="onTouchMove"')
    expect(source).toContain('dog-avatar-cropper__stage')
    expect(source).toContain('dog-avatar-cropper__frame-mask dog-avatar-cropper__frame-mask--top')
    expect(source).toContain('@tap="handleReset"')
    expect(source).not.toContain('<slider')
  })
})
