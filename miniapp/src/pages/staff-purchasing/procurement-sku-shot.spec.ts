import { describe, expect, it } from 'vitest';
import { buildShotView } from './procurement-sku-shot';

describe('新增采购商品 · 截图上传状态文案', () => {
  it('识别完成时明确告诉员工：图已上传、已识别', () => {
    const view = buildShotView({ state: 'done', uploaded: true, filledCount: 3 });

    expect(view.badge).toContain('已上传');
    expect(view.badge).toContain('已识别');
    expect(view.desc).toContain('3 项');
  });

  it('识别中也能看出来图已经收到了', () => {
    const view = buildShotView({
      state: 'recognizing',
      uploaded: false,
      filledCount: 0,
    });

    expect(view.badge).toBe('识别中');
    expect(view.desc).toContain('正在读');
  });

  it('上传失败和"传上去了但没认出来"分开说', () => {
    const uploadFailed = buildShotView({
      state: 'failed',
      uploaded: false,
      filledCount: 0,
      error: '上传失败，请检查网络',
    });
    const recognizeFailed = buildShotView({
      state: 'failed',
      uploaded: true,
      filledCount: 0,
      error: '没认出来',
    });

    expect(uploadFailed.badge).toBe('上传失败');
    expect(recognizeFailed.badge).toBe('已上传 · 没认出来');
  });

  it('一项都没读出来时，不骗人说"填好了"', () => {
    const view = buildShotView({ state: 'done', uploaded: true, filledCount: 0 });

    expect(view.desc).not.toContain('填好');
    expect(view.desc).toContain('没读出');
  });
});
