/**
 * 订单截图识别：选图 → 上传 → 识别（2026-11-05）。
 *
 * 老板反馈：原来这套流程单独占一个「上传订单截图」页面，但那页自己不做事 ——
 * 选完图就跳走，员工真正要「对照原图」是在核对页，原图反而看不到。
 * 现在去掉那一页，入口收到清单详情和核对页，这里只留可复用的三步。
 *
 * 进度文案写死在这里，由单测盯着：当初那页的说明文字就是一句句长出来的。
 */
import {
  importOrderScreenshots,
  uploadOrderScreenshot,
} from '../api/purchasing';

/** 与后端一致：一张图一笔订单，一次最多 5 笔 */
export const MAX_ORDER_SHOTS = 5;

/**
 * 原来上传页有标题副文案、三条编号指引、两句解释，共四段；
 * 现在压成这一行，详情页按钮下方和核对页空状态共用。
 */
export const ORDER_SHOT_HINT =
  '1 张算 1 笔，最多 5 张；先展开「共 N 件」，运费和实付要拍进去。';

export const RECOGNIZE_STAGE_TEXT = 'AI 识别中…';

export type ImportShotsFailure = 'upload' | 'duplicate' | 'recognize';

/** 上传/识别过程中的一句话进度（上传 2/3、AI 识别中…） */
export type ImportStageHandler = (stage: string) => void;

export type ImportShotsResult =
  | { ok: true; count: number }
  | { ok: false; kind: ImportShotsFailure; message: string };

export function uploadStageText(index: number, total: number): string {
  return `上传 ${index}/${total}`;
}

/** 选图：1~5 张，相册或拍照。取消返回空数组，不当成出错。 */
export function chooseOrderShots(remaining = MAX_ORDER_SHOTS): Promise<string[]> {
  const count = Math.max(1, Math.min(remaining, MAX_ORDER_SHOTS));
  return new Promise((resolve) => {
    uni.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => resolve((res.tempFilePaths || []).slice(0, count)),
      fail: () => resolve([]),
    });
  });
}

/**
 * 传图 → 识别。失败按原因分类，页面据此决定是「重试」「去核对」还是「知道了」。
 * 中途有一张传不上去就停住，不拿半套图去识别（否则金额会对不上）。
 */
export async function importOrderShots(
  purchaseListId: string,
  shotPaths: string[],
  onStage: ImportStageHandler,
) {
  const total = shotPaths.length;
  const uploaded: Array<{ url: string; key: string }> = [];

  for (let index = 0; index < total; index += 1) {
    onStage(uploadStageText(index + 1, total));
    try {
      uploaded.push(await uploadOrderScreenshot(shotPaths[index]));
    } catch (error: any) {
      const reason = error?.message || '请重试';
      return {
        ok: false,
        kind: 'upload',
        message: total > 1 ? `第 ${index + 1} 张没传上去：${reason}` : `没传上去：${reason}`,
      };
    }
  }

  onStage(RECOGNIZE_STAGE_TEXT);
  try {
    const res: any = await importOrderScreenshots(
      purchaseListId,
      uploaded.map((item) => item.url),
      uploaded.map((item) => item.key),
    );
    if (res?.code !== 0) {
      throw new Error(res?.message || '识别失败');
    }
    return { ok: true, count: Array.isArray(res.data) ? res.data.length : 0 };
  } catch (error: any) {
    const message = error?.message || '请稍后重试';
    return {
      ok: false,
      kind: message.includes('已经导入过') ? 'duplicate' : 'recognize',
      message,
    };
  }
}
