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

function countValues(tokens: SpecToken[]): number[] {
  return tokens
    .filter((token) => token.dimension === 'count')
    .map((token) => Number(token.key.replace('#count', '')))
    .filter((value) => Number.isFinite(value));
}

/**
 * 规格是否冲突（2026-11-05 加固）。
 *
 * 1. 两边都有重量/体积 → 只比重量体积（包装写法 1盒/1袋 差异太大，不比）。
 * 2. 两边都只写件数 → 比件数（6 枚 vs 30 枚要拦住）。
 * 3. 「1 盒」这种只是包装单位，不当件数比较，避免误伤。
 * 4. 任何一边没读到规格 → 无从比较，不判冲突。
 */
function specConflict(
  lineSpec: string | null,
  skuModel: string | null,
): boolean {
  const lineTokens = extractSpecTokens(lineSpec);
  const skuTokens = extractSpecTokens(skuModel);
  const lineWeighted = lineTokens.filter(
    (token) => token.dimension !== 'count',
  );
  const skuWeighted = skuTokens.filter((token) => token.dimension !== 'count');

  if (lineWeighted.length > 0 && skuWeighted.length > 0) {
    return !lineWeighted.some((line) =>
      skuWeighted.some((sku) => sku.key === line.key),
    );
  }

  // 只有两边都只写件数时，件数才是可比信息。
  if (lineWeighted.length > 0 || skuWeighted.length > 0) return false;

  const lineCounts = countValues(lineTokens).filter((value) => value > 1);
  const skuCounts = countValues(skuTokens).filter((value) => value > 1);
  if (lineCounts.length === 0 || skuCounts.length === 0) return false;
  return !lineCounts.some((line) => skuCounts.includes(line));
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
      // 名称是身份信号，规格是包装信号：先看名字，再看规格是否对得上。
      // 同名但规格不同的商品同时存在时，必须选规格一致的那个，不能按排序取第一个。
      const specOk = !specConflict(line.spec, sku.productModel);
      return {
        sku,
        nameHit,
        score:
          (nameHit ? 100 : 0) +
          (specOk ? 10 : 0) +
          channelScore(importChannel, sku),
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
  semanticHints: Array<{ lineIndex: number; ingredientId: string }> = [],
): MatchedOrderLine[] {
  const normalizedIngredients = candidates
    .map((candidate) => ({
      candidate,
      normalized: normalizeText(candidate.ingredientName),
    }))
    .filter((entry) => entry.normalized.length >= 1)
    .sort((a, b) => b.normalized.length - a.normalized.length);

  const channelFamily = resolveChannelFamily(importChannel);

  const hintByIndex = new Map(
    semanticHints.map((hint) => [hint.lineIndex, hint.ingredientId]),
  );

  return lines.map((line, lineIndex) => {
    const normalizedLine = normalizeText(line.rawName);

    // 先看上次手动匹配学到的映射（同渠道或通用）。
    // 只有「商品规格与本次截图对得上」才直接沿用；对不上就只沿用原料，
    // 商品交给下面按规格重新选（2026-11-05：别名不再无条件沿用）。
    const alias = aliases.find(
      (item) =>
        item.normalizedName === normalizedLine &&
        (!item.channelFamily || item.channelFamily === channelFamily),
    );
    let aliasCandidate: ListItemCandidate | null = null;
    if (alias) {
      const candidate = candidates.find(
        (item) => item.ingredientId === alias.ingredientId,
      );
      if (candidate) {
        const aliasSku = alias.procurementSkuId
          ? candidate.skus.find((sku) => sku.id === alias.procurementSkuId)
          : null;
        if (aliasSku && !specConflict(line.spec, aliasSku.productModel)) {
          return {
            ...line,
            ingredientId: candidate.ingredientId,
            ingredientName: candidate.ingredientName,
            procurementSkuId: aliasSku.id,
            purchaseItemId: candidate.purchaseItemId,
            confidence: 'HIGH' as MatchConfidence,
            reason: '沿用上次匹配',
            needsNewSku: false,
          };
        }
        aliasCandidate = candidate;
      }
    }

    // 模型在“本次清单的原料”里做的语义匹配（比如鲑鱼→三文鱼）；
    // 只认清单内存在的原料，不认就退回字面匹配。
    const hintedIngredientId =
      hintByIndex.get(lineIndex) ?? aliasCandidate?.ingredientId ?? null;
    const hintedCandidate = hintedIngredientId
      ? candidates.find(
          (candidate) => candidate.ingredientId === hintedIngredientId,
        )
      : null;

    const hit = hintedCandidate
      ? { candidate: hintedCandidate }
      : normalizedIngredients.find((entry) =>
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
      : conflict
        ? aliasCandidate
          ? `上次匹配的商品规格是 ${sku?.productModel ?? '未知'}，与截图不一致，请选择或新建`
          : `商品规格是 ${sku?.productModel ?? '未知'}，与截图不一致`
        : !sku
          ? '原料对上了，但这道原料还没有采购商品'
          : aliasCandidate
            ? '沿用上次的原料，按截图规格重选了商品'
            : hintedCandidate
              ? 'AI 语义匹配'
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
