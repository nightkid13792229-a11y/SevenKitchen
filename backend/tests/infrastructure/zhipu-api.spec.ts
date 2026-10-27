import {
  ZHIPU_DEFAULT_BASE_URL,
  buildZhipuApiUrl,
  extractZhipuErrorDetail,
} from 'src/infrastructure/services/zhipu-api';

/**
 * 智谱 URL 与错误文案（2026-10-27 修）
 *
 * 生产实测：baseUrl 填 https://open.bigmodel.cn 时，旧代码拼出
 * https://open.bigmodel.cn/paas/v4/images/generations（少了 /api），
 * 被智谱的 nginx 以 405 拒绝，界面看到的是一整段 HTML。
 */
describe('zhipu-api', () => {
  it('根域名自动补 /api', () => {
    expect(
      buildZhipuApiUrl(
        'https://open.bigmodel.cn',
        '/paas/v4/images/generations',
      ),
    ).toBe('https://open.bigmodel.cn/api/paas/v4/images/generations');
  });

  it('已经带 /api 时不重复', () => {
    expect(
      buildZhipuApiUrl(
        'https://open.bigmodel.cn/api/',
        '/paas/v4/chat/completions',
      ),
    ).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
  });

  it('空值用默认地址', () => {
    expect(buildZhipuApiUrl('', '/paas/v4/models')).toBe(
      `${ZHIPU_DEFAULT_BASE_URL}/api/paas/v4/models`,
    );
  });

  it('JSON 错误优先取 message', () => {
    expect(
      extractZhipuErrorDetail(
        JSON.stringify({ error: { message: '身份验证失败。' } }),
        401,
      ),
    ).toBe('身份验证失败。');
  });

  it('HTML 405 不再把整段 HTML 抛给运营', () => {
    const html =
      '<html><head><title>405 Not Allowed</title></head><body><center><h1>405 Not Allowed</h1></center><hr><center>nginx</center></body></html>';

    const detail = extractZhipuErrorDetail(html, 405);

    expect(detail).toContain('Base URL');
    expect(detail).not.toContain('<html>');
  });
});
