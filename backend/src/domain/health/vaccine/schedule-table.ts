/**
 * 免疫程序表（2026-10-15 重做）—— **只有数据，没有算法**。
 *
 * ── 这个文件是什么 ─────────────────────────────────────────────
 *
 * 它是需求文档**附录 A「免疫程序规格」**在代码里的样子，一行对一行：
 *
 *   · 需求 附录 A.2「三类疫苗的完整参数」→ `SCHEDULE_STEPS`
 *   · 需求 附录 A.3「三条硬口径」        → 窗口参数（AGE/FLEX/GRACE 的公式在 engine）
 *   · 需求 附录 A.4「与 WSAVA 2024 原文核对」→ `basis` 文案
 *   · 需求 第四节「疫苗分级」            → `VACCINE_KIND_LAYERS`
 *
 * **测试从这张表生成**（技术方案 5.1）：表改一行，用例跟着变；
 * 代码与表不一致 → 用例红。所以这个文件里**不许出现判断逻辑** ——
 * 一旦有 if，规格就不再是"一张能拿给兽医审的表"了。
 *
 * ── 三个概念必须分清（需求 A.1）────────────────────────────────
 *
 *   间隔期   两针之间**最短**能隔多久（早打无效）—— FLEX 的下界 / GRACE 的间隔
 *   窗口期   家长**可以**去打的区间 —— 界面上显示的那段
 *   宽限期   窗口终点之后还算"按时"的余量 —— GRACE 的 `graceDays`
 *   重启阈值 隔太久 → 程序失效，重新来过 —— 钩端专属（18 个月）
 *
 * ── 三种窗口形态（技术方案 2.1）───────────────────────────────
 *
 *   `AGE`   起点 = 生日 + 年龄下限；终点 = 起点 + 窗口长度   （每个系列的第一针）
 *   `FLEX`  起点 = 上一针 + 最短间隔；终点 = 上一针 + 最长间隔 （首免系列的后续针）
 *   `GRACE` 起点 = 上一针 + 间隔；终点 = 起点 + 宽限          （所有加强针）
 *
 * 公式在 `engine.ts` 里实现；这里只给参数。
 * 「上一针」= 上一步的**理想接种日**：该步真打了就是**实际接种日**（需求 A.3 第 2 条），
 * 没打就是它的窗口起点（AGE / GRACE）或窗口终点（FLEX）。
 */

/**
 * 接种周期/窗口的分类（2026-10-05 老板定的口径）。
 *
 * ⚠️ 它不是"疫苗名字的分类"，而是**排期的分类** ——
 * 老板原话："这里的这个分类，严格来讲是指接种周期或者接种窗口的分类。"
 *
 *   core_early  早期核心疫苗 —— 4 周龄那一针抢跑（**不主动推**，有记录才认）
 *   core        核心疫苗     —— 幼犬首免 + 26 周补强 + 每 3 年
 *   rabies      狂犬疫苗     —— 12 周起首针，**每年**（法定）
 *   lepto       钩端螺旋体   —— 首免 2 针 + 每年（上一针 ≥18 个月要重启）
 *   other       其他         —— 我们没有接种程序，只如实记录（可选疫苗：犬窝咳、冠状…）
 */
export type VaccineKind = 'core_early' | 'core' | 'rabies' | 'lepto' | 'other';

/** 类别全集（校验与遍历用；展示顺序见 VACCINE_KIND_LABELS 的键序） */
export const VACCINE_KINDS: readonly VaccineKind[] = [
  'core_early',
  'core',
  'rabies',
  'lepto',
  'other',
];

/**
 * 类别的中文名。
 *
 * ⚠️ 核心这一类**必须带病种**（需求：kindLabel 形如
 *    `核心疫苗（犬瘟、细小、腺病毒）`）—— 家长最关心的就是"这一针防什么"。
 *    老板 2026-10-12 原话："核心疫苗的文案可以改为核心疫苗（包含犬瘟、细小、腺病毒）吗？"
 */
export const VACCINE_KIND_LABELS: Record<VaccineKind, string> = {
  core_early: '早期核心疫苗',
  core: '核心疫苗（犬瘟、细小、腺病毒）',
  rabies: '狂犬疫苗',
  lepto: '钩端螺旋体',
  other: '其他',
};

/** 分级（需求 第四节）：必打 / 强烈建议 —— 页面上只讲这两层 */
export type VaccineLayer = 'MUST' | 'SUGGEST';

/**
 * 每一类属于哪一层（需求 第四节「疫苗分级」）。
 *
 *   ① 必打     核心疫苗 + 狂犬疫苗 → 永远出现，过期写"尽快补种"
 *   ② 强烈建议 钩端螺旋体         → 出现，但措辞明确弱于必打；不催
 *   —  可选     犬窝咳 / 冠状 / 副流感 / 莱姆 → **不进页面**（`other` 层为空）
 */
export const VACCINE_KIND_LAYERS: Partial<Record<VaccineKind, VaccineLayer>> = {
  core: 'MUST',
  rabies: 'MUST',
  lepto: 'SUGGEST',
  // core_early 只在"这只狗真的打过"时出现（需求：不主动推），
  // 它不是一层，所以落在必打这一侧显示，但不进默认计划。
  core_early: 'MUST',
  // other（犬窝咳、冠状、副流感、莱姆…）不进计划，没有层级。
};

/** 会进入免疫计划的类别（需求 第四节：页面只讲必打 + 强烈建议） */
export const PLANNED_KINDS: readonly VaccineKind[] = [
  'core',
  'rabies',
  'lepto',
];

// ===========================================================================
// 免疫程序表的参数（需求 附录 A.2 逐行）
// ===========================================================================

/** 核心疫苗：幼犬首免 + 26 周补强 + 每 3 年（WSAVA 2024） */
export const CORE_SCHEDULE = {
  /** 首免起始周龄：指南写的是 "6 to 8 weeks of age" —— 起点取 6 周、窗口宽度 2 周 = 6~8 周 */
  startWeeks: 6,
  /** 第 1 针的窗口长度（周）：6~8 周 */
  firstWindowWeeks: 2,
  /** 后续针的间隔：每 2~4 周（最短 2 周是免疫学下限） */
  intervalWeeksMin: 2,
  intervalWeeksMax: 4,
  /** 系列结束条件：必须有一针落在 16 周龄或以后（这一针是首免里最重要的一针） */
  finishWeeks: 16,
  /** 26 周补强：26 周龄起，窗口 4 周 */
  booster26Weeks: 26,
  booster26WindowWeeks: 4,
  /** 成年加强：上一针 +3 年 ~ +3 年 90 天（宽限 90 天） */
  adultIntervalYears: 3,
  adultGraceDays: 90,
  /** 覆盖 20 年 → ceil(20 / 3) = 7 格（与狂犬、钩端统一"每个类别覆盖 20 年"） */
  adultMaxRepeats: 7,
  /**
   * 成年犬**缺记录**时只补一针（需求 5.2）。
   *
   * WSAVA 2024："a single dose of MLV or recombinant vaccine will likely
   * protect most dogs" —— 一只 6 岁的狗**永远不会**被要求"从第一针开始"。
   */
  catchUpLabel: '补一针',
  /**
   * 卡片上那行小字（2026-10-16 从「依据」里拆出来）。
   *
   * 为什么单列一个字段：`basis` 是**给人查看详情时读的整段依据**（带指南引注、
   * 100 多字），放在卡片上当小字会变成一堵墙；而家长在首屏最需要的就是**一句话**。
   * 两个字段各就各位，也不再有"同一句话说两遍"。
   */
  hint: '幼犬从 6~8 周龄开始，每 2~4 周打一针，一直接种到满 16 周龄。',
  basis:
    '犬瘟、细小、腺病毒为必须接种的核心疫苗。' +
    '首次免疫从 6~8 周龄起，间隔 2~4 周接种一次，一直接种到满 16 周龄（WSAVA 2024）。' +
    '幼犬的母源抗体会干扰疫苗，但每只幼犬的抗体消退时间差异比较大，' +
    '所以需要在 6~16 周龄之间间隔接种。确保至少有一针落在抗体消退的窗口期里。' +
    '16 周龄后，绝大多数幼犬母源抗体大幅减弱，' +
    '所以 16 周龄后的核心疫苗接种尤为重要，也是幼犬首免程序中的最后一针。' +
    '是否接种、何时接种，请以执业兽医的意见为准。',
  /** 26 周补强的依据（WSAVA 2024 p3/p14） */
  booster26Basis:
    'WSAVA 2024：26 周龄或稍后再补一针核心疫苗（而不是等到 12~16 月龄）；' +
    '若已在 20 周龄后做过抗体检测且显示有保护，则不需要这一针',
  /** 成年加强的依据 */
  adultBasis:
    'WSAVA 2024：成年加强三年一次或更少频次；' +
    '16 周龄后的补强在 26 周龄（取代了旧的「12~16 月龄第一次加强」）',
  /** 26 周补强那行小字（原型没有这一屏，与成年口径保持一致） */
  booster26Hint: '26 周龄这一针是首免程序的收尾；之后每 3 年加强一次。',
  /** 成年加强那行小字 */
  adultHint: '之后每 3 年接种一次。',
  /** 成年犬缺记录、只补一针的依据（需求 5.3 的界面口径） */
  catchUpHint: '已经满 26 周，补一针核心疫苗即可；之后每 3 年接种一次。',
  catchUpBasis:
    '这只狗狗已经满 26 周，按成年犬的常规安排补一针核心疫苗即可（WSAVA 2024：' +
    '16 周龄以上的犬只免疫史不明时，一针 MLV 或重组疫苗即可保护大多数犬只）；' +
    '之后每 3 年接种一次。如果你手上还有以前的记录，录进来之后我们会重新算。',
} as const;

/** 狂犬疫苗：12 周起首针 → 每年（法定强制免疫，没有"有效期"这个概念） */
export const RABIES_SCHEDULE = {
  /** 首针周龄：12 周（说明书常见写法；WSAVA 亦载"一些国家首剂不早于 12 周龄"） */
  firstDoseWeeks: 12,
  /** 首针窗口长度：30 天 */
  firstWindowDays: 30,
  /** 年度加强：上一针 +1 年 ~ +30 天（宽限 30 天） */
  intervalYears: 1,
  graceDays: 30,
  /** 每年一次 → 覆盖 20 年 = 20 格 */
  maxDoses: 20,
  hint: '狂犬是法定每年接种，漏了要尽快补上。',
  basis:
    '狂犬属强制免疫（《动物防疫法》），每年接种一次。' +
    '首次免疫程序须大于 12 周龄（WSAVA 2024），' +
    '是否接种、何时接种，请以执业兽医的意见为准。',
} as const;

/** 钩端螺旋体（强烈建议）：首免 2 针 → 每年；上一针 ≥18 个月 → 重启 */
export const LEPTO_SCHEDULE = {
  /** 首针周龄：8 周起，窗口 4 周（= 8~12 周龄） */
  startWeeks: 8,
  firstWindowWeeks: 4,
  /** 第 2 针：间隔 2~4 周 */
  intervalWeeksMin: 2,
  intervalWeeksMax: 4,
  /** 年度加强：上一针 +1 年 ~ +30 天（宽限 30 天） */
  intervalYears: 1,
  graceDays: 30,
  /** 重启阈值：上一针距今 ≥18 个月 → 程序失效，再打 2 针 */
  restartMonths: 18,
  /** 重启第 1 针的窗口：[今天, +2 周] */
  restartFirstWindowWeeks: 2,
  /** 每年一次 → 覆盖 20 年 = 20 格 */
  maxRepeats: 20,
  basis:
    '幼犬 8 周龄后可以完成首次免疫，首次免疫共两针，间隔 2~4 周。' +
    '首次免疫后每年接种一次（WSAVA 2024）。' +
    '中国属钩端螺旋体流行地区。特别是高风险地区（接触积水、牲畜或鼠类）强烈建议接种。' +
    '首次免疫后，如果距离上次接种已经超过 18 个月，建议重启首次免疫程序（2 针，间隔 2~4 周）。' +
    '是否接种、何时接种，请以执业兽医的意见为准。',
  hint: '首次两针，间隔 2~4 周；之后每年一次。',
  /** 重启的依据（WSAVA 2024 问答；指南自认证据稀疏，所以保留"预防性原则"这个定性说法） */
  restartHint: '距离上一针已经超过 18 个月，需要重新打两针。',
  restartBasis:
    'WSAVA 2024 问答：上一针钩端螺旋体疫苗距今 18 个月或更久时，' +
    '虽然支持的证据很少，但基于预防性原则，需要重新开始接种程序（2 针，间隔 2~4 周）。' +
    '指南同时说明：现有钩端疫苗的免疫力被认为撑不到 18 个月。',
} as const;

/** 早期核心疫苗（4 周龄抢跑那一针）：**只有记录里带 core_early 才认，不主动推** */
export const CORE_EARLY_SCHEDULE = {
  /** 4 周龄起单针（常规首免系列之前） */
  startWeeks: 4,
  windowWeeks: 2,
  hint: '4 周龄抢跑的那一针；之后仍要从 6~8 周开始走常规首免。',
  basis:
    'WSAVA 2024 Table 1：CPV 重组 + CDV 弱毒苗可在 4 周龄起接种 1 针，' +
    '之后仍要从 6~8 周开始走常规首免；产品说明书（宠必威幼犬保）建议 4~6 周龄基础接种',
} as const;

// ===========================================================================
// 步骤表（技术方案 2.1「程序表逐行」）
// ===========================================================================

export type ScheduleWindowKind =
  /** 起点 = 生日 + 年龄下限，终点 = 起点 + 窗口长度 */
  | 'AGE'
  /** 起点 = 上一针 + 最短间隔，终点 = 上一针 + 最长间隔 */
  | 'FLEX'
  /** 起点 = 上一针 + 间隔，终点 = 起点 + 宽限 */
  | 'GRACE';

/** 首免系列 / 加强针（技术方案 2.1 的 `series`） */
export type ScheduleSeries = 'PRIMARY' | 'BOOSTER';

export interface ScheduleStepSpec {
  /** 步骤标识模板；实际下发时用 materialize 后的稳定 key */
  key: string;
  kind: VaccineKind;
  /** 页面上写的字（人话）：第 1 针 / 每年一次 / 加强（每 3 年）/ 补一针 */
  label: string;
  layer: VaccineLayer;
  series: ScheduleSeries;
  windowKind: ScheduleWindowKind;
  /** AGE：年龄下限（周） */
  ageWeeks?: number;
  /** AGE：窗口长度（周） */
  windowWeeks?: number;
  /** AGE：窗口长度（天）—— 狂犬首针用 30 天 */
  windowDays?: number;
  /** FLEX：与上一针的最短 / 最长间隔（周） */
  minIntervalWeeks?: number;
  maxIntervalWeeks?: number;
  /** GRACE：与上一针的间隔（年） + 宽限（天） */
  intervalYears?: number;
  graceDays?: number;
  /** 能不能被抗体检测替代（需求 R9 / 附录 A 的 R9 依据） */
  titerable: boolean;
  /** 卡片上那行**短话**（一句话说清这一针是怎么回事） */
  hint: string;
  /** 展开给家长看的**依据**（带指南引注的整段，比 hint 长得多） */
  basis: string;
  /**
   * 会不会进**默认计划**。
   *
   * false 只有一种情况：早期核心疫苗 —— 需求第四节：
   * "不主动推是我们的产品决定……家长录过才认"。
   */
  inDefaultPlan: boolean;
}

/**
 * 程序表逐行（与需求附录 A.2 一一对应）。
 *
 * ⚠️ 这里每一行的 key 是**模板**：
 *   · 首免系列的针次展开成 `core-puppy-1..N`（`core-puppy-n` 那一行是模板）
 *   · 加强针展开成 `core-adult-1..7` / `rabies-1..20` / `lepto-repeat-1..20`
 *   · `core-puppy-last` 是"系列最后一针"的**约束**：窗口起点不早于 16 周龄
 *     （它的参数与 `core-puppy-n` 相同，单独列出来是为了让这张表自解释）
 */
export const SCHEDULE_STEPS: readonly ScheduleStepSpec[] = [
  /* ── 核心 · 幼犬首免（需求 A.2 前三行）───────────────────────── */
  {
    key: 'core-puppy-1',
    kind: 'core',
    label: '第 1 针',
    layer: 'MUST',
    series: 'PRIMARY',
    windowKind: 'AGE',
    ageWeeks: CORE_SCHEDULE.startWeeks,
    windowWeeks: CORE_SCHEDULE.firstWindowWeeks,
    titerable: true,
    hint: CORE_SCHEDULE.hint,
    basis: CORE_SCHEDULE.basis,
    inDefaultPlan: true,
  },
  {
    key: 'core-puppy-n',
    kind: 'core',
    label: '后续针',
    layer: 'MUST',
    series: 'PRIMARY',
    windowKind: 'FLEX',
    minIntervalWeeks: CORE_SCHEDULE.intervalWeeksMin,
    maxIntervalWeeks: CORE_SCHEDULE.intervalWeeksMax,
    titerable: true,
    hint: CORE_SCHEDULE.hint,
    basis: CORE_SCHEDULE.basis,
    inDefaultPlan: true,
  },
  {
    key: 'core-puppy-last',
    kind: 'core',
    label: '最后一针',
    layer: 'MUST',
    series: 'PRIMARY',
    windowKind: 'FLEX',
    minIntervalWeeks: CORE_SCHEDULE.intervalWeeksMin,
    maxIntervalWeeks: CORE_SCHEDULE.intervalWeeksMax,
    titerable: true,
    hint: CORE_SCHEDULE.hint,
    basis: CORE_SCHEDULE.basis,
    inDefaultPlan: true,
  },
  /* ── 核心 · 26 周补强（需求 A.2 第四行）──────────────────────── */
  {
    key: 'core-26w',
    kind: 'core',
    label: '26 周补强',
    layer: 'MUST',
    series: 'BOOSTER',
    windowKind: 'AGE',
    ageWeeks: CORE_SCHEDULE.booster26Weeks,
    windowWeeks: CORE_SCHEDULE.booster26WindowWeeks,
    titerable: true,
    hint: CORE_SCHEDULE.booster26Hint,
    basis: CORE_SCHEDULE.booster26Basis,
    inDefaultPlan: true,
  },
  /* ── 核心 · 成年加强（需求 A.2 第五行）+ 缺记录时的"补一针"（需求 5.2）── */
  {
    key: 'core-adult-n',
    kind: 'core',
    label: '加强（每 3 年）',
    layer: 'MUST',
    series: 'BOOSTER',
    windowKind: 'GRACE',
    intervalYears: CORE_SCHEDULE.adultIntervalYears,
    graceDays: CORE_SCHEDULE.adultGraceDays,
    titerable: true,
    hint: CORE_SCHEDULE.adultHint,
    basis: CORE_SCHEDULE.adultBasis,
    inDefaultPlan: true,
  },
  {
    key: 'core-catchup',
    kind: 'core',
    label: CORE_SCHEDULE.catchUpLabel,
    layer: 'MUST',
    series: 'BOOSTER',
    windowKind: 'GRACE',
    intervalYears: CORE_SCHEDULE.adultIntervalYears,
    graceDays: CORE_SCHEDULE.adultGraceDays,
    titerable: true,
    hint: CORE_SCHEDULE.catchUpHint,
    basis: CORE_SCHEDULE.catchUpBasis,
    inDefaultPlan: true,
  },
  /* ── 狂犬（需求 A.2 第六、七行）─────────────────────────────── */
  {
    key: 'rabies-1',
    kind: 'rabies',
    label: '首针',
    layer: 'MUST',
    series: 'PRIMARY',
    windowKind: 'AGE',
    ageWeeks: RABIES_SCHEDULE.firstDoseWeeks,
    windowDays: RABIES_SCHEDULE.firstWindowDays,
    titerable: false,
    hint: RABIES_SCHEDULE.hint,
    basis: RABIES_SCHEDULE.basis,
    inDefaultPlan: true,
  },
  {
    key: 'rabies-n',
    kind: 'rabies',
    // 狂犬**不编号**（老板 2026-10-10）：不跟"第几次"较劲，一律"每年一次"
    label: '每年一次',
    layer: 'MUST',
    series: 'BOOSTER',
    windowKind: 'GRACE',
    intervalYears: RABIES_SCHEDULE.intervalYears,
    graceDays: RABIES_SCHEDULE.graceDays,
    titerable: false,
    hint: RABIES_SCHEDULE.hint,
    basis: RABIES_SCHEDULE.basis,
    inDefaultPlan: true,
  },
  /* ── 钩端螺旋体（需求 A.2 第八、九、十、十一行）──────────────── */
  {
    key: 'lepto-primary-1',
    kind: 'lepto',
    label: '第 1 针',
    layer: 'SUGGEST',
    series: 'PRIMARY',
    windowKind: 'AGE',
    ageWeeks: LEPTO_SCHEDULE.startWeeks,
    windowWeeks: LEPTO_SCHEDULE.firstWindowWeeks,
    titerable: false,
    hint: LEPTO_SCHEDULE.hint,
    basis: LEPTO_SCHEDULE.basis,
    inDefaultPlan: true,
  },
  {
    key: 'lepto-primary-2',
    kind: 'lepto',
    label: '第 2 针',
    layer: 'SUGGEST',
    series: 'PRIMARY',
    windowKind: 'FLEX',
    minIntervalWeeks: LEPTO_SCHEDULE.intervalWeeksMin,
    maxIntervalWeeks: LEPTO_SCHEDULE.intervalWeeksMax,
    titerable: false,
    hint: LEPTO_SCHEDULE.hint,
    basis: LEPTO_SCHEDULE.basis,
    inDefaultPlan: true,
  },
  {
    key: 'lepto-repeat-n',
    kind: 'lepto',
    label: '每年一次',
    layer: 'SUGGEST',
    series: 'BOOSTER',
    windowKind: 'GRACE',
    intervalYears: LEPTO_SCHEDULE.intervalYears,
    graceDays: LEPTO_SCHEDULE.graceDays,
    titerable: false,
    hint: LEPTO_SCHEDULE.hint,
    basis: LEPTO_SCHEDULE.basis,
    inDefaultPlan: true,
  },
  {
    key: 'lepto-restart-1',
    kind: 'lepto',
    label: '重启免疫 第 1 针',
    layer: 'SUGGEST',
    series: 'PRIMARY',
    // 重启第 1 针的窗口是**从今天起**的固定窗口（需求 A.2 末行），
    // 所以这里用 AGE（起点只由"今天"决定，与上一针无关）
    windowKind: 'AGE',
    ageWeeks: 0,
    windowWeeks: LEPTO_SCHEDULE.restartFirstWindowWeeks,
    titerable: false,
    hint: LEPTO_SCHEDULE.restartHint,
    basis: LEPTO_SCHEDULE.restartBasis,
    inDefaultPlan: true,
  },
  {
    key: 'lepto-restart-2',
    kind: 'lepto',
    label: '重启免疫 第 2 针',
    layer: 'SUGGEST',
    series: 'PRIMARY',
    windowKind: 'FLEX',
    minIntervalWeeks: LEPTO_SCHEDULE.intervalWeeksMin,
    maxIntervalWeeks: LEPTO_SCHEDULE.intervalWeeksMax,
    titerable: false,
    hint: LEPTO_SCHEDULE.restartHint,
    basis: LEPTO_SCHEDULE.restartBasis,
    inDefaultPlan: true,
  },
  /* ── 早期核心疫苗（需求 A.2 末行：我们决定不主动推）────────────── */
  {
    key: 'core-early-1',
    kind: 'core_early',
    label: '早期一针',
    layer: 'MUST',
    series: 'PRIMARY',
    windowKind: 'AGE',
    ageWeeks: CORE_EARLY_SCHEDULE.startWeeks,
    windowWeeks: CORE_EARLY_SCHEDULE.windowWeeks,
    titerable: false,
    hint: CORE_EARLY_SCHEDULE.hint,
    basis: CORE_EARLY_SCHEDULE.basis,
    // ⚠️ 不进默认计划 —— 只有记录里带 core_early 时才认（需求第四节）
    inDefaultPlan: false,
  },
];

/** 按 key 找一行（模板 key；测试与校验用） */
export function findScheduleStep(key: string): ScheduleStepSpec | null {
  return SCHEDULE_STEPS.find((step) => step.key === key) ?? null;
}

// ===========================================================================
// 一句"之后怎么打"（需求 7.3 的第三段：之后的节奏）
// ===========================================================================

/**
 * 每一类的**周期说法**（`rhythm` 那句话由它拼出来）。
 *
 * 需求 7.3："之后的节奏 —— 一句话说清规律，不再逐条排"。
 */
export const KIND_CYCLE_PHRASES: Record<VaccineKind, string> = {
  core: '核心疫苗每 3 年一次',
  rabies: '狂犬每年一次',
  lepto: '钩端每年一次',
  core_early: '早期核心疫苗只有 4 周龄那一针',
  other: '其他疫苗不进计划',
};

/**
 * 抗体检测替代核心之后的周期说法（原型 F 的那一句）。
 *
 * 原型："之后：狂犬与钩端每年一次，核心疫苗每 3 年评估一次"。
 */
export const CORE_TITER_CYCLE_PHRASE = '核心疫苗每 3 年评估一次';

/** 所有项目都被设为"不做"时的那一句（原型 K） */
export const RHYTHM_ALL_IGNORED = '已设为不做的项目，可以在上面那一行点开';
