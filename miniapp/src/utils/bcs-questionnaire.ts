/**
 * 体况评分引导（2026-09-29 重做，2026-09-29 晚按复盘结论修订）
 *
 * 背景：原来给顾客 9 张图让他直接选一个分数 —— 顾客看不懂、没有参照，
 * 结果生产库 **76.2% 的狗体况分停在默认的 5 分、99.98% 从未被确认过**，
 * 相当于算法里唯一的「刹车」从来没被踩下。
 *
 * 改法：**不问「几分」，改问 4 个能看懂的动作**，每题给一个分数档，
 * 最后取中位数。检查点取自 WSAVA 全球营养委员会 2013 年《體態評分表》：
 *
 *   官方共 6 个检查点：肋骨（1-9 每档）、腰椎骨、骨盆骨、尾根、腰身、腹部凹陷。
 *   我们问 4 道：摸肋骨、摸脊椎与骨盆（必答）、俯视腰线、侧视腹部（可跳过）。
 *   少了「尾根」—— 它只在偏胖三档起作用，而那三档已被肋骨/腰线/腹部覆盖。
 *
 * ⚠️ 修订要点（老板复盘后确认）：
 *
 * 1. **取消「长毛犬」分支。** 原先按犬种名字猜是否长毛、长毛就少问两道
 *    「看」的题。实测两个问题：
 *      · 名单双向都会错（柴犬、哈士奇、雪纳瑞、边牧被误收；
 *        拉萨犬、哈瓦那犬、西高地等长毛犬漏收），且错判会改变喂食量；
 *      · 同一只狗走两条路径分数不一样（短毛可达 3-9，长毛可达 2-9）——
 *        分数取决于我们怎么归类它，而不是它实际什么样。
 *    改为：**不问犬种，两道「看」的题各自带一个「看不清」**，
 *    顾客自己判断看不看得见（长毛犬、法斗、恶霸这类桶胸犬都适用）。
 *
 * 2. **分数档对齐官方原文。** 原先腰部/腹部的最瘦档记 4 分，而官方第 3 档
 *    的原文就是「明顯腰身與腹部凹陷」—— 这一档之差导致
 *    **极瘦的狗（1-2 分）在四题路径下永远算不出来**，最瘦只能到 3 分，
 *    目标体重因此少算 20%（FEDIAF：3 分 ×1.3333，1 分 ×1.6667）。
 *    已把腰部/腹部最瘦档改为 3，并把脊椎的最瘦档由 2 改为 1
 *    （原设计与肋骨题不对称且无依据）。
 *
 * 3. **「看不清」不计入中位数**（用 BCS_SKIP 表示），等价于该题没答。
 *
 * ⚠️ 与后端的关系：这里只负责「把动作答案换算成分数」，
 *    换算完成后的分数走原有的 bcsScore 字段，后端算法不需要改动。
 */

/** 一道题的选项：label 给顾客看，bcs 是该选项对应的体况分 */
export interface BcsQuestionOption {
  label: string;
  bcs: number;
}

export interface BcsQuestion {
  key: string;
  /** 顾客看到的题目 */
  title: string;
  /** 'touch' = 用手摸（任何狗都准）；'look' = 用眼看（轮廓看不见时可跳过） */
  kind: 'touch' | 'look';
  /** 是否必答 */
  required: boolean;
  /**
   * 是否允许「看不清」跳过。
   *
   * 只有「看」的题需要：长毛犬的毛、法斗/恶霸这类桶胸犬的胸廓
   * 都会把腰腹轮廓盖住，顾客看不清就不该硬猜 ——
   * 猜错的代价是体况分被推高、目标体重被定低、最后喂少。
   */
  skippable?: boolean;
  /**
   * 指导图（展示在题目的**上方**）。
   *
   * 2026-09-29 加入实拍指导图 —— 文字说明再精简也描述不清"手该放哪"，
   * 一张图解决。
   *
   * 图片放 **CDN** 而不是打进小程序包：主包只有 2MB 额度，
   * 而包内媒体资源另有 200KB 的额度且已用到 97%，塞不下这两张。
   * 与「活动量参考图」「BCS 参考图」用同一套做法（`img.sevenkitchen.cloud`）。
   * 加载失败时该图直接不显示 —— 题目本身是纯文字的，缺图不影响答题。
   */
  image?: string;
  options: BcsQuestionOption[];
}

/**
 * 「看不清」的取值。
 *
 * 用 0 表示：体况分只可能是 1-9，0 不可能是任何一个答案，
 * 因此不会和真实答案混淆。算分时**直接忽略**这个值。
 */
export const BCS_SKIP = 0;

/**
 * 四道题。选项对应的分数**逐条对齐 WSAVA 官方逐档判据**：
 *
 *   肋骨（官方每档都有）：1 「明顯見到肋骨」/ 5 「觸診肋骨沒有過多脂肪」
 *                         / 7 「肋骨不易被觸摸到」/ 9 「大量脂肪堆積覆蓋胸腔」
 *   脊椎骨盆（官方 1-3、7-9）：1 「可見腰椎骨的頂部。骨盆骨突出」
 *                         / 5 摸得到但有層肉 / 7 不易摸到 / 9 摸不到
 *   腰身（官方 3 起）：3 「明顯腰身」/ 5 「可見腰身」/ 7 「幾乎不可見」/ 9 「腰身消失」
 *   腹部（官方 3 起）：3 「腹部凹陷明顯」/ 5 「可看到腹部凹陷」
 *                     / 6 「腹部凹陷明顯（官方 6 档原文如此）」/ 8 「無腹部凹陷」
 */
export const BCS_QUESTIONS: BcsQuestion[] = [
  {
    key: 'ribs',
    title: '用手轻轻按狗狗的胸侧，能摸到肋骨吗？',
    kind: 'touch',
    required: true,
    image: 'https://img.sevenkitchen.cloud/bcs-standards/bcs-guide-palpate-ribs.jpg',
    options: [
      { label: '不用按就能摸到', bcs: 1 },
      { label: '轻轻一按就摸到', bcs: 5 },
      { label: '要用力按才摸到', bcs: 7 },
      { label: '怎么都摸不到', bcs: 9 },
    ],
  },
  {
    key: 'spine',
    title: '摸背上的脊椎和屁股上方那两块骨头',
    kind: 'touch',
    required: true,
    image: 'https://img.sevenkitchen.cloud/bcs-standards/bcs-guide-palpate-spine.jpg',
    options: [
      { label: '骨头很明显', bcs: 1 },
      { label: '摸得到，但有一层肉', bcs: 5 },
      { label: '要用力才摸得到', bcs: 7 },
      { label: '摸不到', bcs: 9 },
    ],
  },
  {
    key: 'waist',
    title: '从正上方往下看，腰那里有收窄吗？',
    kind: 'look',
    required: false,
    skippable: true,
    options: [
      { label: '明显收窄', bcs: 3 },
      { label: '轻微收窄', bcs: 5 },
      { label: '平直、没有收窄', bcs: 7 },
      { label: '往外凸', bcs: 9 },
    ],
  },
  {
    key: 'tuck',
    title: '从侧面看，肚子有往上收吗？',
    kind: 'look',
    required: false,
    skippable: true,
    options: [
      { label: '明显往上收', bcs: 3 },
      { label: '轻微往上收', bcs: 5 },
      { label: '平直', bcs: 6 },
      { label: '往下垂', bcs: 8 },
    ],
  },
];

export type BcsAnswers = Record<string, number>;

export interface BcsScoreResult {
  /** 算出的体况分；未答完必答题时为 null */
  bcs: number | null;
  /** 必答题是否都答了 */
  isComplete: boolean;
  /** 还差哪几道必答题（题干） */
  missing: string[];
}

/**
 * 由动作答案算出体况分。
 *
 * 规则：**取所有有效答案的中位数**（四舍五入到整数）。
 *   · 必答题（摸肋骨、摸脊椎）没答 → 返回 null（不猜）
 *   · 标了 BCS_SKIP（看不清）的题 → 不计入，等价于没答
 *
 * 中位数比平均数稳健：个别看错一项不会把结果带偏。
 *
 * 可达范围：四题都答是 2-9；两道「看」的题都跳过时是 1-9
 * （极瘦的狗通常两道「看」的题也会跳过，因为瘦到骨头明显时
 *  「看不清」未必适用 —— 但至少 1 分不再是不可达的）。
 */
export function resolveBcsFromAnswers(options: {
  answers: BcsAnswers;
  questions: BcsQuestion[];
}): BcsScoreResult {
  const { answers, questions } = options;

  const missing = questions
    .filter(
      (q) =>
        q.required &&
        (answers[q.key] === undefined || answers[q.key] === BCS_SKIP),
    )
    .map((q) => q.title);

  if (missing.length > 0) {
    return { bcs: null, isComplete: false, missing };
  }

  const values = questions
    .map((q) => answers[q.key])
    .filter(
      (v): v is number =>
        typeof v === 'number' && Number.isFinite(v) && v >= 1,
    )
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return { bcs: null, isComplete: false, missing };
  }

  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 1
      ? values[mid]
      : (values[mid - 1] + values[mid]) / 2;

  const clamped = Math.min(Math.max(Math.round(median), 1), 9);
  return { bcs: clamped, isComplete: true, missing: [] };
}

/**
 * 顾客仍然跳过体况分时的兜底。
 *
 * **不猜一个「看起来合理」的分数**，而是明确告诉调用方：
 * 按默认值 5 分处理，并且**标记为未确认**，交给下游（下次称重时自动复评）。
 */
export function resolveBcsFallback(): { bcs: number; confirmed: false } {
  return { bcs: 5, confirmed: false };
}

/** 体况分的文字说明（给顾客看结果用） */
export function getBcsLabel(bcs: number): string {
  if (bcs <= 2) return '明显偏瘦';
  if (bcs === 3) return '偏瘦';
  if (bcs === 4) return '轻微偏瘦';
  if (bcs === 5) return '理想体态';
  if (bcs === 6) return '轻微偏胖';
  if (bcs === 7) return '偏胖';
  if (bcs === 8) return '肥胖';
  return '严重肥胖';
}
