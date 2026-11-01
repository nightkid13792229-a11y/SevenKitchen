/**
 * 路由参数解码（2026-11-01）。
 *
 * 起因：老板在手机上看到「挂到原料 %E7%B3%99%E7%B1%B3」—— 跳转时 `encodeURIComponent`
 * 编码过的原料名，页面拿到后没解码，直接把编码串显示出来了。
 * 中文必须解码，否则这一行字全是乱码，员工不知道自己在给哪道原料加商品。
 */

export function decodeRouteParam(value?: string | null): string {
  if (!value) {
    return '';
  }

  try {
    return decodeURIComponent(value);
  } catch {
    // 残缺的百分号编码：宁可按原样显示，也不要整页崩掉
    return value;
  }
}
