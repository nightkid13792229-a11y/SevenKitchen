import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  recognize: vi.fn(),
}));

vi.mock('../api/purchasing', () => ({
  uploadOrderScreenshot: mocks.upload,
  importOrderScreenshots: mocks.recognize,
}));

import {
  MAX_ORDER_SHOTS,
  ORDER_SHOT_HINT,
  RECOGNIZE_STAGE_TEXT,
  chooseOrderShots,
  importOrderShots,
  uploadStageText,
} from './import-flow';

beforeEach(() => {
  mocks.upload.mockReset();
  mocks.recognize.mockReset();
});

describe('订单截图 · 一行提示（原上传页四段话压成一句）', () => {
  it('该说的还在：一张一笔、上限、展开、费用', () => {
    expect(ORDER_SHOT_HINT).toContain('1 张算 1 笔');
    expect(ORDER_SHOT_HINT).toContain(String(MAX_ORDER_SHOTS));
    expect(ORDER_SHOT_HINT).toContain('共 N 件');
    expect(ORDER_SHOT_HINT).toContain('运费和实付');
  });

  it('不再带编号和"系统会分别识别"这类解释', () => {
    expect(ORDER_SHOT_HINT).not.toContain('①');
    expect(ORDER_SHOT_HINT).not.toContain('分别识别');
    expect(ORDER_SHOT_HINT.length).toBeLessThanOrEqual(48);
  });
});

describe('订单截图 · 选图', () => {
  it('一次最多选 5 张，多的截掉', async () => {
    const chooseImage = vi.fn((options: any) => {
      options.success({ tempFilePaths: ['a', 'b', 'c', 'd', 'e', 'f'] });
    });
    (globalThis as any).uni = { chooseImage };

    await expect(chooseOrderShots()).resolves.toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(chooseImage.mock.calls[0][0].count).toBe(5);
  });

  it('用户点取消就返回空数组，不当成失败', async () => {
    (globalThis as any).uni = {
      chooseImage: (options: any) => options.fail({ errMsg: 'chooseImage:fail cancel' }),
    };

    await expect(chooseOrderShots()).resolves.toEqual([]);
  });
});

describe('订单截图 · 上传与识别', () => {
  it('逐张上传、按顺序报进度，传完才调识别', async () => {
    mocks.upload
      .mockResolvedValueOnce({ url: 'u1', key: 'k1' })
      .mockResolvedValueOnce({ url: 'u2', key: 'k2' });
    mocks.recognize.mockResolvedValue({ code: 0, data: [{ id: 'i1' }, { id: 'i2' }] });
    const stages: string[] = [];

    const result = await importOrderShots('list-1', ['a.png', 'b.png'], (stage) =>
      stages.push(stage),
    );

    expect(stages).toEqual([uploadStageText(1, 2), uploadStageText(2, 2), RECOGNIZE_STAGE_TEXT]);
    expect(mocks.recognize).toHaveBeenCalledWith('list-1', ['u1', 'u2'], ['k1', 'k2']);
    expect(result).toEqual({ ok: true, count: 2 });
  });

  it('中间一张传不上去就停住，不拿半套图去识别', async () => {
    mocks.upload.mockResolvedValueOnce({ url: 'u1', key: 'k1' });
    mocks.upload.mockRejectedValueOnce(new Error('网络断了'));

    const result = await importOrderShots('list-1', ['a.png', 'b.png'], () => {});

    expect(result).toMatchObject({ ok: false, kind: 'upload' });
    expect(result.ok ? '' : result.message).toContain('第 2 张');
    expect(result.ok ? '' : result.message).toContain('网络断了');
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it('后端说这张图导入过 → duplicate，页面去核对，不劝重试', async () => {
    mocks.upload.mockResolvedValue({ url: 'u1', key: 'k1' });
    mocks.recognize.mockResolvedValue({
      code: 400,
      message: '这张截图已经导入过，请勿重复上传（可在识别记录里放弃后重试）',
    });

    const result = await importOrderShots('list-1', ['a.png'], () => {});

    expect(result).toMatchObject({ ok: false, kind: 'duplicate' });
  });

  it('识别超时也把服务端/网络那句话带回去，不吞成"失败"', async () => {
    mocks.upload.mockResolvedValue({ url: 'u1', key: 'k1' });
    mocks.recognize.mockRejectedValue(new Error('请求超时'));

    const result = await importOrderShots('list-1', ['a.png'], () => {});

    expect(result).toEqual({ ok: false, kind: 'recognize', message: '请求超时' });
  });
});
