/**
 * 搜索结果去重：iHerb 的一次搜索会把同一件商品以多个链接返回
 * （不同区域站、带追踪参数、带「您的首选项已更新」这类后缀）。
 *
 * 不去重，比价表会变成「同一瓶出现五次，看起来有五家可选」。
 */

/** iHerb 商品链接形如 `/pr/<slug>/<数字 id>`；id 才是同一件商品的身份证。 */
export function canonicalProductKey(url: string): string {
  const text = String(url ?? '').trim();
  const id = text.match(/\/pr\/[^/]+\/(\d+)/)?.[1];
  if (id) {
    return `iherb:${id}`;
  }
  // 认不出商品 id 就退回"去掉查询串的链接"，至少不会把同一页算两次
  return text.split(/[?#]/)[0];
}

/** 标题尾巴上的站点提示不是商品名。 */
export function cleanProductName(name: string): string {
  return String(name ?? '')
    .replace(/\s*[-–—]\s*您的首选项已更新\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CandidateLike {
  url: string;
  name: string;
}

/** 按商品 id 去重，保留第一次出现的顺序。 */
export function dedupeCandidates<T extends CandidateLike>(candidates: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const candidate of candidates) {
    const key = canonicalProductKey(candidate.url);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ ...candidate, name: cleanProductName(candidate.name) });
  }
  return result;
}
