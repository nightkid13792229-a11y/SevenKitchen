import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SCAN_IMAGE_MAX_WIDTH,
  SCAN_IMAGE_MIN_WIDTH,
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

  it('过敏报告扫描入口同样处理（2026-10-04 搬去定制食谱）', () => {
    const source = read('src/components/custom-recipe/AllergyScanBlock.vue')

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

/**
 * 图太糊就拦一下（2026-10-03，老板那条体检记录的真实原因）。
 *
 * 他上传的 7 张报告只有 **640 像素宽**，化验表"参考范围"和"检测结果"两栏
 * 糊在一起 —— 老记录里因此出现一整块"生化"，数值全是参考范围那一栏。
 * 更要命的是：图糊时模型不说"看不清"，它编。拿那张 540×960 的原图直接问，
 * 它给出「GLU 6.7 mmol/L 参考范围 3.7-7.1」—— 纸上根本没有这行。
 * 提示词里写"看不清宁可留空不许猜"也拦不住，只能在界面上拦。
 */
describe('识别用照片 · 太糊就先问一句', () => {
  const source = () =>
    readFileSync(resolve(process.cwd(), 'src/utils/scan-image.ts'), 'utf-8')

  it('有一条明确的清晰度下限，且不低于 900 像素宽', () => {
    expect(SCAN_IMAGE_MIN_WIDTH).toBeGreaterThanOrEqual(900)
  })

  it('量不出尺寸时不拦人（宁可放过，不要误伤正常照片）', () => {
    const text = source()

    expect(text).toContain('item.width > 0 && item.width < SCAN_IMAGE_MIN_WIDTH')
    expect(text).toContain('return { path, width: 0, height: 0 }')
  })

  it('提示里给出实际尺寸，并让家长选"重新选"还是"继续识别"', () => {
    const text = source()

    expect(text).toContain('这张照片太小了')
    expect(text).toContain('建议重新拍一张')
    expect(text).toContain("confirmText: '继续识别'")
    expect(text).toContain("cancelText: '重新选'")
  })

  it('两个识别入口都在识别前问这一句，选"重新选"就真的不动手', () => {
    for (const file of [
      'src/components/dog-profile/HealthDocumentScan.vue',
      'src/components/custom-recipe/AllergyScanBlock.vue',
    ]) {
      const text = readFileSync(resolve(process.cwd(), file), 'utf-8')
      expect(text).toContain('await findBlurryScanImages(filePaths)')
      expect(text).toContain('await confirmBlurryScanImages(blurry)')
    }

    const scan = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )
    expect(scan).toContain('if (!goOn) {\n      isBusy.value = false\n      return\n    }')
  })
})
