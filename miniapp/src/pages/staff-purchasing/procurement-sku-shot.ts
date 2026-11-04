/**
 * 「新增采购商品」截图上传区显示什么（2026-11-05）。
 *
 * 老板反馈：图已经传上去、AI 也填好了，页面还停在"拍商品详情页 / 从相册选"，
 * 看起来像什么都没发生。这里把"四种状态 → 文案"的映射单独拎出来：
 * 页面只负责画，文案有单测兜着，避免以后再被改回去。
 */

export type ShotState = 'idle' | 'recognizing' | 'done' | 'failed';

export interface ShotView {
  badge: string;
  desc: string;
}

export function buildShotView(input: {
  state: ShotState;
  uploaded: boolean;
  filledCount: number;
  error?: string;
}): ShotView {
  const { state, uploaded, filledCount, error } = input;

  if (state === 'recognizing') {
    return {
      badge: '识别中',
      desc: '正在读商品名、净含量和价格…',
    };
  }

  if (state === 'done') {
    return {
      badge: '✓ 已上传 · 已识别',
      desc:
        filledCount > 0
          ? `已按这张图填好 ${filledCount} 项，可以改`
          : '图看过了，没读出可用信息，手动填一下',
    };
  }

  if (state === 'failed') {
    return {
      // 上传成功但识别失败，和压根没传上去，是两件事，别混成一句"失败"
      badge: uploaded ? '已上传 · 没认出来' : '上传失败',
      desc: error || '可以重试，或者手动填写',
    };
  }

  return { badge: '', desc: '' };
}
