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

/** 免疫程序的类别 */
export type VaccineKind = 'core' | 'rabies';

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
  /** 计划是否有专业审核背书 —— 未审核时顾客侧不展示 */
  reviewed: boolean;
  generatedAt: string;
}

export interface VaccineRecordLike {
  id: string;
  vaccineName: string;
  vaccinationDate: string; // YYYY-MM-DD
  nextDueDate?: string | null;
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
  /** WSAVA 2024 讨论的 26 周龄以上补强（可选） */
  optionalBoosterWeeks: 26,
  basis: 'WSAVA 2024：6–8 周龄起，每 2–4 周一次，直到 16 周龄或更大',
} as const;

/** 成年加强（WSAVA 2024） */
export const CORE_ADULT_BOOSTER = {
  /** 首免完成后 1 年做第一次加强 */
  firstBoosterYears: 1,
  /** 之后每 3 年（免疫力可维持多年，远超 3 年） */
  repeatYears: 3,
  /** 看多少次加强（够覆盖绝大多数狗的寿命） */
  maxBoosters: 5,
  basis: 'WSAVA 2024：成年加强可三年一次或更少频次；首免完成后 1 年做第一次',
} as const;

/** 狂犬病（国内） */
export const RABIES_SCHEDULE = {
  /** 首针：一般 12 周龄以上（各地规定不同） */
  firstDoseWeeksMin: 12,
  /** 之后每年一次 */
  repeatYears: 1,
  maxDoses: 12,
  basis:
    '国内狂犬病属强制免疫病种，通常每年一次；具体月龄与登记要求以当地规定为准',
} as const;

/**
 * 疫苗名分类：只区分"狂犬"与"其它"。
 *
 * 为什么只分两类：疫苗名是自由文本，细分成"六联/八联/卫佳"没有可靠依据；
 * 而狂犬在国内是强制免疫、按年接种，周期与核心疫苗完全不同，必须分开。
 */
export function classifyVaccineName(name: string): VaccineKind {
  const text = String(name || '').toLowerCase();
  return /狂犬|rabies/.test(text) ? 'rabies' : 'core';
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
export function buildImmunizationSchedule(birthday: Date): ImmunizationScheduleItem[] {
  const seeds: StepSeed[] = [];

  // ── 幼犬首免：从 startWeeksMin 起，按最大间隔排，直到 finishWeeksMin ──
  const firstStart = addWeeks(birthday, CORE_PUPPY_SERIES.startWeeksMin);
  const firstEnd = addWeeks(birthday, CORE_PUPPY_SERIES.startWeeksMax);
  const finish = addWeeks(birthday, CORE_PUPPY_SERIES.finishWeeksMin);

  let doseIndex = 0;
  let cursor = firstStart;
  while (cursor.getTime() <= finish.getTime() && doseIndex < 8) {
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

  // 第一针的窗口其实从 6 到 8 周都行，把它放宽（上面用的是最紧的排法）
  if (seeds.length > 0) {
    seeds[0].windowEnd = laterOf(seeds[0].windowEnd, firstEnd);
  }

  // ── 26 周龄以上的可选补强（WSAVA 2024 的讨论） ──
  const optional = addWeeks(birthday, CORE_PUPPY_SERIES.optionalBoosterWeeks);
  seeds.push({
    key: 'core-optional-26w',
    kind: 'core',
    label: '首免后补强（可选）',
    windowStart: optional,
    windowEnd: addWeeks(optional, 4),
    basis:
      'WSAVA 2024 讨论了在 26 周龄以上再补一针核心疫苗，而不是等到 12–16 月龄；是否补由兽医判断',
  });

  // ── 成年加强：首免完成后 1 年做第一次，之后每 3 年 ──
  let booster = addYears(finish, CORE_ADULT_BOOSTER.firstBoosterYears);
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

  // ── 狂犬：首针 12 周龄起，之后每年一次 ──
  let rabies = addWeeks(birthday, RABIES_SCHEDULE.firstDoseWeeksMin);
  for (let index = 0; index < RABIES_SCHEDULE.maxDoses; index += 1) {
    seeds.push({
      key: `rabies-${index + 1}`,
      kind: 'rabies',
      label: index === 0 ? '狂犬疫苗 首针' : `狂犬疫苗 第 ${index + 1} 次`,
      windowStart: addDays(rabies, -30),
      windowEnd: addDays(rabies, 90),
      basis: RABIES_SCHEDULE.basis,
    });
    rabies = addYears(rabies, RABIES_SCHEDULE.repeatYears);
  }

  return seeds;
}

/** 这一步的时间窗里有没有对应类型的记录 */
function findMatchingRecord(
  seed: StepSeed,
  records: { record: VaccineRecordLike; kind: VaccineKind; date: Date }[],
): { record: VaccineRecordLike; date: Date } | null {
  const inWindow = records.filter(
    (item) =>
      item.kind === seed.kind &&
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

function buildReminder(status: VaccineStepStatus, label: string): string {
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
      kind: classifyVaccineName(record.vaccineName),
      date: parseDateText(record.vaccinationDate),
    }))
    .filter((item): item is { record: VaccineRecordLike; kind: VaccineKind; date: Date } =>
      Boolean(item.date),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // ① 早于建议窗口的核心疫苗：幼犬首免过早，可能被母源抗体中和
  const coreSeeds = seeds.filter((seed) => seed.kind === 'core');
  const earliestCoreStart = coreSeeds.length
    ? coreSeeds.reduce(
        (min, seed) => earlierOf(min, seed.windowStart),
        coreSeeds[0].windowStart,
      )
    : null;

  if (earliestCoreStart) {
    for (const item of parsed) {
      if (item.kind !== 'core') continue;
      if (item.date.getTime() < addDays(earliestCoreStart, -7).getTime()) {
        conflicts.push({
          kind: 'core',
          recordId: item.record.id,
          recordDate: toDateText(item.date),
          vaccineName: item.record.vaccineName,
          reason: '这一针比建议的首免起始时间早得比较多',
          suggestion:
            '幼犬过早接种可能被母源抗体中和。建议把这次记录带给兽医看，由他判断这一针是否计数、后续怎么排。',
        });
      }
    }
  }

  // ② 狂犬间隔不足一年
  const rabiesDoses = parsed.filter((item) => item.kind === 'rabies');
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
  for (const item of parsed) {
    const nextDue = parseDateText(item.record.nextDueDate || '');
    if (!nextDue) continue;

    const candidates = seeds.filter((seed) => seed.kind === item.kind);
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
        kind: item.kind,
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
      reviewed: Boolean(input.reviewed),
      generatedAt: new Date().toISOString(),
    };
  }

  const seeds = buildImmunizationSchedule(birthday);
  const parsed = input.records
    .map((record) => ({
      record,
      kind: classifyVaccineName(record.vaccineName),
      date: parseDateText(record.vaccinationDate),
    }))
    .filter((item): item is { record: VaccineRecordLike; kind: VaccineKind; date: Date } =>
      Boolean(item.date),
    );

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
        reminder: buildReminder(status, seed.label),
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
