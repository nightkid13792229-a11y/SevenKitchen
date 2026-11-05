/**
 * 订单截图规格 vs 采购商品规格（纯函数，2026-11-05）。
 *
 * 后端匹配时用同一套口径（backend/src/application/purchasing/purchase-order-match.ts）：
 *   · 两边都有重量/体积 → 只比重量体积；
 *   · 两边都只有件数 → 比件数（6 枚 vs 30 枚要提示）；
 *   · 「1 盒」这种只是包装单位，不当件数比；
 *   · 任何一边没读到 → 不判断。
 *
 * 这里只用来「提示」，不拦人：员工可能就是要用旧商品，或者该去改商品档案。
 * 但必须让人看见 —— 生成后克数是按商品规格算的，规格对不上会直接抬高/压低折合单价。
 */

const SPEC_PATTERN =
  /(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g|克|ml|毫升|l|升|斤|两|个|只|枚|片|粒|颗|条|块|支|根|份|包|袋|盒|瓶|罐|卷)/gi;

export interface SpecToken {
  key: string;
  dimension: 'g' | 'ml' | 'count';
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

export function extractSpecTokens(value: string | null | undefined): SpecToken[] {
  if (!value) return [];
  const tokens: SpecToken[] = [];
  const regex = new RegExp(SPEC_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    const unit = match[2].toLowerCase();
    if (unit === 'kg' || unit === '千克' || unit === '公斤') {
      tokens.push({ key: `${round(amount * 1000)}g`, dimension: 'g' });
    } else if (unit === 'g' || unit === '克') {
      tokens.push({ key: `${round(amount)}g`, dimension: 'g' });
    } else if (unit === 'l' || unit === '升') {
      tokens.push({ key: `${round(amount * 1000)}ml`, dimension: 'ml' });
    } else if (unit === 'ml' || unit === '毫升') {
      tokens.push({ key: `${round(amount)}ml`, dimension: 'ml' });
    } else {
      tokens.push({ key: `${round(amount)}#count`, dimension: 'count' });
    }
  }
  return tokens;
}

function countValues(tokens: SpecToken[]): number[] {
  return tokens
    .filter((token) => token.dimension === 'count')
    .map((token) => Number(token.key.replace('#count', '')))
    .filter((value) => Number.isFinite(value));
}

export function isSpecMismatch(
  lineSpec: string | null | undefined,
  skuModel: string | null | undefined,
): boolean {
  const lineTokens = extractSpecTokens(lineSpec);
  const skuTokens = extractSpecTokens(skuModel);
  const lineWeighted = lineTokens.filter((token) => token.dimension !== 'count');
  const skuWeighted = skuTokens.filter((token) => token.dimension !== 'count');

  if (lineWeighted.length > 0 && skuWeighted.length > 0) {
    return !lineWeighted.some((line) =>
      skuWeighted.some((sku) => sku.key === line.key),
    );
  }

  if (lineWeighted.length > 0 || skuWeighted.length > 0) return false;

  const lineCounts = countValues(lineTokens).filter((value) => value > 1);
  const skuCounts = countValues(skuTokens).filter((value) => value > 1);
  if (lineCounts.length === 0 || skuCounts.length === 0) return false;
  return !lineCounts.some((line) => skuCounts.includes(line));
}

/** 给员工看的一句话；规格一致（或没法判断）时返回 null */
export function specWarningText(
  lineSpec: string | null | undefined,
  skuModel: string | null | undefined,
): string | null {
  if (!isSpecMismatch(lineSpec, skuModel)) return null;
  return `截图是 ${lineSpec}，这个商品是 ${skuModel}；生成后克数和单价会按商品规格（${skuModel}）算。`;
}
