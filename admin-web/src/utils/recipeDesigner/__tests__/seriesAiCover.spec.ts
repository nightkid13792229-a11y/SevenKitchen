import { describe, expect, it } from 'vitest'
import {
  SERIES_AI_COVER_TIMEOUT_MESSAGE,
  SERIES_AI_COVER_TIMEOUT_MS,
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
  it('不可用原因按优先级返回', () => {
    expect(
      resolveSeriesAiCoverUnavailableReason({
        ...base,
        savedSeriesName: '未命名系列 · 10-27 11:00',
      }),
    ).toContain('正式名称');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, available: false }),
    ).toContain('AI 食谱封面');
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
    expect(resolveSeriesAiCoverHint(base)).toContain('预览');
    expect(resolveSeriesAiCoverHint({ ...base, isLive: true })).toContain(
      '预览',
    );
    expect(resolveSeriesAiCoverHint({ ...base, hasCover: true })).toContain(
      '用这张',
    );
    expect(
      resolveSeriesAiCoverHint({ ...base, available: false }),
    ).toContain('AI 食谱封面');
    // 非管理员整个生图入口都不显示，连提示也不该出现（设计稿 5.1）
    expect(resolveSeriesAiCoverHint({ ...base, isAdmin: false })).toBe('');
  });

  it('超时常量与文案固定', () => {
    expect(SERIES_AI_COVER_TIMEOUT_MS).toBe(300000);
    expect(SERIES_AI_COVER_TIMEOUT_MESSAGE).toContain('300');
  });
});
