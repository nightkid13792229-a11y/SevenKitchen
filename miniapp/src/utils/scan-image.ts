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
