/**
 * 识别用照片的准备（2026-10-03）。
 *
 * ── 为什么不让微信直接给「压缩图」────────────────────────────────
 *
 * 从前两处识别入口都写 `sizeType: ['compressed']`：微信会把宽度压到 1280。
 * 体检化验单上「白字 + 深绿底」的小数字，缩到那个尺寸只剩几个像素高，
 * 模型就会读错 —— 实测同一张血细胞形态学报告：
 *   · 整页 1280 宽 → 正常色素性红细胞读成 6.02（原图 6.07）
 *   · 把右栏单独放大再喂 → 立刻读对 6.07
 * 也就是说这不是模型不行，是我们给它的像素不够。
 *
 * 识别准不准是这件事的全部价值，所以这里换成「原图 + 自己压到 2000 宽」：
 * 比 1280 多一倍多的细节，体积仍在几百 KB 量级（不会把九张图传成几十兆）。
 *
 * 三条注意：
 *   1. `sizeType: ['original']` 拿原图 —— 微信的 compressed 拿不回细节，
 *      先压过一遍再放大是没用的。
 *   2. `compressedWidth` 需要基础库 2.26.0+；老基础库会忽略它，
 *      结果是"传了原图"—— 慢一点，但识别只会更准，不会更差。
 *   3. 压缩失败**不回退成不能识别**：直接用原图，宁可慢也不丢清晰度。
 */

/** 识别用照片的最长边上限（宽）。1280 是微信 compressed 的宽度，这里翻一倍。 */
export const SCAN_IMAGE_MAX_WIDTH = 2000

/** 压缩质量。化验单是文字，88 足够，再高只是白涨体积。 */
export const SCAN_IMAGE_QUALITY = 88

/** 选图时用的 sizeType：必须拿原图，压缩交给下面的 prepareScanImage 统一做。 */
export const SCAN_IMAGE_SIZE_TYPE: 'original'[] = ['original']

/**
 * 低于这个宽度就认为"读不准"（约等于手机截屏/被转发过一道的图）。
 *
 * ── 为什么要有这条线（2026-10-03 实测）──────────────────────────
 *
 * 老板那条体检记录里的化验数据之所以离谱，是因为 7 张图上传时只有 **640 像素宽**：
 * 化验表"参考范围"和"检测结果"两栏糊成一团，模型分不清哪一栏是结果 ——
 * 老记录里因此出现一整块"生化"，数值全是参考范围那一栏。
 *
 * 更要命的是：**图太糊时模型不会说"我看不清"，它会编。**
 * 拿那张 540×960 的原图直接问，它给出「GLU 6.7 mmol/L 参考范围 3.7-7.1」——
 * 这行数字和参考范围在纸上根本不存在，但看起来完全合理，家长会当成真的。
 * 提示词里写"看不清宁可留空不许猜"也拦不住（实测仍然编）。
 * 所以只能在这一步拦住：**先告诉家长这张图太小，让他自己决定要不要重拍。**
 */
export const SCAN_IMAGE_MIN_WIDTH = 900

export interface ScanImageSize {
  path: string
  width: number
  height: number
}

/** 量一张图的像素尺寸（拿不到就当"没意见"，不拦人）。 */
export async function inspectScanImage(path: string): Promise<ScanImageSize> {
  try {
    const info: any = await new Promise((resolve, reject) => {
      uni.getImageInfo({ src: path, success: resolve, fail: reject })
    })
    return {
      path,
      width: Number(info?.width || 0) || 0,
      height: Number(info?.height || 0) || 0,
    }
  } catch {
    return { path, width: 0, height: 0 }
  }
}

/** 挑出"太小、读不准"的那些图 */
export async function findBlurryScanImages(paths: string[]): Promise<ScanImageSize[]> {
  const list = Array.isArray(paths) ? paths.filter(Boolean) : []
  const sizes = await Promise.all(list.map(path => inspectScanImage(path)))
  return sizes.filter(item => item.width > 0 && item.width < SCAN_IMAGE_MIN_WIDTH)
}

/**
 * 图太小就先问一句，别让家长把编出来的数字当真。
 *
 * @returns true = 继续识别；false = 回去重选
 */
export async function confirmBlurryScanImages(blurry: ScanImageSize[]): Promise<boolean> {
  if (!Array.isArray(blurry) || blurry.length === 0) return true

  const sample = blurry[0]
  const sizeText = sample.width > 0
    ? `${sample.width}×${sample.height}`
    : '尺寸很小'
  const countText = blurry.length === 1
    ? '有 1 张照片太模糊'
    : `有 ${blurry.length} 张照片太模糊`

  try {
    const res: any = await new Promise((resolve, reject) => {
      uni.showModal({
        title: '这张照片太小了',
        content:
          `${countText}（例如 ${sizeText}），报告上的小数字很可能认错。` +
          '建议重新拍一张，或从相册里选**原图**。要继续识别吗？',
        confirmText: '继续识别',
        cancelText: '重新选',
        success: resolve,
        fail: reject,
      })
    })
    return Boolean(res?.confirm)
  } catch {
    return true
  }
}

/**
 * 读一张本地图片的原始宽度（拿不到就返回 0）。
 *
 * 为什么要先问一下：`compressedWidth` 是"目标宽度"，原图比它还小的时候
 * 微信会把图**放大**——白白涨体积，细节一点没多。所以先量一下再决定压到多宽。
 */
async function readImageWidth(path: string): Promise<number> {
  try {
    const info: any = await new Promise((resolve, reject) => {
      uni.getImageInfo({ src: path, success: resolve, fail: reject })
    })
    const width = Number(info?.width || 0)
    return Number.isFinite(width) && width > 0 ? width : 0
  } catch {
    return 0
  }
}

/**
 * 把一张本地照片准备成"识别用"的版本。
 *
 * @param path chooseImage 返回的本地临时路径
 * @returns 可以上传的本地路径；压缩失败时原样返回 `path`
 */
export async function prepareScanImage(path: string): Promise<string> {
  const source = String(path || '').trim()
  if (!source) return source

  // 原图本来就不宽（截图、小图）就不放大，只按质量重压一遍
  const sourceWidth = await readImageWidth(source)
  const targetWidth =
    sourceWidth > 0 && sourceWidth < SCAN_IMAGE_MAX_WIDTH
      ? sourceWidth
      : SCAN_IMAGE_MAX_WIDTH

  try {
    const res: any = await new Promise((resolve, reject) => {
      uni.compressImage({
        src: source,
        quality: SCAN_IMAGE_QUALITY,
        compressedWidth: targetWidth,
        success: resolve,
        fail: reject,
      })
    })
    const out = String(res?.tempFilePath || '').trim()
    return out || source
  } catch {
    return source
  }
}

/** 批量准备；逐张失败互不牵连。 */
export async function prepareScanImages(paths: string[]): Promise<string[]> {
  const list = Array.isArray(paths) ? paths.filter(Boolean) : []
  const prepared: string[] = []
  for (const path of list) {
    prepared.push(await prepareScanImage(path))
  }
  return prepared
}
