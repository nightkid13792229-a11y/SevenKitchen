import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  CHALLENGE_RULES,
  ELIMINATION_DIRECTIONS,
  ITCH_SCALE,
  STOOL_SCALE,
  STRICT_RULES,
  VET_BOUNDARY_NOTES,
  getDurationAdvice,
  resolveDayIndex,
  resolvePlannedEndDate,
  summarizeTrialTrend,
} from '../../domain/health/elimination-trial';

/**
 * 过敏原排查计划（2026-10-04，过敏重构第三期）
 *
 * 老板第 2 条："对于很多需要做过敏排查的用户来说，
 * 可以创建过敏原的排查计划。"
 *
 * ── 定位（很重要，决定了这个服务"不做什么"）──────────────
 *
 *   知识库 skin-003 / skin-004 都写明：排除试验**必须由兽医设计并监督**。
 *   所以这里只做三件事：
 *     1. 按方向给建议时长（带出处）
 *     2. 记录执行过程（打卡、破戒）
 *     3. 把再挑战的结论回写到过敏记录上
 *
 *   **不做**：给用药建议、判断是不是过敏、替顾客下结论。
 *
 * ── 为什么打卡要做得很轻 ────────────────────────────────────
 *
 *   皮肤方向要喂 6～12 周。太重的话顾客坚持不到最后，
 *   计划废掉、数据也白记。所以一天只有三个动作：
 *   痒不痒、大便怎么样、有没有破戒。
 */
const ACTIVE_STATUSES = ['DRAFT', 'ELIMINATION', 'CHALLENGE'];

const DIRECTIONS = new Set(ELIMINATION_DIRECTIONS.map((item) => item.value));

export interface CreateTrialInput {
  direction?: string;
  focusAllergens?: string[];
  startDate?: string | null;
  plannedDays?: number | null;
  currentFoodNote?: string | null;
  notes?: string | null;
}

export interface UpdateTrialInput extends CreateTrialInput {
  status?: string;
  strictRules?: Record<string, boolean>;
}

@Injectable()
export class AllergyTrialService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 这只狗的排查计划（含打卡与再挑战）。
   *
   * 同时返回"规则表"——建议时长、必守清单、再挑战窗口、兽医边界提示。
   * 规则由后端下发而不是写在小程序里：知识库更新时只改一处，
   * 而且这些数字都带出处，不该散落在客户端。
   */
  async getActive(customerId: string, dogId: string) {
    await this.requireOwnedDog(customerId, dogId);

    const trial = await this.prisma.allergyTrial.findFirst({
      where: { dogId, status: { in: ACTIVE_STATUSES as never } },
      orderBy: { createdAt: 'desc' },
      include: {
        logs: { orderBy: { logDate: 'asc' } },
        challenges: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!trial) {
      return {
        dogId,
        trial: null,
        rules: this.buildRules(),
      };
    }

    return {
      dogId,
      trial: this.toClientTrial(trial),
      rules: this.buildRules(),
    };
  }

  /** 历史计划（已结束 / 已放弃），倒序 */
  async listHistory(customerId: string, dogId: string) {
    await this.requireOwnedDog(customerId, dogId);

    const trials = await this.prisma.allergyTrial.findMany({
      where: { dogId, status: { in: ['COMPLETED', 'ABANDONED'] } },
      orderBy: { createdAt: 'desc' },
      include: { challenges: true },
      take: 20,
    });

    return {
      dogId,
      total: trials.length,
      trials: trials.map((trial) => ({
        id: trial.id,
        status: trial.status,
        direction: trial.direction,
        focusAllergens: trial.focusAllergens,
        startDate: toDateText(trial.startDate),
        plannedEndDate: toDateText(trial.plannedEndDate),
        concludedAt: trial.concludedAt?.toISOString() ?? null,
        challenges: trial.challenges.map((challenge) => ({
          allergen: challenge.allergen,
          outcome: challenge.outcome,
        })),
      })),
    };
  }

  /** 新建计划 */
  async create(customerId: string, dogId: string, input: CreateTrialInput) {
    await this.requireOwnedDog(customerId, dogId);

    const existing = await this.prisma.allergyTrial.findFirst({
      where: { dogId, status: { in: ACTIVE_STATUSES as never } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('这只狗已经有一个进行中的排查计划了');
    }

    const direction = normalizeDirection(input.direction);
    const advice = getDurationAdvice(direction);
    const plannedDays = normalizePlannedDays(input.plannedDays, advice);
    const focusAllergens = normalizeAllergenList(input.focusAllergens);
    const startDate = parseDate(input.startDate);

    const trial = await this.prisma.allergyTrial.create({
      data: {
        dogId,
        direction: direction as never,
        focusAllergens,
        plannedDays,
        startDate,
        plannedEndDate: startDate
          ? resolvePlannedEndDate(startDate, plannedDays)
          : null,
        currentFoodNote: trimTo(input.currentFoodNote, 500),
        notes: trimTo(input.notes, 1000),
        // 必守清单初始全部未勾选 —— 顾客要自己逐条确认，
        // 不给"看起来已经做到了"的假象
        strictRules: {},
      },
    });

    return this.getActive(customerId, dogId).then(() => trial);
  }

  /** 修改计划（含开始排除期、结束计划） */
  async update(
    customerId: string,
    dogId: string,
    trialId: string,
    input: UpdateTrialInput,
  ) {
    await this.requireOwnedDog(customerId, dogId);

    const trial = await this.requireTrial(dogId, trialId);

    const direction =
      input.direction === undefined
        ? undefined
        : normalizeDirection(input.direction);

    const startDate =
      input.startDate === undefined ? undefined : parseDate(input.startDate);

    // 方向变了而顾客没显式指定天数时，跟着新方向的建议走
    const advice = getDurationAdvice(direction ?? trial.direction);
    const plannedDays =
      input.plannedDays === undefined || input.plannedDays === null
        ? direction !== undefined && input.plannedDays === undefined
          ? advice.minDays
          : undefined
        : normalizePlannedDays(input.plannedDays, advice);

    const nextStart = startDate === undefined ? trial.startDate : startDate;
    const nextDays = plannedDays ?? trial.plannedDays;

    const status = input.status === undefined ? undefined : normalizeStatus(input.status);

    await this.prisma.allergyTrial.update({
      where: { id: trialId },
      data: {
        direction: direction as never,
        focusAllergens:
          input.focusAllergens === undefined
            ? undefined
            : normalizeAllergenList(input.focusAllergens),
        startDate,
        plannedDays,
        plannedEndDate:
          nextStart === null
            ? null
            : resolvePlannedEndDate(nextStart, nextDays),
        currentFoodNote:
          input.currentFoodNote === undefined
            ? undefined
            : trimTo(input.currentFoodNote, 500),
        notes: input.notes === undefined ? undefined : trimTo(input.notes, 1000),
        strictRules:
          input.strictRules === undefined
            ? undefined
            : normalizeStrictRules(input.strictRules),
        status: status as never,
        concludedAt:
          status === 'COMPLETED' || status === 'ABANDONED'
            ? new Date()
            : status === undefined
              ? undefined
              : null,
      },
    });

    return this.getActive(customerId, dogId);
  }

  /** 每日打卡（同一天重复提交按更新处理） */
  async logDay(
    customerId: string,
    dogId: string,
    trialId: string,
    input: {
      logDate?: string;
      itchScore?: number | null;
      stoolScore?: number | null;
      brokeStrict?: boolean;
      note?: string | null;
    },
  ) {
    await this.requireOwnedDog(customerId, dogId);
    await this.requireTrial(dogId, trialId);

    const logDate = parseDate(input.logDate) ?? startOfToday();

    await this.prisma.allergyTrialLog.upsert({
      where: { trialId_logDate: { trialId, logDate } },
      create: {
        trialId,
        logDate,
        itchScore: normalizeScore(input.itchScore),
        stoolScore: normalizeScore(input.stoolScore),
        brokeStrict: input.brokeStrict === true,
        note: trimTo(input.note, 500),
      },
      update: {
        itchScore:
          input.itchScore === undefined
            ? undefined
            : normalizeScore(input.itchScore),
        stoolScore:
          input.stoolScore === undefined
            ? undefined
            : normalizeScore(input.stoolScore),
        brokeStrict:
          input.brokeStrict === undefined ? undefined : input.brokeStrict === true,
        note: input.note === undefined ? undefined : trimTo(input.note, 500),
      },
    });

    return this.getActive(customerId, dogId);
  }

  /**
   * 开始再挑战：为每个目标过敏原建一条挑战记录。
   *
   * 指南要求**一次只加回一种**（skin-003：症状可能数小时内出现，
   * 也可能延迟至 14 天）—— 同时加回多种就分不清是哪一个引起的。
   */
  async startChallenge(customerId: string, dogId: string, trialId: string) {
    await this.requireOwnedDog(customerId, dogId);
    const trial = await this.requireTrial(dogId, trialId);

    const focus = trial.focusAllergens ?? [];
    if (focus.length === 0) {
      throw new BadRequestException('这个计划还没有指定要排查的过敏原');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const allergen of focus) {
        await tx.allergyTrialChallenge.upsert({
          where: { trialId_allergen: { trialId, allergen } },
          create: { trialId, allergen, outcome: 'PENDING' },
          update: {},
        });
      }
      await tx.allergyTrial.update({
        where: { id: trialId },
        data: { status: 'CHALLENGE' },
      });
    });

    return this.getActive(customerId, dogId);
  }

  /**
   * 记录一项再挑战的结论，并**回写到过敏记录**。
   *
   * 这是整个计划产生价值的地方：
   *   复发了   → 该过敏原标为「确诊」→ 含它的食谱**彻底不进推荐**
   *   没反应   → 标为「已排除」      → 不再避开，食谱选择变多
   *   不确定   → 保持「待排查」
   *
   * 结论由顾客/兽医给。系统只负责把它落到推荐与配方真正读的那个字段上。
   */
  async concludeChallenge(
    customerId: string,
    dogId: string,
    trialId: string,
    allergen: string,
    input: { outcome?: string; reactionNote?: string | null },
  ) {
    await this.requireOwnedDog(customerId, dogId);
    await this.requireTrial(dogId, trialId);

    const outcome = normalizeOutcome(input.outcome);
    const target = String(allergen || '').trim();
    if (!target) {
      throw new BadRequestException('请指定要记录结论的过敏原');
    }

    const certainty =
      outcome === 'REACTED'
        ? 'CONFIRMED'
        : outcome === 'NO_REACTION'
          ? 'RULED_OUT'
          : 'TO_VERIFY';

    await this.prisma.$transaction(async (tx) => {
      await tx.allergyTrialChallenge.upsert({
        where: { trialId_allergen: { trialId, allergen: target } },
        create: {
          trialId,
          allergen: target,
          outcome: outcome as never,
          endedAt: startOfToday(),
          reactionNote: trimTo(input.reactionNote, 1000),
        },
        update: {
          outcome: outcome as never,
          endedAt: startOfToday(),
          reactionNote: trimTo(input.reactionNote, 1000),
        },
      });

      // 回写过敏记录：没有就先建一条，有就更新可信度
      const existing = await tx.allergyRecord.findUnique({
        where: { dogId_allergen: { dogId, allergen: target } },
      });

      if (existing) {
        await tx.allergyRecord.update({
          where: { id: existing.id },
          data: { certainty: certainty as never, source: 'PLAN' },
        });
      } else {
        await tx.allergyRecord.create({
          data: {
            dogId,
            allergen: target,
            certainty: certainty as never,
            source: 'PLAN',
            notes: '排查计划得出的结论',
          },
        });
      }
    });

    return this.getActive(customerId, dogId);
  }

  /** 结束计划（含"中途放弃"—— 如实记录，不假装没发生过） */
  async conclude(
    customerId: string,
    dogId: string,
    trialId: string,
    input: { abandoned?: boolean; notes?: string | null },
  ) {
    await this.requireOwnedDog(customerId, dogId);
    await this.requireTrial(dogId, trialId);

    await this.prisma.allergyTrial.update({
      where: { id: trialId },
      data: {
        status: input.abandoned ? 'ABANDONED' : 'COMPLETED',
        concludedAt: new Date(),
        notes: input.notes === undefined ? undefined : trimTo(input.notes, 1000),
      },
    });

    return this.getActive(customerId, dogId);
  }

  // -------------------------------------------------------------------------

  private buildRules() {
    return {
      directions: ELIMINATION_DIRECTIONS,
      strictRules: STRICT_RULES,
      challenge: CHALLENGE_RULES,
      itchScale: ITCH_SCALE,
      stoolScale: STOOL_SCALE,
      /**
       * 这两条必须原样显示给顾客（不得改写、不得折叠隐藏）：
       *   ① 试验必须由兽医设计与监督
       *   ② 皮试 / 血清 IgE 对食物不良反应不能确诊
       */
      vetBoundaryNotes: VET_BOUNDARY_NOTES,
    };
  }

  private toClientTrial(trial: {
    id: string;
    status: string;
    direction: string;
    focusAllergens: string[];
    startDate: Date | null;
    plannedEndDate: Date | null;
    plannedDays: number;
    currentFoodNote: string | null;
    strictRules: unknown;
    notes: string | null;
    createdAt: Date;
    logs: Array<{
      id: string;
      logDate: Date;
      itchScore: number | null;
      stoolScore: number | null;
      brokeStrict: boolean;
      note: string | null;
    }>;
    challenges: Array<{
      id: string;
      allergen: string;
      startedAt: Date | null;
      endedAt: Date | null;
      outcome: string;
      reactionNote: string | null;
    }>;
  }) {
    const advice = getDurationAdvice(trial.direction);
    const today = startOfToday();
    const dayIndex = trial.startDate
      ? resolveDayIndex(trial.startDate, today)
      : null;

    const itchTrend = summarizeTrialTrend(trial.logs, 'itchScore');
    const stoolTrend = summarizeTrialTrend(trial.logs, 'stoolScore');

    const strictRules =
      trial.strictRules && typeof trial.strictRules === 'object'
        ? (trial.strictRules as Record<string, boolean>)
        : {};
    const checkedCount = STRICT_RULES.filter(
      (rule) => strictRules[rule.key] === true,
    ).length;

    const missedDays = trial.logs.filter((log) => log.brokeStrict).length;

    return {
      id: trial.id,
      status: trial.status,
      direction: trial.direction,
      directionLabel:
        ELIMINATION_DIRECTIONS.find((item) => item.value === trial.direction)
          ?.label ?? '皮肤',
      focusAllergens: trial.focusAllergens ?? [],
      startDate: toDateText(trial.startDate),
      plannedEndDate: toDateText(trial.plannedEndDate),
      plannedDays: trial.plannedDays,
      currentFoodNote: trial.currentFoodNote,
      notes: trial.notes,
      createdAt: trial.createdAt.toISOString(),

      /** 第几天 / 共几天 —— 给进度条用 */
      dayIndex,
      /** 建议时长与依据（每次都下发，知识库更新后立即生效） */
      advice,

      /** 必守清单的勾选进度：没勾完就提示，但**不拦**开始 */
      strictRules,
      strictRulesChecked: checkedCount,
      strictRulesTotal: STRICT_RULES.length,

      /** 打卡情况：漏记与破戒都要如实呈现，不能只显示好看的 */
      loggedDays: trial.logs.length,
      brokeStrictDays: missedDays,
      logs: trial.logs.map((log) => ({
        id: log.id,
        logDate: toDateText(log.logDate),
        itchScore: log.itchScore,
        stoolScore: log.stoolScore,
        brokeStrict: log.brokeStrict,
        note: log.note,
      })),
      trend: { itch: itchTrend, stool: stoolTrend },

      challenges: trial.challenges.map((challenge) => ({
        id: challenge.id,
        allergen: challenge.allergen,
        startedAt: toDateText(challenge.startedAt),
        endedAt: toDateText(challenge.endedAt),
        outcome: challenge.outcome,
        reactionNote: challenge.reactionNote,
      })),
    };
  }

  private async requireTrial(dogId: string, trialId: string) {
    const trial = await this.prisma.allergyTrial.findFirst({
      where: { id: trialId, dogId },
    });
    if (!trial) {
      throw new NotFoundException('排查计划不存在');
    }
    return trial;
  }

  private async requireOwnedDog(customerId: string, dogId: string) {
    const dog = await this.prisma.dog.findUnique({ where: { id: dogId } });
    if (!dog) {
      throw new NotFoundException('Dog not found');
    }
    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }
    return dog;
  }
}

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

export function normalizeDirection(value: unknown): string {
  const key = String(value || '').trim().toUpperCase();
  return DIRECTIONS.has(key as never) ? key : 'SKIN';
}

export function normalizeStatus(value: unknown): string {
  const key = String(value || '').trim().toUpperCase();
  const allowed = new Set([
    'DRAFT',
    'ELIMINATION',
    'CHALLENGE',
    'COMPLETED',
    'ABANDONED',
  ]);
  if (!allowed.has(key)) {
    throw new BadRequestException('计划状态不合法');
  }
  return key;
}

export function normalizeOutcome(value: unknown): string {
  const key = String(value || '').trim().toUpperCase();
  const allowed = new Set(['PENDING', 'REACTED', 'NO_REACTION', 'UNCERTAIN']);
  if (!allowed.has(key)) {
    throw new BadRequestException('再挑战结论不合法');
  }
  return key;
}

function normalizePlannedDays(
  value: number | null | undefined,
  advice: { minDays: number; maxDays: number },
): number {
  if (value === null || value === undefined) {
    return advice.minDays;
  }
  const days = Math.round(Number(value));
  if (!Number.isFinite(days)) {
    return advice.minDays;
  }
  // 允许调整，但夹在合理区间里：
  // 太短会让顾客在"还没见效"时误判成"不过敏"（指南明确这会过度诊断）
  return Math.min(365, Math.max(7, days));
}

function normalizeAllergenList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const name = String(item ?? '').trim().slice(0, 40);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    // 一次排查 3 个以上就没法归因了，而且顾客也执行不了
    if (result.length >= 5) break;
  }
  return result;
}

function normalizeStrictRules(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, boolean> = {};
  for (const rule of STRICT_RULES) {
    if ((value as Record<string, unknown>)[rule.key] === true) {
      result[rule.key] = true;
    }
  }
  return result;
}

function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const score = Math.round(Number(value));
  if (!Number.isFinite(score) || score < 0 || score > 3) return null;
  return score;
}

function trimTo(value: unknown, max: number): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function parseDate(value: unknown): Date | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const matched = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1990 || year > 2100) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function toDateText(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}
