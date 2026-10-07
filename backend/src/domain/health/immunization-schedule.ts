import {
  findProductsInName,
  productCoversKind,
  recommendProductsForStep,
  resolvePreferredBrand,
} from './vaccine-products';

/**
 * 免疫程序表与疫苗计划推算（2026-10-01，第四期）。
 *
 * ── 老板的四条要求 ────────────────────────────────────────
 *   15. 按免疫程序提醒顾客还需要打哪些、什么时候打
 *   16. 免疫程序首选 WSAVA 指南，其次结合国内法律法规与现状；
 *       **给出建议时要引导顾客自己做决策**，不是替他拍板
 *   17. 顾客自己的计划与我们的建议不一致时，要提醒
 *   18. 提醒形式：小程序内即可
 *
 * ── 三条设计纪律 ──────────────────────────────────────────
 *
 *   ① **只算时间，不猜疫苗名**。顾客填的疫苗名是自由文本（"六联""卫佳伍"
 *      "狂犬"…），靠名字匹配极易出错。这里改成**按时间窗推算**：
 *      从出生日期推出每一步应该在什么时候打，再看有没有记录落在这个窗口里。
 *      唯一需要分类的是"狂犬 vs 其它"，因为国内狂犬是强制免疫、按年接种，
 *      周期与核心疫苗完全不同。
 *
 *   ② **每一步都带依据**。WSAVA 的哪一段、还是国内法规 —— 顾客和审核的人
 *      都要能查到这句话是从哪来的。
 *
 *   ③ **建议≠处方**。这里只产出"建议在第几周到第几周之间接种"，以及
 *      "你的记录与建议不一致"的提示；要不要打、什么时候打，由顾客与兽医决定。
 *      所以下面没有任何"必须""应该立刻"的措辞，只有时间窗与偏差提示。
 */

/**
 * 免疫程序的类别。
 *
 * ⚠️ 2026-10-04 兽医审核后从两类扩成"按疫苗种类单独设置"。
 * 审核意见第 3 条：
 *   "免疫程序表的每 3 年加强没有问题，但是个别疫苗它可能需要每年接种一次，
 *    比如钩端螺旋体。这个我们可能需要分疫苗种类来单独设置。"
 *
 * 之前只有 core / rabies 两类，是因为"疫苗名是自由文本、细分没依据"。
 * 现在细分有了依据 —— 每种疫苗的复种间隔来自**它自己的说明书**，
 * 见下面 `NON_CORE_SCHEDULES`。
 */
export type VaccineKind = 'core_early' | 'core' | 'rabies' | 'lepto' | 'other';

/**
 * ⚠️ 这个类型不是"疫苗名字的分类"，是**接种周期/窗口的分类**（2026-10-05 老板定的）。
 *
 * 老板原话：
 *   "分类不需要犬二联、犬四联、犬六联这种类型的分类，也就是产品名称这个字段。
 *    只需要匹配到它是属于哪一种疫苗？……这里的这个分类，严格来讲是指
 *    接种周期或者接种窗口的分类。……所以这里的分类只是为了知道录入的这个
 *    疫苗产品，它如何参与到疫苗接种计划的。"
 *
 * 所以命名一律按**周期**来，不按联数：
 *   core_early  早期核心疫苗 —— **4 周龄起 1 针**（抢跑一针，之后仍走首免系列）
 *   core        核心疫苗     —— 幼犬 6~8 周起至 ≥16 周（4 针）+ 26 周补强 + **每 3 年**
 *   rabies      狂犬疫苗     —— 12 周起，**每年**
 *   lepto       钩端螺旋体   —— 8 周起 2 针，**每年**
 *   other       其他         —— 我们没有接种程序（犬窝咳、冠状病毒、驱虫药…），只记录
 *
 * ⚠️ `core_early` 是老板 2026-10-05 特意点出来的：
 *   "还有一些特殊的产品，比如说犬瘟细小两种疫苗，接种周期比较早的，
 *    在 4 周龄就可以开始注射的早期疫苗，举例，宠必威的幼犬保。
 *    这些特殊的疫苗，我们也需要进行单独的分类，不然的话，没有办法确认它们的
 *    接种周期，进而就没有办法确认，在疫苗提醒或者疫苗计划中，到底要怎么为它进行排期。"
 *   在此之前它被混在 `core` 里 —— 于是系统拿"6~8 周起"的窗口去套一支 4 周龄的苗，
 *   根本排不了期。
 */

/**
 * 顾客能选的归类（**闭集**，2026-10-05）。
 *
 * 老板拍板："AI 可以扫出名字，并且判断归类……匹配分类这件事情交给 AI 来做"。
 * 但 AI 只能在**这四类**里选 —— 它没法自创类别，只能套用我们维护的映射。
 *
 * 为什么要闭集：以前"不认识就当核心苗"，于是一针**驱虫药「拜宠清」**
 * 只要日期落在窗口里，就会把幼犬首免的某一针标记成已完成 ——
 * 我们从此不再提醒，而且没人看得出来为什么。这是最坏的一类 bug。
 *
 * `other` = 我们没有接种程序的非核心苗（犬窝咳、冠状病毒、莱姆病…）：
 * 如实记下来，但**不参与计划** —— 不会让任何一针"算完成"。
 */
export const VACCINE_KINDS: readonly VaccineKind[] = [
  'core_early',
  'core',
  'rabies',
  'lepto',
  'other',
];

/** 校验一个值是不是我们认的类别（来自 AI 或顾客时都要过这一关） */
export function normalizeVaccineKind(value: unknown): VaccineKind | null {
  const key = String(value || '').trim().toLowerCase();
  return (VACCINE_KINDS as readonly string[]).includes(key)
    ? (key as VaccineKind)
    : null;
}

/** 一步在计划里的状态 */
export type VaccineStepStatus =
  | 'DONE' // 已完成（窗口内有记录）
  | 'DUE' // 现在就该做（处于窗口内且还没记录）
  | 'UPCOMING' // 还没到时间
  | 'OVERDUE' // 已过窗口且没有记录
  | 'SKIPPED'; // 顾客明确选择不做

export type VaccineDecision = 'ACCEPT' | 'DEFER' | 'SKIP';

export interface VaccinePlanStep {
  /** 稳定标识，用于存顾客的决定 */
  key: string;
  kind: VaccineKind;
  /**
   * 种类的中文名（狂犬疫苗 / 核心疫苗 / 早期核心疫苗 / 钩端螺旋体 / 其他）。
   *
   * 2026-10-06 老板要求计划里每一步要显示"疫苗种类" —— 由后端下发，
   * 前端不再自己维护一份映射（这个项目吃过两次"两边各有一套"的亏）。
   */
  kindLabel: string;
  label: string;
  /** 时间窗（ISO 日期 YYYY-MM-DD）；开区间时另一侧为空 */
  windowStart: string;
  windowEnd: string;
  status: VaccineStepStatus;
  /**
   * 状态的**中文说法**，由后端下发（2026-10-07，老板审计第 5 块）。
   *
   * 为什么放后端：这句话的口径跟"每一类只显示下一针"绑在一起 ——
   * 窗口过去的那一针，作为"这一类下一针"时叫「该补了」，
   * 而不是「已逾期」；而"没有证据"时又要软成「还没记录」。
   * 规则只写一处，小程序/医生分享页/以后的提醒都直接用这个字段。
   */
  statusLabel: string;
  /** 窗口内命中的记录（有的话） */
  matchedRecordId: string | null;
  matchedRecordDate: string | null;
  /** 这一步为什么在这个时间 —— 给顾客和审核的人看 */
  basis: string;
  /** 提醒文案（小程序内展示，不用订阅消息） */
  reminder: string;
  /**
   * 这一步所属的**那一类**，有没有任何一条对得上的记录（2026-10-07）。
   *
   * 决定口气软硬：false（这一类一针记录都没有）→ 说"档案里还没有这一针的记录"，
   * 不说"已逾期"。原来是整只狗一把尺，导致"只记过狂犬的狗"钩端那两针
   * 被说成已逾期 —— 老板审计时要求改成按类判断。
   */
  noEvidence: boolean;
  /**
   * 这一步常见的产品（兽医审核意见第 6 条：每个种类最多 3 个）。
   *
   * ⚠️ 措辞是「**常见的有**」，不是「建议打」。
   *    各医院进的货不一样，推荐了顾客也未必买得到；
   *    而且"打哪个商品"已经挨着诊疗，不是我们该拍板的。
   *
   * 只列进口苗 —— 老板 2026-10-04 审核意见第 5 条：
   * "所有国产疫苗都不推荐"。
   */
  commonProducts: string[];
  /**
   * 「这一针别和别的针同一天打」的提醒（2026-10-05）。
   *
   * 只有**窗口跟另一分类的针重叠、而且两边都还没做**时才出现。
   * 空字符串 = 这段时间没有别的针要打，不用提。
   */
  spacingNote: string;
}

/** 顾客与建议不一致的地方 */
export interface VaccinePlanConflict {
  kind: VaccineKind;
  /** 记录本身 */
  recordId: string;
  recordDate: string;
  vaccineName: string;
  /** 为什么不一致 */
  reason: string;
  /** 建议怎么处理（不是命令） */
  suggestion: string;
}

export interface VaccinePlanResult {
  dogId: string;
  birthday: string;
  ageWeeks: number | null;
  steps: VaccinePlanStep[];
  conflicts: VaccinePlanConflict[];
  /** 下一步该做什么 —— 疫苗板块顶部那一行 */
  nextStep: VaccinePlanStep | null;
  summary: {
    done: number;
    due: number;
    overdue: number;
    upcoming: number;
    skipped: number;
  };
  /** 顾客对每一步的决定 */
  decisions: Record<string, VaccineDecision>;
  /**
   * 这只狗**一条接种记录都没有**（2026-10-04）。
   *
   * 界面用它决定口径：没有记录时不说"已逾期"，
   * 只说"档案里还没有这一针的记录" —— 我们没证据说他没打。
   */
  /**
   * 这只狗**一条接种记录都没有**（`records.length === 0`）。
   *
   * 用来决定：要不要显示"档案里还没有接种记录"这张卡，
   * 以及要不要**整块藏掉**计划与"下一步"。
   *
   * ⚠️ 2026-10-04 修正：这里原来算的是 `!hasAnyEvidence`（没有任何一步
   * 被匹配上），但字段名、界面文案、注释说的都是"一条记录都没有"。
   * 后果很具体：顾客只录了一条"钩端螺旋体"（它是非核心苗，程序表里没有
   * 对应步骤），界面就对着他说"档案里还没有接种记录" —— 人家刚录完。
   * 所以拆成两个字段。
   */
  noRecordAtAll: boolean;
  /**
   * 我们**没有任何一条能对上号的证据**（一条记录都没有，或有记录但一条都没匹配上）。
   *
   * 只用来决定**措辞软硬**：为真时不出现"已过期""尽快安排"这种口气。
   * 不用它决定显不显示计划 —— 那件事归 `noRecordAtAll`。
   */
  noEvidence: boolean;
  /** 计划是否有专业审核背书 —— 未审核时顾客侧不展示 */
  reviewed: boolean;
  generatedAt: string;
}

export interface VaccineRecordLike {
  id: string;
  vaccineName: string;
  vaccinationDate: string; // YYYY-MM-DD
  nextDueDate?: string | null;
  /**
   * 这条记录存的归类（2026-10-05）：core / rabies / lepto / other。
   *
   * 顾客选的或 AI 判的，都已在写入时定好。老记录是空数组 ——
   * 那时按名字推一次（`resolveRecordKinds`），行为与以前一致。
   */
  kinds?: string[];
}

/* ===========================================================================
 * 一、免疫程序表
 *
 * 依据：WSAVA 2024 疫苗接种指南（首要）、AAHA 2022 犬免疫指南、
 *       《中华人民共和国动物防疫法》与《狂犬病防治技术规范》。
 * ========================================================================= */

/** 幼犬首免：起始与结束的周龄，以及针次间隔（WSAVA 2024） */
export const CORE_PUPPY_SERIES = {
  /** 6–8 周龄开始 */
  startWeeksMin: 6,
  startWeeksMax: 8,
  /** 每 2–4 周一次 */
  intervalWeeksMin: 2,
  intervalWeeksMax: 4,
  /** 打到 16 周龄或更大 */
  finishWeeksMin: 16,
  /**
   * 26 周龄以上的补强（2026-10-04 改）。
   *
   * 原文（p3 / p14）："Revaccination at or after 26 weeks of age (rather than
   * waiting until 12 to 16 months of age) is advised"；
   * 并明确说这条**取代**了旧的"12~16 月龄第一次加强"。
   * 所以它不是"可选"，而是**推荐做法**；不想打这一针的话，
   * 替代方案是 20 周龄以后做抗体检测。
   */
  boosterWeeks: 26,
  /**
   * 最低接种月龄（2026-10-04 新增，用于判断"接种过早"）。
   *
   * 指南 FAQ（p29）："Should I vaccinate puppies that are less than 4 weeks of age?
   * A. In general, no."；Table 1 另有一支 CPV 重组苗"4 周龄起可打一针"。
   * 所以 **4 周才是红线**，不是 6 周 —— 之前我们把 5 周龄以下都判成"过早"，
   * 会把那支正规的 4 周龄产品误报成错误。
   */
  earliestWeeks: 4,
  basis: 'WSAVA 2024：6–8 周龄起，每 2–4 周一次，直到 16 周龄或更大',
  /** 末针的依据单独写：这一针是全程序里最重要的一针 */
  finalDoseBasis:
    'WSAVA 2024：16 周龄或更大时接种的那一针最重要 —— 此时绝大多数幼犬的母源抗体已消退，' +
    '「finishing no earlier than 16 weeks」',
} as const;

/** 成年加强（WSAVA 2024） */
export const CORE_ADULT_BOOSTER = {
  /**
   * 加强间隔：3 年。
   *
   * ⚠️ 2026-10-04 改动：**去掉了原来的 "首免完成后 1 年做第一次"**。
   *
   * 指南 p14 原文：
   *   "This recommendation … **replaces an earlier recommendation for a
   *    'first annual booster' with core vaccines at 12 to 16 months of age.**"
   * 新的口径是：16 周龄那一针之后，**26 周龄或稍后再补一针**，
   * 然后才是三年一次。我们原来那个"16周 + 1年 ≈ 15.5 月龄"的第一针，
   * 正好就是被取代掉的旧做法。
   */
  repeatYears: 3,
  /** 看多少次加强（够覆盖绝大多数狗的寿命） */
  maxBoosters: 5,
  basis:
    'WSAVA 2024：成年加强三年一次或更少频次；' +
    '16 周龄后的补强在 26 周龄（取代了旧的「12~16 月龄第一次加强」）',
} as const;

/**
 * 非核心苗：按疫苗种类单独设置（2026-10-04，兽医审核意见第 3 条）。
 *
 * ── 为什么非核心苗要"有记录才出现" ──────────────────────────
 *
 * WSAVA 把疫苗分成核心与非核心，非核心苗（钩端螺旋体、犬副流感、
 * 博德特氏菌…）**要结合每只狗的生活方式与当地疫情逐只评估**，
 * 不是默认全打 —— 我们自己已审核的知识条目 `immune-001` 就是这么写的。
 * 所以这些步骤**不能默认推给每一只狗**，否则跟已审核的内容自相矛盾。
 *
 * 做法：**这只狗已经有这类苗的记录时，才把它纳入计划**
 * （说明它和它的兽医已经决定要打这一类），之后按年提醒。
 * 没打过的不出现 —— 要不要开始，是它和兽医的事，不是我们该推的。
 *
 * ── 每一类的参数从哪来 ────────────────────────────────────
 *   `basis` 必须写清是哪支产品的说明书，顾客和复鞫的人都要能查到。
 */
export const NON_CORE_SCHEDULES = {
  /**
   * 早期核心疫苗（2026-10-05 新增，老板特意点出来的那一类）。
   *
   * 为什么必须单独一类：它跟普通核心苗**周期完全不一样** ——
   * 普通核心苗 6~8 周起、连打 4 针；这一支 **4 周龄就能打**，
   * 1 针，之后**仍然要**从 6~8 周开始走正常首免（它不是首免的替代）。
   *
   * 依据：WSAVA 2024 Table 1（p12）——
   *   "Canine parvovirus-2 (recombinant) + canine distemper virus (MLV):
   *    Administer a single dose **from 4 weeks of age** before commencing
   *    routine primary vaccinations"
   * 产品说明书：宠必威幼犬保「建议 4~6 周龄基础接种」。
   *
   * 混在 core 里的后果（改之前就是这样）：系统拿"6~8 周起"去套一支
   * 4 周龄的苗，窗口对不上 —— **这一针根本排不进计划**。
   */
  core_early: {
    label: '早期核心疫苗',
    /** 认哪些写法：明确的病名组合，或我们核过成分的商品名 */
    namePattern: /幼犬保|早期苗|抢跑/i,
    startWeeksMin: 4,
    /** 只打 1 针 */
    doses: 1,
    intervalWeeksMin: 0,
    intervalWeeksMax: 2,
    /**
     * ⚠️ 0 = **不按周期重复**。
     *
     * 它不是"每年一次"也不是"每 3 年一次"——它是首免前的一针抢跑，
     * 打完就交棒给正常首免（core 那一类）。
     * 所以 maxRepeats 也是 0：只出现一次，不排后续。
     */
    repeatYears: 0,
    maxRepeats: 0,
    basis:
      'WSAVA 2024 Table 1：CPV 重组 + CDV 弱毒苗可在 4 周龄起接种 1 针，' +
      '之后仍要从 6~8 周开始走常规首免；产品说明书（宠必威幼犬保）建议 4~6 周龄基础接种',
  },
  lepto: {
    label: '钩端螺旋体',
    /**
     * 认哪些写法。
     *
     * ⚠️ 故意**不含"犬八联"**：这个叫法各家含义不一样，
     * 国产苗与进口苗防的病并不相同，拿它当"含钩端"会误判。
     * 只认明确的病名，以及我们**核过成分、确定含钩端**的商品名。
     */
    namePattern: /钩端螺旋体|钩端|lepto|卫佳捌|优乐康|乐必妥/i,
    /** 说明书：幼犬首免应在 8 周龄后 */
    startWeeksMin: 8,
    /** 说明书：间隔 2~4 周第二次 */
    intervalWeeksMin: 2,
    intervalWeeksMax: 4,
    /** 说明书：共 2 针 */
    doses: 2,
    /** 说明书：以后每年 1 次 */
    repeatYears: 1,
    maxRepeats: 12,
    basis:
      '中国大陆属钩端螺旋体常见地区；WSAVA 2024 对高风险地区（接触积水、' +
      '牲畜或鼠类）强烈建议接种。宠必威乐必妥（犬钩端螺旋体病二价灭活疫苗）' +
      '说明书：幼犬首免应在 8 周龄后，间隔 2~4 周第二次，以后每年 1 次。' +
      '是否接种、何时接种，请以执业兽医的意见为准。',
  },
} as const;

export type NonCoreKind = keyof typeof NON_CORE_SCHEDULES;

/**
 * 不同分类的疫苗**不要同一天打**（2026-10-05 老板的第二条规则）。
 *
 * 老板原话："不同分类的疫苗不可以在同一天接种，尽量避开 2~3 天。
 * 比如狂犬疫苗、核心疫苗和钩端螺旋体要分开打。"
 *
 * ⚠️ 说明出处：这是**我们自己定的接种间隔规则**，比 WSAVA 更保守 ——
 *    指南只要求"不同疫苗不要混在同一支注射器里"，
 *    并没有规定必须隔几天。所以文案里不写"指南要求"，
 *    只写"我们建议错开"，免得专业人士一眼看出引用不实。
 */
export const VACCINE_SPACING = {
  /** 最少隔几天 */
  minGapDays: 2,
  /** 建议隔几天 */
  recommendedGapDays: 3,
} as const;

/** 狂犬病（国内） */
export const RABIES_SCHEDULE = {
  /**
   * 首针默认月龄：12 周。
   *
   * ⚠️ 这个数字的来源要说清楚（2026-10-04 查证）：
   *   · **不是 WSAVA 的规定** —— Table 1（p12）狂犬那一行三列写的都是
   *     "Follow any local laws or regulations as a priority. Follow the product
   *      leaflets of locally manufactured vaccines."，
   *     "In some countries, the first dose is generally not given before 12 weeks"
   *     是**描述**，不是推荐；
   *   · **也不是中国法规的规定** ——《狂犬病防治技术规范》5.1 只写
   *     "对所有犬实行强制性免疫，每年一次"，没有首针月龄；
   *   · 所以 12 周大概率来自**国内狂犬疫苗说明书**（多数国产苗写 3 月龄以上）。
   * 保持 12 周作为默认起点是合理的，但**依据必须如实写成"常见做法，
   * 以疫苗说明书与当地规定为准"**，不能写成指南要求。
   */
  firstDoseWeeksMin: 12,
  /** 之后每年一次（国内法规口径） */
  repeatYears: 1,
  maxDoses: 12,
  basis:
    '国内狂犬属强制免疫病种，每年一次（《狂犬病防治技术规范》5.1）；' +
    '首针月龄以所用疫苗的说明书与当地规定为准，这里默认按 12 周龄起',
} as const;

/**
 * 疫苗名分类：只区分"狂犬"与"其它"。
 *
 * 为什么只分两类：疫苗名是自由文本，细分成"六联/八联/卫佳"没有可靠依据；
 * 而狂犬在国内是强制免疫、按年接种，周期与核心疫苗完全不同，必须分开。
 *
 * ⚠️ 已知局限（2026-10-04 查产品清单时发现，**待产品清单审核后修**）：
 *
 * 现在**所有非狂犬苗都归为 core**，于是"一针单独的钩端螺旋体疫苗"
 * （宠必威乐必妥就是单苗）只要落在首免窗口里，就会被算成**完成了一针核心苗**。
 * 两种情形会出错：
 *   · 单苗（钩端螺旋体、犬窝咳、冠状病毒）被当成核心联苗；
 *   · 卫佳捌那种"核心 + 钩端 + 冠状"的组合苗，反而没法表达它多防了什么。
 *
 * 不能靠加关键词解决 —— 正确做法是给每个产品存一份"**防哪些病**"，
 * 也就是 `docs/plans/2026-10-04-vaccine-product-list-review.md` 那份清单的用途之一。
 * 那份清单经兽医审核后，这里改成按**抗原清单**匹配，而不是按名字。
 */
export function classifyVaccineName(name: string): VaccineKind {
  // 保留旧签名：返回"最主要的那一类"。
  // ⚠️ 认不出来时返回 **'other'**，不再冒充 'core'（2026-10-05）——
  //    理由见 classifyVaccineKinds 第 ③ 步。
  const kinds = classifyVaccineKinds(name);
  if (kinds.includes('core')) return 'core';
  return kinds[0] ?? 'other';
}

/**
 * 一条记录能算作哪几类（2026-10-04）。
 *
 * 必须返回数组：**一支组合苗可以同时顶好几个种类**。
 * 典型是硕腾卫佳捌 —— 它既是核心苗（犬瘟热+腺病毒+副流感+细小），
 * 又含钩端螺旋体；顾客打了它，核心苗那一步和钩端螺旋体那一步都该算完成。
 *
 * 以前的写法是"不是狂犬就算核心"，于是**一针单独的钩端螺旋体疫苗
 * 会被算成完成了一针核心苗** —— 那是错的，而且会让计划少算一针。
 */
export function classifyVaccineKinds(name: string): VaccineKind[] {
  const text = String(name || '').toLowerCase();
  const kinds = new Set<VaccineKind>();

  // ① 已审核的产品目录里查得到的，按**它真实的成分**算。
  //    这一步才能正确处理组合苗 —— 卫佳捌既是核心苗、又含钩端螺旋体，
  //    顾客打了它，核心苗那一步和钩端那一步都该算完成。
  for (const product of findProductsInName(text)) {
    for (const kind of product.kinds) {
      kinds.add(kind);
    }
  }

  // ② 目录里没有的（顾客手写"六联""犬瘟热"这类自由文本），退回按病名/联数判。
  if (/狂犬|rabies/.test(text)) {
    kinds.add('rabies');
  }
  for (const [kind, config] of Object.entries(NON_CORE_SCHEDULES)) {
    if (config.namePattern.test(text)) {
      kinds.add(kind as VaccineKind);
    }
  }

  // 核心苗的常见写法：联数（"四联""八联"）与病名。
  // 少了这一步，"六联"会掉成"未归类"—— 那是把好好的记录挡在计划外面。
  //
  // ⚠️ 但**早期核心疫苗不算 core**（2026-10-05）：它是 4 周龄那一针抢跑，
  //    周期跟核心苗完全不同（1 针交棒，不是 4 针 + 三年一次）。
  //    已经在 core_early 里的，不许再补一个 core。
  if (CORE_NAME_PATTERN.test(text) && !kinds.has('core_early')) {
    kinds.add('core');
  }

  // 非核心、而且我们**没有**接种程序的（犬窝咳、冠状病毒、莱姆病…）→ other。
  // 如实记下来，但**不参与计划** —— 绝不能让它们把核心苗的某一针"算完成"。
  if (OTHER_NAME_PATTERN.test(text)) {
    kinds.add('other');
  }

  // ③ **不再兜底猜"核心苗"**（2026-10-05）。
  //
  //    以前这里是"什么都没认出来就当核心苗"，后果很严重：
  //    一针驱虫药「拜宠清」、一支非核心的「犬窝咳」，
  //    只要日期落在某个窗口里，就会把那一针标记成**已完成** ——
  //    我们从此不再提醒顾客打疫苗，而且没人看得出来为什么。
  //
  //    返回空数组 = **未归类**。调用方（计划）对未归类的记录一律不匹配任何步骤，
  //    界面上也会要求顾客自己指定归类。宁可空着，也不猜。
  return [...kinds];
}

/**
 * 一条记录最终算哪几类（2026-10-05）。
 *
 * 优先用**记录自己存的**（顾客手选 / AI 判的，都是明确指定过的）；
 * 老记录没存过才退回按名字推 —— 那是历史数据的兼容路径，不是主路径。
 */
export function resolveRecordKinds(record: {
  kinds?: unknown;
  vaccineName?: string;
}): VaccineKind[] {
  const stored = Array.isArray(record?.kinds)
    ? record.kinds
        .map((item) => normalizeVaccineKind(item))
        .filter((item): item is VaccineKind => item !== null)
    : [];

  if (stored.length > 0) {
    return stored;
  }

  return classifyVaccineKinds(String(record?.vaccineName || ''));
}

/* ===========================================================================
 * 二、日期工具（纯函数，便于单测）
 * ========================================================================= */

const DAY_MS = 86400000;

export function toDateText(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateText(value: string | null | undefined): Date | null {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function addYears(date: Date, years: number): Date {
  const next = new Date(date.getTime());
  next.setFullYear(next.getFullYear() + years);
  return next;
}

/** 两个日期之间相差几周（向下取整） */
export function weeksBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (7 * DAY_MS));
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function earlierOf(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/* ===========================================================================
 * 三、计划推算
 * ========================================================================= */

/**
 * 免疫程序表里的一步（**未过滤**的完整程序）。
 *
 * 与 VaccinePlanStep 的区别：这里不管"今天几号、有没有打过"，
 * 只回答"按程序，这只狗应该在第几周到第几周接种"。
 * 营养师审核、以及"看一眼整套程序"时用它。
 */
export interface ImmunizationScheduleItem {
  key: string;
  kind: VaccineKind;
  label: string;
  windowStart: Date;
  windowEnd: Date;
  basis: string;
}

type StepSeed = ImmunizationScheduleItem;

/**
 * 从出生日期推出所有该做的步骤（不管有没有记录）。
 *
 * 幼犬程序与成年程序是两套：
 *   · 还没到 16 周龄 → 走首免程序
 *   · 已经过了首免 → 走成年加强程序
 * 中间的狗（首免没做完就已经长大）会同时拿到"补完首免"与后续步骤，
 * 由时间窗自然处理，不特殊分支。
 */
export function buildImmunizationSchedule(
  birthday: Date,
  /**
   * 这次要排哪几类。
   *
   * 默认 = `DEFAULT_PLAN_KINDS` = **核心 + 狂犬 + 钩端螺旋体**。
   *
   * ⚠️ 这里原来写的是"默认只排 core + rabies"，2026-10-07 老板审计时
   *    发现说明和行为不一致（钩端确实默认排）。**行为是有意为之**：
   *    老板当时的原话是大陆很常见、"强烈建议将其纳入"，
   *    所以钩端默认排给每只狗、让家长拿去和兽医讨论 —— 见
   *    `DEFAULT_PLAN_KINDS` 上面那段注释。其余非核心苗（犬窝咳、冠状…）
   *    仍然是"这只狗有记录才加"。
   *
   * 营养师看整套程序表时把 `ALL_VACCINE_KINDS` 传进来。
   */
  options: { kinds?: readonly VaccineKind[] } = {},
): ImmunizationScheduleItem[] {
  const kinds = options.kinds ?? DEFAULT_PLAN_KINDS;
  const seeds: StepSeed[] = [];

  const wantsCore = kinds.includes('core')
  const wantsRabies = kinds.includes('rabies')

  // ── 幼犬首免：从 startWeeksMin 起，按最大间隔排，直到 finishWeeksMin ──
  if (wantsCore) {
  const firstStart = addWeeks(birthday, CORE_PUPPY_SERIES.startWeeksMin);
  const firstEnd = addWeeks(birthday, CORE_PUPPY_SERIES.startWeeksMax);
  const finish = addWeeks(birthday, CORE_PUPPY_SERIES.finishWeeksMin);

  let doseIndex = 0;
  let cursor = firstStart;
  // 先排到 16 周龄之前的那几针
  while (cursor.getTime() < finish.getTime() && doseIndex < 8) {
    const windowEnd = laterOf(
      earlierOf(addWeeks(cursor, CORE_PUPPY_SERIES.intervalWeeksMax), finish),
      cursor,
    );
    seeds.push({
      key: `core-puppy-${doseIndex + 1}`,
      kind: 'core',
      label: `幼犬首免 第 ${doseIndex + 1} 针`,
      windowStart: cursor,
      windowEnd,
      basis: CORE_PUPPY_SERIES.basis,
    });
    cursor = addWeeks(cursor, CORE_PUPPY_SERIES.intervalWeeksMax);
    doseIndex += 1;
  }

  // ── 关键：必须再有一针落在 16 周龄及以后（2026-10-04 修）────────
  //
  // 改造前是 "打到 16 周就停"，于是从 6 周龄起排出来的是 6/10/14 三针，
  // **最后一针的窗口是 14~16 周** —— 一只 14 周龄接种的幼犬会被判"首免完成"。
  // 而指南反复强调的恰恰是这一针：
  //   p11 "The most important of these early vaccine doses is the one
  //        administered at 16 weeks of age or older."
  //   p14 "continues to recommend finishing no earlier than 16 weeks."
  //
  // 所以这里**强制补一针**，窗口起点不早于 16 周龄。
  // 从 6 周起排出来是 6/10/14/18（4 针）；从 8 周起是 8/12/16（3 针）。
  const finalStart = laterOf(cursor, finish);
  seeds.push({
    key: `core-puppy-${doseIndex + 1}`,
    kind: 'core',
    label: `幼犬首免 第 ${doseIndex + 1} 针`,
    windowStart: finalStart,
    windowEnd: addWeeks(finalStart, CORE_PUPPY_SERIES.intervalWeeksMax),
    basis: CORE_PUPPY_SERIES.finalDoseBasis,
  });
  doseIndex += 1;

  // 第一针的窗口其实从 6 到 8 周都行，把它放宽（上面用的是最紧的排法）
  if (seeds.length > 0) {
    seeds[0].windowEnd = laterOf(seeds[0].windowEnd, firstEnd);
  }

  // ── 26 周龄以上的补强（WSAVA 2024 推荐，不是"可选"）──────────
  //
  // 指南 p14：这条**取代**了旧的"12~16 月龄第一次加强"。
  // 不想打这一针的话，替代方案是 20 周龄以后做抗体检测。
  const booster26w = addWeeks(birthday, CORE_PUPPY_SERIES.boosterWeeks);
  seeds.push({
    key: 'core-26w',
    kind: 'core',
    label: '首免后补强（26 周龄）',
    windowStart: booster26w,
    windowEnd: addWeeks(booster26w, 4),
    basis:
      'WSAVA 2024：26 周龄或稍后再补一针核心疫苗（而不是等到 12~16 月龄）；' +
      '若已在 20 周龄后做过抗体检测且显示有保护，则不需要这一针',
  });

  // ── 成年加强：从 26 周龄那一针之后 3 年开始，之后每 3 年 ──
  let booster = addYears(booster26w, CORE_ADULT_BOOSTER.repeatYears);
  for (let index = 0; index < CORE_ADULT_BOOSTER.maxBoosters; index += 1) {
    seeds.push({
      key: `core-adult-${index + 1}`,
      kind: 'core',
      label:
        index === 0 ? '成年加强 第 1 次' : `成年加强 第 ${index + 1} 次`,
      /*
       * 窗口从**目标日当天**开始（2026-10-07 老板审计时定，原来是 −30 天）。
       *
       * 与狂犬对齐：每年一次的那类从周年当天起算，3 年一次的也从周年当天起算。
       * 早于 3 年就打是"比指南更频"，不该由我们把窗口提前一个月去邀请。
       */
      windowStart: booster,
      windowEnd: addDays(booster, 90),
      basis: CORE_ADULT_BOOSTER.basis,
    });
    booster = addYears(booster, CORE_ADULT_BOOSTER.repeatYears);
  }
  } // wantsCore

  // ── 非核心苗：按疫苗种类各自排（2026-10-04，兽医审核意见第 3 条）──
  //
  // 每一类的参数来自**它自己的说明书**（见 NON_CORE_SCHEDULES），
  // 所以间隔可以是每年，而不是核心苗的每 3 年。
  for (const kind of kinds) {
    if (kind === 'core' || kind === 'rabies') continue
    const config = NON_CORE_SCHEDULES[kind as NonCoreKind]
    if (!config) continue
    seeds.push(...buildNonCoreSeeds(birthday, kind, config))
  }

  // ── 狂犬：首针 12 周龄起，之后每年一次 ──
  if (wantsRabies) {
  let rabies = addWeeks(birthday, RABIES_SCHEDULE.firstDoseWeeksMin);
  for (let index = 0; index < RABIES_SCHEDULE.maxDoses; index += 1) {
    seeds.push({
      key: `rabies-${index + 1}`,
      kind: 'rabies',
      label: index === 0 ? '狂犬疫苗 首针' : `狂犬疫苗 第 ${index + 1} 次`,
      // 首针**不往前放宽**（2026-10-04 修）：
      // 之前所有年接种窗口统一 -30 天，把首针窗口拉到了 12周−30天 ≈ 7.7 周龄，
      // 于是"8 周龄打狂犬"也会被判成已完成 —— 而 12 周是说明书上的最低月龄，
      // 往下放宽没有任何依据。
      //
      // ⚠️ 每年的针也**不再提前 30 天**（2026-10-07 老板审计时定）：
      // 窗口的起点就是"上一次的周年当天"。理由是口径必须自洽 ——
      // 一边把窗口提前一个月邀请顾客来打，一边又在他真打了之后提示
      // "狂犬间隔不足一年，与国内年免口径不符"，等于自己打自己。
      // 顺延之后也一样：上一针打在几号，下一次的窗口就从明年那一号开始。
      windowStart: rabies,
      windowEnd: addDays(rabies, 90),
      basis: RABIES_SCHEDULE.basis,
    });
    rabies = addYears(rabies, RABIES_SCHEDULE.repeatYears);
  }
  } // wantsRabies

  // 按窗口起点排序：顾客看到的顺序应该是时间顺序，
  // 而加了非核心苗之后，各类是分段 push 的，顺序会乱。
  return seeds.sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());
}

/**
 * 类别的中文名（2026-10-05）。
 *
 * 界面要显示"这条记录算哪一类"，所以放在 domain 里跟分类逻辑挨着，
 * 避免前端各写一份、迟早对不上。
 */
export const VACCINE_KIND_LABELS: Record<VaccineKind, string> = {
  core_early: '早期核心疫苗',
  core: '核心疫苗',
  rabies: '狂犬疫苗',
  lepto: '钩端螺旋体',
  other: '其他',
};

/**
 * 分类 → 接种周期/窗口（2026-10-05）。
 *
 * 老板："第三一个要确认每一个分类是否有明确的接种周期或者是接种窗口。"
 * 这就是那张表 —— **每一类在这里必须能读出"怎么排期"**，
 * 读不出来就说明这一类不该存在。
 *
 * 说明文字给顾客看，所以用大白话；具体窗口由各自的 SCHEDULE 常量算。
 */
export const VACCINE_KIND_CYCLE_NOTES: Record<VaccineKind, string> = {
  core_early:
    '4 周龄起可以打一针「抢跑」的早期苗；打完仍然要从 6~8 周开始走正常首免。',
  core: '幼犬 6~8 周起、每 2~4 周一次，最后一针不早于 16 周龄；26 周龄再补一针；之后每 3 年一次。',
  rabies: '12 周龄起首针，之后每年一次（国内强制免疫）。',
  lepto: '8 周龄起首免 2 针、间隔 2~4 周，之后每年一次。',
  other: '我们没有这一类的接种程序，只如实记录，不参与提醒。',
};

/**
 * 核心苗的常见写法（联数 + 病名）。
 *
 * 必须有这一步：产品目录只收进口苗，顾客写"六联""犬热"是常态；
 * 少了它这些记录会掉成"未归类"，被挡在计划外面。
 */
/**
 * 自由文本里能看出"这是核心苗"的写法（2026-10-06 按 WSAVA 2024 修正）。
 *
 * ⚠️ **副流感已经从这条里删掉了**。老板指出并核实过：
 *    WSAVA 2024 的口径是 —— 犬的核心疫苗只有三支：
 *    **犬瘟病毒、腺病毒、细小病毒**；**副流感属于非核心**
 *    （与博德特氏菌一起归在"犬窝咳"那一类，按生活方式逐只评估）。
 *    来源：WSAVA 2024 guidelines（Squires et al., JSAP 65(5):277–316），
 *    见 RSPCA 知识库对该指南的转述。
 *
 *    以前把副流感算核心，会让一支"副流感单苗"顶掉核心苗的某一针 ——
 *    和当年把驱虫药当核心苗是同一类错误（我们从此不再提醒那一针）。
 *
 * "联数"（二联…九联）仍然算核心：联苗按惯例都覆盖那三种核心病。
 */
const CORE_NAME_PATTERN =
  /犬瘟|细小|腺病毒|传染性肝炎|distemper|parvo|adenovirus|[二三四五六七八九]联/i;

/**
 * 非核心、而且我们**没有**接种程序的（2026-10-05）。
 *
 * 这些以前会被当成"核心苗"，从而能顶掉核心苗的某一针 —— 是错的。
 * WSAVA 里它们都属于"按生活方式逐只评估"的非核心苗。
 * 记下来是对的，影响计划是不对的。
 */
const OTHER_NAME_PATTERN =
  /犬窝咳|窝咳|冠状病毒|莱姆|博德特|支气管败血|副流感|parainfluenza|bordetella|kennel\s*cough/i;

/**
 * 顾客侧默认排哪几类。
 *
 * ⚠️ 2026-10-06 老板定：**钩端螺旋体也进默认计划**。
 *
 * 老板原话："钩端螺旋体为什么是有记录才排呢？钩端螺旋体虽然不在核心疫苗内，
 * 但是在中国大陆还是非常常见。好像也是，强烈建议将其纳入到接种疫苗类的吧。"
 *
 * 依据核对过：WSAVA 2024 对**高风险地区**是"强烈建议"
 * （接触积水、牲畜或鼠类）；中国大陆多属常见地区，所以对顾客默认排出来、
 * 让家长拿去和兽医讨论，比"等他自己录过才提醒"更有用。
 *
 * 仍然**只是建议**：这一步的措辞是"建议时间"+"依据"，不是命令；
 * 打不打、什么时候打，以执业兽医的意见为准（老板一贯的口径）。
 *
 * 其余非核心苗（犬窝咳、冠状…）仍保持"有记录才加" ——
 * 要不要开始打那一类，是家长和兽医的事，不是我们该主动推的。
 */
export const DEFAULT_PLAN_KINDS: readonly VaccineKind[] = [
  'core',
  'rabies',
  'lepto',
];

/** 全部类别 —— 营养师看整套程序表时用 */
export const ALL_VACCINE_KINDS: readonly VaccineKind[] = [
  'core',
  'rabies',
  ...(Object.keys(NON_CORE_SCHEDULES) as NonCoreKind[]),
];

/**
 * 排某一类非核心苗的步骤。
 *
 * 跟核心苗不一样的地方：**间隔来自这一类的说明书**，不是核心苗那套
 * "首免到 16 周 + 三年一次"。钩端螺旋体是首免 2 针、之后每年 1 次。
 */
function buildNonCoreSeeds(
  birthday: Date,
  kind: VaccineKind,
  config: (typeof NON_CORE_SCHEDULES)[NonCoreKind],
): StepSeed[] {
  const seeds: StepSeed[] = [];
  const windowTailDays = 30;

  // 首免几针
  let cursor = addWeeks(birthday, config.startWeeksMin);
  for (let index = 0; index < config.doses; index += 1) {
    seeds.push({
      key: `${kind}-primary-${index + 1}`,
      kind,
      label:
        config.doses > 1
          ? `${config.label} 第 ${index + 1} 针`
          : config.label,
      windowStart: cursor,
      windowEnd: addWeeks(cursor, config.intervalWeeksMax),
      basis: config.basis,
    });
    cursor = addWeeks(cursor, config.intervalWeeksMax);
  }

  // 之后按这一类的复种间隔重复（钩端螺旋体：每年 1 次）。
  // repeatYears = 0 表示**这一类不按周期重复**（早期核心疫苗就是这样：
  // 它是首免前的一针抢跑，打完交棒给 core，不该再排后续）。
  if (config.repeatYears <= 0 || config.maxRepeats <= 0) {
    return seeds;
  }

  let repeat = addYears(cursor, config.repeatYears);
  for (let index = 0; index < config.maxRepeats; index += 1) {
    seeds.push({
      key: `${kind}-repeat-${index + 1}`,
      kind,
      label: `${config.label} 每年 1 次（第 ${index + 1} 次）`,
      /*
       * 每年一次的窗口：起点就是**上一次的周年当天**（2026-10-07 老板审计时定）。
       *
       * 原来是提前 30 天（windowTailDays）—— 那会一边提前一个月邀请顾客来打，
       * 一边在他真打了之后提示"间隔不足一年，与国内年免口径不符"，
       * 两个口径自己打自己。狂犬那边同一时间也改成了周年起算。
       */
      windowStart: repeat,
      windowEnd: addDays(repeat, 90),
      basis: config.basis,
    });
    repeat = addYears(repeat, config.repeatYears);
  }

  return seeds;
}

/**
 * 这条记录**顶不顶得上**这一类（2026-10-05）。
 *
 * 产品库里有这支苗 → 用它核过的成分判（`productCoversKind`）。
 * 库里没有的（顾客手写"犬四联"这种）→ 按写法判：
 *   · 核心：要写得出**四种都防**的迹象（四联及以上的联数）
 *     —— 这正是不让"犬二联"顶核心首免的地方。
 *   · 早期核心：二联/幼犬保这类"防犬瘟+细小"的
 *   · 狂犬 / 钩端：写出病名即可
 */
export function recordCoversStep(vaccineName: string, kind: VaccineKind): boolean {
  const text = String(vaccineName || '').toLowerCase();

  const products = findProductsInName(text);
  if (products.length > 0) {
    return products.some((product) => productCoversKind(product, kind));
  }

  // 产品库里没有的手写写法，按字面判
  if (kind === 'rabies') return /狂犬|rabies/.test(text);
  if (kind === 'lepto') return /钩端|lepto/i.test(text);
  if (kind === 'core') {
    /*
     * 「四联」及以上，或者三种核心病名写全了 —— 才算顶得上核心首免。
     *
     * ⚠️ 2026-10-06 修正：这里原来要求**四种**病名（含副流感）。
     *    但按 WSAVA 2024，犬的核心疫苗只有三支 —— **犬瘟、腺病毒、细小**；
     *    副流感属非核心。所以"病名写全"的判据改成这三种。
     *    （联数那条仍然保守地要求四联及以上：只写"犬三联"的手写记录
     *      我们不知道它第三联是腺病毒还是副流感，宁可多提醒一次，
     *      也不要把核心首免误判成已完成。）
     */
    return (
      /[四五六七八九]联/.test(text) ||
      (/犬瘟|distemper/.test(text) &&
        /细小|parvo/.test(text) &&
        /腺病毒|传染性肝炎/.test(text))
    );
  }
  if (kind === 'core_early') {
    return (
      /幼犬保|早期苗|抢跑/.test(text) ||
      (/犬瘟|distemper/.test(text) && /细小|parvo/.test(text))
    );
  }
  return true;
}

/** 这一步的时间窗里有没有对应类型的记录 */
function findMatchingRecord(
  seed: StepSeed,
  records: { record: VaccineRecordLike; kinds: VaccineKind[]; date: Date }[],
): { record: VaccineRecordLike; date: Date } | null {
  const inWindow = records.filter(
    (item) =>
      // 一支组合苗能顶好几类，所以看的是"包含"而不是"等于"
      item.kinds.includes(seed.kind) &&
      // ⚠️ 光"归到这一类"还不够，还得**顶得上**（2026-10-05）：
      //    卫佳细、犬二联都归"核心疫苗"，但一个只防细小、一个只防两种，
      //    顶不上要求防四种病的核心首免。顶不上就继续提醒 ——
      //    多提醒无害，漏提醒有害。
      recordCoversStep(item.record.vaccineName, seed.kind) &&
      item.date.getTime() >= seed.windowStart.getTime() &&
      item.date.getTime() <= seed.windowEnd.getTime(),
  );
  if (inWindow.length === 0) {
    return null;
  }
  // 窗口里有多条时取最早的一条（那一条就是"这一步"完成的证据）
  return inWindow.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
}

function resolveStatus(
  seed: StepSeed,
  matched: boolean,
  decision: VaccineDecision | undefined,
  today: Date,
): VaccineStepStatus {
  /*
   * ⚠️ 顺序很讲究（2026-10-07 老板审计第 5 块确认）：
   * **"真的打了"优先于"点过不做"**。
   *
   * 原来 SKIP 排在最前面，于是出现过这种别扭结果：顾客先点了"不做"，
   * 后来其实带狗去打了那一针（记录确实顶上了这一步），
   * 计划里却仍然写着「不做」。打了针是事实，不做只是当时的意图 —— 事实优先。
   */
  if (matched) {
    return 'DONE';
  }
  if (decision === 'SKIP') {
    return 'SKIPPED';
  }
  if (today.getTime() < seed.windowStart.getTime()) {
    return 'UPCOMING';
  }
  if (today.getTime() <= seed.windowEnd.getTime()) {
    return 'DUE';
  }
  return 'OVERDUE';
}

/**
 * 提醒文案。
 *
 * `noEvidence` = 我们手上**没有任何一条能对上号的证据**
 * （一条记录都没有，或者有记录但一条都没匹配上程序里的步骤）。
 *
 * 这是 2026-10-04 老板定的口径：「没有记录，我们不去说已过期」。
 * 原因很实在：家长明明每年都带狗去打，只是没在小程序里记，
 * 打开却看到一串"已经过了建议时间，建议尽快安排"——
 * 第一反应是"我是不是漏打了"，第二反应是"这系统不准"。
 *
 * 我们**没有证据**说他没打，就不该用"逾期"这种口气。
 *
 * ⚠️ 2026-10-04 改：这个参数原来叫 `noRecordAtAll`，但传进来的是
 * "没有一条匹配上" —— 跟字段名说的"一条记录都没有"是两回事。
 * 见 `noRecordAtAll` / `noEvidence` 两个字段的注释。
 *
 * ⚠️ 2026-10-07 又改一次（老板审计时发现）：**判断按类，不按整只狗**。
 *    改之前是整只狗一把尺：一只只记过狂犬的狗，钩端两针会说"已逾期"；
 *    而一只什么记录都没有的狗，同样两针却说"还没记录" —— 同一件事两种口气。
 *    现在：**这一类一针记录都没有 → 这一类一律说"还没记录"**。
 */
function buildReminder(
  status: VaccineStepStatus,
  label: string,
  noEvidence = false,
): string {
  if (noEvidence && (status === 'DUE' || status === 'OVERDUE')) {
    return `${label}：档案里还没有这一针的记录`;
  }

  switch (status) {
    case 'DUE':
      return `${label}：现在正是接种时间`;
    case 'OVERDUE':
      return `${label}：已经过了建议时间，建议尽快安排`;
    case 'UPCOMING':
      return `${label}：还没到时间`;
    case 'DONE':
      return `${label}：已完成`;
    default:
      return `${label}：已选择不做`;
  }
}

/**
 * 状态的中文说法（2026-10-07 老板审计第 5 块定）。
 *
 *   · 已完成 / 待安排 / 该打了 —— 好理解，不解释
 *   · **窗口过去的**：作为"这一类的下一针"显示时叫「**该补了**」，
 *     不再叫「已逾期」—— 老板的原话是"已经逾期的，我们不显示出来，
 *     也不告诉用户就可以了……我们只需要告诉用户接下来该打什么"。
 *     但那一针本身还是要出现（每一类都得有"下一步"），只是口气改成"该补上"。
 *   · 没有证据时（这一类一条记录都没有、也不是"起针"）→ 「还没记录」，
 *     那是给"家长明明打过、只是没记"用的，不指责。
 */
function resolveStatusLabel(
  status: VaccineStepStatus,
  noEvidence: boolean,
  isKindStart: boolean,
): string {
  switch (status) {
    case 'DONE':
      return '已完成';
    case 'SKIPPED':
      return '不做';
    case 'UPCOMING':
      return '待安排';
    case 'DUE':
      return isKindStart || !noEvidence ? '该打了' : '还没记录';
    default:
      return noEvidence ? '还没记录' : '该补了';
  }
}

/**
 * 找出"顾客记录与建议不一致"的地方。
 *
 * 老板第 17 条要的就是这个。这里只报**能确定的偏差**，不猜测：
 *   · 接种时间明显早于建议窗口 → 可能被母源抗体干扰（幼犬尤其）
 *   · 狂犬间隔不足一年 → 与国内年免口径不符
 *   · 填了"下次到期日"但与建议窗口差得远 → 顾客可能按别的程序在走
 */
export function detectConflicts(
  records: VaccineRecordLike[],
  seeds: StepSeed[],
  today: Date,
): VaccinePlanConflict[] {
  const conflicts: VaccinePlanConflict[] = [];
  const parsed = records
    .map((record) => ({
      record,
      kinds: resolveRecordKinds(record),
      date: parseDateText(record.vaccinationDate),
    }))
    .filter((item): item is { record: VaccineRecordLike; kinds: VaccineKind[]; date: Date } =>
      Boolean(item.date),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // ① 早于最低月龄的核心疫苗（2026-10-04 调整判据）
  //
  // 原来的判据是"早于首针窗口起点 7 天"（＝约 5 周龄），
  // 但这会**误伤**指南 Table 1 里那支正规产品：
  //   "Canine parvovirus-2 (recombinant)+canine distemper virus (MLV)
  //    — Administer a single dose **from 4 weeks of age** before commencing
  //      routine primary vaccinations"
  // 家长按兽医建议在 4 周龄打了这一针，回来记录却被我们标成"接种过早"。
  //
  // 真正的红线是 4 周（FAQ p29："Should I vaccinate puppies that are less than
  // 4 weeks of age? A. In general, no."），所以改用 4 周龄作判据。
  const coreSeeds = seeds.filter((seed) => seed.kind === 'core');
  const earliestCoreStart = coreSeeds.length
    ? coreSeeds.reduce(
        (min, seed) => earlierOf(min, seed.windowStart),
        coreSeeds[0].windowStart,
      )
    : null;

  if (earliestCoreStart) {
    // earliestCoreStart = 出生 + 6 周；再往前 2 周就是 4 周龄
    const minimumAgeLine = addWeeks(
      earliestCoreStart,
      CORE_PUPPY_SERIES.earliestWeeks - CORE_PUPPY_SERIES.startWeeksMin,
    );

    for (const item of parsed) {
      if (!item.kinds.includes('core')) continue;
      if (item.date.getTime() < minimumAgeLine.getTime()) {
        conflicts.push({
          kind: 'core',
          recordId: item.record.id,
          recordDate: toDateText(item.date),
          vaccineName: item.record.vaccineName,
          reason: '这一针打在 4 周龄之前',
          suggestion:
            '指南不建议给 4 周龄以下幼犬接种（母源抗体会中和疫苗，注射用活苗还可能有害）。' +
            '建议把这次记录带给兽医看，由他判断这一针是否计数、后续怎么排。',
        });
      }
    }
  }

  // ② 狂犬间隔不足一年
  const rabiesDoses = parsed.filter((item) => item.kinds.includes('rabies'));
  for (let index = 1; index < rabiesDoses.length; index += 1) {
    const previous = rabiesDoses[index - 1];
    const current = rabiesDoses[index];
    const monthsApart =
      (current.date.getTime() - previous.date.getTime()) / (30 * DAY_MS);
    if (monthsApart < 10) {
      conflicts.push({
        kind: 'rabies',
        recordId: current.record.id,
        recordDate: toDateText(current.date),
        vaccineName: current.record.vaccineName,
        reason: `与上一针狂犬相隔约 ${Math.max(1, Math.round(monthsApart))} 个月，短于一年`,
        suggestion:
          '国内狂犬通常每年一次。这次间隔偏短，建议与兽医确认是否按当地要求执行。',
      });
    }
  }

  // ③ 记录里填的"下次到期日"与建议窗口差得远
  //
  // 一条记录可能同时属于好几类（卫佳捌既是核心苗又含钩端），
  // 所以逐类都比一遍；只要**有一类对得上**就不算冲突 ——
  // 顾客手上的方案跟哪一类一致都说明他在按某套程序走。
  for (const item of parsed) {
    const nextDue = parseDateText(item.record.nextDueDate || '');
    if (!nextDue) continue;

    const candidates = seeds.filter((seed) => item.kinds.includes(seed.kind));
    if (candidates.length === 0) continue;

    const nearest = candidates.reduce((best, seed) => {
      const bestGap = Math.abs(best.windowStart.getTime() - nextDue.getTime());
      const seedGap = Math.abs(seed.windowStart.getTime() - nextDue.getTime());
      return seedGap < bestGap ? seed : best;
    }, candidates[0]);

    const gapDays =
      Math.abs(nearest.windowStart.getTime() - nextDue.getTime()) / DAY_MS;
    if (gapDays > 180) {
      conflicts.push({
        kind: nearest.kind,
        recordId: item.record.id,
        recordDate: toDateText(item.date),
        vaccineName: item.record.vaccineName,
        reason: `记录里写的下次到期日（${toDateText(nextDue)}）与建议的时间对不上`,
        suggestion:
          '你可能在按另一套程序接种。以你手上兽医给的方案为准，这里只做提醒。',
      });
    }
  }

  return conflicts;
}

export interface BuildVaccinePlanInput {
  dogId: string;
  birthday: string;
  records: VaccineRecordLike[];
  decisions?: Record<string, VaccineDecision>;
  /** 该方案是否已经过专业审核（未审核时顾客侧不展示） */
  reviewed?: boolean;
  today?: Date;
}

/**
 * 生成疫苗计划。
 *
 * 纯函数：给定出生日期、已有记录与顾客的决定，算出完整计划。
 * 不读数据库、不依赖当前时间（today 可注入），因此可以完整单测。
 */
export function buildVaccinePlan(
  input: BuildVaccinePlanInput,
): VaccinePlanResult {
  const today = input.today ? new Date(input.today.getTime()) : new Date();
  today.setHours(0, 0, 0, 0);

  const birthday = parseDateText(input.birthday);
  const decisions = input.decisions || {};

  if (!birthday) {
    return {
      dogId: input.dogId,
      birthday: '',
      ageWeeks: null,
      steps: [],
      conflicts: [],
      nextStep: null,
      summary: { done: 0, due: 0, overdue: 0, upcoming: 0, skipped: 0 },
      decisions,
      noRecordAtAll: input.records.length === 0,
      noEvidence: input.records.length === 0,
      reviewed: Boolean(input.reviewed),
      generatedAt: new Date().toISOString(),
    };
  }

  /*
   * ══ 日期说得通的记录才参与匹配（2026-10-07 老板审计时定）════════════
   *
   * 实测踩到的两个坑 —— 数据写错，但系统原来全都照单全收：
   *   · 接种日填成未来（手写年份写错、OCR 把年份读错）：一条 2026-12-01 的记录
   *     把「狂犬疫苗 首针」直接标成已完成 —— 一针还没打，提醒就没了；
   *   · 接种日填得比狗狗生日还早（年份写错；或者生日本来就是估的）：
   *     「幼犬首免 第 1 针」算完成，后面几针的窗口被整体拖到**出生之前**。
   *
   * 现在的口径：
   *   · 未来日期的记录**不参与计划**，并在计划里留一条"请核对"（不是悄悄忽略）；
   *   · 早于生日的记录**仍然算剂量** —— 生日本身可能是估的，直接丢掉会把
   *     真实打过的那一针抹掉；但窗口不许被拖到出生之前（见下面夹取那一段）。
   */
  const todayMs = today.getTime();
  const futureDatedRecords = input.records.filter((record) => {
    const date = parseDateText(record.vaccinationDate);
    return Boolean(date) && (date as Date).getTime() > todayMs;
  });
  const futureDatedIds = new Set(futureDatedRecords.map((record) => record.id));

  const parsed = input.records
    .filter((record) => !futureDatedIds.has(record.id))
    .map((record) => ({
      record,
      kinds: resolveRecordKinds(record),
      date: parseDateText(record.vaccinationDate),
    }))
    .filter((item): item is { record: VaccineRecordLike; kinds: VaccineKind[]; date: Date } =>
      Boolean(item.date),
    );

  // 非核心苗"有记录才纳入计划"（2026-10-04，见 NON_CORE_SCHEDULES 的注释）：
  // 这只狗已经在打钩端螺旋体了，才按年提醒它；没打过的不出现 ——
  // 要不要开始打这一类，是它和兽医的事，不是我们该推的。
  const kindsInRecords = new Set<VaccineKind>()
  for (const item of parsed) {
    for (const kind of item.kinds) kindsInRecords.add(kind)
  }
  const planKinds = [
    ...DEFAULT_PLAN_KINDS,
    ...ALL_VACCINE_KINDS.filter(
      (kind) => !DEFAULT_PLAN_KINDS.includes(kind) && kindsInRecords.has(kind),
    ),
  ]

  // 这只狗现在用什么牌子 → 续针优先推同一个牌子（老板规则一）
  const preferredBrand = resolvePreferredBrand(
    input.records.map((record) => record.vaccineName),
  );

  const seeds = buildImmunizationSchedule(birthday, { kinds: planKinds });

  // ⚠️ 这两个**不是一回事**（2026-10-04 拆开）：
  //   · noRecordAtAll → 顾客一条都没录（决定界面说什么、藏什么）
  //   · noEvidence    → 一条都没对上号（只决定措辞软硬）
  // 之前用一个字段兼两件事，于是"只录了一条非核心苗"的人
  // 会被界面告知"档案里还没有接种记录"。
  const noRecordAtAll = input.records.length === 0;
  const noEvidence = !seeds.some((seed) => Boolean(findMatchingRecord(seed, parsed)));

  /*
   * 记录怎么对上步骤：**按针数分**，不是按"窗口里有没有"（2026-10-05 改）。
   *
   * ── 为什么必须改 ─────────────────────────────────────────────
   *
   * 老板实测截图：18 周打了一针卫佳捌（含钩端），系统却认为
   * **一针钩端都没打过** —— 因为钩端的窗口是"8~12 周"和"12~16 周"，
   * 18 周掉在两个窗口之外，一条都没算上，于是让他再打两针。
   *
   * 真相是：那针里的钩端就是**第 1 针**，只需要 2~4 周后补第 2 针。
   *
   * 老办法判的是"你有没有在**对的时间**打"，可系列苗真正要数的是
   * **打了几针**（钩端首免 2 针、核心首免 4 针）。所以：
   *
   *   把每一类的记录按时间排好，第 1 条记录 → 第 1 步，第 2 条 → 第 2 步……
   *   一条记录只能顶一步（同一条记录顶两步 = 一针算两次）；
   *   组合苗可以同时顶**不同类**的各一步（卫佳捌 = 核心那步 + 钩端那步）。
   *
   * 窗口仍然有用 —— 它决定"这一步该在什么时候做、现在该不该提醒"，
   * 只是不再参与"算不算完成"的判定。打得太早/太晚由 detectConflicts 单独提示。
   */
  /*
   * ══ 首免按"这只狗自己的第一针"排（2026-10-07 老板定的相对模型）════════
   *
   * 老板审计时问的："如果是 15 周才开始进入幼犬首免流程的话，那是不是我们
   * 也不用死守固定死的幼犬首免的 8~12、12~14、14~16 这个固定流程呢？
   * ……对于用户而言，这是他狗狗的第一针呀。"
   *
   * 对。指南的原话是"6~8 周龄起，**每 2~4 周一次，直到 16 周龄或更大**"——
   * 它约束的是**间隔**和**结束条件**（有一针落在 ≥16 周龄），
   * 从没规定"必须凑够几针"，也没规定"必须打在固定的那几个档位"。
   *
   * 所以现在：
   *   · 起点 = 这只狗实际打第一针的那天；还没打过 → 就是现在
   *     （没到 6 周龄的，从 6~8 周龄起）；
   *   · 从起点起每 2~4 周排一针，**直到有一针落在 ≥16 周龄**；
   *   · **针次从它自己的第一针开始数** —— 15 周才打的第一针就叫"第 1 针"；
   *   · 起点本身已 ≥16 周龄 → 一针就是完成针；
   *     起点已 ≥26 周龄 → 连 26 周补强都不用补。
   *
   * 这一条同时替掉了原来三处补丁（"≥16 周才首免就裁成一针"、"完成针裁剪"、
   * 以及审计时发现的"不许催比开始接种还早的档位"）。
   * 只有**6~8 周龄按时开始**的狗继续用固定的四针程序表（那套已经审核过，不动）。
   */
  const coreDoseDates = parsed
    .filter(
      (item) =>
        item.kinds.includes('core') &&
        recordCoversStep(item.record.vaccineName, 'core'),
    )
    .map((item) => item.date)
    .sort((a, b) => a.getTime() - b.getTime());
  const firstCoreDose = coreDoseDates[0];
  const latestCoreDose = coreDoseDates[coreDoseDates.length - 1];
  const dogAgeWeeks = weeksBetween(birthday, today);

  /** 这只狗实际开始首免的周龄（还没打过 → 现在，或 6 周龄起） */
  const seriesStartWeeks = firstCoreDose
    ? weeksBetween(birthday, firstCoreDose)
    : dogAgeWeeks >= CORE_PUPPY_SERIES.finishWeeksMin
      ? CORE_PUPPY_SERIES.finishWeeksMin
      : Math.max(dogAgeWeeks, CORE_PUPPY_SERIES.startWeeksMin);

  /**
   * "一针都没打过"的狗的第一针 —— 它要显示成「该打了」，不要被软化成
   * "还没记录"（老板 2026-10-07 改的口径：那一针显示成"现在就该打"）。
   */
  let urgentFirstDoseKey: string | null = null;

  if (seriesStartWeeks > CORE_PUPPY_SERIES.startWeeksMax) {
    // ── 相对模型：丢掉固定档位，按这只狗自己的起点重排 ──
    for (let index = seeds.length - 1; index >= 0; index -= 1) {
      const seed = seeds[index];
      if (seed.kind === 'core' && /^core-puppy-/.test(seed.key)) {
        seeds.splice(index, 1);
      }
    }

    // 还差几针：从起点起每 2~4 周一次，直到有一针落在 ≥16 周龄
    const doseCount =
      seriesStartWeeks >= CORE_PUPPY_SERIES.finishWeeksMin
        ? 1
        : Math.ceil(
            (CORE_PUPPY_SERIES.finishWeeksMin - seriesStartWeeks) /
              CORE_PUPPY_SERIES.intervalWeeksMax,
          ) + 1;
    const spacingWeeks =
      doseCount <= 1
        ? 0
        : Math.max(
            CORE_PUPPY_SERIES.intervalWeeksMin,
            Math.ceil(
              (CORE_PUPPY_SERIES.finishWeeksMin - seriesStartWeeks) /
                (doseCount - 1),
            ),
          );
    /*
     * 一针都没打过、又已经 ≥16 周龄的狗：窗口**从今天开始**。
     *
     * 老板 2026-10-07 定的："显示成现在就该打"。
     * 原来把窗口放在"它 16 周龄那一档"（历史日期）→ 显示成"已逾期" ——
     * 对一只档案空白的狗，说"你逾期了"没意义也没有证据；
     * 说"现在该打这一针"才是事实。
     */
    const startDate = firstCoreDose
      ? firstCoreDose
      : dogAgeWeeks >= CORE_PUPPY_SERIES.finishWeeksMin
        ? today
        : addWeeks(birthday, seriesStartWeeks);
    const ruleText =
      'WSAVA 2024：6~8 周龄起，每 2~4 周一次，直到有一针落在 ' +
      `${CORE_PUPPY_SERIES.finishWeeksMin} 周龄或更大`;

    const newPuppySeeds: StepSeed[] = [];
    for (let index = 0; index < doseCount; index += 1) {
      const planned = addWeeks(startDate, index * spacingWeeks);
      newPuppySeeds.push({
        key: `core-puppy-${index + 1}`,
        kind: 'core',
        label:
          doseCount === 1
            ? '核心疫苗 首免（一针）'
            : `幼犬首免 第 ${index + 1} 针`,
        windowStart: planned,
        windowEnd: addWeeks(planned, 2),
        basis: firstCoreDose
          ? doseCount === 1
            ? `${ruleText}。这只狗 ${Math.round(seriesStartWeeks)} 周龄才开始首免，` +
              '母源抗体已经消退，**一针核心疫苗即可**（不需要再按 2~4 周连打）' +
              (seriesStartWeeks >= CORE_PUPPY_SERIES.boosterWeeks
                ? '；26 周龄以后才开始的那一针同时顶掉了 6 月龄补强，也不需要再补。'
                : '；仍建议在 26 周龄前后补一针。')
            : `${ruleText}。这只狗 ${Math.round(seriesStartWeeks)} 周龄才开始首免，` +
              '所以从**它自己的第一针**起算，还要再打 ' +
              `${doseCount} 针（针次按它自己的第一针编号，不是按固定月龄档位）。`
          : doseCount === 1
            ? 'WSAVA 2024：26 周龄或更大、接种史不明的犬，**一针核心疫苗即可**提供足够保护' +
              '（这一针同时顶掉了 6 月龄补强）。档案里还没有核心疫苗记录，建议尽快安排。'
            : `${ruleText}。档案里还没有核心疫苗记录，从这一针起每 2~4 周一次，` +
              '直到有一针落在 ≥16 周龄；针次从这一针开始编号。',
      });
    }

    /*
     * 一针都没打过时，第一针就是"现在该打"那一步 —— 不能被"还没记录"的
     * 软口气盖住（那是给"家长明明打过、只是没记"的情况用的）。
     * 见下面 buildReminder 的调用处。
     */
    if (!firstCoreDose) {
      urgentFirstDoseKey = 'core-puppy-1';
    }

    /*
     * ⚠️ 这里**不能按窗口起点重排**（2026-10-07 踩过）。
     *
     * 一只 10 岁、档案空白的狗：它的成年加强窗口按程序表算是在 2020~2026 年
     * （早就过去了），而"首免那一针"的窗口是**今天** —— 按窗口排的话，
     * 「成年加强 第 1 次」会排到「首免（一针）」前面，
     * "这一类的下一针"就选错成了成年加强 ✗。
     *
     * 正确的顺序是**程序顺序**：首免那几针 → 26 周补强 → 成年加强。
     * 基础程序表本来就是按这个顺序（窗口都是按生日推的），
     * 所以把新的首免针插回最前面就行。
     */
    seeds.unshift(...newPuppySeeds);
  } else if (firstCoreDose) {
    /*
     * 按时（≤8 周龄）开始的狗：沿用固定的四针程序表；
     * 但一旦"有一针落在 ≥16 周龄"，首免就算完成，后面那几针不必再排 ——
     * 留几步按**实际打了几针**算：
     *   · 8/12/16 周龄 三针 → 排 3 步（原来会催第 4 针 ✗）
     *   · 6/10/14/18 周龄 四针 → 仍然 4 步 ✓（程序表本来就是为它排的）
     *   · 8/12/14 周龄（最后一针太早）→ 不裁，照样要求补一针 ✓
     *
     * ⚠️ 别写成"只要有一针 ≥16 周龄就把最后一针删掉"：那样标准四针打法的
     *    第 4 针会被删掉，18 周龄那一针变成"没有步骤可顶"。（实测踩过。）
     */
    const finisherDose = coreDoseDates.find(
      (date) => weeksBetween(birthday, date) >= CORE_PUPPY_SERIES.finishWeeksMin,
    );
    if (finisherDose) {
      let trimmed = false;
      for (let index = seeds.length - 1; index >= 0; index -= 1) {
        const seed = seeds[index];
        if (seed.kind !== 'core' || !/^core-puppy-/.test(seed.key)) continue;
        const puppyLeft = seeds.filter(
          (item) => item.kind === 'core' && /^core-puppy-/.test(item.key),
        ).length;
        if (puppyLeft <= coreDoseDates.length) break;
        seeds.splice(index, 1);
        trimmed = true;
      }

      // 裁过就要把"为什么没有第 4 针"说清楚，否则家长会以为漏排了
      if (trimmed) {
        const lastPuppy = [...seeds]
          .reverse()
          .find((seed) => seed.kind === 'core' && /^core-puppy-/.test(seed.key));
        if (lastPuppy) {
          lastPuppy.basis +=
            `；已经有一针打在 ≥${CORE_PUPPY_SERIES.finishWeeksMin} 周龄，` +
            '按 WSAVA 2024 这一针就是完成针，首免到此为止（不必再补第 4 针）。';
        }
      }
    }
  }

  /*
   * ══ 26 周补强要不要排？—— 只要有一针核心苗打在 ≥26 周龄，就算补过了 ══
   *
   * 指南说的是"26 周龄或稍后再补一针"（Revaccination at or after 26 weeks）。
   * 所以任何一针落在 ≥26 周龄的核心苗，同时就是那一针补强 —— 没有"必须在
   * 26~30 周那个窗口里打"这回事。
   *
   * 实测踩过的两种情况（老板审计时那个例子就是第一种）：
   *   · 8/12/16 周打完、第 5 针拖到 1 岁才打 → 原来会留一步
   *     「首免后补强（26 周龄）· 该补了（窗口 2026-07）」✗ 其实那一针已经补过了；
   *   · 一针都没打过、现在 2 岁的狗 → 现在开始打的那一针同样顶掉补强
   *     （老板 2026-10-06 定的"大于 26 周才开始首免，一针就够"）；
   *   · 反过来：15 周龄开始首免、现在 30 周龄的狗，**补强还是要补** ——
   *     因为它一针都还没落在 ≥26 周龄。
   */
  const covers26wBooster =
    coreDoseDates.some(
      (date) => weeksBetween(birthday, date) >= CORE_PUPPY_SERIES.boosterWeeks,
    ) || (!firstCoreDose && dogAgeWeeks >= CORE_PUPPY_SERIES.boosterWeeks);
  if (covers26wBooster) {
    const index = seeds.findIndex((seed) => seed.key === 'core-26w');
    if (index >= 0) seeds.splice(index, 1);
  }

  /**
   * 最近一次实际打过的核心苗 —— 不论它有没有"配上"某一步。
   *
   * 成年加强按老板 2026-10-07 定的口径算：**上一次实际接种 + 3 年**。
   * 一只每年都打的狗（比如赛文），"上一次"必须是最后那一针；
   * 只认"配上了步骤的那一针"会把锚点停在最早那针上，算出偏早的日期。
   */
  const latestCoreDoseMs = latestCoreDose ? latestCoreDose.getTime() : null;

  const recordsByKind = new Map<VaccineKind, { record: VaccineRecordLike; date: Date }[]>();
  for (const item of parsed) {
    for (const kind of item.kinds) {
      // 顶不上的记录不进这个队列（卫佳细、犬二联顶不上核心首免）
      if (!recordCoversStep(item.record.vaccineName, kind)) continue;
      const list = recordsByKind.get(kind) || [];
      list.push({ record: item.record, date: item.date });
      recordsByKind.set(kind, list);
    }
  }
  for (const list of recordsByKind.values()) {
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /*
   * ⚠️ 这里原来有个 `neverHadCoreRecord`，用来给"从没打过核心苗的狗"
   * 把「首免（一针）」那一步**强行留在计划里**（怕它被"过期太久"的过滤器收掉）。
   *
   * 2026-10-07 老板改口径之后不需要了：那一针的窗口现在**从今天开始**
   * （状态"该打了"），本来就不会被当成"过期太久"收起来。
   * 留着那段逻辑反而多一条容易忘的分支，所以删掉。
   */

  /*
   * 哪一条记录完成了哪一步 —— **先按窗口认领，再按顺序补位**（2026-10-06 修）。
   *
   * ⚠️ 原来只有"每一类里第 N 步吃第 N 条记录"这一条（纯按顺序派），
   *    **完全不看日期**。老板实测撞出来的怪现象都是它造成的：
   *      · 2026-07-18 打的卫佳捌（含钩端），被判成完成了
   *        「钩端螺旋体 每年 1 次（第 1 次）」—— 而那一针的窗口是 2024 年；
   *      · 同年 5~9 月那个真正对应的「每年 1 次（第 3 次）」反而显示"已逾期"；
   *      · 2026-07-25 刚打的狂犬，被判成完成了「狂犬疫苗 首针」（2023 年的窗口），
   *        而真正对应的「第 4 次」显示"已逾期"。
   *
   * 为什么不能只按窗口：幼犬首免那种**有限针次**，临床上"第 N 针就是第 N 剂"——
   * 顾客可能拖到两岁才补打，按窗口就一条都对不上、计划全废。
   * 所以两步走：
   *   ① **窗口认领**：日期落在某一步窗口内的记录，先完成那一步
   *      （这对"每年一次"这种开放式系列是唯一正确的口径）
   *   ② **顺序补位**：剩下的记录，按顺序填给还没被认领的步骤
   *      （保住"第 N 针 = 第 N 剂"的老口径）
   */
  const assignedByKey = new Map<string, { record: VaccineRecordLike; date: Date }>();
  /*
   * ⚠️ "这条记录在这一类里用过了" 的账本已经被新算法取代（2026-10-07）。
   *
   * 新算法按记录排队、每条记录只找一次步骤，所以"一针不能算两次"
   * **由构造保证**（原来靠 usedByKind 这个 Set 兜着）。
   * 需要恢复旧写法时记得把这个账本一起恢复。
   */
  /**
   * 一条记录算不算"时间上说得过去"地完成了这一步。
   *
   * 允许的偏差：窗口起点的前一年 ~ 窗口终点的后一年。
   * 覆盖面够用（拖打半年、一年都算数），又能挡住"差好几年"的乱配 ——
   * 不加这个门槛时，一条 2026 年的记录会去"完成"2023 年的那一步。
   */
  const FALLBACK_TOLERANCE_MS = 365 * 24 * 60 * 60 * 1000;
  const fits = (seed: StepSeed, date: Date) =>
    date.getTime() >= seed.windowStart.getTime() - FALLBACK_TOLERANCE_MS &&
    date.getTime() <= seed.windowEnd.getTime() + FALLBACK_TOLERANCE_MS;

  /**
   * 记录怎么对上步骤（2026-10-07 审计第 3 块重写）。
   *
   * ── 口径：一类之内，把记录和步骤**按时间配成一对一的顺序匹配** ──────────
   *
   * "第 N 针 = 第 N 剂"（老板最初那条），外加两个约束：
   *   ① **顺序不许倒挂**：后打的针不能顶前面的步骤、先打的针不能顶后面的步骤；
   *   ② **时间上要说得过去**：离那一步的窗口超过一年就不配（宁可不配）。
   * 在满足 ①② 的所有配法里，选"**配上的条数最多**"的那一种
   * （一条真实打过的针不该被白白扔掉），同样多时优先"**刚好落在窗口里的**"
   * （那是最硬的证据：日期正对着那一步）。
   *
   * ── 为什么不用原来的"窗口认领 + 顺序补位"两趟走法 ────────────────────
   *
   * 老板审计时实测出来的倒挂：一只狗 6/8/10 周各打一针（合规打法），
   * 第 2 针被算成 10 周那针、第 3 针被算成 8 周那针。
   * 两趟走法各管一段 —— 窗口认领说"这一步只挑自己窗口里最早的"，
   * 顺序补位又说"剩下的按顺序填"，谁也没保证合起来是顺序的。
   *
   * 也不能简单改成"每条记录填给最早说得通的那一步"：那样赛文那条
   * 2026-07-18 的成年加强针会被 2025-08-18 那条记录抢走（它在一年容差内）。
   * 所以这里用一个小型动态规划（步骤和记录都不多，代价可以忽略）：
   * 目标 1 = 配上的条数最多；目标 2 = 落在窗口里的条数最多。
   */
  const runMatching = () => {
    assignedByKey.clear();

    for (const [kind, list] of recordsByKind.entries()) {
      const steps = seeds.filter((seed) => seed.kind === kind);
      if (steps.length === 0 || list.length === 0) continue;

      const recordCount = list.length;
      const stepCount = steps.length;
      /** 这条记录是不是正好落在那一步的窗口里（最硬的证据） */
      const inWindow = (j: number, i: number) =>
        list[i].date.getTime() >= steps[j].windowStart.getTime() &&
        list[i].date.getTime() <= steps[j].windowEnd.getTime();

      type Score = [number, number];
      const better = (a: Score, b: Score) =>
        a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];

      const memo = new Map<string, Score>();
      /** 从第 j 步、第 i 条记录往后，最好能拿到什么分数 */
      const best = (j: number, i: number): Score => {
        if (j >= stepCount || i >= recordCount) return [0, 0];
        const memoKey = `${j}:${i}`;
        const cached = memo.get(memoKey);
        if (cached) return cached;

        const candidates: Score[] = [];
        if (fits(steps[j], list[i].date)) {
          const rest = best(j + 1, i + 1);
          candidates.push([1 + rest[0], (inWindow(j, i) ? 1 : 0) + rest[1]]);
        }
        candidates.push(best(j, i + 1)); // 这条记录不往这一步配
        candidates.push(best(j + 1, i)); // 这一步先空着

        let result = candidates[0];
        for (const candidate of candidates.slice(1)) {
          if (better(candidate, result)) result = candidate;
        }

        memo.set(memoKey, result);
        return result;
      };

      best(0, 0);

      // 按同一套优先级回放：能配就配 → 否则这条记录不配 → 否则这一步空着
      let j = 0;
      let i = 0;
      while (j < stepCount && i < recordCount) {
        /*
         * ⚠️ 同分时的优先级决定"第 N 剂"落在哪一步，顺序是：
         *    能配就配 > 这条记录不配 > 这一步空着。
         * 反过来（同分优先跳过这一步）会把一条本可以顶第 1 针的记录
         * 推到第 2 针上 —— 实测踩过：18 周龄那针卫佳捌的钩端从"第 1 针"
         * 变成了没配上。
         */
        const canTake = fits(steps[j], list[i].date);
        const takeScore: Score | null = canTake
          ? (() => {
              const rest = best(j + 1, i + 1);
              return [1 + rest[0], (inWindow(j, i) ? 1 : 0) + rest[1]] as Score;
            })()
          : null;
        const skipRecord = best(j, i + 1);
        const skipStep = best(j + 1, i);

        const options: { action: 'take' | 'skipRecord' | 'skipStep'; score: Score }[] = [];
        if (takeScore) options.push({ action: 'take', score: takeScore });
        options.push({ action: 'skipRecord', score: skipRecord });
        options.push({ action: 'skipStep', score: skipStep });

        let winner = options[0];
        for (const option of options.slice(1)) {
          if (better(option.score, winner.score)) winner = option;
        }

        if (winner.action === 'take') {
          assignedByKey.set(steps[j].key, list[i]);
          j += 1;
          i += 1;
        } else if (winner.action === 'skipRecord') {
          i += 1;
        } else {
          j += 1;
        }
      }
    }
  };

  runMatching();

  /*
   * ══ 用**实际接种日**重排后续步骤的窗口（2026-10-06 老板指出）══════════
   *
   * 老板："如果接种窗口只跟生日有关，跟记录无关的话，假设 26 周后的核心疫苗的
   * 加强针被拖到了一岁的时候打，那么 3 年后的成年期第一次加强针要算到什么时候呢？
   * ……优先级更高的相关性，难道不是上一次的接种日期吗？"
   *
   * 对。原来所有窗口都只由生日推出，于是**实际接种日和理想日期一旦有偏差，
   * 后面每一针的窗口就整体偏掉**。实测两个后果：
   *   · 狂犬首针拖到一岁才打 → "第 2 次"显示离那一针只有 2 个月就到期
   *     （提前 10 个月催人重复接种 —— 这是最危险的一条）；
   *   · 26 周补强拖到一岁打 → 补强的窗口早过了，一直挂着"已逾期"，
   *     而那一针被算成了幼犬第 4 针。
   *
   * 现在的口径：**某一步的窗口 = 上一次实际接种日 + 该步原本的间隔**。
   * 实现上就是"把后面的步骤整体平移"——平移量 = 实际接种日 − 那一步原本的窗口起点。
   * 没有记录时平移量为 0，退回按生日推算（没有记录就没有"实际"可言）。
   */
  const originalWindowStart = new Map<string, Date>();
  const originalWindowEnd = new Map<string, Date>();
  for (const seed of seeds) {
    originalWindowStart.set(seed.key, seed.windowStart);
    originalWindowEnd.set(seed.key, seed.windowEnd);
  }

  const seedsByKind = new Map<VaccineKind, StepSeed[]>();
  for (const seed of seeds) {
    const list = seedsByKind.get(seed.kind) || [];
    list.push(seed);
    seedsByKind.set(seed.kind, list);
  }

  const reanchorWindows = () => {
  for (const list of seedsByKind.values()) {
    let shiftMs = 0;
    /*
     * 这一类里**最近一次实际打过**的日期（2026-10-07 老板审计第 3 块）。
     *
     * 成年加强要严格按"上一次实际接种 + 3 年"算 —— 而不是按程序表里的档位。
     * 实测差别（老板问的那个例子）：一只狗 8/12/16 周龄按时打完首免、
     * 第 5 针拖到 1 岁（2027-01-04）才打：
     *   · 按档位平移 → 成年加强落在 2030-01-30（那一针 + 3 年 + 8 周 − 30 天）；
     *   · 按"上一针 + 3 年" → 2030-01-04，正对周年。
     * 老板要的是后者。
     */
    let lastDoseMs: number | null = null;
    for (const seed of list) {
      // 先按上一步带过来的偏移平移这一步（第一步没有上一步）
      if (shiftMs !== 0) {
        const originalStart = (originalWindowStart.get(seed.key) as Date).getTime();
        const originalEnd = (originalWindowEnd.get(seed.key) as Date).getTime();
        let start = originalStart + shiftMs;
        /*
         * 窗口不许被拖到**狗狗出生之前**（2026-10-07 老板审计时定）。
         *
         * 会走到这里是因为有个别记录的日期早于生日（年份写错，或生日是估的）。
         * 那种记录仍然算剂量，但不该让"幼犬首免 第 2 针"的窗口落在一只狗
         * 出生之前 —— 实测见过 2025-11-29 这种窗口，一眼就是错的。
         * 夹取时**保持窗口宽度不变**，只把它整体挪到出生那天之后。
         */
        if (start < birthday.getTime()) {
          start = birthday.getTime();
        }
        /*
         * 26 周补强的窗口**不许早于 26 周龄**（2026-10-07 老板审计时定）。
         *
         * 指令表里这一针的定义就是"26 周龄或更大"（WSAVA 2024）。
         * 但整条线会跟着实际接种日平移 —— 一只 6/8/10 周就打完了三针的狗，
         * 平移到 26 周那一步会变成 **21~25 周龄**，狗狗才 21 周大就被催
         * "该补强了"，早于指南的下限。所以这里给它钉一个地板：
         * 可以往后顺延（缓打没问题），不能往前越过 26 周龄。
         */
        if (seed.key === 'core-26w') {
          const floor =
            birthday.getTime() + CORE_PUPPY_SERIES.boosterWeeks * 7 * DAY_MS;
          if (start < floor) {
            start = floor;
          }
        }
        seed.windowStart = new Date(start);
        seed.windowEnd = new Date(start + (originalEnd - originalStart));
      }
      /*
       * 这一步**真的打了** → 用它的实际日期给后面的步骤定锚点。
       *
       * ⚠️ 只要是"认下来的"匹配就能定锚，**不管是窗口认领还是顺序补位**
       *    （2026-10-06 修正过一次过度收紧）。原先只让窗口认领的定锚，
       *    结果把最该顺延的两种情况挡在门外：
       *      · 18 周龄那针卫佳捌里的钩端（落在钩端窗口之外，补位认的第 1 针）
       *        → 第 2 针又拿生日窗口去说人家逾期；
       *      · 狂犬首针拖到一岁才打（补位认的）→ 第 2 针还是"两个月后就到期"。
       *    "补位匹配一定离谱"这个前提不成立：补位本身已经限定了
       *    **离窗口不超过一年**（见上面的 FALLBACK_TOLERANCE_MS），
       *    所以平移量一定有界，不会把整条线带飞。
       */
      const matched = assignedByKey.get(seed.key);
      // ⚠️ 先记下"处理这一步**之前**最近一次实际接种" —— 成年加强要锚在它上面。
      //    不能用这一步自己的接种日（那会变成"拿这一针给自己定 3 年后"）。
      const previousDoseMs = lastDoseMs;
      if (matched) {
        shiftMs =
          matched.date.getTime() -
          (originalWindowStart.get(seed.key) as Date).getTime();
        lastDoseMs = matched.date.getTime();
      }

      /*
       * 成年加强：直接锚在"上一次实际接种 + 3 年"上（2026-10-07 老板定）。
       *
       * 第 1 次 = 上一次实际接种（可能是 26 周补强那一针、也可能更晚）+ 3 年；
       * 之后每一次 = 上一次加强（打了就按实际那天）+ 3 年。
       * 一针都没打过时退回程序表（没有"上一次"可言）。
       *
       * 老板问过的差别（8/12/16 周三针 + 第 5 针拖到 1 岁才打）：
       *   · 按程序档位平移 → 成年加强落在 2030-01-30；
       *   · 按"上一针 + 3 年" → 2030-01-04，正对周年。要的是后者。
       */
      /*
       * 第 1 次加强的锚点用**这只狗最后打过的核心苗**（latestCoreDoseMs），
       * 不用"配上了步骤的那一针" —— 一只每年都打的狗，中间几针可能
       * 配不上任何步骤（接种比建议更频），但"上一次实际接种"就是最后那针。
       * 第 2 次起按老规矩：上一次加强打了就按实际那天，没打就跟着窗口链走。
       */
      const adultAnchorMs =
        seed.key === 'core-adult-1' && latestCoreDoseMs !== null
          ? latestCoreDoseMs
          : previousDoseMs;
      if (
        seed.kind === 'core' &&
        /^core-adult-/.test(seed.key) &&
        adultAnchorMs !== null
      ) {
        const originalStart = (originalWindowStart.get(seed.key) as Date).getTime();
        const originalEnd = (originalWindowEnd.get(seed.key) as Date).getTime();
        const start = addYears(new Date(adultAnchorMs), CORE_ADULT_BOOSTER.repeatYears);
        seed.windowStart = start;
        seed.windowEnd = new Date(start.getTime() + (originalEnd - originalStart));
        // 后面的兄弟步骤跟着这一步走；若这一步自己没打，锚点就交给平移链
        shiftMs = start.getTime() - originalStart;
        if (!matched) {
          lastDoseMs = null;
        }
      }
    }
  }
  };

  /*
   * 匹配 → 按实际接种日重排窗口 → **再匹配一次**（2026-10-06 老板要求）。
   *
   * 为什么要迭代：第一轮匹配用的是"按生日算"的窗口，而重排之后窗口会挪位置 ——
   * 两边口径不一致时会出现"这一针被算给了很靠后的那一步"这种别扭结果。
   * 用重排后的窗口再认一次，让**匹配和显示用同一套窗口**。
   * 两轮足够收敛（第三轮不会再变），所以不再循环。
   */
  reanchorWindows();
  runMatching();
  reanchorWindows();

  /**
   * 哪几类的"起针"要显示成"**现在该打**"（2026-10-07 老板审计第 5 块定）。
   *
   * 判据：这一类**一针都没打过**（队列是空的），而且它的起针窗口**已经过去**。
   * 这种时候显示"该补了（窗口 2024 年 3~6 月）"既别扭也没有意义 ——
   * 家长看到的就是"现在开始打第一针"。所以把窗口挪到今天，
   * 状态自然变成"该打了"，措辞也不再用"还没记录"那种软口气。
   *
   * 窗口宽度保持不变（狂犬 90 天还是 90 天）。
   */
  const firstSeedKeyByKind = new Map<VaccineKind, string>();
  for (const seed of seeds) {
    if (!firstSeedKeyByKind.has(seed.kind)) firstSeedKeyByKind.set(seed.kind, seed.key);
  }
  const recordlessStartKeys = new Set<string>();
  for (const [kind, key] of firstSeedKeyByKind.entries()) {
    if ((recordsByKind.get(kind) || []).length > 0) continue;
    recordlessStartKeys.add(key);
    const seed = seeds.find((item) => item.key === key);
    if (seed && seed.windowEnd.getTime() < today.getTime()) {
      const width = seed.windowEnd.getTime() - seed.windowStart.getTime();
      seed.windowStart = today;
      seed.windowEnd = new Date(today.getTime() + width);
    }
  }

  const allSteps: VaccinePlanStep[] = seeds.map((seed) => {
      const matched = assignedByKey.get(seed.key) ?? null;
      // 顾客说"不做"的那一步不再报逾期，尊重他的选择
      const status = resolveStatus(
        seed,
        Boolean(matched),
        decisions[seed.key],
        today,
      );
      // 口气软硬看**这一类**有没有对得上的记录，不看整只狗（2026-10-07 老板定）
      const kindHasEvidence = seeds.some(
        (item) => item.kind === seed.kind && assignedByKey.has(item.key),
      );
      return {
        key: seed.key,
        kind: seed.kind,
        kindLabel: VACCINE_KIND_LABELS[seed.kind] || seed.kind,
        label: seed.label,
        windowStart: toDateText(seed.windowStart),
        windowEnd: toDateText(seed.windowEnd),
        status,
        statusLabel: resolveStatusLabel(status, !kindHasEvidence, recordlessStartKeys.has(seed.key)),
        matchedRecordId: matched?.record.id ?? null,
        matchedRecordDate: matched ? toDateText(matched.date) : null,
        basis: seed.basis,
        reminder: buildReminder(
          status,
          seed.label,
          !kindHasEvidence && !recordlessStartKeys.has(seed.key),
        ),
        // "这一类的起针"是事实、不是指责 —— 不用"还没记录"的软口气
        noEvidence: !kindHasEvidence && !recordlessStartKeys.has(seed.key),
        // 这一步大概在几周龄 → 决定哪些产品顶得上（最低首免周龄不能晚于它）
        // 先占位：推荐产品要等**所有步骤的状态都出来**才能算
        // （见下面"多联苗该不该推"那一段），间距提醒同理。
        commonProducts: [],
        spacingNote: '',
      };
    })
    /*
     * ══ 每一类只留"下一针"（2026-10-07 老板审计第 5 块定）════════════════
     *
     * 老板原话："所有类型的疫苗，我们只给顾客看到下一针待接种的疫苗就可以了。
     * 比如核心疫苗下一针该怎么打？或者狂犬疫苗下一针该怎么打？
     * 钩端螺旋体下一针该怎么打？……而不是用一个时间来框住需要显示的待接种的计划。"
     *
     * 所以：
     *   · **已完成** → 保留（那是这只狗的历史，老板要留着）
     *   · **不做**   → 不显示（顾客已经决定了，不再拿窗口去烦他）
     *   · 其余未完成的 → **每一类只留最靠前的那一步**（"这一类的下一针"），
     *     别的都不显示 —— 这就是"不许跳步"，现在由后端筛好再下发，
     *     小程序、医生分享页、以后的提醒都不用各自再实现一遍。
     *
     * 顺带**去掉了两个时间框**（原来"过期一年以上不显示"、"18 个月以后不显示"）：
     * 一个类别最多出一条，程序表再长也不会刷屏，那两个框只会误伤 ——
     * 比如"下一针在 3 年后"的成年加强，或者一只漏打三年、下一针早就过期的狗
     * （后者原来会让整个狂犬疫苗从计划里消失，那是很危险的）。
     */
    ;

  /** 每一类里"最靠前的那一步还没完成的" —— 就是这一类的下一针 */
  const nextPendingKeyByKind = new Map<VaccineKind, string>();
  for (const step of allSteps) {
    if (step.status === 'DONE' || step.status === 'SKIPPED') continue;
    if (!nextPendingKeyByKind.has(step.kind)) {
      nextPendingKeyByKind.set(step.kind, step.key);
    }
  }

  const steps: VaccinePlanStep[] = allSteps.filter((step) => {
    if (step.status === 'DONE') {
      return true;
    }
    if (step.status === 'SKIPPED') {
      return false;
    }
    return nextPendingKeyByKind.get(step.kind) === step.key;
  });

  /*
   * 多联苗该不该推（2026-10-05 老板第 4 问）。
   *
   * 老板举的例子：幼犬 16 周后打了一针卫佳捌（核心+钩端），
   * 那钩端第 2 针（2~4 周后）该推什么？
   *   · 再推一针卫佳捌 → **核心苗在 2~4 周内又打了一次**，
   *     可核心这时候该等到 26 周才补强 —— 重复了，不该推。
   *   · 推一支钩端单苗（宠必威乐必妥）→ 正好。
   *
   * 判据（比"窗口重叠"精确）：
   *   某个**别的**分类，如果它**刚打过（90 天内完成过一步）**、
   *   而且**现在没有该打的步骤**（没在待办里），
   *   那么这一步就只推"单一分类"的苗 —— 别顺带把那个分类再打一遍。
   *
   * 反例（不能误伤）：26 周龄的核心补强，狗没打过钩端 ——
   *   钩端从来就没"刚打过"，所以卫佳捌照常推。这是常见做法。
   */
  const recentlyDoneKinds = new Set(
    steps
      .filter((step) => {
        if (step.status !== 'DONE') return false;
        const end = parseDateText(step.windowEnd);
        return Boolean(end) && end!.getTime() >= addDays(today, -90).getTime();
      })
      .map((step) => step.kind),
  );
  /*
   * "现在真的要打"的分类 —— **只算该打了 / 已逾期**。
   *
   * ⚠️ 不能把 UPCOMING 也算进来：那样"26 周那个还很远的补强"会让 core
   *    一直留在待办里，于是"刚打过核心"这件事永远不算数，多联苗永远被放行。
   *    实测就是这么翻车的：18 周打完卫佳捌之后，钩端那一步还在推卫佳捌。
   */
  const pendingNowKinds = new Set(
    steps
      .filter((step) => step.status === 'DUE' || step.status === 'OVERDUE')
      .map((step) => step.kind),
  );

  for (const step of steps) {
    const blockedKind = [...recentlyDoneKinds].some(
      (kind) => kind !== step.kind && !pendingNowKinds.has(kind),
    );

    step.commonProducts = recommendProductsForStep(
      step.kind,
      weeksBetween(birthday, parseDateText(step.windowStart) || birthday),
      { preferredBrand, allowCombo: !blockedKind },
    ).map((product) => product.name);
  }

  /*
   * 不同分类的针别撞在一起（老板规则二）。
   *
   * 判据：**两针窗口有重叠**、分类不同、而且两边都还没做
   * （DONE / SKIPPED 的不算 —— 已经打过或明确不做，没什么可错开的）。
   */
  const pending = steps.filter(
    (step) =>
      step.status === 'DUE' ||
      step.status === 'OVERDUE' ||
      step.status === 'UPCOMING',
  );

  for (const step of steps) {
    if (!pending.includes(step)) {
      continue;
    }

    const start = parseDateText(step.windowStart);
    const end = parseDateText(step.windowEnd);
    if (!start || !end) {
      continue;
    }

    const overlapping = pending.filter((other) => {
      if (other === step || other.kind === step.kind) return false;
      const otherStart = parseDateText(other.windowStart);
      const otherEnd = parseDateText(other.windowEnd);
      if (!otherStart || !otherEnd) return false;

      const windowsOverlap =
        otherStart.getTime() <= end.getTime() &&
        start.getTime() <= otherEnd.getTime();
      if (!windowsOverlap) {
        return false;
      }

      /*
       * ⚠️ 再加一道「**对面那针现在也已经能打了**」的门槛。
       *
       * 不加会变成噪音：核心苗的窗口横跨 6~18 周，狂犬从 12 周起每年一次 ——
       * 两边窗口几乎永远重叠，于是**每一步都挂着"别和狂犬同一天打"**。
       * 实测过：5 步里 4 步带提醒。挂多了人就不看了，等于没提醒。
       *
       * 现在只在"对面那针的窗口也开了（或 7 天内就开）"时才说 ——
       * 那才是顾客真会把两针凑到一起的时候。
       */
      return otherStart.getTime() <= addDays(today, 7).getTime();
    });

    const labels = overlapping
      .map((item) => VACCINE_KIND_LABELS[item.kind])
      .filter((label, i, arr) => arr.indexOf(label) === i);

    step.spacingNote =
      labels.length > 0
        ? `这段时间还有「${labels.join('、')}」要打 —— 不同类的疫苗不要同一天打，` +
          `前后错开 ${VACCINE_SPACING.minGapDays}~${VACCINE_SPACING.recommendedGapDays} 天。`
        : '';
  }

  const summary = {
    done: steps.filter((step) => step.status === 'DONE').length,
    due: steps.filter((step) => step.status === 'DUE').length,
    overdue: steps.filter((step) => step.status === 'OVERDUE').length,
    upcoming: steps.filter((step) => step.status === 'UPCOMING').length,
    skipped: steps.filter((step) => step.status === 'SKIPPED').length,
  };

  // 下一步：优先逾期，其次当前应做，最后是最近的将来
  const nextStep =
    steps.find((step) => step.status === 'OVERDUE') ||
    steps.find((step) => step.status === 'DUE') ||
    steps.find((step) => step.status === 'UPCOMING') ||
    null;

  return {
    dogId: input.dogId,
    birthday: toDateText(birthday),
    ageWeeks: weeksBetween(birthday, today),
    steps,
    /*
     * 「这一针的日期是未来」也当成一条"记录与建议不一致"报给顾客看。
     *
     * 不报的话，顾客只会觉得"我记了一针，怎么计划里当没这回事" ——
     * 说清楚"还没发生的针不能算打过、请核对日期"，他才好去改。
     */
    conflicts: [
      ...futureDatedRecords.map((record) => ({
        kind: (resolveRecordKinds(record)[0] ?? 'other') as VaccineKind,
        recordId: record.id,
        recordDate: String(record.vaccinationDate).slice(0, 10),
        vaccineName: record.vaccineName,
        reason: '接种日期不能晚于今天',
        suggestion: '请核对疫苗本上的日期（最常见的错法是把年份写错）',
      })),
      ...detectConflicts(input.records, seeds, today),
    ],
    nextStep,
    summary,
    decisions,
    noRecordAtAll,
    noEvidence,
    reviewed: Boolean(input.reviewed),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * ⚠️ 这里原来有个 isVaccinePlanCustomerEnabled()（读环境变量 VACCINE_PLAN
 * 决定顾客侧开不开）。2026-10-06 老板定：**按审核通过的标准部署**，
 * 卡点取消 —— 免疫程序表正式对顾客开放，不再是"内部先看"的状态。
 * 留着一个随时能把功能关掉的开关，反而会让线上状态变得说不清。
 */

/**
 * 由成分推导类别 —— 实现在 vaccine-products（成分表在那里），
 * 这里转出去，省得调用方为了一个函数引两个模块（2026-10-06）。
 */
export { kindsOfComponents } from './vaccine-products';
