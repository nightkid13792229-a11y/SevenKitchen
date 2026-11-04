/**
 * 订单行 → 采购清单原料的匹配（纯函数，2026-11-04）。
 *
 * 方向是「以清单需求为主线」：只把订单行往本次清单里的原料上靠，
 * 清单里没有的原料一律不匹配（未匹配），由员工决定是个人采购还是手工挂。
 *
 * 三条硬约束：
 *   1. 不做跨原料替代（牛肋条不会自动挂到牛里脊）；
 *   2. 原料命中最长匹配优先（「绿豆芽」优先于「绿豆」）；
 *   3. 原料对上了但商品规格对不上 → needsNewSku，绝不按比例折算。
 */

import type {
  ListItemCandidate,
  MatchAlias,
  ListSkuCandidate,
  MatchConfidence,
  MatchedOrderLine,
  ParsedOrderLine,
} from './purchase-order-import.types';

const BRAND_NOISE = [
  "member's mark",
  'members mark',
  '沃集鲜',
  '盒马',
  '山姆',
  '沃尔玛',
  '日日鲜',
  '工坊',
  '烧烤季',
  '鲜宰',
  '冰鲜',
  '冷鲜',
  '生鲜',
  '有机',
  '进口',
  '国产',
  '精选',
  '安心',
  '保洁',
];

const SPEC_PATTERN =
  /(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g|克|ml|毫升|l|升|斤|两|个|只|枚|片|粒|颗|条|块|支|根|份|包|袋|盒|瓶|罐|卷)/gi;

export function normalizeText(value: string): string {
  let text = value.toLowerCase();
  // 「300g/份」「1.59kg(30枚)」这类写法：先去掉数字单位后面跟的件数单位，
  // 否则规格被删掉后会残留一个「份」字，导致商品名匹配不上。
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g|克|ml|毫升|l|升)\s*[\/（(]?\s*(个|只|枚|片|粒|颗|条|块|支|根|份|包|袋|盒|瓶|罐|卷|斤|两)/gi,
    '$1$2',
  );
  text = text.replace(/[\s【】\[\]（）()「」『』·•,，。.、:：;；!！?？'"“”‘’*×x/-]/g, '');
  for (const noise of BRAND_NOISE) {
    text = text.split(noise).join('');
  }
  text = text.replace(SPEC_PATTERN, '');
  text = text.replace(/约/g, '');
  return text;
}

interface SpecToken {
  key: string;
  dimension: 'g' | 'ml' | 'count';
}

export function extractSpecTokens(value: string | null | undefined): SpecToken[] {
  if (!value) return [];
  const tokens: SpecToken[] = [];
  const regex = new RegExp(SPEC_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    const unit = match[2].toLowerCase();
    if (['kg', '千克', '公斤'].includes(unit)) {
      tokens.push({ key: `${round(amount * 1000)}g`, dimension: 'g' });
    } else if (['g', '克'].includes(unit)) {
      tokens.push({ key: `${round(amount)}g`, dimension: 'g' });
    } else if (['l', '升'].includes(unit)) {
      tokens.push({ key: `${round(amount * 1000)}ml`, dimension: 'ml' });
    } else if (['ml', '毫升'].includes(unit)) {
      tokens.push({ key: `${round(amount)}ml`, dimension: 'ml' });
    } else {
      // 件数单位只比数值：1 盒 vs 1 袋 视为同一件数
      tokens.push({ key: `${round(amount)}#count`, dimension: 'count' });
    }
  }
  return tokens;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

function specConflict(
  lineSpec: string | null,
  skuModel: string | null,
): boolean {
  const lineTokens = extractSpecTokens(lineSpec).filter(
    (token) => token.dimension !== 'count',
  );
  const skuTokens = extractSpecTokens(skuModel).filter(
    (token) => token.dimension !== 'count',
  );
  if (lineTokens.length === 0 || skuTokens.length === 0) return false;
  return !lineTokens.some((line) =>
    skuTokens.some((sku) => sku.key === line.key),
  );
}

/** 渠道归一：盒马/盒马鲜生、山姆/山姆会员店、沃尔玛 视为同一家 */
export function resolveChannelFamily(channel?: string | null): string {
  const text = (channel || '').trim().toLowerCase();
  if (!text) return '';
  if (text.includes('盒马')) return '盒马';
  if (text.includes('山姆') || text.includes('sam')) return '山姆';
  if (text.includes('沃尔玛') || text.includes('walmart')) return '沃尔玛';
  return text;
}

function channelScore(
  importChannel: string,
  sku: ListSkuCandidate,
): number {
  if (!sku.purchaseChannel) return 0;
  return resolveChannelFamily(sku.purchaseChannel) ===
    resolveChannelFamily(importChannel)
    ? 1
    : 0;
}

function pickSku(
  line: ParsedOrderLine,
  skus: ListSkuCandidate[],
  importChannel: string,
): {
  sku: ListSkuCandidate | null;
  nameHit: boolean;
  channelMismatch: boolean;
} {
  if (skus.length === 0) {
    return { sku: null, nameHit: false, channelMismatch: false };
  }
  const normalizedLine = normalizeText(line.rawName);

  // 渠道是硬条件：订单是沃尔玛，就不能自动挂到本地生鲜市场的散称商品。
  // 该渠道没有商品时留空，员工可以手动选别的渠道或新建商品。
  const sameChannel = importChannel
    ? skus.filter((sku) => channelScore(importChannel, sku) === 1)
    : [];
  if (importChannel && sameChannel.length === 0) {
    return { sku: null, nameHit: false, channelMismatch: true };
  }

  const ranked = (sameChannel.length > 0 ? sameChannel : skus)
    .map((sku) => {
      const normalizedSku = normalizeText(sku.name);
      const nameHit =
        normalizedSku.length >= 2 && normalizedLine.includes(normalizedSku);
      return {
        sku,
        nameHit,
        score: (nameHit ? 10 : 0) + channelScore(importChannel, sku),
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    sku: ranked[0].sku,
    nameHit: ranked[0].nameHit,
    channelMismatch: false,
  };
}

export function matchOrderLines(
  lines: ParsedOrderLine[],
  candidates: ListItemCandidate[],
  importChannel: string,
  aliases: MatchAlias[] = [],
): MatchedOrderLine[] {
  const normalizedIngredients = candidates
    .map((candidate) => ({
      candidate,
      normalized: normalizeText(candidate.ingredientName),
    }))
    .filter((entry) => entry.normalized.length >= 1)
    .sort((a, b) => b.normalized.length - a.normalized.length);

  const channelFamily = resolveChannelFamily(importChannel);

  return lines.map((line) => {
    const normalizedLine = normalizeText(line.rawName);

    // 先看上次手动匹配学到的映射（同渠道或通用），命中就直接沿用。
    const alias = aliases.find(
      (item) =>
        item.normalizedName === normalizedLine &&
        (!item.channelFamily || item.channelFamily === channelFamily),
    );
    if (alias) {
      const aliasCandidate = candidates.find(
        (candidate) => candidate.ingredientId === alias.ingredientId,
      );
      if (aliasCandidate) {
        const aliasSku = alias.procurementSkuId
          ? aliasCandidate.skus.find((sku) => sku.id === alias.procurementSkuId)
          : null;
        return {
          ...line,
          ingredientId: aliasCandidate.ingredientId,
          ingredientName: aliasCandidate.ingredientName,
          procurementSkuId: aliasSku?.id ?? null,
          purchaseItemId: aliasCandidate.purchaseItemId,
          confidence: 'HIGH' as MatchConfidence,
          reason: aliasSku ? '沿用上次匹配' : '沿用上次原料（待选商品）',
          needsNewSku: !aliasSku,
        };
      }
    }

    const hit = normalizedIngredients.find((entry) =>
      normalizedLine.includes(entry.normalized),
    );

    if (!hit) {
      return {
        ...line,
        ingredientId: null,
        ingredientName: null,
        procurementSkuId: null,
        purchaseItemId: null,
        confidence: 'LOW' as MatchConfidence,
        reason: '清单里没有对应原料',
        needsNewSku: false,
      };
    }

    const { sku, nameHit, channelMismatch } = pickSku(
      line,
      hit.candidate.skus,
      importChannel,
    );

    const conflict = sku ? specConflict(line.spec, sku.productModel) : false;
    const needsNewSku = !sku || conflict;

    let confidence: MatchConfidence = 'MEDIUM';
    if (sku && nameHit && !conflict) confidence = 'HIGH';
    else if (!sku) confidence = 'LOW';

    const reason = channelMismatch
      ? `该渠道（${importChannel}）还没有对应的采购商品，请手动选择或新建`
      : !sku
        ? '原料对上了，但这道原料还没有采购商品'
        : conflict
        ? `商品规格是 ${sku.productModel ?? '未知'}，与截图不一致`
        : nameHit
          ? '命中采购商品'
          : '按原料匹配';

    return {
      ...line,
      ingredientId: hit.candidate.ingredientId,
      ingredientName: hit.candidate.ingredientName,
      procurementSkuId: needsNewSku ? null : sku?.id ?? null,
      purchaseItemId: hit.candidate.purchaseItemId,
      confidence,
      reason,
      needsNewSku,
    };
  });
}
