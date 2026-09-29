/**
 * 体况评分引导（2026-09-29 重做；同日复盘后两次修订）
 *
 * 背景：原来给顾客 9 张图让他直接选一个分数 —— 顾客看不懂、没有参照，
 * 结果生产库 **76.2% 的狗体况分停在默认的 5 分、仅 1 只被顾客确认过**，
 * 相当于算法里唯一的「刹车」从来没被踩下。
 *
 * 改法：**不问「几分」，改问一个能看懂的动作** —— 摸肋骨时要按多用力。
 * 选项逐条对齐 WSAVA 全球营养委员会 2013《體態評分表》的判据。
 *
 * ── 依据：为什么不问腰线/腹部/脊椎/骨盆 ──────────────────────────
 *
 * WSAVA 官方 9 档判据里，各检查点出现的档位分布：
 *
 *   肋骨/胸部  1 2 3 4 5 6 7 8 9   ← 唯一贯穿全量程的检查点
 *   腰椎       1 2 3 · · · 7 8 9   ← 4/5/6 档完全不出现
 *   骨盆       1 2 3 · · · · · ·   ← 只在过瘦三档
 *   尾根       · · · · · · 7 8 9   ← 只在过胖三档
 *   腰线/腹部  · · 3 4 5 6 7 8 9
 *
 * 所以：
 *   1. **腰线/腹部（视觉）已删** —— 官方原文「BCS 及 MCS 均須經由觸診方能
 *      正確評估，尤其是中至長毛動物」；且桶胸犬（法斗、巴哥）主人看不到腰线，
 *      会如实答「没有收窄」，被误判成偏胖。生产库有 66 只这类狗。
 *   2. **腰椎/骨盆已删** —— 官方把「腰椎與骨盆」明确划给 **MCS（肌肉状况评分）**
 *      （原文：MCS 的評估項目包括顳骨、肩胛骨、腰椎與骨盆）。我们的能量计算
 *      只评估 BCS（体脂肪），混进 MCS 会让分数被往中间拉：
 *        · 肌肉流失型肥胖（肋骨肉多 + 骨盆骨头突出）→ 该减重 20%，却算成「维持现状」
 *        · 肌肉好的偏瘦狗 → 目标体重少算 20%
 *   3. **尾根不加** —— 只在过胖三档起作用，而那三档肋骨已能覆盖。
 *
 * ── 为什么只有一道题、五个选项 ──────────────────────────────
 *
 * 官方在 3、4、5 三档的肋骨描述几乎一样（都是「可輕易觸摸到肋骨」，只有脂肪
 * 描述微调），实际是靠腰线/腹部把这三档分开的。视觉题删掉后，**光靠摸肋骨
 * 能可靠区分的本来就只有 4-5 档**。所以：
 *
 *   · 选项统一改成「**手要按多用力**」的动作阶梯：碰 → 放上去 → 轻轻按 →
 *     用力按 → 摸不到。家长做一个动作、报告这个动作，**不需要判断"脂肪厚不厚"
 *     这种抽象量**。
 *   · 用 5 个选项而不是 4 个，把分辨率做回来：4 个选项时，真实的 3 分狗会被
 *     算成 1 分（目标体重多算 25%）；5 个选项最大偏差降到 13%。
 *   · 唯一剩下的 13% 偏差在 6 分被算成 5 分。可接受，依据官方原文：
 *     「BCS **高於 6 分**以上的成年動物，引發疾病的風險似乎會提高」——
 *     风险阈值在"高于 6 分"，6 分与 5 分临床上可合并处理。
 *
 * ── 犬种差异 ────────────────────────────────────────────
 *
 * 深胸细腰型犬（灵缇、惠比特等）在**理想体态下就能摸到肋骨且几乎没肉**，
 * 会被算成 2-3 分 → 目标体重定高 33-54%，逼一只正常狗增重。
 * 处理方式**不在这份题库里**：换算表存在数据库的犬种表（`bcs_score_map`），
 * 由调用方用 `applyBcsScoreMap` 把选项换算成分数。
 * 好处：想增删犬种或调整分数，改数据库即可，不用发小程序版本。
 *
 * ⚠️ 与后端的关系：这里只负责「把动作答案换算成分数」，
 *    分数走原有的 bcsScore 字段，后端能量算法不需要改动。
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
  /** 是否必答 */
  required: boolean;
  /**
   * 指导图（展示在题目的**上方**）。
   *
   * 文字说明再精简也描述不清"手该放哪"，一张图解决。
   *
   * 图片放 **CDN** 而不是打进小程序包：主包只有 2MB 额度，
   * 而包内媒体资源另有 200KB 的额度且已用到 97%，塞不下。
   * 与「活动量参考图」用同一套做法（`img.sevenkitchen.cloud`）。
   * 加载失败时该图不显示 —— 题干本身是纯文字的，缺图不影响答题。
   */
  image?: string;
  options: BcsQuestionOption[];
}

/**
 * 唯一一道题。选项分数逐条对齐 WSAVA 官方「肋骨」判据：
 *
 *   1（明顯見到肋骨…看不出任何體脂肪）/ 2（觸摸不到脂肪）
 *     → 「一碰就硌手，几乎没有肉」取 2
 *   3（可輕易觸摸到肋骨，看得出脂肪但觸摸不到）
 *     → 「手放上去就摸到，不用按」
 *   5（肋骨可輕易觸摸到，且沒有過多脂肪包覆）
 *     → 「要轻轻按一下才摸到」
 *   7（肋骨難以摸出，且有過多脂肪包覆）
 *     → 「要用力按才摸到」
 *   8（觸摸不到，或用力觸摸才摸得到）/ 9（堆積非常大量的脂肪）
 *     → 「怎么都摸不到」取 9
 */
export const BCS_QUESTIONS: BcsQuestion[] = [
  {
    key: 'ribs',
    title: '摸摸狗狗的胸侧，要按多用力才能摸到肋骨？',
    required: true,
    image: 'https://img.sevenkitchen.cloud/bcs-standards/bcs-guide-palpate-ribs.jpg',
    options: [
      { label: '一碰就硌手，几乎没有肉', bcs: 2 },
      { label: '手放上去就摸到，不用按', bcs: 3 },
      { label: '要轻轻按一下才摸到', bcs: 5 },
      { label: '要用力按才摸到', bcs: 7 },
      { label: '怎么都摸不到', bcs: 9 },
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
 * 规则：**取所有已答题目的中位数**（四舍五入到整数）。
 * 必答题没答 → 返回 null（不猜）。
 *
 * 目前只有一道题，所以结果就是所选的那一档。保留「中位数」的通用写法，
 * 是为了将来若补题目时不必改算法（中位数对个别看错的一项更稳健）。
 */
export function resolveBcsFromAnswers(options: {
  answers: BcsAnswers;
  questions: BcsQuestion[];
}): BcsScoreResult {
  const { answers, questions } = options;

  const missing = questions
    .filter((q) => q.required && answers[q.key] === undefined)
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
 * 按犬种给出的换算表，把「选中的选项」换算成体况分（深胸细腰型犬）。
 *
 * 换算表来自数据库的犬种表 `bcs_score_map`（灵缇等填 [4,5,6,7,9]，其余留空），
 * 由后端随犬种/档案接口下发。**名单和分数都不在小程序里**，
 * 想增删犬种或调整分数只需改数据库，不用发新版小程序、不用走微信审核。
 *
 * 为什么需要它：深胸细腰型犬在**理想体态下就能摸到肋骨且几乎没肉**，
 * 按标准分 2/3/5/7/9 会被算成 2-3 分，算法据此把目标体重定高 33-54%、
 * 逼一只正常狗增重。它们的换算表是 4/5/6/7/9：
 *
 *   选项                     标准   深胸细腰   理由
 *   一碰就硌手，几乎没有肉        2      4    它们的"偏瘦"是常态
 *   手放上去就摸到，不用按        3      5    它们的理想体态就是这个手感
 *   要轻轻按一下才摸到           5      6    天生精瘦的犬种要轻按，说明已有脂肪
 *   要用力按才摸到              7      7    一致
 *   怎么都摸不到                9      9    一致（肥胖的灵缇同样存在）
 *
 * 换算表按**选项顺序**一一对应。长度与选项数不符时**整表忽略、退回标准分** ——
 * 宁可少一次修正，也不能把顾客的答案换算成一个错位的分数。
 */
export function applyBcsScoreMap(
  bcs: number | null,
  map: number[] | null | undefined,
  options: BcsQuestionOption[],
): number | null {
  if (bcs === null) {
    return null;
  }
  if (!Array.isArray(map) || map.length !== options.length) {
    return bcs;
  }
  // 用选项的默认分反查它在题里的位置，再取该犬种给这一档的分数
  const index = options.findIndex((option) => option.bcs === bcs);
  if (index < 0) {
    return bcs;
  }
  const mapped = map[index];
  return typeof mapped === 'number' && Number.isFinite(mapped) ? mapped : bcs;
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
