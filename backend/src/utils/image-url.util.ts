/**
 * 图片地址的协议归一化。
 *
 * 背景：早期 CDN 的图片地址是以 http:// 落库的（CO'S 域名后来才配了 HTTPS 证书），
 * 库里至今仍有一批历史数据是 http://img.sevenkitchen.cloud/...。
 * 后台页面本身走 HTTPS，引用 http 图片会触发浏览器的 Mixed Content 警告
 * （Chromium 会自动升级为 HTTPS，图片仍能显示，但控制台一直报警），
 * 因此对外返回图片地址时统一升级为 https。
 *
 * 小程序端已有同样处理（miniapp/src/utils/config.ts 的 normalizeImageUrl），
 * 这里补上后端侧的兜底，避免日后新增消费方再次踩坑。
 */
export function normalizeImageUrlProtocol<T extends string | null | undefined>(
  url: T,
): T {
  if (typeof url !== 'string' || !url) {
    return url;
  }

  if (!url.toLowerCase().startsWith('http://')) {
    return url;
  }

  return url.replace(/^http:\/\//i, 'https://') as T;
}
