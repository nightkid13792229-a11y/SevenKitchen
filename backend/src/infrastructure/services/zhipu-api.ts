/**
 * 智谱 API 的地址与错误文案（2026-10-27 修）
 *
 * ## 踩过的坑
 *
 * 智谱的接口在 `https://open.bigmodel.cn/api/paas/v4/...`。
 * 后台 AI 设置里的 Base URL 一直让填 `https://open.bigmodel.cn`（根域名），
 * 但旧生图客户端直接拼 `/paas/v4/images/generations` —— 少了 `/api`，
 * 请求打到智谱的静态网关，返回一整段 nginx 405 HTML，界面看起来像"生图失败"。
 *
 * 这里统一拼地址：根域名 / 带 /api / 带尾斜杠三种写法都能用，且不重复。
 */
export const ZHIPU_DEFAULT_BASE_URL = 'https://open.bigmodel.cn';

export function buildZhipuApiUrl(
  baseUrl: string | null | undefined,
  path: string,
): string {
  const trimmed = String(baseUrl ?? '').trim() || ZHIPU_DEFAULT_BASE_URL;
  const root = trimmed.replace(/\/+$/, '').replace(/\/api$/i, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${root}/api${suffix}`;
}

/**
 * 把智谱的响应变成一句人能看懂的话。
 *
 * 网关的错误是 HTML；直接截 200 字扔到界面上，运营看到的是一屏标签。
 * 401/403/404/405 给明确原因，其它给 HTTP 状态 + 建议。
 */
export function extractZhipuErrorDetail(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message || parsed?.message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  } catch {
    // 不是 JSON：下面按 HTML / 纯文本处理
  }

  const text = String(raw ?? '').trim();
  if (!text || /<html|<!doctype|<body/i.test(text)) {
    if (status === 401) return 'API Key 无效或未授权（401）';
    if (status === 403) return 'API Key 没有权限（403）';
    if (status === 404 || status === 405) {
      return `接口路径不对（HTTP ${status}），请检查 Base URL 是否填 https://open.bigmodel.cn`;
    }
    return `智谱网关返回 HTTP ${status}，请检查 Base URL 或稍后重试`;
  }

  return text.slice(0, 200);
}
