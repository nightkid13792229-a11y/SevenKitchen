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
import { channelMatchKey, type ChannelOption } from './channel-catalog';
import { isWeightUnit } from './purchase-order-weight-units';

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
  text = text.replace(
    /[\s【】\[\]（）()「」『』·•,，。.、:：;；!！?？'"“”‘’*×x/-]/g,
    '',
  );
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

export function extractSpecTokens(
  value: string | null | undefined,
): SpecToken[] {
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

/**
 * 渠道是硬条件：订单是沃尔玛，就不能自动挂到本地生鲜市场的散称商品。
 *
 * 2026-11-05 起比较之前先按**字典**归一（「山姆」和「山姆会员店」是同一条），
 * 不再在代码里写死「盒马/山姆/沃尔玛」三家的包含判断。
 */
function channelScore(
  importKey: string,
  sku: ListSkuCandidate,
  channels: ChannelOption[],
): number {
  if (!importKey || !sku.purchaseChannel) return 0;
  return channelMatchKey(sku.purchaseChannel, channels) === importKey ? 1 : 0;
}

function pickSku(
  line: ParsedOrderLine,
  skus: ListSkuCandidate[],
  importChannel: string | null,
  channels: ChannelOption[],
): {
  sku: ListSkuCandidate | null;
  nameHit: boolean;
  channelMismatch: boolean;
  /** 渠道还没确认：先不挑商品，等员工选了渠道再自动匹配 */
  channelPending: boolean;
} {
  if (!importChannel) {
    return {
      sku: null,
      nameHit: false,
      channelMismatch: false,
      channelPending: true,
    };
  }
  if (skus.length === 0) {
    return {
      sku: null,
      nameHit: false,
      channelMismatch: false,
      channelPending: false,
    };
  }
  const normalizedLine = normalizeText(line.rawName);
  const importKey = channelMatchKey(importChannel, channels);

  // 渠道是硬条件：订单是沃尔玛，就不能自动挂到本地生鲜市场的散称商品。
  // 该渠道没有商品时留空，员工可以手动选别的渠道或新建商品。
  const sameChannel = importKey
    ? skus.filter((sku) => channelScore(importKey, sku, channels) === 1)
    : [];
  if (sameChannel.length === 0) {
    return {
      sku: null,
      nameHit: false,
      channelMismatch: true,
      channelPending: false,
    };
  }

  const ranked = sameChannel
    .map((sku) => {
      const normalizedSku = normalizeText(sku.name);
      const nameHit =
        normalizedSku.length >= 2 && normalizedLine.includes(normalizedSku);
      // 曾用名同样算「名字命中」：订单识别的商品名会跟着截图改，
      // 只认现名的话，改完名以后同样的字反而匹配不上了（2026-11-05）。
      const previousHit =
        !nameHit &&
        (sku.previousNames ?? []).some((oldName) => {
          const normalizedOld = normalizeText(oldName);
          return (
            normalizedOld.length >= 2 && normalizedLine.includes(normalizedOld)
          );
        });
      // 名称是身份信号，规格是包装信号：先看名字，再看规格是否对得上。
      // 同名但规格不同的商品同时存在时，必须选规格一致的那个，不能按排序取第一个。
      const specOk = !specConflict(line.spec, sku.productModel);
      return {
        sku,
        nameHit: nameHit || previousHit,
        score:
          (nameHit || previousHit ? 100 : 0) +
          (specOk ? 10 : 0) +
          channelScore(importKey, sku, channels),
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    sku: ranked[0].sku,
    nameHit: ranked[0].nameHit,
    channelMismatch: false,
    channelPending: false,
  };
}

/**
 * 规格「正命中」得分（2026-11-07，评审补强）：
 *   2 = 能证明两边是同一个规格；
 *   1 = 信息不足（一边没写规格，无从比较）；
 *   0 = 两边都写了，但明确对不上。
 *
 * 为什么不能直接用 specConflict：它把「信息不足」和「不冲突」都返回 false，
 * 于是「同名但规格没写清」会被当成「规格对得上」，静默挂错商品。
 */
function specMatchScore(
  specText: string | null | undefined,
  skuModel: string | null | undefined,
): number {
  const lineTokens = extractSpecTokens(specText);
  const skuTokens = extractSpecTokens(skuModel);
  const lineWeighted = lineTokens.filter(
    (token) => token.dimension !== 'count',
  );
  const skuWeighted = skuTokens.filter((token) => token.dimension !== 'count');

  if (lineWeighted.length > 0 && skuWeighted.length > 0) {
    return lineWeighted.some((line) =>
      skuWeighted.some((sku) => sku.key === line.key),
    )
      ? 2
      : 0;
  }

  if (lineWeighted.length === 0 && skuWeighted.length === 0) {
    const lineCounts = countValues(lineTokens).filter((value) => value > 1);
    const skuCounts = countValues(skuTokens).filter((value) => value > 1);
    if (lineCounts.length > 0 && skuCounts.length > 0) {
      return lineCounts.some((value) => skuCounts.includes(value)) ? 2 : 0;
    }
  }

  return 1;
}

/**
 * 同名商品反查（2026-11-07）。
 *
 * 为什么要有这一层：匹配方向是「原料 → 商品」，商品名只有原料认出来之后
 * 才被看到。可截图写的往往是**商品名**：沃尔玛「冷鲜 鲜切黄牛后腿肉」
 * 挂在原料「牛霖」下，名字里没有「牛霖」，字面永远认不出原料，
 * 而清单里恰好就有这个同名商品。
 *
 * 规则（宁可不认，也不认错）：
 *   1. 只在**同一渠道**的商品里找（订单是沃尔玛，就不看山姆的同名商品）；
 *   2. 只认**名字完全一致**（归一化后相等，含曾用名），不做包含匹配；
 *   3. 同名商品分属两个不同原料时，说不清是哪一个，交给员工；
 *   4. 已经靠原料名 / 语义 / 别名认出来的行不会走到这里；
 *   5. 同一原料下有多个同名商品时，只有**能证明规格一致**才挂商品；
 *      证明不了就只挂原料（specVerified=false），交给员工选。
 */
function findSkuByExactName(
  line: ParsedOrderLine,
  candidates: ListItemCandidate[],
  importKey: string,
  channels: ChannelOption[],
): {
  candidate: ListItemCandidate;
  sku: ListSkuCandidate;
  specVerified: boolean;
} | null {
  const normalizedLine = normalizeText(line.rawName);
  if (!importKey || normalizedLine.length < 2) return null;

  const hits: Array<{ candidate: ListItemCandidate; sku: ListSkuCandidate }> =
    [];
  for (const candidate of candidates) {
    for (const sku of candidate.skus) {
      if (channelScore(importKey, sku, channels) !== 1) continue;
      const names = [sku.name, ...(sku.previousNames ?? [])];
      const sameName = names.some((name) => {
        const normalized = normalizeText(name);
        return normalized.length >= 2 && normalized === normalizedLine;
      });
      if (sameName) hits.push({ candidate, sku });
    }
  }
  if (hits.length === 0) return null;

  // 同一个名字挂在不同原料下（两个原料各有一个同名商品）：不猜。
  const ingredientIds = new Set(hits.map((hit) => hit.candidate.ingredientId));
  if (ingredientIds.size > 1) return null;

  // 截图的规格可能只写在名字里（「… 约200g」），spec 字段为空时用名字兜底。
  const specText = line.spec?.trim() || line.rawName;
  const scored = hits.map((hit) => ({
    ...hit,
    score: specMatchScore(specText, hit.sku.productModel),
  }));
  const exact = scored.filter((hit) => hit.score === 2);
  if (exact.length > 0) {
    return {
      candidate: exact[0].candidate,
      sku: exact[0].sku,
      specVerified: true,
    };
  }

  // 一个同名商品、截图也没写规格：没有第二个可能，直接挂。
  const hasLineSpec = extractSpecTokens(specText).length > 0;
  if (hits.length === 1 && !hasLineSpec) {
    return {
      candidate: hits[0].candidate,
      sku: hits[0].sku,
      specVerified: true,
    };
  }

  // 证明不了规格：只挂原料，商品留给员工按截图选（别再蒙一个）。
  return {
    candidate: hits[0].candidate,
    sku: hits[0].sku,
    specVerified: false,
  };
}

export function matchOrderLines(
  lines: ParsedOrderLine[],
  candidates: ListItemCandidate[],
  importChannel: string | null,
  channels: ChannelOption[],
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

  const channelKey = importChannel
    ? channelMatchKey(importChannel, channels)
    : '';

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
        (!item.channelFamily ||
          (channelKey !== '' &&
            channelMatchKey(item.channelFamily, channels) === channelKey)),
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
        // 渠道还没确认时不能沿用商品：同一个叫法换个渠道就是另一个商品。
        if (
          importChannel &&
          aliasSku &&
          !specConflict(line.spec, aliasSku.productModel)
        ) {
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

    let hit = hintedCandidate
      ? { candidate: hintedCandidate }
      : normalizedIngredients.find((entry) =>
          normalizedLine.includes(entry.normalized),
        );

    // 原料名没命中时，再反过来在同一渠道的商品里找同名商品（2026-11-07）。
    // 只在不靠语义提示、不靠别名的情况下兜底，避免盖过员工教过的映射。
    let exactNameSku: ListSkuCandidate | null = null;
    let exactNameSpecVerified = false;
    if (!hit && !hintedCandidate && channelKey) {
      const reverse = findSkuByExactName(
        line,
        candidates,
        channelKey,
        channels,
      );
      if (reverse) {
        hit = { candidate: reverse.candidate };
        exactNameSku = reverse.sku;
        exactNameSpecVerified = reverse.specVerified;
      }
    }

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

    const picked = pickSku(line, hit.candidate.skus, importChannel, channels);
    // 同名商品反查已经认准了是哪一个商品，直接用，不再让 pickSku 按分数重挑。
    const sku = exactNameSku ?? picked.sku;
    const nameHit = exactNameSku ? true : picked.nameHit;
    const channelMismatch = exactNameSku ? false : picked.channelMismatch;
    const channelPending = exactNameSku ? false : picked.channelPending;

    // 反查路径的规格要按「名字兜底」算：截图的克重常常只写在名字里。
    const conflict = sku
      ? specConflict(
          exactNameSku ? line.spec?.trim() || line.rawName : line.spec,
          sku.productModel,
        )
      : false;
    // 反查出来的同名商品如果证明不了规格一致，就不能自动挂（会按错的净含量折算成本）。
    const exactNameUnconfirmed =
      Boolean(exactNameSku) && !exactNameSpecVerified;
    // 补货改版：按斤/公斤/克/两买的，不要求采购商品；原料对上就能记。
    const allowWeight = isWeightUnit(line.unit);
    const needsNewSku = allowWeight
      ? false
      : !sku || conflict || exactNameUnconfirmed;

    let confidence: MatchConfidence = 'MEDIUM';
    if (allowWeight && nameHit) confidence = 'HIGH';
    else if (sku && nameHit && !conflict && !needsNewSku) confidence = 'HIGH';
    else if (!sku) confidence = 'LOW';

    const reason = allowWeight
      ? '按重量记，不需要采购商品'
      : channelPending
      ? '这笔订单还没确认渠道，确认后会自动匹配商品'
      : channelMismatch
        ? `该渠道（${importChannel}）还没有对应的采购商品，请手动选择或新建`
        : conflict
          ? aliasCandidate
            ? `上次匹配的商品规格是 ${sku?.productModel ?? '未知'}，与截图不一致，请选择或新建`
            : `商品规格是 ${sku?.productModel ?? '未知'}，与截图不一致`
          : !sku
            ? '原料对上了，但这道原料还没有采购商品'
            : exactNameUnconfirmed
              ? '同名商品无法确认规格，请按截图选一个'
              : aliasCandidate
                ? '沿用上次的原料，按截图规格重选了商品'
                : hintedCandidate
                  ? 'AI 语义匹配'
                  : exactNameSku
                    ? '按同名商品匹配'
                    : nameHit
                      ? '命中采购商品'
                      : '按原料匹配';

    return {
      ...line,
      ingredientId: hit.candidate.ingredientId,
      ingredientName: hit.candidate.ingredientName,
      procurementSkuId: allowWeight
        ? null
        : needsNewSku
          ? null
          : (sku?.id ?? null),
      purchaseItemId: hit.candidate.purchaseItemId,
      confidence,
      reason,
      needsNewSku,
    };
  });
}
