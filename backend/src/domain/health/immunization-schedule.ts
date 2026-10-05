import {
  findProductsInName,
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
  label: string;
  /** 时间窗（ISO 日期 YYYY-MM-DD）；开区间时另一侧为空 */
  windowStart: string;
  windowEnd: string;
  status: VaccineStepStatus;
  /** 窗口内命中的记录（有的话） */
  matchedRecordId: string | null;
  matchedRecordDate: string | null;
  /** 这一步为什么在这个时间 —— 给顾客和审核的人看 */
  basis: string;
  /** 提醒文案（小程序内展示，不用订阅消息） */
  reminder: string;
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
      '宠必威乐必妥（犬钩端螺旋体病二价灭活疫苗）说明书：' +
      '幼犬首免应在 8 周龄后，间隔 2~4 周第二次，以后每年 1 次',
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
   * 默认只排 core + rabies（标准程序）。非核心苗由调用方按
   * "这只狗有没有这类苗的记录"决定要不要加进来 —— 见 NON_CORE_SCHEDULES
   * 上面那段注释：非核心苗不默认推给每一只狗。
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
      windowStart: addDays(booster, -30),
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
      // 往下放宽没有任何依据。后续每年的针保留 -30 天（提前一个月打是常规做法）。
      windowStart: index === 0 ? rabies : addDays(rabies, -30),
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
const CORE_NAME_PATTERN =
  /犬瘟|细小|腺病毒|副流感|传染性肝炎|distemper|parvo|adenovirus|[二三四五六七八九]联/i;

/**
 * 非核心、而且我们**没有**接种程序的（2026-10-05）。
 *
 * 这些以前会被当成"核心苗"，从而能顶掉核心苗的某一针 —— 是错的。
 * WSAVA 里它们都属于"按生活方式逐只评估"的非核心苗。
 * 记下来是对的，影响计划是不对的。
 */
const OTHER_NAME_PATTERN =
  /犬窝咳|窝咳|冠状病毒|莱姆|博德特|支气管败血|bordetella|kennel\s*cough/i;

/** 顾客侧默认排哪几类（非核心苗要"有记录才加"，见 NON_CORE_SCHEDULES） */
export const DEFAULT_PLAN_KINDS: readonly VaccineKind[] = ['core', 'rabies'];

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
      windowStart: addDays(repeat, -windowTailDays),
      windowEnd: addDays(repeat, 90),
      basis: config.basis,
    });
    repeat = addYears(repeat, config.repeatYears);
  }

  return seeds;
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
  if (decision === 'SKIP') {
    return 'SKIPPED';
  }
  if (matched) {
    return 'DONE';
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

  const parsed = input.records
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

  const steps: VaccinePlanStep[] = seeds
    .map((seed) => {
      const matched = findMatchingRecord(seed, parsed);
      // 顾客说"不做"的那一步不再报逾期，尊重他的选择
      const status = resolveStatus(
        seed,
        Boolean(matched),
        decisions[seed.key],
        today,
      );
      return {
        key: seed.key,
        kind: seed.kind,
        label: seed.label,
        windowStart: toDateText(seed.windowStart),
        windowEnd: toDateText(seed.windowEnd),
        status,
        matchedRecordId: matched?.record.id ?? null,
        matchedRecordDate: matched ? toDateText(matched.date) : null,
        basis: seed.basis,
        reminder: buildReminder(status, seed.label, noEvidence),
        // 这一步大概在几周龄 → 决定哪些产品顶得上（最低首免周龄不能晚于它）
        commonProducts: recommendProductsForStep(
          seed.kind,
          weeksBetween(birthday, seed.windowStart),
          { preferredBrand },
        ).map((product) => product.name),
        // 先占位，下面算完"跟别的分类有没有撞车"再填
        spacingNote: '',
      };
    })
    // 只留下"对现在还有意义"的步骤。
    //
    // 不加这一步，一只 10 岁的老狗会看到"幼犬首免 第 1 针：已逾期"这种
    // 毫无意义的提示 —— 那是十年前的窗口，不是现在要做的事。
    //
    // 规则：
    //   · DONE              → 保留，那是这只狗的历史
    //   · DUE / OVERDUE     → 只在窗口刚过去一年内保留（过期太久的不算"该做"）
    //   · UPCOMING          → 只保留 18 个月内会到期的（否则一次列出十几年后的安排）
    //   · SKIPPED           → 按它原本该在的时间段处理
    .filter((step) => {
      const start = parseDateText(step.windowStart);
      const end = parseDateText(step.windowEnd);
      if (!start || !end) {
        return false;
      }

      if (step.status === 'DONE') {
        return true;
      }

      const recentEnough = end.getTime() >= addDays(today, -365).getTime();
      if (step.status === 'DUE' || step.status === 'OVERDUE') {
        return recentEnough;
      }

      // UPCOMING / SKIPPED：看它是不是在近期将来
      return start.getTime() <= addDays(today, 540).getTime() && recentEnough;
    });

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
    conflicts: detectConflicts(input.records, seeds, today),
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
 * 顾客可见的疫苗建议是否开放。
 *
 * **默认关闭**（老板定的边界：未经专业审核的兽医内容不得对顾客开放）。
 * 免疫程序表目前由研发依据 WSAVA 2024 与国内法规起草，**尚未经兽医审核**，
 * 所以线上默认只给营养师/管理端看。
 * 审核完成后设置环境变量 `VACCINE_PLAN=customer` 即可对顾客开放。
 */
export function isVaccinePlanCustomerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.VACCINE_PLAN ?? '').trim().toLowerCase() === 'customer';
}
