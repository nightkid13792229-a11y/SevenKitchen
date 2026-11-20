/**
 * 形态同义词归并。
 *
 * 市场标题里同一件事有很多说法：「甘氨酸铜 / 双甘氨酸铜 / 甘氨酸螯合铜」；
 * 「螯合铜」「生物活性铜」其实是泛称或营销词，不是一种具体形态。
 *
 * 两件事都不需要人工维护：
 * 1. 去掉修饰词（螯合 / 生物活性 / 活性 / 复合 / 天然…）后同名、或一个是另一个子串的，并成一条；
 * 2. 去完修饰只剩"营养素本身"（如"铜"）的，直接丢掉——它不是形态。
 */
import type { DimensionCandidate } from './supplement-form-candidates';

/** 这些词只是修饰，不改变"是哪种盐/哪种分子" */
const GENERIC_MODIFIERS = /(生物活性|活性|螯合|复合|天然|进口|高效|强效|加强型)/g;
const CJK = /[\u4e00-\u9fa5]/;

export type MergedCandidate = DimensionCandidate & { alsoKnownAs: string[] };

/** 前端传进来的可能是「矿物质 · 铜」，取最后一段才是营养素名 */
function nutrientCore(nutrientLabel: string): string {
  const parts = String(nutrientLabel ?? '').split('·');
  return parts[parts.length - 1].replace(/\s+/g, '').trim();
}

export function canonicalFormLabel(label: string, nutrientLabel = ''): string {
  const cleaned = String(label ?? '')
    .replace(GENERIC_MODIFIERS, '')
    .replace(/\s+/g, '')
    .trim();
  const nutrient = nutrientCore(nutrientLabel);
  // 去完修饰就只剩营养素名：这是泛称/营销词，不是形态
  if (nutrient && cleaned === nutrient) {
    return '';
  }
  return cleaned;
}

/**
 * 把候选按"去修饰后的名字"归并；中文标签里一个是另一个子串时也并（短的当正名）。
 * 合并后优先保留有原文的那条，引用合并，市场计数取最大，其余说法进 alsoKnownAs。
 */
export function mergeSynonymCandidates(
  candidates: DimensionCandidate[],
  nutrientLabel: string,
): MergedCandidate[] {
  const groups: { canonical: string; members: DimensionCandidate[] }[] = [];

  for (const candidate of candidates) {
    const canonical = canonicalFormLabel(candidate.labelZh, nutrientLabel);
    if (!canonical) {
      continue;
    }
    const existing = groups.find(
      (group) =>
        group.canonical === canonical ||
        (CJK.test(canonical) &&
          CJK.test(group.canonical) &&
          // 太短的不参与"互相包含"判断：否则「铜」会把所有带铜的名字都吸过来
          Math.min(group.canonical.length, canonical.length) >= 2 &&
          (group.canonical.includes(canonical) || canonical.includes(group.canonical))),
    );
    if (!existing) {
      groups.push({ canonical, members: [candidate] });
      continue;
    }
    if (canonical.length < existing.canonical.length) {
      existing.canonical = canonical;
    }
    existing.members.push(candidate);
  }

  return groups.map((group) => {
    const evidenced = group.members.find((item) => item.status === 'EVIDENCED');
    const base = evidenced ?? group.members[0];
    const citations = [...(evidenced?.citations ?? [])];
    for (const member of group.members) {
      for (const citation of member.citations) {
        if (
          !citations.some(
            (item) => item.quote === citation.quote && item.documentId === citation.documentId,
          )
        ) {
          citations.push(citation);
        }
      }
    }
    const marketCount = Math.max(...group.members.map((item) => item.market?.count ?? 0), 0);
    const samples = [
      ...new Set(group.members.flatMap((item) => item.market?.samples ?? [])),
    ].slice(0, 3);

    return {
      ...base,
      labelZh: group.canonical,
      citations,
      market: marketCount > 0 ? { count: marketCount, samples } : null,
      alsoKnownAs: [
        ...new Set(group.members.map((item) => item.labelZh).filter((name) => name !== group.canonical)),
      ],
    };
  });
}
