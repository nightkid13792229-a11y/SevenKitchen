/**
 * 补剂标签打印的纯逻辑（错误分类 / 进度文案）
 *
 * 为什么单独抽一个文件：这些判断决定"现场同事看到什么、下一步该干什么"，
 * 是这一页最不能出错的部分（比如后端说「请先完成分装」被吞成「加载失败」，
 * 人就不知道要回去填分装结果）。放在页面里没法测，抽出来可以单独锁住。
 */

export type LabelPrintFailureKind =
  | 'not-connected'
  | 'image-missing'
  | 'timeout'
  | 'printer-busy'
  | 'canvas-missing'
  | 'unknown'

export interface LabelPrintFailure {
  kind: LabelPrintFailureKind
  /** 弹窗标题，直接说明是哪种失败 */
  title: string
  /** 下一步该干什么 */
  hint: string
  /** 原始错误文案，留着方便排查，不要求仓库同事看懂 */
  detail?: string
}

/**
 * 判定"打印超时"的耗时门槛。
 *
 * jcing-printer 的 printLabelFromImage 在 20 秒兜底超时后是 **resolve 而不是 reject**
 * （见 utils/jcing-printer.ts，为了不让用户卡在转圈里），
 * 所以超时只能靠耗时认出来：门槛取 19 秒，既兜住那条 20 秒的路径，
 * 又不会误伤正常路径（正常走 print 回调或 5 秒兜底，都在 10 秒内）。
 */
export const PRINT_TIMEOUT_MS = 19000

/** 两张标签之间的停顿：精臣 SDK 上一个任务没吐完就 startJob 会报"SDK忙" */
export const PRINT_GAP_MS = 800

/** "第 3 张 / 共 12 张"——现场核对缺哪张时用得上 */
export function buildLabelPositionText(index: number, total: number): string {
  return `第 ${index + 1} 张 / 共 ${total} 张`
}

/** 全部打印时的进度文案：「打印中 3/12」 */
export function buildPrintProgressTitle(index: number, total: number): string {
  return `打印中 ${index + 1}/${total}`
}

/**
 * 把加载标签图片的失败翻译成给人看的话。
 *
 * 关键规则：**后端返回的 message 一律原样透传**。
 * request 层对 code !== 0 是 reject(new Error(后端文案))，
 * 所以 `error instanceof Error` 基本就是"后端在说话"，
 * 这种时候绝不能换成泛泛的「加载失败」——例如「请先完成分装，再打印标签」
 * 是仓库同事唯一能看懂的指路牌。
 * 只有网络层的失败（request:fail / timeout）才由我们组织文案。
 */
export function describeLabelLoadError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  const errMsg = typeof (error as { errMsg?: unknown })?.errMsg === 'string'
    ? String((error as { errMsg: string }).errMsg)
    : ''

  if (/timeout|超时/i.test(errMsg)) {
    return '网络超时，没取到标签图片，请重试'
  }
  if (errMsg) {
    return '网络异常，没取到标签图片，请检查网络后重试'
  }
  return '标签图片加载失败，请重试'
}

/** 后端"还没分装"的拒绝：措辞可能微调，所以主判定 + 兜底关键词都留着 */
export function isSupplementPackRequiredError(message: string): boolean {
  if (!message) return false
  if (message.includes('请先完成分装')) return true
  return message.includes('分装') && (message.includes('标签') || message.includes('打印'))
}

/**
 * 打印失败归类。
 *
 * 现场同事要能分辨「没连打印机 / 图片没生成 / 打印超时」这三件完全不同的事：
 * 没连就去连打印机，图没生成要重新加载（折腾打印机没用），
 * 超时得先看打印机有没有出纸再决定要不要补打。
 */
export function classifyLabelPrintError(
  error: unknown,
  elapsedMs: number,
): LabelPrintFailureKind {
  const message = error instanceof Error
    ? error.message
    : String((error as { errMsg?: unknown; message?: unknown })?.errMsg
      || (error as { message?: unknown })?.message
      || '')

  if (message.includes('打印机未连接')) return 'not-connected'
  if (message.includes('Canvas参数缺失')) return 'canvas-missing'
  if (message.includes('保存图片文件失败')) return 'image-missing'
  if (message.includes('SDK忙') || message.includes('startJob回调未触发')) return 'printer-busy'
  if (elapsedMs >= PRINT_TIMEOUT_MS) return 'timeout'
  return 'unknown'
}

export function describeLabelPrintFailure(
  kind: LabelPrintFailureKind,
  index: number,
  total: number,
  detail?: string,
): LabelPrintFailure {
  const position = buildLabelPositionText(index, total)

  switch (kind) {
    case 'not-connected':
      return {
        kind,
        title: '打印机未连接',
        hint: '先点上方「连接打印机」把打印机连上，再回来打印。',
        detail,
      }
    case 'image-missing':
      return {
        kind,
        title: '图片生成失败',
        hint: `${position}的图片后端没生成出来。点「重新加载」刷新后再打；一直失败请找技术。`,
        detail,
      }
    case 'timeout':
      return {
        kind,
        title: '打印超时',
        hint: `${position}发出去 20 秒没等到打印机回执。先看打印机出纸没有：出纸了就算打好，没出纸点「补打这一张」。`,
        detail,
      }
    case 'printer-busy':
      return {
        kind,
        title: '打印机忙',
        hint: '上一个任务还没结束。等几秒再点「补打这一张」。',
        detail,
      }
    case 'canvas-missing':
      return {
        kind,
        title: '打印组件没准备好',
        hint: '退出本页重新进来一次再打。',
        detail,
      }
    default:
      return {
        kind,
        title: '打印失败',
        hint: `${position}没打出来。检查打印机和纸张后点「补打这一张」。`,
        detail,
      }
  }
}
