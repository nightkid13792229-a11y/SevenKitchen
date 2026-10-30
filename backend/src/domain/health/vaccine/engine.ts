/**
 * 疫苗计划引擎（2026-10-15 重做）—— **四个纯函数，不碰数据库**。
 *
 *   ① `materializeSteps`  生日 + 记录 → 步骤序列（每一步带窗口）
 *   ② `matchRecords`      步骤 + 记录 → 每一步的状态与命中的记录
 *   ③ `pickNext`          步骤 → "下一针"（唯一一条）
 *   ④ `buildPlanView`     以上全部 + 忽略决定 + 抗体检测 → 给前端的视图模型
 *
 * ── 为什么必须是纯函数（技术方案 2.2）──────────────────────────
 * 不碰数据库 → 可以拿"生日 + 一堆记录"直接跑测试，不需要建库、不需要启服务。
 * 这正是"测试从规格表生成"的前提。
 *
 * ── 窗口怎么算（需求 附录 A）─────────────────────────────────
 *
 * 每一步有一个**理想接种日**（anchor）：
 *   · 这一步真打了 → 理想日 = **实际接种日**（需求 A.3 第 2 条：按实际接种日滚动）
 *   · 没打 → AGE / GRACE 用**窗口起点**，FLEX 用**窗口终点**
 *
 *   `AGE`   窗口 = [生日 + 年龄下限, 起点 + 窗口长度]
 *   `FLEX`  窗口 = [上一针 + 最短间隔, 上一针 + 最长间隔]
 *   `GRACE` 窗口 = [上一针 + 间隔, 起点 + 宽限]
 *
 * 一针未打、而这一类第一步的窗口已经过去 → **窗口挪到今天**（宽度不变），
 * 并带出 `missedWindowStart/End`（需求 A.3 第 1 条）。
 */

import {
  CORE_EARLY_SCHEDULE,
  CORE_SCHEDULE,
  CORE_TITER_REVIEW_YEARS,
  LEPTO_SCHEDULE,
  RABIES_SCHEDULE,
  VACCINE_KIND_LABELS,
  VACCINE_KIND_LAYERS,
  type ScheduleSeries,
  type ScheduleWindowKind,
  type VaccineKind,
  type VaccineLayer,
} from './schedule-table';
import {
  classifyRecordKinds,
  findComboProducts,
  resolvePreferredBrand,
} from './products';
import {
  buildConflicts,
  buildIgnored,
  buildRhythm,
  pickComboForStep,
  selectPlanSteps,
  toStepDto,
  type PlanStepDto,
} from './plan-view';

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

/* ===========================================================================
 * 日期工具（纯函数，便于单测）
 * =========================================================================== */

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
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  const day = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + months);
  const daysInMonth = new Date(
    copy.getFullYear(),
    copy.getMonth() + 1,
    0,
  ).getDate();
  copy.setDate(Math.min(day, daysInMonth));
  return copy;
}

export function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

/** 相差几周（向下取整，负数表示还没出生） */
export function weeksBetween(from: Date, to: Date): number {
  return Math.floor(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / WEEK_MS,
  );
}

/** 相差几个月（向下取整） */
export function monthsBetween(from: Date, to: Date): number {
  const start = startOfDay(from);
  const end = startOfDay(to);
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) {
    months -= 1;
  }
  return months;
}

/* ===========================================================================
 * 输入 / 输出类型
 * =========================================================================== */

/** 一条接种记录（引擎只认这几个字段；`nextDueDate` / `status` 已随列删除） */
export interface VaccineRecordLike {
  id: string;
  vaccineName: string;
  /** YYYY-MM-DD */
  vaccinationDate: string;
  /** 这一针含哪些病种（写入时由后端算） */
  components?: string[];
  /** 这条记录归成哪几类（写入时由后端算） */
  kinds?: string[];
  /**
   * 产品名有没有被人工核对过（安全默认值）。
   * **false = 不参与匹配**（照旧显示在记录列表里，只是不算作"这一针打过了"）。
   */
  productVerified?: boolean;
}

/** 一条抗体检测记录 */
export interface AntibodyTestLike {
  id: string;
  /** YYYY-MM-DD */
  testedAt: string;
  /** CORE / RABIES */
  targets: string[];
  result: 'PASS' | 'FAIL' | 'UNKNOWN';
  /** YYYY-MM-DD */
  nextReviewAt?: string | null;
}

export type VaccineDecisionValue = 'ACCEPT' | 'DEFER' | 'SKIP';

export interface VaccineDecisionLike {
  decision: VaccineDecisionValue;
  reason?: string | null;
  /**
   * “这次先不打”的到期日（`YYYY-MM-DD` 或 Date）。
   * 没有值 = 旧数据，按仍有效处理；到期后这一类重新出现。
   */
  snoozeUntil?: string | Date | null;
}

export interface MaterializeInput {
  birthday: Date;
  /** 该狗的接种记录（引擎自己会过滤"没核对过"的） */
  records: VaccineRecordLike[];
  today: Date;
}

export type StepStatus = 'DONE' | 'DUE' | 'UPCOMING' | 'OVERDUE';

/** 展开后的一步（内部形态：日期是 Date） */
export interface MaterializedStep {
  key: string;
  kind: VaccineKind;
  label: string;
  layer: VaccineLayer;
  series: ScheduleSeries;
  windowKind: ScheduleWindowKind;
  windowStart: Date;
  windowEnd: Date;
  /**
   * 这一步的窗口**原来**是哪一段 —— 只在"起针窗口过了、被挪到今天"时有值。
   * 前端据此显示"（原建议时间 X ~ Y 已过）"。
   */
  missedWindowStart?: Date;
  missedWindowEnd?: Date;
  /** 窗口被挪到今天过 → 状态按**逾期**算（需求 A.3 第 1 条） */
  movedToToday: boolean;
  /** 会不会出现在默认计划里（早期核心疫苗 = false） */
  inDefaultPlan: boolean;
  /** 卡片上那行短话（与 basis 分工：短的给首屏，长的给"查看详情"） */
  hint: string;
  basis: string;
  titerable: boolean;
}

/** 匹配之后的一步 */
export interface MatchedStep extends MaterializedStep {
  status: StepStatus;
  /** 状态的**中文说法**：待接种 / 已完成 / 尽快补种 */
  statusLabel: string;
  matchedRecordId: string | null;
  matchedRecordDate: Date | null;
  /** 这一针被抗体检测替代了（原型 F）—— 时间含义变成"下次评估" */
  titer?: {
    testedAt: string;
    nextReviewAt: string;
  };
  /** 最近一次 CORE 抗体检测不合格（#1/V3）：这一步是补一针 */
  titerFail?: {
    testedAt: string;
  };
  /** 顾客点过"不做"（`VaccineDecision.decision === 'SKIP'`） */
  skipped: boolean;
}

export interface VaccinePlanView {
  dogId: string;
  birthday: string;
  ageWeeks: number | null;
  next: PlanStepDto | null;
  plan: PlanStepDto[];
  ignored: {
    count: number;
    items: Array<{
      key: string;
      kindLabel: string;
      label: string;
      reason: string | null;
      /** “这次先不打”的到期日（#2）；STOPPED 为空 */
      snoozeUntil?: string | null;
    }>;
  };
  rhythm: string;
  /** 有几条记录待核对（`productVerified === false`） */
  pendingReview: number;
  conflicts: Array<{
    kind: string;
    recordId: string;
    recordDate: string;
    vaccineName: string;
    reason: string;
    suggestion: string;
  }>;
  noRecordAtAll: boolean;
}

export interface BuildPlanViewInput {
  dogId: string;
  birthday: string;
  records: VaccineRecordLike[];
  decisions?: Record<string, VaccineDecisionLike>;
  antibodyTests?: AntibodyTestLike[];
  today?: Date;
}

/* ===========================================================================
 * 内部：记录预处理与"哪一针算哪一步"
 * =========================================================================== */

export interface PreparedRecord {
  record: VaccineRecordLike;
  kinds: VaccineKind[];
  date: Date;
}

/**
 * 能参与匹配的记录。
 *
 * ⚠️ **没核对过的不参与匹配**（`productVerified === false`）——
 * 两个方向的后果不对称：错算成"没打"只是多提醒一次；
 * 错算成"打了"是**狗真的漏打**（狂犬还是法定强制免疫）。
 *
 * ⚠️ 日期在**未来**的记录也不参与（手写年份写错、OCR 读错）——
 * 它会把"还没打的针"直接标成已完成。这一条由 plan-view 报成冲突，不静默丢。
 */
export function prepareRecords(
  records: VaccineRecordLike[],
  today?: Date,
): PreparedRecord[] {
  const limit = today ? startOfDay(today).getTime() : null;
  return records
    .filter((record) => record.productVerified !== false)
    .map((record) => ({
      record,
      kinds: classifyRecordKinds(record),
      date: parseDateText(record.vaccinationDate),
    }))
    .filter(
      (
        item,
      ): item is {
        record: VaccineRecordLike;
        kinds: VaccineKind[];
        date: Date;
      } => Boolean(item.date),
    )
    .filter((item) => (limit === null ? true : item.date.getTime() <= limit))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** 某一类的记录日期（按日期升序） */
function dosesOfKind(records: PreparedRecord[], kind: VaccineKind): Date[] {
  return records
    .filter((item) => item.kinds.includes(kind))
    .map((item) => item.date)
    .sort((a, b) => a.getTime() - b.getTime());
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * 一条记录**怎样算数**（需求第五节"证据纪律" + A.3 第 2 条）。
 *
 * 优先"窗口内的那一条"；窗口内没有时：
 *   · **系列的第一步**（狂犬首针、钩端第 1 针、核心第 1 针）——
 *     允许认领"比窗口晚"的那一针：一只狗一生中第一次打这一类，
 *     不管几岁打的，它就是"第 1 针"（后续窗口从它滚动）
 *   · **后续针** —— 只接受"晚到不超过一个间隔期"的那一针
 *     （打晚了一点点仍然算这一步；晚了半年就该走重启/补种的判断）
 */
function claimDose(
  doses: Date[],
  used: Set<number>,
  windowStart: Date,
  windowEnd: Date,
  options: { isFirstOfKind: boolean; lateToleranceWeeks: number },
): Date | null {
  // ① 窗口内（最早的一条）
  for (let index = 0; index < doses.length; index += 1) {
    if (used.has(index)) continue;
    const date = doses[index];
    if (
      date.getTime() >= windowStart.getTime() &&
      date.getTime() <= windowEnd.getTime()
    ) {
      used.add(index);
      return date;
    }
  }

  // ② 窗口外：第一步放宽到"之后任何一针"；后续针只放宽一个间隔期
  const lateLimit = options.isFirstOfKind
    ? Number.POSITIVE_INFINITY
    : windowEnd.getTime() + options.lateToleranceWeeks * WEEK_MS;
  for (let index = 0; index < doses.length; index += 1) {
    if (used.has(index)) continue;
    const date = doses[index];
    if (date.getTime() > windowEnd.getTime() && date.getTime() <= lateLimit) {
      used.add(index);
      return date;
    }
  }
  return null;
}

interface StepDraft {
  key: string;
  kind: VaccineKind;
  label: string;
  series: ScheduleSeries;
  windowKind: ScheduleWindowKind;
  windowStart: Date;
  windowEnd: Date;
  /** 卡片上那行短话 */
  hint: string;
  basis: string;
  titerable: boolean;
  inDefaultPlan: boolean;
  missedWindowStart?: Date;
  missedWindowEnd?: Date;
}

/**
 * 认领器：某一类的记录 → 这一步是哪一针。
 *
 * 一条记录只能认领一步（一对一），已经认领过的不会再用 ——
 * 不然一支组合苗会被算成"打了好几针"。
 */
class Claimer {
  private used = new Set<number>();
  private claimedKeys = new Set<string>();

  constructor(private readonly doses: Date[]) {}

  claim(
    key: string,
    windowStart: Date,
    windowEnd: Date,
    options: { isFirstOfKind: boolean; lateToleranceWeeks: number },
  ): Date | null {
    const matched = claimDose(
      this.doses,
      this.used,
      windowStart,
      windowEnd,
      options,
    );
    if (matched) this.claimedKeys.add(key);
    return matched;
  }

  isClaimed(key: string): boolean {
    return this.claimedKeys.has(key);
  }

  hasDoses(): boolean {
    return this.doses.length > 0;
  }

  last(): Date | null {
    return this.doses.length ? this.doses[this.doses.length - 1] : null;
  }
}

/** 起针窗口已过、而且这一类**一针都没打过** → 窗口挪到今天（宽度不变） */
function moveToTodayIfMissed(
  draft: StepDraft,
  matched: Date | null,
  today: Date,
  hadAnyDoseOfKind: boolean,
): StepDraft {
  if (matched || hadAnyDoseOfKind) return draft;
  if (today.getTime() <= draft.windowEnd.getTime()) return draft;

  const width = draft.windowEnd.getTime() - draft.windowStart.getTime();
  return {
    ...draft,
    missedWindowStart: draft.windowStart,
    missedWindowEnd: draft.windowEnd,
    windowStart: new Date(today.getTime()),
    windowEnd: new Date(today.getTime() + width),
  };
}

/* ===========================================================================
 * 核心疫苗（需求 5.1 / 5.2 / 附录 A.2）
 * =========================================================================== */

/** 一步成年加强（上一针 +3 年 ~ +90 天） */
function adultStep(anchor: Date, index: number): StepDraft {
  const start = addYears(anchor, CORE_SCHEDULE.adultIntervalYears * index);
  return {
    key: `core-adult-${index}`,
    kind: 'core',
    label: '加强（每 3 年）',
    series: 'BOOSTER',
    windowKind: 'GRACE',
    windowStart: start,
    windowEnd: addDays(start, CORE_SCHEDULE.adultGraceDays),
    hint: CORE_SCHEDULE.adultHint,
    basis: CORE_SCHEDULE.adultBasis,
    titerable: true,
    inDefaultPlan: true,
  };
}

/** 核心"成年加强"那一串：锚点 = 上一针（实际接种日；没有就用给定的窗口起点） */
function withCoreAdults(anchor: Date, prefix: StepDraft[]): StepDraft[] {
  const steps = [...prefix];
  for (let index = 1; index <= CORE_SCHEDULE.adultMaxRepeats; index += 1) {
    steps.push(adultStep(anchor, index));
  }
  return steps.sort(
    (a, b) => a.windowStart.getTime() - b.windowStart.getTime(),
  );
}

/**
 * **核心看是否满 26 周**（需求 5.2）：
 *
 *   · 满 26 周之前 → 按首免系列排（6 周起每 2~4 周，直到有一针 ≥16 周龄）
 *   · 已满 26 周、而且**没有打到 16 周那一针** → **只补一针**，之后每 3 年
 *   · 已满 26 周、系列已经完成 → 26 周补强（还年轻时）或每 3 年
 *
 * 一只 6 岁的狗**永远不会**被要求"从第一针开始"。
 */
function buildCoreSteps(
  records: PreparedRecord[],
  birthday: Date,
  today: Date,
): StepDraft[] {
  const claimer = new Claimer(dosesOfKind(records, 'core'));
  const ageWeeksToday = weeksBetween(birthday, today);
  const finishFloor = addWeeks(birthday, CORE_SCHEDULE.finishWeeks);
  const primary: StepDraft[] = [];

  /* ── 首免系列：从 6 周起每 2~4 周排一针，直到有一针落在 ≥16 周龄 ── */
  let anchor: Date | null = null;
  for (let index = 1; index <= 8; index += 1) {
    const isFirst = index === 1;
    const windowStart: Date = isFirst
      ? addWeeks(birthday, CORE_SCHEDULE.startWeeks)
      : addWeeks(anchor as Date, CORE_SCHEDULE.intervalWeeksMin);
    const windowEnd: Date = isFirst
      ? addWeeks(
          birthday,
          CORE_SCHEDULE.startWeeks + CORE_SCHEDULE.firstWindowWeeks,
        )
      : addWeeks(anchor as Date, CORE_SCHEDULE.intervalWeeksMax);

    let draft: StepDraft = {
      key: `core-puppy-${index}`,
      kind: 'core',
      label: `第 ${index} 针`,
      series: 'PRIMARY',
      windowKind: isFirst ? 'AGE' : 'FLEX',
      windowStart,
      windowEnd,
      hint: CORE_SCHEDULE.hint,
    basis: CORE_SCHEDULE.basis,
      titerable: true,
      inDefaultPlan: true,
    };
    const matched = claimer.claim(draft.key, windowStart, windowEnd, {
      isFirstOfKind: isFirst,
      lateToleranceWeeks: CORE_SCHEDULE.intervalWeeksMax,
    });
    // 一针未打、而这一步的窗口已经过去 → 窗口挪到今天（需求 A.3 第 1 条）
    draft = moveToTodayIfMissed(draft, matched, today, claimer.hasDoses());
    primary.push(draft);
    anchor = matched ?? (isFirst ? draft.windowStart : draft.windowEnd);

    // "直到有一针 ≥16 周龄"（需求 A.2 的"系列结束条件"）——
    // 两种情况都算系列走完了：
    //   ① 真打了一针在 ≥16 周龄（WSAVA："最重要的就是 16 周龄这一针"）
    //   ② 这一针的窗口起点已经到 16 周龄（还没打，但这就是系列最后一针）
    if (matched && weeksBetween(birthday, matched) >= CORE_SCHEDULE.finishWeeks)
      break;
    if (draft.windowStart.getTime() >= finishFloor.getTime()) break;
  }

  const lastDose = claimer.last();
  // 首免算不算完成：**最后一针核心苗打在 16 周龄或以后**（WSAVA："最重要的一针"）
  const seriesComplete = Boolean(
    lastDose && weeksBetween(birthday, lastDose) >= CORE_SCHEDULE.finishWeeks,
  );

  /* ── 已满 26 周、系列没完成 → 只补一针（需求 5.2 / 验收"6 岁零记录"）── */
  if (ageWeeksToday >= CORE_SCHEDULE.booster26Weeks && !seriesComplete) {
    const target =
      primary.find((step) => !claimer.isClaimed(step.key)) ??
      primary[primary.length - 1];
    const width = target.windowEnd.getTime() - target.windowStart.getTime();
    const windowStart = laterOf(target.windowStart, today);
    const catchUp: StepDraft = {
      ...target,
      key: 'core-catchup',
      label: CORE_SCHEDULE.catchUpLabel,
      series: 'BOOSTER',
      hint: CORE_SCHEDULE.catchUpHint,
    basis: CORE_SCHEDULE.catchUpBasis,
      // ⚠️ 用**原窗口**，不是"已经挪到今天之后"的那个窗口：
      //    首免第 1 针自己可能已经被 `moveToTodayIfMissed` 挪过一次
      missedWindowStart: target.missedWindowStart ?? target.windowStart,
      missedWindowEnd: target.missedWindowEnd ?? target.windowEnd,
      windowStart,
      windowEnd: new Date(windowStart.getTime() + width),
    };
    return withCoreAdults(catchUp.windowStart, [catchUp]);
  }

  /* ── 已满 26 周、系列已完成 ────────────────────────────────── */
  if (ageWeeksToday >= CORE_SCHEDULE.booster26Weeks) {
    const lastDoseWeeks = lastDose ? weeksBetween(birthday, lastDose) : null;
    const boosterStillRelevant =
      lastDoseWeeks !== null &&
      lastDoseWeeks < CORE_SCHEDULE.booster26Weeks &&
      ageWeeksToday < 52;
    if (boosterStillRelevant) {
      // 26 周补强：窗口已过就如实写"尽快补种"（不挪到今天 —— 这一类已经打过针了）
      const boosterStart = addWeeks(birthday, CORE_SCHEDULE.booster26Weeks);
      const boosterEnd = addWeeks(
        birthday,
        CORE_SCHEDULE.booster26Weeks + CORE_SCHEDULE.booster26WindowWeeks,
      );
      claimer.claim('core-26w', boosterStart, boosterEnd, {
        isFirstOfKind: false,
        lateToleranceWeeks: CORE_SCHEDULE.intervalWeeksMax,
      });
      const booster: StepDraft = {
        key: 'core-26w',
        kind: 'core',
        label: '26 周补强',
        series: 'BOOSTER',
        windowKind: 'AGE',
        windowStart: boosterStart,
        windowEnd: boosterEnd,
        hint: CORE_SCHEDULE.booster26Hint,
    basis: CORE_SCHEDULE.booster26Basis,
        titerable: true,
        inDefaultPlan: true,
      };
      return withCoreAdults(booster.windowStart, [booster]);
    }
    // 26 周补强的窗口早就过去了（狗已经 1 岁以上）→ 直接进每 3 年
    return withCoreAdults(lastDose as Date, []);
  }

  /* ── 幼犬期：整段展开（首免系列 + 26 周补强 + 之后每 3 年）────────── */
  const steps: StepDraft[] = [...primary];
  const boosterStart = addWeeks(birthday, CORE_SCHEDULE.booster26Weeks);
  const boosterEnd = addWeeks(
    birthday,
    CORE_SCHEDULE.booster26Weeks + CORE_SCHEDULE.booster26WindowWeeks,
  );
  const boosterMatched = claimer.claim('core-26w', boosterStart, boosterEnd, {
    isFirstOfKind: false,
    lateToleranceWeeks: CORE_SCHEDULE.intervalWeeksMax,
  });
  let booster: StepDraft = {
    key: 'core-26w',
    kind: 'core',
    label: '26 周补强',
    series: 'BOOSTER',
    windowKind: 'AGE',
    windowStart: boosterStart,
    windowEnd: boosterEnd,
    hint: CORE_SCHEDULE.booster26Hint,
    basis: CORE_SCHEDULE.booster26Basis,
    titerable: true,
    inDefaultPlan: true,
  };
  booster = moveToTodayIfMissed(
    booster,
    boosterMatched,
    today,
    claimer.hasDoses(),
  );
  steps.push(booster);

  // 成年加强的锚点：上一针实际接种日与 26 周补强的理想日，取**较晚**的那个
  const adultAnchor = laterOf(
    lastDose ?? booster.windowStart,
    booster.windowStart,
  );
  return withCoreAdults(adultAnchor, steps);
}

/* ===========================================================================
 * 狂犬（12 周起首针 → 每年一次）
 * =========================================================================== */

function buildRabiesSteps(
  records: PreparedRecord[],
  birthday: Date,
  today: Date,
): StepDraft[] {
  const claimer = new Claimer(dosesOfKind(records, 'rabies'));
  const steps: StepDraft[] = [];

  const firstStart = addWeeks(birthday, RABIES_SCHEDULE.firstDoseWeeks);
  const firstEnd = addDays(firstStart, RABIES_SCHEDULE.firstWindowDays);
  const firstMatched = claimer.claim('rabies-1', firstStart, firstEnd, {
    isFirstOfKind: true,
    lateToleranceWeeks: 4,
  });
  let first: StepDraft = {
    key: 'rabies-1',
    kind: 'rabies',
    label: '首针',
    series: 'PRIMARY',
    windowKind: 'AGE',
    windowStart: firstStart,
    windowEnd: firstEnd,
    hint: RABIES_SCHEDULE.hint,
    basis: RABIES_SCHEDULE.basis,
    titerable: false,
    inDefaultPlan: true,
  };
  first = moveToTodayIfMissed(first, firstMatched, today, claimer.hasDoses());
  steps.push(first);

  // 年度加强：上一针 +1 年 ~ +30 天（锚点 = 实际最后一针）
  const lastDose = claimer.last();
  let anchor = lastDose ?? first.windowStart;
  for (let index = 2; index <= RABIES_SCHEDULE.maxDoses + 1; index += 1) {
    const start = addYears(anchor, RABIES_SCHEDULE.intervalYears);
    const end = addDays(start, RABIES_SCHEDULE.graceDays);
    const matched = claimer.claim(`rabies-${index}`, start, end, {
      isFirstOfKind: false,
      lateToleranceWeeks: 4,
    });
    steps.push({
      key: `rabies-${index}`,
      kind: 'rabies',
      label: '每年一次',
      series: 'BOOSTER',
      windowKind: 'GRACE',
      windowStart: start,
      windowEnd: end,
      hint: RABIES_SCHEDULE.hint,
    basis: RABIES_SCHEDULE.basis,
      titerable: false,
      inDefaultPlan: true,
    });
    anchor = matched ?? start;
  }

  return steps.sort(
    (a, b) => a.windowStart.getTime() - b.windowStart.getTime(),
  );
}

/* ===========================================================================
 * 钩端螺旋体（首免 2 针 → 每年一次；上一针 ≥18 个月 → 重启 2 针）
 * =========================================================================== */

/** 年度加强那一串（重力锚点 = 上一针实际接种日；重启之后由 annualAfter 重排） */
function annualChain(anchor: Date, claimer: Claimer): StepDraft[] {
  const steps: StepDraft[] = [];
  let cursor = anchor;
  for (let index = 1; index <= LEPTO_SCHEDULE.maxRepeats; index += 1) {
    const start = addYears(cursor, LEPTO_SCHEDULE.intervalYears);
    const end = addDays(start, LEPTO_SCHEDULE.graceDays);
    const matched = claimer.claim(`lepto-repeat-${index}`, start, end, {
      isFirstOfKind: false,
      lateToleranceWeeks: LEPTO_SCHEDULE.intervalWeeksMax,
    });
    steps.push({
      key: `lepto-repeat-${index}`,
      kind: 'lepto',
      label: '每年一次',
      series: 'BOOSTER',
      windowKind: 'GRACE',
      windowStart: start,
      windowEnd: end,
      hint: LEPTO_SCHEDULE.hint,
    basis: LEPTO_SCHEDULE.basis,
      titerable: false,
      inDefaultPlan: true,
    });
    cursor = matched ?? start;
  }
  return steps;
}

function buildLeptoSteps(
  records: PreparedRecord[],
  birthday: Date,
  today: Date,
): StepDraft[] {
  const doses = dosesOfKind(records, 'lepto');
  const claimer = new Claimer(doses);

  /* ── 首免第 1 针（8~12 周龄）────────────────────────────────── */
  const firstStart = addWeeks(birthday, LEPTO_SCHEDULE.startWeeks);
  const firstEnd = addWeeks(
    birthday,
    LEPTO_SCHEDULE.startWeeks + LEPTO_SCHEDULE.firstWindowWeeks,
  );
  const firstMatched = claimer.claim('lepto-primary-1', firstStart, firstEnd, {
    isFirstOfKind: true,
    lateToleranceWeeks: LEPTO_SCHEDULE.intervalWeeksMax,
  });
  let first: StepDraft = {
    key: 'lepto-primary-1',
    kind: 'lepto',
    label: '第 1 针',
    series: 'PRIMARY',
    windowKind: 'AGE',
    windowStart: firstStart,
    windowEnd: firstEnd,
    hint: LEPTO_SCHEDULE.hint,
    basis: LEPTO_SCHEDULE.basis,
    titerable: false,
    inDefaultPlan: true,
  };
  first = moveToTodayIfMissed(first, firstMatched, today, claimer.hasDoses());

  /* ── 首免第 2 针（上一针 +2~4 周）────────────────────────────── */
  const secondBase = firstMatched ?? first.windowStart;
  const secondStart = addWeeks(secondBase, LEPTO_SCHEDULE.intervalWeeksMin);
  const secondEnd = addWeeks(secondBase, LEPTO_SCHEDULE.intervalWeeksMax);
  const secondMatched = claimer.claim(
    'lepto-primary-2',
    secondStart,
    secondEnd,
    {
      isFirstOfKind: false,
      lateToleranceWeeks: LEPTO_SCHEDULE.intervalWeeksMax,
    },
  );
  const second: StepDraft = {
    key: 'lepto-primary-2',
    kind: 'lepto',
    label: '第 2 针',
    series: 'PRIMARY',
    windowKind: 'FLEX',
    windowStart: secondStart,
    windowEnd: secondEnd,
    hint: LEPTO_SCHEDULE.hint,
    basis: LEPTO_SCHEDULE.basis,
    titerable: false,
    inDefaultPlan: true,
  };

  const primary = [first, second];

  /* ── 之后每年一次 ──────────────────────────────────────────── */
  const lastDose = doses.length ? doses[doses.length - 1] : null;
  const previousDose = doses.length > 1 ? doses[doses.length - 2] : null;
  const stale =
    lastDose !== null &&
    monthsBetween(lastDose, today) >= LEPTO_SCHEDULE.restartMonths;
  /*
   * "上一针本身就是重启第 1 针" → 下一步接着排「重启免疫 第 2 针」。
   *
   * ⚠️ 两个条件缺一不可：
   *   ① 它和再上一针相隔 ≥18 个月（说明它是"重启"而不是常规年度加强）
   *   ② 它离今天**不超过 3 个月** —— 重启第 2 针的窗口只开到第 1 针之后 4 周，
   *      隔了半年还回头催"第 2 针"多半是错的（那一针很可能打了、只是没记）。
   *      没有 ② 的话，一本只记了"首免两针 + 几年后一针"的老本子会被误判成
   *      "上一针是重启针"（实测：6 年前的两针 + 半年前一针）。
   */
  const lastDoseWasRestart =
    lastDose !== null &&
    previousDose !== null &&
    monthsBetween(previousDose, lastDose) >= LEPTO_SCHEDULE.restartMonths &&
    monthsBetween(lastDose, today) <= 3;

  /*
   * 年度加强的锚点 = **这只狗实际打过的最后一针钩端**（需求 A.3 第 2 条）。
   *
   * ⚠️ 必须优先用 `lastDose`，而不是"第 2 针那一步有没有被认领" ——
   *    老本子往往是跳着记的（首免两针 + 几年后一针），
   *    按"第二针 + 1 年"往后排会让下一次落在**错的年份**上（实测）。
   */
  const repeats = annualChain(
    lastDose ?? secondMatched ?? second.windowEnd,
    claimer,
  );

  if (!stale && !lastDoseWasRestart) {
    return [...primary, ...repeats].sort(
      (a, b) => a.windowStart.getTime() - b.windowStart.getTime(),
    );
  }

  /*
   * 重启免疫（需求 A.2 最后一行 / WSAVA 2024 问答）：
   * 把"最后一针之后、第一个还没打的步骤"整段换成重启的 2 针，
   * 后面的年度加强从重启第 2 针重新起算。
   */
  const all = [...primary, ...repeats].sort(
    (a, b) => a.windowStart.getTime() - b.windowStart.getTime(),
  );
  const targetIndex = all.findIndex(
    (step) =>
      !claimer.isClaimed(step.key) &&
      (lastDose === null || step.windowStart.getTime() >= lastDose.getTime()),
  );
  // 找不到"最后一针之后还没打的步骤" = 这一类没有待办 → 不动它
  if (targetIndex < 0) return all;
  const head = all.slice(0, targetIndex);

  if (stale) {
    const restartOne: StepDraft = {
      key: 'lepto-restart-1',
      kind: 'lepto',
      label: '重启免疫 第 1 针',
      series: 'PRIMARY',
      windowKind: 'AGE',
      windowStart: today,
      windowEnd: addWeeks(today, LEPTO_SCHEDULE.restartFirstWindowWeeks),
      hint: LEPTO_SCHEDULE.restartHint,
    basis: LEPTO_SCHEDULE.restartBasis,
      titerable: false,
      inDefaultPlan: true,
    };
    const restartTwo: StepDraft = {
      key: 'lepto-restart-2',
      kind: 'lepto',
      label: '重启免疫 第 2 针',
      series: 'PRIMARY',
      windowKind: 'FLEX',
      windowStart: addWeeks(
        restartOne.windowStart,
        LEPTO_SCHEDULE.intervalWeeksMin,
      ),
      windowEnd: addWeeks(
        restartOne.windowStart,
        LEPTO_SCHEDULE.intervalWeeksMax,
      ),
      hint: LEPTO_SCHEDULE.restartHint,
    basis: LEPTO_SCHEDULE.restartBasis,
      titerable: false,
      inDefaultPlan: true,
    };
    return [...head, restartOne, restartTwo].sort(
      (a, b) => a.windowStart.getTime() - b.windowStart.getTime(),
    );
  }

  // 上一针本身就是"重启第 1 针" → 这一步接着排「第 2 针」
  const restartTwo: StepDraft = {
    key: 'lepto-restart-2',
    kind: 'lepto',
    label: '重启免疫 第 2 针',
    series: 'PRIMARY',
    windowKind: 'FLEX',
    windowStart: addWeeks(lastDose, LEPTO_SCHEDULE.intervalWeeksMin),
    windowEnd: addWeeks(lastDose, LEPTO_SCHEDULE.intervalWeeksMax),
    hint: LEPTO_SCHEDULE.restartHint,
    basis: LEPTO_SCHEDULE.restartBasis,
    titerable: false,
    inDefaultPlan: true,
  };
  return [...head, restartTwo].sort(
    (a, b) => a.windowStart.getTime() - b.windowStart.getTime(),
  );
}

/* ===========================================================================
 * 早期核心疫苗（只有记录里带 core_early 才认）
 * =========================================================================== */

function buildCoreEarlySteps(
  records: PreparedRecord[],
  birthday: Date,
): StepDraft[] {
  const doses = dosesOfKind(records, 'core_early');
  if (doses.length === 0) return [];
  const start = addWeeks(birthday, CORE_EARLY_SCHEDULE.startWeeks);
  return [
    {
      key: 'core-early-1',
      kind: 'core_early',
      label: '早期一针',
      series: 'PRIMARY',
      windowKind: 'AGE',
      windowStart: start,
      windowEnd: addWeeks(
        birthday,
        CORE_EARLY_SCHEDULE.startWeeks + CORE_EARLY_SCHEDULE.windowWeeks,
      ),
      hint: CORE_EARLY_SCHEDULE.hint,
    basis: CORE_EARLY_SCHEDULE.basis,
      titerable: false,
      inDefaultPlan: false,
    },
  ];
}

/* ===========================================================================
 * ① materializeSteps
 * =========================================================================== */

/**
 * ① 展开步骤（纯函数）。
 *
 * 输入：生日 + 该狗的接种记录 + 今天
 * 输出：步骤序列（每一步带窗口；按窗口起点从近到远）
 */
export function materializeSteps(input: MaterializeInput): MaterializedStep[] {
  const birthday = startOfDay(input.birthday);
  const today = startOfDay(input.today);
  const records = prepareRecords(input.records, today);

  const drafts: StepDraft[] = [
    ...buildCoreEarlySteps(records, birthday),
    ...buildCoreSteps(records, birthday, today),
    ...buildRabiesSteps(records, birthday, today),
    ...buildLeptoSteps(records, birthday, today),
  ];

  return drafts
    .map((draft) => ({
      key: draft.key,
      kind: draft.kind,
      label: draft.label,
      layer: VACCINE_KIND_LAYERS[draft.kind] ?? 'SUGGEST',
      series: draft.series,
      windowKind: draft.windowKind,
      windowStart: draft.windowStart,
      windowEnd: draft.windowEnd,
      ...(draft.missedWindowStart && draft.missedWindowEnd
        ? {
            missedWindowStart: draft.missedWindowStart,
            missedWindowEnd: draft.missedWindowEnd,
          }
        : {}),
      movedToToday: Boolean(draft.missedWindowStart),
      inDefaultPlan: draft.inDefaultPlan,
      hint: draft.hint,
      basis: draft.basis,
      titerable: draft.titerable,
    }))
    .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());
}

/* ===========================================================================
 * ② matchRecords
 * =========================================================================== */

/**
 * ② 每一步的状态。
 *
 * 规则（技术方案 2.2）：
 *   ① 没核对的记录**不参与匹配**
 *   ② 先查产品库按成分覆盖（`classifyRecordKinds`）
 *   ③ 库里没有，按名字字面判
 *   ④ 都认不出 → **不算**
 *   ⑤ **事实优先于忽略**：有记录就是已完成
 */
export function matchRecords(
  steps: MaterializedStep[],
  records: VaccineRecordLike[],
  options: {
    decisions?: Record<string, VaccineDecisionLike>;
    today?: Date;
  } = {},
): MatchedStep[] {
  const today = startOfDay(options.today ?? new Date());
  const decisions = options.decisions ?? {};
  const prepared = prepareRecords(records, today);

  const byKind = new Map<VaccineKind, PreparedRecord[]>();
  for (const item of prepared) {
    for (const kind of item.kinds) {
      const list = byKind.get(kind) ?? [];
      list.push(item);
      byKind.set(kind, list);
    }
  }

  const claimedByKey = new Map<string, PreparedRecord>();
  for (const [kind, items] of byKind) {
    const kindSteps = steps
      .filter((step) => step.kind === kind)
      .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());
    const doses = [...items]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((item) => item.date);
    const used = new Set<number>();

    for (let index = 0; index < kindSteps.length; index += 1) {
      const step = kindSteps[index];
      const matchedDate = claimDose(
        doses,
        used,
        step.windowStart,
        step.windowEnd,
        {
          isFirstOfKind: index === 0,
          lateToleranceWeeks: 4,
        },
      );
      if (!matchedDate) continue;
      const hit = items.find(
        (item) => item.date.getTime() === matchedDate.getTime(),
      );
      if (hit) claimedByKey.set(step.key, hit);
    }
  }

  /**
   * 「不再接种了」是**长期**决定，不是"这一针先不打"（需求 R5 的验收：
   * 忽略后不再催）。所以只要某一类里有一条 `reason = STOPPED` 的决定，
   * 这一类的**后续步骤统统不再提醒** —— 否则一只 12 岁、按兽医建议停打的狗，
   * 每年都会重新冒出一条"该打狂犬了"，家长得年年忽略一次。
   *
   * 恢复方式不变：把那条决定删掉，整类就回来了。
   */
  const stoppedKinds = new Set(
    Object.entries(decisions)
      .filter(([, value]) => value?.reason === 'STOPPED')
      .map(([key]) => kindOfStepKey(key))
      .filter((kind): kind is VaccineKind => Boolean(kind)),
  );

  return steps.map((step) => {
    const matched = claimedByKey.get(step.key) ?? null;
    const decision = decisionForStep(decisions, step);
    const kindStopped = stoppedKinds.has(step.kind);
    let status: StepStatus;
    if (matched) {
      status = 'DONE';
    } else if (step.movedToToday) {
      // 窗口被挪到今天 = 原窗口已经过去（需求 A.3 第 1 条）→ 按逾期算
      status = 'OVERDUE';
    } else if (today.getTime() < step.windowStart.getTime()) {
      status = 'UPCOMING';
    } else if (today.getTime() <= step.windowEnd.getTime()) {
      status = 'DUE';
    } else {
      status = 'OVERDUE';
    }

    /**
     * 「原建议时间」= 这一步**确实有过、而且已经过去**的那个建议窗口（修法 A，2026-10-16）。
     *
     * 为什么补在这里：`missedWindowStart/End` 原来只有"起针逾期、窗口被挪到今天"
     * 那一条路会写（`moveToTodayIfMissed`），而**加强针的窗口本来就不挪** ——
     * 一只狂犬漏了两年的狗，状态算得出"逾期"、窗口也还留在原处，却没人把它
     * 标成"原建议时间"，于是前端只能写「建议尽快安排」✗
     * （验收表 R15 要的是「建议尽快补种（原建议时间 X，已过）」）。
     * 前端本来就认这两个字段，所以这里补上即可，**前端一行都不用改**。
     *
     * 三个条件缺一不可（后两条是这次最容易做偏的地方）：
     *   · `status === 'OVERDUE'` —— 只有逾期才配说"原建议时间"；
     *   · `!step.movedToToday` —— **被挪到今天的那种不许补**：它的窗口是"今天起算"的，
     *     补上去会写出「原建议时间（今天）~（今天+宽限），已过」，凭空说一个
     *     **还没过去的窗口**"已过"是错的。它真正错过的那个窗口在挪的时候就存好了
     *     （`missedWindowStart` 已有值），这里只原样保留、绝不改写；
     *   · `today > windowEnd` —— 窗口终点真的在今天之前（"起点在过去、且不等于今天"
     *     是同一件事：终点都过去了，起点自然也在过去）。窗口还开着的 / 还没到的
     *     是"待接种"，不是"逾期"，一个字都不能补。
     */
    const missed =
      status === 'OVERDUE' &&
      !step.movedToToday &&
      !step.missedWindowStart &&
      today.getTime() > step.windowEnd.getTime()
        ? {
            missedWindowStart: step.windowStart,
            missedWindowEnd: step.windowEnd,
          }
        : {};

    return {
      ...step,
      ...missed,
      status,
      statusLabel:
        status === 'DONE'
          ? '已完成'
          : status === 'OVERDUE'
            ? '尽快补种'
            : '待接种',
      matchedRecordId: matched?.record.id ?? null,
      matchedRecordDate: matched?.date ?? null,
      // 事实优先：真打了就是 DONE，不算忽略
      skipped:
        !matched && (isDecisionActive(decision, today) || kindStopped),
    };
  });
}


/**
 * 2026-10-30（#2）：决定可以挂在**类别**上（`core`），也可以挂旧的步骤 key。
 * 新数据一律用类别；旧数据/兼容路径用 stepKey。
 */
function decisionForStep(
  decisions: Record<string, VaccineDecisionLike>,
  step: { key: string; kind: VaccineKind },
): VaccineDecisionLike | undefined {
  return decisions[step.kind] ?? decisions[step.key];
}

/**
 * 一条决定现在生效吗？
 *
 *   · STOPPED：长期有效；
 *   · NOT_NOW：到 `snoozeUntil` 当天为止；到期后这一类重新出现；
 *   · 旧数据没有 `snoozeUntil`：按仍有效处理（迁移会补上 30 天）。
 */
function isDecisionActive(
  decision: VaccineDecisionLike | undefined,
  today: Date,
): boolean {
  if (!decision || decision.decision !== 'SKIP') return false;
  if (decision.reason === 'STOPPED') return true;
  if (decision.reason !== 'NOT_NOW') return false;
  if (!decision.snoozeUntil) return true;
  const until =
    decision.snoozeUntil instanceof Date
      ? startOfDay(decision.snoozeUntil)
      : parseDateText(String(decision.snoozeUntil));
  if (!until) return true;
  return until.getTime() > today.getTime();
}

/**
 * 从步骤 key 的前缀认类别（`core-puppy-1` → core、`lepto-repeat-2` → lepto）。
 * 也用于把旧的 stepKey 决定回填到类别（#2）。
 */
export function kindOfStepKey(key: string): VaccineKind | null {
  if (key.startsWith('core_early')) return 'core_early';
  if (key.startsWith('core')) return 'core';
  if (key.startsWith('rabies')) return 'rabies';
  if (key.startsWith('lepto')) return 'lepto';
  return null;
}

/* ===========================================================================
 * ③ pickNext
 * =========================================================================== */

/**
 * 按紧迫度取"下一针"（唯一一条）：逾期 → 到窗口 → 未来；同级取窗口最早的。
 *
 * ⚠️ 需求："第一句话永远是「下一针：哪一类 · 什么时候」，**哪怕是三年后**；
 *    不做'没事 / 有事'的二分"。所以最远的那一条也照样是"下一针"。
 */
export function pickNext(steps: MatchedStep[]): MatchedStep | null {
  const candidates = steps.filter(
    (step) => step.status !== 'DONE' && !step.skipped,
  );
  if (candidates.length === 0) return null;

  const rank: Record<StepStatus, number> = {
    OVERDUE: 0,
    DUE: 1,
    UPCOMING: 2,
    DONE: 3,
  };
  return [...candidates].sort((a, b) => {
    const byRank = rank[a.status] - rank[b.status];
    if (byRank !== 0) return byRank;
    return a.windowStart.getTime() - b.windowStart.getTime();
  })[0];
}

/* ===========================================================================
 * ④ buildPlanView
 * =========================================================================== */

/**
 * 抗体检测能不能替代**核心**当前那一针（需求 R9 / 技术方案 1.2）。
 *
 *   ① `targets` 含 `CORE` 且 `result === 'PASS'`（合格与否以报告/兽医为准，我们不设阈值）
 *   ② **20 周龄之前不做**：报告日期必须在 20 周龄之后
 *   ③ 检测日要**晚于最后一次核心接种**（打过针之后才做的检测才算新证据）
 *
 * `RABIES` 只记录、不影响计划（法定每年，法规优先）。
 */
/** 最后一针核心疫苗之后，至少隔这么久再测（需求 R9 的依据栏） */
const TITER_AFTER_DOSE_DAYS = 28;

function latestCoreTiterTest(
  tests: AntibodyTestLike[],
): { test: AntibodyTestLike; date: Date } | null {
  return (
    tests
      .filter(
        (test) => Array.isArray(test.targets) && test.targets.includes('CORE'),
      )
      .map((test) => ({ test, date: parseDateText(test.testedAt) }))
      .filter(
        (item): item is { test: AntibodyTestLike; date: Date } =>
          Boolean(item.date),
      )
      .sort(
        (a, b) =>
          b.date.getTime() - a.date.getTime() ||
          String(b.test.id).localeCompare(String(a.test.id)),
      )[0] ?? null
  );
}

function lastCoreDoseTime(records: PreparedRecord[]): number | undefined {
  return records
    .filter((item) => item.kinds.includes('core'))
    .map((item) => item.date.getTime())
    .sort((a, b) => b - a)[0];
}

/**
 * 检测证据是否成立（#1）：
 *   ① 检测时狗已满 20 周龄（20 周前 MDA 可能还在）；
 *   ② 最后一针核心疫苗之后至少 4 周（刚打完就测，测到的是刚打进去的抗体）。
 */
function isTiterEvidenceValid(
  date: Date,
  birthday: Date,
  records: PreparedRecord[],
): boolean {
  if (date.getTime() < addWeeks(birthday, 20).getTime()) return false;
  const lastCoreDose = lastCoreDoseTime(records);
  return (
    lastCoreDose === undefined ||
    date.getTime() >= lastCoreDose + TITER_AFTER_DOSE_DAYS * DAY_MS
  );
}

/**
 * 最近一次 CORE 检测是 PASS、且证据成立 → 抗体替代核心。
 *
 * ⚠️ 2026-10-30（#1）：**只看最近一次 CORE 检测**。
 *    以前是“在所有 PASS 里找最近的”，于是一条旧的 PASS 会盖过一条新的 FAIL。
 *    Q2 的口径是“只对最新一份生效”，所以先取最新，再看它是 PASS 还是 FAIL。
 */
function findCoreTiterCover(
  tests: AntibodyTestLike[],
  birthday: Date,
  records: PreparedRecord[],
): { testedAt: Date; nextReviewAt: Date } | null {
  const latest = latestCoreTiterTest(tests);
  if (!latest || latest.test.result !== 'PASS') return null;
  if (!isTiterEvidenceValid(latest.date, birthday, records)) return null;
  return {
    testedAt: latest.date,
    nextReviewAt: addYears(latest.date, CORE_TITER_REVIEW_YEARS),
  };
}

/**
 * 最近一次 CORE 检测是 FAIL、且证据成立 → 核心补一针（Q2 已定，2026-10-29）。
 */
function findCoreTiterFail(
  tests: AntibodyTestLike[],
  birthday: Date,
  records: PreparedRecord[],
): { testedAt: Date } | null {
  const latest = latestCoreTiterTest(tests);
  if (!latest || latest.test.result !== 'FAIL') return null;
  if (!isTiterEvidenceValid(latest.date, birthday, records)) return null;
  return { testedAt: latest.date };
}

/** 抗体合格 → 计划里只留**一个**“评估”行（V1/V11） */
function makeTiterReviewStep(
  base: MatchedStep,
  cover: { testedAt: Date; nextReviewAt: Date },
  today: Date,
): MatchedStep {
  const due = cover.nextReviewAt.getTime() <= today.getTime();
  return {
    ...base,
    key: 'core-titer-review',
    label: '评估',
    windowStart: cover.nextReviewAt,
    windowEnd: cover.nextReviewAt,
    missedWindowStart: undefined,
    missedWindowEnd: undefined,
    movedToToday: false,
    status: due ? 'OVERDUE' : 'DONE',
    statusLabel: due ? '建议复查' : '已完成',
    hint: due
      ? `该复查抗体了（上次检测 ${toDateText(cover.testedAt)}）`
      : `这次不用打：抗体检测合格（${toDateText(cover.testedAt)}）`,
    titer: {
      testedAt: toDateText(cover.testedAt),
      nextReviewAt: toDateText(cover.nextReviewAt),
    },
    titerFail: undefined,
    basis:
      `已用抗体检测替代：${toDateText(cover.testedAt)} 的抗体检测结果为合格，` +
      `核心疫苗这一针不用打；建议复查 ${toDateText(cover.nextReviewAt)}。` +
      `是否接种请以执业兽医的意见为准。`,
    matchedRecordId: null,
    matchedRecordDate: null,
    skipped: false,
  };
}

/** 抗体不合格 → 计划里只留**一个**“补一针”行（V3） */
function makeTiterFailStep(
  base: MatchedStep,
  fail: { testedAt: Date },
  today: Date,
): MatchedStep {
  return {
    ...base,
    key: 'core-titer-fail-catchup',
    label: '补一针',
    windowStart: today,
    windowEnd: addWeeks(today, 2),
    missedWindowStart: undefined,
    missedWindowEnd: undefined,
    movedToToday: false,
    status: 'OVERDUE',
    statusLabel: '尽快补种',
    hint: `上次抗体不合格（${toDateText(fail.testedAt)}），补一针`,
    basis:
      `${toDateText(fail.testedAt)} 的核心抗体检测结果为不合格，` +
      `建议补一针核心疫苗；之后是否再测，请以执业兽医的意见为准。`,
    titer: undefined,
    titerFail: { testedAt: toDateText(fail.testedAt) },
    titerable: false,
    matchedRecordId: null,
    matchedRecordDate: null,
    skipped: false,
  };
}

export function buildPlanView(input: BuildPlanViewInput): VaccinePlanView {
  const today = startOfDay(input.today ?? new Date());
  const birthday = parseDateText(input.birthday);
  const decisions = input.decisions ?? {};
  const tests = input.antibodyTests ?? [];

  if (!birthday) {
    return {
      dogId: input.dogId,
      birthday: '',
      ageWeeks: null,
      next: null,
      plan: [],
      ignored: { count: 0, items: [] },
      rhythm: '',
      pendingReview: 0,
      conflicts: [],
      noRecordAtAll: input.records.length === 0,
    };
  }

  const prepared = prepareRecords(input.records, today);
  const steps = matchRecords(
    materializeSteps({ birthday, records: input.records, today }),
    input.records,
    { decisions, today },
  );

  // 计划：每一类的**当前一步**（核心首免系列整段展开）—— 见 plan-view 的说明
  const planned = selectPlanSteps(steps);

  // 抗体检测替代/补一针（需求 R9；#1 V1/V3/V11）
  const titerCover = findCoreTiterCover(tests, birthday, prepared);
  const titerFail = titerCover
    ? null
    : findCoreTiterFail(tests, birthday, prepared);
  const titerCoveredKeys = new Set<string>();
  let planWithTiter = planned;
  if (titerCover) {
    /*
     * V11：只留**一个**“评估”行。
     * 以前是 planned.map，把核心首免的每一步都换成“评估”，出现多行重复。
     */
    const base = planned.find((step) => step.kind === 'core');
    if (base) {
      const review = makeTiterReviewStep(base, titerCover, today);
      titerCoveredKeys.add(review.key);
      planWithTiter = [
        ...planned.filter((step) => step.kind !== 'core'),
        review,
      ];
    }
  } else if (titerFail) {
    // V3：最新一次 CORE 抗体不合格 → 补一针（只留一个“补一针”行）
    const base = planned.find((step) => step.kind === 'core');
    if (base) {
      planWithTiter = [
        ...planned.filter((step) => step.kind !== 'core'),
        makeTiterFailStep(base, titerFail, today),
      ];
    }
  }

  const preferredBrand = resolvePreferredBrand(
    input.records.map((record) => record.vaccineName),
  );

  const planSteps = [...planWithTiter].sort((a, b) => {
    /*
     * `plan` 由后端按时间从近到远排好（前端不再排序）。
     *
     * 时间**相同**时（典型：三件事都被挪到今天"尽快补种"）：
     * 必打（MUST）排在强烈建议（SUGGEST）前面 —— 原型 B 的顺序就是
     * 核心 → 狂犬 → 钩端，而不是按窗口长度排。
     */
    const byTime = a.windowStart.getTime() - b.windowStart.getTime();
    if (byTime !== 0) return byTime;
    const byLayer = (a.layer === 'MUST' ? 0 : 1) - (b.layer === 'MUST' ? 0 : 1);
    if (byLayer !== 0) return byLayer;
    const byEnd = a.windowEnd.getTime() - b.windowEnd.getTime();
    if (byEnd !== 0) return byEnd;
    return a.key.localeCompare(b.key);
  });

  const plan: PlanStepDto[] = planSteps.map((step) =>
    toStepDto(step, {
      weeksAtStep: weeksBetween(birthday, step.windowStart),
      preferredBrand,
      // 只有"这段时间本来就有另一类该打"时才推联苗（否则会顺带重复另一类）
      allowCombo: planSteps.some(
        (other) =>
          other.kind !== step.kind &&
          other.status !== 'DONE' &&
          !other.skipped &&
          other.windowStart.getTime() <= step.windowEnd.getTime() &&
          other.windowEnd.getTime() >= step.windowStart.getTime(),
      ),
      suppressProducts: titerCoveredKeys.has(step.key),
    }),
  );

  // combo：两个异类、都未完成、窗口**真的重叠**、且存在同时含两类且都够龄的联苗
  const planByKey = new Map(plan.map((dto) => [dto.key, dto]));
  for (const dto of plan) {
    const self = planSteps.find((step) => step.key === dto.key);
    if (!self || self.status === 'DONE' || self.skipped) continue;
    for (const other of planSteps) {
      if (other.key === self.key || other.kind === self.kind) continue;
      if (other.status === 'DONE' || other.skipped) continue;
      const overlapStart = laterOf(self.windowStart, other.windowStart);
      const overlapEnd =
        self.windowEnd.getTime() <= other.windowEnd.getTime()
          ? self.windowEnd
          : other.windowEnd;
      // 只挨着一天不算"重叠"（原型 A 的核心第 1 针与钩端第 1 针正是这种）
      if (overlapStart.getTime() >= overlapEnd.getTime()) continue;

      const products = findComboProducts(
        self.kind,
        other.kind,
        weeksBetween(birthday, overlapStart),
      ).map((product) => product.name);
      if (products.length === 0) continue;

      const combo = pickComboForStep(self, other, {
        windowStart: overlapStart,
        windowEnd: overlapEnd,
        products,
      });
      planByKey.set(dto.key, { ...dto, combo });
      break; // 每步最多一个 combo
    }
  }

  const nextStep = pickNext(planWithTiter);
  const next = nextStep ? (planByKey.get(nextStep.key) ?? null) : null;
  const ignoredCount = buildIgnored(steps, decisions).count;

  return {
    dogId: input.dogId,
    birthday: toDateText(birthday),
    ageWeeks: weeksBetween(birthday, today),
    next,
    plan: plan.map((dto) => planByKey.get(dto.key) ?? dto),
    ignored: buildIgnored(steps, decisions),
    rhythm: buildRhythm(plan, titerCover !== null, ignoredCount > 0),
    pendingReview: input.records.filter(
      (record) => record.productVerified === false,
    ).length,
    conflicts: buildConflicts({
      birthday,
      records: input.records,
      prepared,
      tests,
      today,
    }),
    noRecordAtAll: input.records.length === 0,
  };
}

export { VACCINE_KIND_LABELS };
