/**
 * 排除性饮食试验（过敏原排查计划）的规则表
 * （2026-10-04，过敏重构第三期）
 *
 * ── 定位：这是"帮你执行"，不是"替你开方案" ──────────────────
 *
 *   知识库 skin-003 / skin-004 都写明：**排除试验必须由兽医设计并监督**。
 *   所以这个模块只做三件事：
 *     1. 按"表现方向"给一个**建议时长**（明示依据与出处）
 *     2. 给出**必须守住的事**清单（顾客照着勾，系统只负责提醒）
 *     3. 给再挑战的观察窗口
 *   **不给用药建议、不判断是不是过敏、不替顾客下结论。**
 *
 * ── 依据（全部来自知识库，可倒查）────────────────────────────
 *
 *   skin-003 饮食排除试验：诊断食物不良反应的金标准方法
 *     · 皮肤科病例：饲喂可控排除粮 6～12 周；
 *       改善可能是渐进的，需 4～12 周才显现
 *     · 慢性外耳炎病例：可能需要 4～6 个月才有明显改善
 *     · 胃肠道病例：通常 2～4 周较短排除期即可满足
 *     · 排除粮的关键：蛋白限制为 1～2 个来源，用水解蛋白或
 *       既往未接触过的新奇蛋白源
 *     · 皮肤科病例避免过量蛋白质（犬 16%～22% 干物质）
 *     · 激发试验：症状可能数小时内出现，也可能延迟至 14 天；
 *       胃肠道症状复发通常在前 3 天内，最长可达 7 天
 *     · ⚠️ 不做激发试验会导致食物敏感性被明显过度诊断
 *
 *   skin-004 排除试验期间的严格管理
 *     · 除排除粮外不得摄入任何其他物质：零食、调味维生素补充剂、
 *       可咀嚼药物（如调味心丝虫预防药）、脂肪酸补充剂、咀嚼玩具
 *     · 建议宠主连续数周记录**饮食日记**
 *     · 多宠家庭要确认患宠吃不到其他宠物的粮
 *
 *   skin-003 caveat（必须原样传达给顾客）
 *     · 皮试、血清 IgE/RAST、ELISA 对食物不良反应
 *       **既不适用于筛查也不能确诊**
 *
 *   来源：小动物临床营养学（第 5 版）第 31 章《食物不良反应》，
 *        证据级 B；ACVIM 2026 慢性肠病共识建议用设计良好的
 *        排除性饮食试验，而不是血清过敏原检测。
 */

/** 表现方向：决定建议排除期长度 */
export type EliminationDirection = 'SKIN' | 'GI' | 'BOTH' | 'OTITIS';

export interface EliminationDurationAdvice {
  /** 建议最少天数 */
  minDays: number;
  /** 建议最多天数 */
  maxDays: number;
  /** 给顾客看的一句话 */
  label: string;
  /** 依据出处（必须显示，不能只给数字） */
  basis: string;
  /** 改善可能要多久才显现 —— 避免顾客两周没见效就放弃 */
  expectation: string;
}

const DURATION_BY_DIRECTION: Record<EliminationDirection, EliminationDurationAdvice> = {
  SKIN: {
    minDays: 42,
    maxDays: 84,
    label: '建议 6～12 周',
    basis: '小动物临床营养学（第 5 版）第 31 章《食物不良反应》· 瘙痒性皮炎与排除性饮食试验',
    expectation: '改善是渐进的，通常要 4～12 周才看得出来。中途没变化不代表没用。',
  },
  GI: {
    minDays: 14,
    maxDays: 28,
    label: '建议 2～4 周',
    basis: '小动物临床营养学（第 5 版）第 31 章《食物不良反应》· 胃肠道表现',
    expectation: '胃肠道方向通常 2～4 周就能看出变化。慢性反复的问题需要更长的排除期。',
  },
  BOTH: {
    // 皮肤 + 肠胃同时有表现时按更长的那个走 —— 宁可多喂两周，不要因为太短而误判
    minDays: 42,
    maxDays: 84,
    label: '建议 6～12 周',
    basis: '小动物临床营养学（第 5 版）第 31 章《食物不良反应》· 皮肤与胃肠表现并存',
    expectation: '皮肤与肠胃同时有表现时，按皮肤方向的 6～12 周走，避免因时间太短而误判。',
  },
  OTITIS: {
    minDays: 120,
    maxDays: 180,
    label: '可能需要 4～6 个月',
    basis: '小动物临床营养学（第 5 版）第 31 章《食物不良反应》· 慢性外耳炎',
    expectation: '慢性外耳炎改善很慢，可能需要 4～6 个月才有明显变化。',
  },
};

export function getDurationAdvice(
  direction: string | null | undefined,
): EliminationDurationAdvice {
  const key = String(direction || '').toUpperCase() as EliminationDirection;
  return DURATION_BY_DIRECTION[key] ?? DURATION_BY_DIRECTION.SKIN;
}

export const ELIMINATION_DIRECTIONS: Array<{
  value: EliminationDirection;
  label: string;
  description: string;
}> = [
  {
    value: 'SKIN',
    label: '皮肤',
    description: '反复抓挠、啃咬、蹭脸、掉毛、皮肤发红',
  },
  {
    value: 'GI',
    label: '肠胃',
    description: '软便、拉稀、呕吐、排便次数多',
  },
  {
    value: 'BOTH',
    label: '两者都有',
    description: '皮肤和肠胃同时有表现',
  },
  {
    value: 'OTITIS',
    label: '反复耳道发炎',
    description: '耳朵反复发臭、摇头、挠耳',
  },
];

/**
 * 排除期必须守住的事（来源 skin-004）。
 *
 * 全部来自指南原文列举的"排除期间禁止摄入"清单。
 * 界面做成可勾选的清单，而不是一段说明文字 ——
 * 顾客是"照着做"，不是"读一遍"。
 */
export const STRICT_RULES: Array<{ key: string; label: string; detail: string }> = [
  {
    key: 'noOtherFood',
    label: '除了指定的食物，什么都不喂',
    detail: '排除粮之外一口都不能给，包括"就一点点"。',
  },
  {
    key: 'noTreats',
    label: '停掉所有零食',
    detail: '零食是最常被忽略的过敏原来源。',
  },
  {
    key: 'noFlavoredSupplements',
    label: '停掉调味补充剂',
    detail: '调味的维生素、脂肪酸补充剂都算。',
  },
  {
    key: 'noChewableMeds',
    label: '换掉或停掉可咀嚼药物',
    detail: '调味心丝虫预防药这类已被证实能引起不良反应，要问兽医换一种。',
  },
  {
    key: 'noChews',
    label: '停掉咬胶、骨头、洁齿棒',
    detail: '这些几乎都含动物蛋白。',
  },
  {
    key: 'noOtherPetsFood',
    label: '确认它吃不到家里其他宠物的粮',
    detail: '多宠家庭最容易漏的一条。',
  },
  {
    key: 'noHumanFood',
    label: '人吃的东西一口都不能给',
    detail: '包括水果、面包边这些"看着没事"的。',
  },
  {
    key: 'dietDiary',
    label: '每天记录吃了什么、有什么变化',
    detail: '指南建议连续数周记饮食日记，常能发现与复诊时陈述不同的情况。',
  },
];

/** 再挑战的观察窗口（来源 skin-003） */
export const CHALLENGE_RULES = {
  /** 建议最短观察天数 */
  minObserveDays: 7,
  /** 最长观察天数 —— 症状可能延迟到 14 天才出现 */
  maxObserveDays: 14,
  label: '建议单独加回这一种，观察 7～14 天',
  expectation:
    '症状可能几小时内就出现，也可能延迟到 14 天。胃肠道症状通常在前 3 天内出现，最长 7 天。',
  basis: '小动物临床营养学（第 5 版）第 31 章《食物不良反应》· 激发试验',
  /**
   * ⚠️ 不做再挑战会怎样 —— 这条必须让顾客看到。
   * skin-003 原文："不进行激发试验会导致食物敏感性被明显过度诊断。"
   */
  warning:
    '不做再挑战，会把很多其实不过敏的食物误判成过敏。指南明确：不进行激发试验会导致食物敏感性被明显过度诊断。',
} as const;

/**
 * 必须原样传达给顾客的两条安全提示（不得改写、不得省略）。
 *
 * 第一条来自 skin-003 的 caveat，第二条来自 skin-003/skin-004 的
 * "必须由兽医设计并监督"。这两条是**给顾客看的引导**，
 * 不是系统替顾客否定他手里的报告。
 */
export const VET_BOUNDARY_NOTES = [
  '这个试验必须由兽医设计并监督。这里只是帮你按计划执行、记录、把结果整理出来。',
  '皮试、血清 IgE / RAST / ELISA 这类检测，对食物不良反应既不适用于筛查、也不能确诊。想确认是不是食物过敏，只有排除性饮食试验这条路。',
] as const;

/** 打卡用的评分档（0=最好，数字越大问题越明显） */
export const ITCH_SCALE = [
  { value: 0, label: '不痒' },
  { value: 1, label: '有点' },
  { value: 2, label: '明显' },
  { value: 3, label: '很痒' },
] as const;

export const STOOL_SCALE = [
  { value: 0, label: '正常' },
  { value: 1, label: '偏软' },
  { value: 2, label: '不成形' },
  { value: 3, label: '拉稀' },
] as const;

/** 由开始日期与天数算计划结束日 */
export function resolvePlannedEndDate(
  startDate: Date,
  days: number,
): Date {
  const end = new Date(startDate.getTime());
  end.setUTCDate(end.getUTCDate() + Math.max(0, days));
  return end;
}

/** 已经进行到第几天（含开始当天） */
export function resolveDayIndex(startDate: Date, today: Date): number {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.floor((now - start) / 86400000) + 1;
}

/**
 * 把打卡记录压成一条趋势 —— 给顾客看"到底在好转吗"。
 *
 * 只看首尾会骗人（中间可能反复），所以返回首段均值与末段均值的对比。
 * 样本不足时返回 null，界面就说"再记几天就能看出趋势"，
 * 不要拿两天的数据编出一个结论。
 */
export function summarizeTrialTrend(
  logs: Array<{ logDate: Date; itchScore: number | null; stoolScore: number | null }>,
  field: 'itchScore' | 'stoolScore',
): {
  firstAverage: number;
  lastAverage: number;
  direction: 'improving' | 'worsening' | 'stable';
  sampleSize: number;
} | null {
  const points = logs
    .filter((log) => typeof log[field] === 'number')
    .sort((a, b) => a.logDate.getTime() - b.logDate.getTime())
    .map((log) => ({ date: log.logDate, value: log[field] as number }));

  // 少于 4 个点不足以说趋势 —— 宁可不说，也不要给一个假结论
  if (points.length < 4) return null;

  const windowSize = Math.max(1, Math.floor(points.length / 3));
  const first = points.slice(0, windowSize);
  const last = points.slice(-windowSize);
  const average = (items: Array<{ value: number }>) =>
    items.reduce((sum, item) => sum + item.value, 0) / items.length;

  const firstAverage = average(first);
  const lastAverage = average(last);
  const delta = lastAverage - firstAverage;

  return {
    firstAverage: round1(firstAverage),
    lastAverage: round1(lastAverage),
    // 0.5 分以内算稳定，避免把正常波动说成"好转"或"恶化"
    direction: delta <= -0.5 ? 'improving' : delta >= 0.5 ? 'worsening' : 'stable',
    sampleSize: points.length,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
