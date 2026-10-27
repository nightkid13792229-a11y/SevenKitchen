import { describe, expect, it } from 'vitest'
import {
  SERIES_AI_COVER_TIMEOUT_MESSAGE,
  SERIES_AI_COVER_TIMEOUT_MS,
  buildSeriesAiCoverSaveFlag,
  resolveSeriesAiCoverButtonLabel,
  resolveSeriesAiCoverHint,
  resolveSeriesAiCoverUnavailableReason,
  type SeriesAiCoverContext,
} from '../seriesAiCover';

const base: SeriesAiCoverContext = {
  isAdmin: true,
  available: true,
  generating: false,
  busy: false,
  savedSeriesName: '鸡肉南瓜餐',
  hasCover: false,
  isLive: false,
};

describe('seriesAiCover', () => {
  it('按钮文案随状态变化', () => {
    expect(resolveSeriesAiCoverButtonLabel(false, false)).toBe('AI 生成图片');
    expect(resolveSeriesAiCoverButtonLabel(true, false)).toBe('重新生成');
    expect(resolveSeriesAiCoverButtonLabel(false, true)).toBe('生成中…');
  });

  it('只有未上线 + 空封面才直接保存', () => {
    expect(
      buildSeriesAiCoverSaveFlag({ hasCover: false, isLive: false }),
    ).toBe(true);
    expect(buildSeriesAiCoverSaveFlag({ hasCover: true, isLive: false })).toBe(
      false,
    );
    expect(buildSeriesAiCoverSaveFlag({ hasCover: false, isLive: true })).toBe(
      false,
    );
    expect(buildSeriesAiCoverSaveFlag({ hasCover: true, isLive: true })).toBe(
      false,
    );
  });

  it('不可用原因按优先级返回', () => {
    expect(
      resolveSeriesAiCoverUnavailableReason({
        ...base,
        savedSeriesName: '未命名系列 · 10-27 11:00',
      }),
    ).toContain('正式名称');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, available: false }),
    ).toContain('AI 设置');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, available: null }),
    ).toContain('检查');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, busy: true }),
    ).toContain('保存');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, savedSeriesName: '' }),
    ).toContain('正式名称');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, isAdmin: false }),
    ).toBe('');
    expect(resolveSeriesAiCoverUnavailableReason(base)).toBe('');
  });

  it('提示文案随封面 / 上线状态变化', () => {
    expect(resolveSeriesAiCoverHint(base)).toContain('自动保存');
    expect(resolveSeriesAiCoverHint({ ...base, isLive: true })).toContain(
      '预览',
    );
    expect(resolveSeriesAiCoverHint({ ...base, hasCover: true })).toContain(
      '用这张',
    );
    expect(
      resolveSeriesAiCoverHint({ ...base, available: false }),
    ).toContain('AI 设置');
  });

  it('超时常量与文案固定', () => {
    expect(SERIES_AI_COVER_TIMEOUT_MS).toBe(120000);
    expect(SERIES_AI_COVER_TIMEOUT_MESSAGE).toContain('120');
  });
});
