import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SCAN_IMAGE_MAX_WIDTH,
  SCAN_IMAGE_QUALITY,
  SCAN_IMAGE_SIZE_TYPE,
} from './scan-image'

/**
 * 识别准确度的"像素底线"（2026-10-03）。
 *
 * 老板反馈"化验数值不准"，查下来不是模型不行，是给它的图太小：
 * 微信 compressed 会把宽度压到 1280，化验单上白字绿底的小数字只剩几像素，
 * 模型把 6.07 读成 6.02；同一栏放大后立刻读对。
 */
describe('识别用照片 · 像素底线', () => {
  it('宽度上限要比微信压缩图（1280）大一截', () => {
    expect(SCAN_IMAGE_MAX_WIDTH).toBeGreaterThanOrEqual(2000)
  })

  it('质量够高但不虚高（化验单是文字）', () => {
    expect(SCAN_IMAGE_QUALITY).toBeGreaterThanOrEqual(80)
    expect(SCAN_IMAGE_QUALITY).toBeLessThanOrEqual(95)
  })

  it('必须向微信要原图 —— 先压过一遍再放大是没用的', () => {
    expect(SCAN_IMAGE_SIZE_TYPE).toEqual(['original'])
  })

  it('压缩失败也要能识别（回退原图，不丢清晰度）', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/utils/scan-image.ts'), 'utf-8')

    expect(source).toContain('return out || source')
    expect(source).toContain('} catch {\n    return source\n  }')
  })
})

describe('识别入口 · 都走同一条"提清晰度"的路', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8')

  it('体检/病历扫描入口不再用 compressed', () => {
    const source = read('src/components/dog-profile/HealthDocumentScan.vue')

    expect(source).toContain('sizeType: SCAN_IMAGE_SIZE_TYPE')
    expect(source).not.toContain("sizeType: ['compressed']")
    // 上传前统一准备
    expect(source).toContain('await prepareScanImages(filePaths)')
  })

  it('过敏报告扫描入口同样处理', () => {
    const source = read('src/components/dog-profile/AllergyQuickAddSection.vue')

    expect(source).toContain('sizeType: SCAN_IMAGE_SIZE_TYPE')
    expect(source).toContain('await prepareScanImages(filePaths)')
  })

  it('手填表单里的普通附件保持轻量上传（不为了识别把附件也放大）', () => {
    const source = read('src/components/dog-profile/HealthRecordsSection.vue')

    expect(source).toContain("sizeType: ['compressed']")
    expect(source).not.toContain('prepareScanImages')
  })
})

describe('识别用照片 · 不放大本来就不宽的原图', () => {
  const source = () =>
    readFileSync(resolve(process.cwd(), 'src/utils/scan-image.ts'), 'utf-8')

  it('先量原图宽度，再决定压到多宽（避免"压缩"反而把图放大）', () => {
    const text = source()

    expect(text).toContain('uni.getImageInfo({ src: path, success: resolve, fail: reject })')
    expect(text).toContain('sourceWidth < SCAN_IMAGE_MAX_WIDTH')
    expect(text).toContain('compressedWidth: targetWidth')
  })

  it('量不到宽度也照样能走（回退到上限宽度）', () => {
    const text = source()

    expect(text).toContain('return Number.isFinite(width) && width > 0 ? width : 0')
  })
})
