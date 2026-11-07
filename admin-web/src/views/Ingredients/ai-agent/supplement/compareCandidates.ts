/**
 * 选品比较：把几个候选按三层逐层淘汰，给出一个推荐。
 *
 * 三层是老板定的，顺序不能倒：
 * ① 化学形态（对狗安不安全、好不好吸收）
 * ② 人用还是犬用（一律先人用；饲料级进不了我们的分装零售）
 * ③ 性价比（前两层打平了才比）
 *
 * 《饲料添加剂品种目录》**不在这里**——它只用来查标签名字，不当门禁。
 * 目录的查询结果只作为一列提示信息带出来，不参与淘汰。
 *
 * 这里不碰网络也不碰界面：给一组事实，算出排序、淘汰理由和推荐。
 */
export type FormGrade = 'BEST' | 'GOOD' | 'FAIR'
export type UsageKind = 'HUMAN' | 'FEED_GRADE'

export interface CandidateFacts {
  key: string
  /** 展示用名字 */
  name: string
  formGrade: FormGrade
  usage: UsageKind
  /** 采购价（每个采购单位） */
  pricePerPurchaseUnit: number | null
  /** 1 个采购单位 = 多少粒/片 */
  unitsPerPurchaseUnit: number | null
  /** 标签每份的有效成分合计（毫克），用来算「每 1000mg 多少钱」 */
  activeMgPerServing: number | null
  /** 每份几粒 */
  servingUnitsPerDose: number | null
  /** 目录里查得到、且适用范围含犬；查不到就是 null，仅作提示 */
  catalogDogAllowed: boolean | null
  /** 命中硬排除清单（氧化铁/碳酸亚铁/氧化铜）；null = 没命中 */
  hardExclusionReason?: string | null
}

export type EliminationReason = 'HARD_EXCLUSION' | 'FEED_GRADE' | 'LOWER_FORM'

export interface CandidateVerdict {
  key: string
  name: string
  /** 淘汰原因；null = 还留在场上 */
  eliminatedBy: EliminationReason | null
  /** 每 1000mg 有效成分的价格；算不出来是 null（不猜） */
  costPer1000Mg: number | null
  /** 一句话说明它现在的处境 */
  note: string
}

export interface ComparisonResult {
  verdicts: CandidateVerdict[]
  /** 推荐的那个；一个都选不出就是 null */
  recommendedKey: string | null
  /** 推荐的理由；没有推荐时说明为什么 */
  reason: string
}

const FORM_SCORE: Record<FormGrade, number> = { BEST: 3, GOOD: 2, FAIR: 1 }

export function costPer1000Mg(facts: CandidateFacts): number | null {
  const { pricePerPurchaseUnit, unitsPerPurchaseUnit, activeMgPerServing, servingUnitsPerDose } =
    facts;
  if (
    !isPositive(pricePerPurchaseUnit) ||
    !isPositive(unitsPerPurchaseUnit) ||
    !isPositive(activeMgPerServing) ||
    !isPositive(servingUnitsPerDose)
  ) {
    return null;
  }
  const servingsPerPurchase = unitsPerPurchaseUnit / servingUnitsPerDose;
  const activeMgPerPurchase = servingsPerPurchase * activeMgPerServing;
  const cost = (pricePerPurchaseUnit / activeMgPerPurchase) * 1000;
  return Math.round(cost * 100) / 100;
}

function isPositive(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function compareCandidates(candidates: CandidateFacts[]): ComparisonResult {
  if (candidates.length === 0) {
    return { verdicts: [], recommendedKey: null, reason: '还没有候选可比' };
  }

  // ① 形态：只淘汰「明显低一档」的，不淘汰同档
  const bestForm = Math.max(...candidates.map((item) => FORM_SCORE[item.formGrade]));

  const verdicts: CandidateVerdict[] = candidates.map((candidate) => {
    const cost = costPer1000Mg(candidate);
    const base = {
      key: candidate.key,
      name: candidate.name,
      costPer1000Mg: cost
    };

    // 硬排除先于一切：不是"差一点"，是不该作为该营养素的来源
    if (candidate.hardExclusionReason) {
      return {
        ...base,
        eliminatedBy: 'HARD_EXCLUSION' as const,
        note: candidate.hardExclusionReason
      };
    }

    if (candidate.usage === 'FEED_GRADE') {
      return {
        ...base,
        eliminatedBy: 'FEED_GRADE' as const,
        note: '饲料级，进不了我们的分装零售'
      };
    }

    if (FORM_SCORE[candidate.formGrade] < bestForm) {
      return {
        ...base,
        eliminatedBy: 'LOWER_FORM' as const,
        note: '形态比同类低一档'
      };
    }

    return {
      ...base,
      eliminatedBy: null,
      note: cost === null ? '价格或规格没填全，算不出每 1000mg 单价' : '形态与同类持平'
    };
  });

  const survivors = verdicts.filter((item) => item.eliminatedBy === null);
  const priced = survivors.filter(
    (item): item is CandidateVerdict & { costPer1000Mg: number } => item.costPer1000Mg !== null
  );

  if (survivors.length === 0) {
    return {
      verdicts,
      recommendedKey: null,
      reason: '没有候选过得了前两层，先补候选或核对形态/用途'
    };
  }

  if (priced.length === 0) {
    return {
      verdicts,
      recommendedKey: null,
      reason: '形态和用途都过关了，但价格没填全，比不出性价比'
    };
  }

  const cheapest = priced.reduce((best, item) =>
    item.costPer1000Mg < best.costPer1000Mg ? item : best
  );

  const reason =
    survivors.length === 1
      ? '只有它过了前两层（形态与用途）'
      : `前两层打平，它每 1000mg 最便宜（¥${cheapest.costPer1000Mg.toFixed(2)}）`;

  return {
    verdicts,
    recommendedKey: cheapest.key,
    reason
  };
}
