/**
 * 视图模型组装（2026-10-15）—— 给前端的那一份"已经算好的东西"。
 *
 * 技术方案第三章：前端只渲染，不做任何计算。所以这里负责四件事：
 *
 *   ① `selectPlanSteps` 免疫计划里放哪几步（每一类的"当前一步"）
 *   ② `toStepDto`       一步 → 下发形状（含 `kindLabel` / `statusLabel` / 常见产品）
 *   ③ `buildIgnored`    "已忽略 N 项"（**真实值**，冲突 A1 的修复）
 *   ④ `buildRhythm`     "之后：狂犬与钩端每年一次，核心疫苗每 3 年一次"
 *   ⑤ `buildConflicts`  冲突提示（`kind` 不再硬编码，冲突 A7）
 *
 * 这里同样**不碰数据库**，只吃 engine 算好的步骤。
 */

import {
  CORE_SCHEDULE,
  RHYTHM_ALL_IGNORED,
  VACCINE_KIND_LABELS,
  VACCINE_KIND_SHORT_LABELS,
  type VaccineKind,
} from './schedule-table';
import { recommendProductsForStep } from './products';
import {
  addWeeks,
  parseDateText,
  toDateText,
  type MatchedStep,
  type PreparedRecord,
  type VaccineDecisionLike,
  type VaccineRecordLike,
} from './engine';

/* ===========================================================================
 * 下发形状（技术方案第三章 · 冻结契约）
 * =========================================================================== */

/** 「可以和另一类一起打」（老板 2026-10-14 / 原型 G） */
export interface PlanComboDto {
  /** 可以和哪一类合并 */
  withKind: VaccineKind;
  /** 那一类的中文名（直接下发，前端不再自己映射） */
  withLabel: string;
  /** 两边都合适的日期区间（两窗口的交集） */
  windowStart: string;
  windowEnd: string;
  /**
   * 能一支顶两类的产品名 —— **不截断**（冲突 A5：
   * 原来跟"每类推荐 3 支"共用一个上限，把维克犬四联加钩端截掉了）。
   */
  products: string[];
  /** 那句话本身（原型 G："这一针可以和钩端螺旋体一起打"） */
  hint: string;
}

export interface PlanStepDto {
  key: string;
  kind: VaccineKind;
  /** 带病种的类别名：`核心疫苗（犬瘟、细小、腺病毒）` */
  kindLabel: string;
  /** 人话：`第 1 针` / `每年一次` / `加强（每 3 年）` / `补一针` */
  label: string;
  /** 分级：必打 / 强烈建议 */
  layer: 'MUST' | 'SUGGEST';
  windowStart: string;
  windowEnd: string;
  /** 只在"起针窗口过了、被挪到今天"时有值 */
  missedWindowStart?: string;
  missedWindowEnd?: string;
  status: 'DONE' | 'DUE' | 'UPCOMING' | 'OVERDUE';
  /** 待接种 / 已完成 / 尽快补种 */
  statusLabel: string;
  /** 类别**短名**（计划行那种窄位置用；长名会把行撑成两行） */
  kindShort?: string;
  /** 卡片上那行**短话**（原型 B/F/I 卡上那句）；与 `basis` 分工见程序表 */
  hint?: string;
  /**
   * 这一针是被**抗体检测替代**的（原型 F）：
   * 时间含义变成"下次评估"，行上写"这次不用打：抗体检测合格（X）"。
   */
  titer?: {
    testedAt: string;
    nextReviewAt: string;
  };
  /** 这一步为什么在这个时间 */
  basis?: string;
  /** 这一项能不能用抗体检测替代 */
  titerable: boolean;
  /** 常见产品（"常见的有…"，最多 3 支） */
  products: string[];
  /** 可以和谁一起打（每步最多一个） */
  combo?: PlanComboDto | null;
}

/* ===========================================================================
 * ① 免疫计划里放哪几步
 * =========================================================================== */

/**
 * 需求 7.3："不穷举，按**看得见的近期 + 每类的下一次 + 之后的节奏**三段给"。
 *
 * 落到代码就是：**每一类只给它的"当前一步"**——
 *
 *   · 当前一步 = 该类第一个**还没完成**的步骤（时间上最早的那一步）
 *   · 核心的**首免系列**是个例外：它是"一段"而不是"一针"，
 *     所以整段展开（原型 A："往下能看到 4 针 + 狂犬 + 2027 年补强"），
 *     一直到系列收尾的 26 周补强为止
 *   · 这一步被顾客**忽略**了 → 这一类不再出现在计划里；
 *     如果它以前有打完的针，就把**最后打完的那一步**留在计划里
 *     （原型 K：三项都设为不做之后，计划里只剩两条"已完成"）
 *   · 早期核心疫苗只有"记录里带 core_early"时才展开，展开即已完成，
 *     照旧显示（需求第四节：不主动推，但录过就认）
 */
export function selectPlanSteps(steps: MatchedStep[]): MatchedStep[] {
  const byKind = new Map<VaccineKind, MatchedStep[]>();
  for (const step of steps) {
    const list = byKind.get(step.kind) ?? [];
    list.push(step);
    byKind.set(step.kind, list);
  }

  const selected: MatchedStep[] = [];
  const kindOrder: VaccineKind[] = ['core_early', 'core', 'rabies', 'lepto'];
  for (const kind of kindOrder) {
    const list = (byKind.get(kind) ?? []).sort(
      (a, b) => a.windowStart.getTime() - b.windowStart.getTime(),
    );
    if (list.length === 0) continue;

    // 早期核心疫苗：展开即"打过"，直接显示成已完成的一步
    if (kind === 'core_early') {
      selected.push(list[0]);
      continue;
    }

    /**
     * 该类"当前这一步" = 第一个**既没完成、也没被忽略**的步骤。
     *
     * ⚠️ 2026-10-16 修：原来找的是"第一个没完成的"，于是被忽略的那一步会一直
     *    挡在前面 —— 「这次先不打」和「不再接种了」在页面上变得一模一样
     *    （都永久安静），可按钮上写的是"之后还会提醒" ✗。两种含义必须分得开：
     *      · NOT_NOW（这次先不打）→ 跳过这一步，**后面那一步照常来**（可能是一年后）
     *      · STOPPED（不再接种了）→ 整类都标成 skipped（在引擎里做），这里就找不到当前步了
     */
    const currentIndex = list.findIndex(
      (step) => step.status !== 'DONE' && !step.skipped,
    );
    if (currentIndex < 0) {
      // 这一类没有待办了（全完成 / 全设成不做）→ 只留最后打完的那一行（原型 K）
      const lastDone = [...list]
        .reverse()
        .find((step) => step.status === 'DONE');
      if (lastDone) selected.push(lastDone);
      continue;
    }
    const current = list[currentIndex];

    // 核心首免系列：整段展开，到系列收尾（26 周补强）为止
    if (kind === 'core' && current.series === 'PRIMARY') {
      for (const step of list.slice(currentIndex)) {
        if (step.series === 'BOOSTER') {
          if (step.status !== 'DONE' && !step.skipped) selected.push(step);
          break;
        }
        if (step.status !== 'DONE' && !step.skipped) selected.push(step);
      }
      continue;
    }

    selected.push(current);
  }

  return selected;
}

/* ===========================================================================
 * ② 一步 → 下发形状
 * =========================================================================== */

/**
 * 抗体检测的最小周龄（需求 R9：20 周龄之前不做）。
 *
 * 为什么是 20 周：幼犬的母源抗体会干扰检测结果，20 周龄前测出来的
 * "合格/不合格"都不能作为免打一针的依据（WSAVA 2024 也是这个口径）。
 */
const MIN_TITER_AGE_WEEKS = 20;

export function toStepDto(
  step: MatchedStep,
  options: {
    weeksAtStep: number;
    preferredBrand?: string;
    allowCombo?: boolean;
    /** 抗体检测替代掉的那一行不再推产品（推了会误导） */
    suppressProducts?: boolean;
  },
): PlanStepDto {
  const products = options.suppressProducts
    ? []
    : recommendProductsForStep(step.kind, options.weeksAtStep, {
        preferredBrand: options.preferredBrand,
        allowCombo: options.allowCombo,
      }).map((product) => product.name);

  return {
    key: step.key,
    kind: step.kind,
    kindLabel: VACCINE_KIND_LABELS[step.kind],
    kindShort: VACCINE_KIND_SHORT_LABELS[step.kind],
    label: step.label,
    layer: step.layer,
    windowStart: toDateText(step.windowStart),
    windowEnd: toDateText(step.windowEnd),
    ...(step.missedWindowStart && step.missedWindowEnd
      ? {
          missedWindowStart: toDateText(step.missedWindowStart),
          missedWindowEnd: toDateText(step.missedWindowEnd),
        }
      : {}),
    status: step.status,
    statusLabel: step.statusLabel,
    hint: step.hint,
    ...(step.titer ? { titer: step.titer } : {}),
    basis: step.basis,
    /**
     * 能不能用抗体检测替代（需求 R9：**20 周龄之前不做**）。
     *
     * ⚠️ 2026-10-16 修（老板："一只两周龄的狗狗做抗体检测是否不合理呢？"）：
     *    这里原来直接透传程序表的 `titerable`（核心疫苗都是 true），
     *    于是一只 2 周龄的幼犬，卡片上也会出现「先做抗体检测」——
     *    可它的母源抗体还在，测了也说明不了任何事，指南也不建议 20 周龄前测。
     *    所以按**这一步窗口开始时狗的周龄**再判一道：不满 20 周就不给这条路。
     */
    titerable: step.titerable && options.weeksAtStep >= MIN_TITER_AGE_WEEKS,
    products,
    combo: null,
  };
}

/** 组一句"可以和 X 一起打" */
export function pickComboForStep(
  self: MatchedStep,
  other: MatchedStep,
  detail: { windowStart: Date; windowEnd: Date; products: string[] },
): PlanComboDto {
  const withLabel = VACCINE_KIND_LABELS[other.kind];
  return {
    withKind: other.kind,
    withLabel,
    windowStart: toDateText(detail.windowStart),
    windowEnd: toDateText(detail.windowEnd),
    products: [...detail.products],
    hint: `这一针可以和${withLabel}一起打`,
  };
}

/* ===========================================================================
 * ③ 已忽略的项（冲突 A1：原来 `count` 恒为 0）
 * =========================================================================== */

/**
 * `VaccineDecision` 里 `decision = SKIP` 的步骤。
 *
 * ⚠️ 事实优先于忽略：这一步**真的打了**就不算"忽略"（打了针是事实，
 *    不做只是当时的意图）。所以只统计仍未完成的那些。
 */
export function buildIgnored(
  steps: MatchedStep[],
  decisions: Record<string, VaccineDecisionLike>,
): {
  count: number;
  items: Array<{
    key: string;
    kindLabel: string;
    label: string;
    reason: string | null;
  }>;
} {
  const items = steps
    .filter(
      (step) =>
        decisions[step.key]?.decision === 'SKIP' && step.status !== 'DONE',
    )
    .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime())
    .map((step) => ({
      key: step.key,
      kindLabel: VACCINE_KIND_LABELS[step.kind],
      label: step.label,
      // `reason` 原样带出：NOT_NOW（这次先不打）/ STOPPED（不再接种了）
      reason: decisions[step.key]?.reason ?? null,
    }));

  return { count: items.length, items };
}

/* ===========================================================================
 * ④ 节奏那一句话
 * =========================================================================== */

/**
 * 需求 7.3 第三段："之后的节奏 —— 一句话说清规律，不再逐条排"。
 *
 * 例（原型 A/B/C）：`之后：狂犬与钩端每年一次，核心疫苗每 3 年一次`
 * 例（原型 F，核心被抗体检测替代）：`之后：狂犬与钩端每年一次，核心疫苗每 3 年评估一次`
 * 例（原型 K，全都设为不做）：`已设为不做的项目，可以在上面那一行点开`
 */
export function buildRhythm(
  plan: PlanStepDto[],
  coreReplacedByTiter: boolean,
  hasIgnored = false,
): string {
  const pending = plan.filter((step) => step.status !== 'DONE');
  if (pending.length === 0) {
    // 所有项目都被设为不做（原型 K 唯一不写"下一针"的情况）
    return plan.length > 0 || hasIgnored ? RHYTHM_ALL_IGNORED : '';
  }

  const kinds = new Set(pending.map((step) => step.kind));
  const annual: string[] = [];
  if (kinds.has('rabies')) annual.push('狂犬');
  if (kinds.has('lepto')) annual.push('钩端');

  const parts: string[] = [];
  if (annual.length > 0) {
    parts.push(`${annual.join('与')}每年一次`);
  }
  // 核心被抗体检测替代时，那一行是"已完成"（不进 pending），
  // 但节奏句仍要说清它的规律（原型 F：核心疫苗每 3 年评估一次）
  if (kinds.has('core') || coreReplacedByTiter) {
    parts.push(
      coreReplacedByTiter ? '核心疫苗每 3 年评估一次' : '核心疫苗每 3 年一次',
    );
  }
  return parts.length > 0 ? `之后：${parts.join('，')}` : '';
}

/* ===========================================================================
 * ⑤ 冲突提示
 * =========================================================================== */

/**
 * 需求 R13 / R15：日期与记录的异常要在页面上说清（"加载失败 ≠ 没有记录"）。
 *
 * 本次保留的三条（另外两条随字段一起删掉了）：
 *   · 接种日期填到了**未来**（手写年份写错、OCR 读错）→ 它会把没打的针标成已完成
 *   · 核心苗打在 **4 周龄之前**（指南红线）或**早于生日**（多半是年份写错）
 *   · 狂犬两针间隔**不足一年**（国内按年接种）
 *   · 抗体检测在 **20 周龄之前**做（指南：20 周龄以上的抗体才指示保护）
 *
 * ⚠️ `kind` **不再硬编码**（冲突 A7）：按这条记录自己归出来的类别填。
 * ⚠️ 已删除：「记录里写的下次到期日与建议时间对不上」——
 *    那个字段整个不用了（老板 2026-10-15 定），没有"报冲突"这一说。
 */
export function buildConflicts(input: {
  birthday: Date;
  records: VaccineRecordLike[];
  prepared: PreparedRecord[];
  tests: Array<{
    id: string;
    testedAt: string;
    targets: string[];
    result: string;
  }>;
  today: Date;
}): Array<{
  kind: string;
  recordId: string;
  recordDate: string;
  vaccineName: string;
  reason: string;
  suggestion: string;
}> {
  const { birthday, prepared, today } = input;
  const conflicts: ReturnType<typeof buildConflicts> = [];
  const kindOf = (record: VaccineRecordLike): string =>
    prepared.find((item) => item.record.id === record.id)?.kinds[0] ?? 'other';

  // ① 日期在未来 → 不参与匹配（会把"还没打的针"标成已完成）
  for (const record of input.records) {
    const date = parseDateText(record.vaccinationDate);
    if (!date) continue;
    if (date.getTime() <= today.getTime()) continue;
    conflicts.push({
      kind: kindOf(record),
      recordId: record.id,
      recordDate: toDateText(date),
      vaccineName: record.vaccineName,
      reason: `这一针的接种日期（${toDateText(date)}）还没到`,
      suggestion: '请核对疫苗本上的日期（最常见的错法是把年份写错）。',
    });
  }

  // ② 核心苗打在 4 周龄之前 / 早于生日
  const minimumAge = addWeeks(birthday, CORE_SCHEDULE.startWeeks - 2); // 4 周龄
  for (const item of prepared) {
    if (!item.kinds.includes('core')) continue;
    if (item.date.getTime() >= minimumAge.getTime()) continue;

    if (item.date.getTime() < birthday.getTime()) {
      conflicts.push({
        kind: 'core',
        recordId: item.record.id,
        recordDate: toDateText(item.date),
        vaccineName: item.record.vaccineName,
        reason: `这一针的接种日期（${toDateText(item.date)}）比狗狗生日还早`,
        suggestion: '请核对疫苗本上的日期（最常见的错法是把年份写错）。',
      });
      continue;
    }

    conflicts.push({
      kind: 'core',
      recordId: item.record.id,
      recordDate: toDateText(item.date),
      vaccineName: item.record.vaccineName,
      reason: `这一针打在 4 周龄之前`,
      suggestion:
        '指南不建议给 4 周龄以下幼犬接种（母源抗体会中和疫苗，注射用活苗还可能有害）。' +
        '建议把这次记录带给兽医看，由他判断这一针是否计数、后续怎么排。',
    });
  }

  // ③ 狂犬两针间隔不足一年
  const rabiesDoses = prepared
    .filter((item) => item.kinds.includes('rabies'))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  for (let index = 1; index < rabiesDoses.length; index += 1) {
    const previous = rabiesDoses[index - 1];
    const current = rabiesDoses[index];
    const daysApart =
      (current.date.getTime() - previous.date.getTime()) / 86400000;
    if (daysApart >= 365) continue;
    conflicts.push({
      kind: 'rabies',
      recordId: current.record.id,
      recordDate: toDateText(current.date),
      vaccineName: current.record.vaccineName,
      reason: `与上一针狂犬相隔约 ${Math.max(1, Math.round(daysApart / 30))} 个月，短于一年`,
      suggestion:
        '国内狂犬通常每年一次。这次间隔偏短，建议与兽医确认是否按当地要求执行。',
    });
  }

  // ④ 抗体检测在 20 周龄之前做（指南：20 周龄以上的抗体才指示保护）
  const titerMinimumAge = addWeeks(birthday, 20);
  for (const test of input.tests) {
    if (!Array.isArray(test.targets) || !test.targets.includes('CORE'))
      continue;
    const date = parseDateText(test.testedAt);
    if (!date) continue;
    if (date.getTime() >= titerMinimumAge.getTime()) continue;
    conflicts.push({
      kind: 'core',
      recordId: test.id,
      recordDate: toDateText(date),
      vaccineName: '抗体检测（核心三项）',
      reason: '这份抗体检测是在 20 周龄之前做的',
      suggestion:
        'WSAVA 2024：20 周龄以上犬只血清中有抗体才被认为指示保护。' +
        '这一份先不作为"可以不打"的依据，建议 20 周龄后复查，或直接按计划接种。',
    });
  }

  return conflicts;
}
