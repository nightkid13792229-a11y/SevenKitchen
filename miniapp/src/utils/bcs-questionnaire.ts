/**
 * 体况评分引导（2026-09-29，上线批次阶段 C）
 *
 * 背景：原来给顾客 9 张图让他直接选一个分数 —— 顾客看不懂、没有参照，
 * 结果生产库 **76.2% 的狗体况分停在默认的 5 分、99.98% 从未被确认过**，
 * 相当于算法里唯一的「刹车」从来没被踩下。
 *
 * 改法（老板已审核）：**不问「几分」，改问 4 个能看懂的动作**：
 *   摸肋骨、摸脊椎与骨盆（这两项必答）
 *   俯视腰线、侧视腹部（这两项是「看」，长毛犬看不出来，会隐藏）
 *
 * 每题的答案直接给一个 BCS 分档，最后取**中位数**——
 * 中位数比平均数稳健，个别看错一项不会把结果带偏。
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
  /** 'touch' = 用手摸（长毛犬也准）；'look' = 用眼看（长毛犬会隐藏） */
  kind: 'touch' | 'look';
  /** 是否必答 */
  required: boolean;
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
      { label: '骨头很明显', bcs: 2 },
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
    options: [
      { label: '明显收窄', bcs: 4 },
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
    options: [
      { label: '明显往上收', bcs: 4 },
      { label: '轻微往上收', bcs: 5 },
      { label: '平直', bcs: 6 },
      { label: '往下垂', bcs: 8 },
    ],
  },
];

/**
 * 长毛犬种关键词。
 *
 * 这些犬种「看」不出来腰线和腹部上收（毛把轮廓盖住了），
 * 所以只保留「摸」的两道题。识别不到就照常显示四题——
 * 两道「看」的题本来也是选答，不会造成错误结果。
 */
const LONG_HAIR_BREED_KEYWORDS = [
  '泰迪', '贵宾', '比熊', '博美', '萨摩', '阿拉斯加', '哈士奇',
  '马尔济斯', '马尔他', '西施', '约克夏', '蝴蝶犬', '古牧',
  '古代牧羊', '松狮', '金毛', '喜乐蒂', '可卡', '雪纳瑞',
  '边牧', '边境牧羊', '日本银狐', '银狐', '阿富汗', '苏牧',
  '苏格兰牧羊', '大白熊', '秋田', '柴犬', '萨摩耶',
  'poodle', 'pomeranian', 'bichon', 'samoyed', 'husky',
  'malamute', 'maltese', 'shih tzu', 'yorkshire', 'papillon',
  'chow', 'golden', 'sheltie', 'cocker', 'schnauzer', 'collie',
  'akita', 'shiba',
];

/**
 * 需要特殊判断标准的犬种（阶段 C9）。
 *
 * 这两类犬用常规标准会误判：
 *   · 深胸细腰型（灵缇、惠比特等）：**理想体况下就能看到肋骨和腰线**，
 *     按常规标准容易被误判成「偏瘦」
 *   · 短鼻桶胸型（法斗、英斗、巴哥等）：胸廓本身就宽、腰线不明显，
 *     容易被误判成「偏胖」
 * 处理方式：**不改变算分逻辑**（那会引入主观偏差），
 * 而是在题目上方给一句针对该犬种的提示。
 */
const SIGHTHOUND_KEYWORDS = ['灵缇', '格力', '惠比特', '萨路基', '阿富汗', 'greyhound', 'whippet', 'saluki', 'borzoi'];
const BRACHYCEPHALIC_KEYWORDS = ['法斗', '法国斗牛', '英斗', '英国斗牛', '巴哥', '八哥', '波士顿', '西施', '北京犬', 'bulldog', 'pug', 'boston', 'french'];

export type BcsSpecialBreedType = 'SIGHTHOUND' | 'BRACHYCEPHALIC' | null;

/** 识别需要特殊判断标准的犬种 */
export function resolveSpecialBreedType(
  breedName?: string | null,
): BcsSpecialBreedType {
  if (!breedName) {
    return null;
  }
  const name = String(breedName).toLowerCase();
  if (SIGHTHOUND_KEYWORDS.some((k) => name.includes(k.toLowerCase()))) {
    return 'SIGHTHOUND';
  }
  if (BRACHYCEPHALIC_KEYWORDS.some((k) => name.includes(k.toLowerCase()))) {
    return 'BRACHYCEPHALIC';
  }
  return null;
}

/** 该犬种的判断提示（没有则返回空串） */
export function getSpecialBreedHint(type: BcsSpecialBreedType): string {
  if (type === 'SIGHTHOUND') {
    return '灵缇、惠比特这类狗，**即使体况理想也能看到肋骨和腰线**。所以「不用按就能摸到肋骨」对它们来说可能仍是正常的，别急着判断成偏瘦。';
  }
  if (type === 'BRACHYCEPHALIC') {
    return '法斗、巴哥这类狗，胸廓天生就宽、腰线不明显。所以「俯视看不到收窄」对它们来说可能仍是正常的，重点看**摸肋骨**的结果。';
  }
  return '';
}

/** 判断是否按「长毛犬」处理（只留摸的两题） */
export function isLongHairedBreed(breedName?: string | null): boolean {
  if (!breedName) {
    return false;
  }
  const name = String(breedName).toLowerCase();
  return LONG_HAIR_BREED_KEYWORDS.some((keyword) =>
    name.includes(keyword.toLowerCase()),
  );
}

/** 当前需要问的题目（长毛犬隐藏两道「看」的题） */
export function resolveQuestions(options: {
  isLongHaired: boolean;
}): BcsQuestion[] {
  if (!options.isLongHaired) {
    return BCS_QUESTIONS;
  }
  return BCS_QUESTIONS.filter((q) => q.kind === 'touch');
}

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
 * 必答题（摸肋骨、摸脊椎）未答完 → 返回 null（不猜）。
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
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
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
