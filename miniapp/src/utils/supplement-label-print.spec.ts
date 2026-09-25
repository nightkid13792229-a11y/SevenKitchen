import { describe, expect, it } from 'vitest'
import {
  PRINT_TIMEOUT_MS,
  buildLabelPositionText,
  buildPrintProgressTitle,
  classifyLabelPrintError,
  describeLabelLoadError,
  describeLabelPrintFailure,
  isSupplementPackRequiredError,
} from './supplement-label-print'

/**
 * 补剂标签打印页的错误文案规则。
 *
 * 这一页的成败全在"话说清楚没有"：
 *   · 后端说「请先完成分装，再打印标签」时必须原样透传，不能吞成「加载失败」
 *   · 打印失败必须分清 未连接 / 图片没生成 / 超时，三种情况现场要做的事完全不同
 */
describe('supplement label load errors', () => {
  it('原样透传后端文案（页面要显示「请先完成分装，再打印标签」）', () => {
    const backendError = new Error('请先完成分装，再打印标签')

    expect(describeLabelLoadError(backendError)).toBe('请先完成分装，再打印标签')
    expect(isSupplementPackRequiredError(describeLabelLoadError(backendError))).toBe(true)
  })

  it('后端换了别的措辞也不吞掉', () => {
    expect(describeLabelLoadError(new Error('订单状态不允许打印标签'))).toBe(
      '订单状态不允许打印标签',
    )
  })

  it('网络层失败才由前端组织文案', () => {
    expect(describeLabelLoadError({ errMsg: 'request:fail timeout' })).toContain('超时')
    expect(describeLabelLoadError({ errMsg: 'request:fail' })).toContain('网络')
    expect(describeLabelLoadError(undefined)).toBe('标签图片加载失败，请重试')
  })

  it('只有后端说"分装"才提示回去填分装结果', () => {
    expect(isSupplementPackRequiredError('请先完成分装，再打印标签')).toBe(true)
    expect(isSupplementPackRequiredError('订单还未分装，无法打印标签')).toBe(true)
    // 网络报错里带"标签"两个字，不能误判成"没分装"
    expect(isSupplementPackRequiredError('网络异常，没取到标签图片，请检查网络后重试')).toBe(false)
    expect(isSupplementPackRequiredError('订单不存在')).toBe(false)
    expect(isSupplementPackRequiredError('')).toBe(false)
  })
})

describe('supplement label print progress text', () => {
  it('进度按"第几张/共几张"报，现场核对到第几张一眼能对上', () => {
    expect(buildPrintProgressTitle(0, 12)).toBe('打印中 1/12')
    expect(buildPrintProgressTitle(2, 12)).toBe('打印中 3/12')
    expect(buildLabelPositionText(2, 12)).toBe('第 3 张 / 共 12 张')
  })
})

describe('supplement label print failures', () => {
  it('分清"未连接打印机 / 图片生成失败 / 打印超时"三件不同的事', () => {
    expect(classifyLabelPrintError(new Error('打印机未连接'), 100)).toBe('not-connected')
    expect(classifyLabelPrintError(new Error('保存图片文件失败'), 100)).toBe('image-missing')
    expect(classifyLabelPrintError(new Error('SDK忙:打印任务启动失败,请稍后重试'), 100)).toBe(
      'printer-busy',
    )
    expect(classifyLabelPrintError(new Error('Canvas参数缺失，请刷新页面后重试'), 100)).toBe(
      'canvas-missing',
    )
    // 精臣 SDK 20 秒兜底超时是 resolve 而不是 reject，只能靠耗时认出来
    expect(classifyLabelPrintError(null, PRINT_TIMEOUT_MS)).toBe('timeout')
    expect(classifyLabelPrintError(new Error('未知错误'), 500)).toBe('unknown')
  })

  it('每种失败的标题和下一步都不一样', () => {
    const notConnected = describeLabelPrintFailure('not-connected', 0, 12)
    const imageMissing = describeLabelPrintFailure('image-missing', 0, 12)
    const timeout = describeLabelPrintFailure('timeout', 0, 12)

    expect(notConnected.title).toBe('打印机未连接')
    expect(notConnected.hint).toContain('连接打印机')

    expect(imageMissing.title).toBe('图片生成失败')
    expect(imageMissing.hint).toContain('重新加载')

    expect(timeout.title).toBe('打印超时')
    // 超时的关键动作：先看出纸没有，而不是无脑重打
    expect(timeout.hint).toContain('出纸')
    expect(timeout.hint).toContain('补打这一张')
  })

  it('带上第几张和原始错误，方便定位是哪一张、为什么', () => {
    const failure = describeLabelPrintFailure('unknown', 2, 12, 'some raw error')

    expect(failure.hint).toContain('第 3 张 / 共 12 张')
    expect(failure.detail).toBe('some raw error')
  })
})
