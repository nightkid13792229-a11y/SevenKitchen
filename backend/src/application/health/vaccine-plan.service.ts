import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  buildPlanView,
  kindOfStepKey,
  materializeSteps,
  parseDateText,
  toDateText,
  type VaccineDecisionLike,
  type VaccineDecisionValue,
  type VaccinePlanView,
} from '../../domain/health/vaccine/engine';

/**
 * 疫苗计划服务（2026-10-15 重做）。
 *
 * 这一层只做三件事：**取数 → 交给纯函数 → 落库**。
 * 排期、状态、合并接种、节奏那一句话全在 `domain/health/vaccine/*` 里，
 * 它们不碰数据库，所以能拿"生日 + 一堆记录"直接跑测试。
 *
 * ── 与改造前的三点不同 ──────────────────────────────────────
 *   ① `audience` 参数**删掉**了：营养师与顾客拿的是同一份
 *      （原来后端里就是 `void audience`，一个死参数）
 *   ② 忽略决定从 `DogVaccinePlan.decisions`（JSON）换成
 *      `VaccineDecision` 表（一条决定一行，带原因与时间）
 *   ③ 决定校验**针对这只狗的实际步骤**（冲突 A4）：
 *      原来拿"默认计划表"校验，非默认步骤（如早产儿那几针）会被 400 拒掉
 */

/**
 * 忽略的原因（2026-10-30 #2 起，两种行为**不再一样**）：
 *   · NOT_NOW  = 这一类推迟 30 天，到期后重新出现；
 *   · STOPPED  = 这一类长期不再提醒，直到手动恢复。
 */
export const VACCINE_DECISION_REASONS = ['NOT_NOW', 'STOPPED'] as const;
export type VaccineDecisionReason = (typeof VACCINE_DECISION_REASONS)[number];

/** “这次先不打”的默认推迟天数（产品口径；老板 2026-10-30 确认） */
const SNOOZE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class VaccinePlanService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取某只狗的疫苗计划（冻结契约见技术方案 3.1）。
   */
  async getPlan(customerId: string, dogId: string): Promise<VaccinePlanView> {
    const dog = await this.requireOwnedDog(customerId, dogId);

    const [records, decisions, antibodyTests] = await Promise.all([
      this.prisma.vaccineRecord.findMany({
        where: { dogId },
        orderBy: { vaccinationDate: 'desc' },
      }),
      this.prisma.vaccineDecision.findMany({ where: { dogId } }),
      this.prisma.antibodyTestRecord.findMany({
        where: { dogId },
        orderBy: { testedAt: 'desc' },
      }),
    ]);

    return buildPlanView({
      dogId,
      birthday: toDateText(dog.birthday),
      records: records.map((record) => this.toRecordLike(record)),
      decisions: this.toDecisionMap(decisions),
      antibodyTests: antibodyTests.map((test) => ({
        id: test.id,
        testedAt: toDateText(test.testedAt),
        targets: test.targets,
        result: test.result,
        nextReviewAt: test.nextReviewAt ? toDateText(test.nextReviewAt) : null,
      })),
    });
  }

  /**
   * 记录顾客对某一步的决定（需求 R5：忽略时问一句原因）。
   *
   * ⚠️ 冲突 A4 的修复：校验要针对**这只狗的实际步骤**。
   *    原来用 `buildImmunizationSchedule(birthday)`（默认计划表）校验，
   *    于是任何不在默认表里的步骤都会被 400 拒 —— 顾客点了"忽略"却报错。
   */
  async setDecision(
    customerId: string,
    dogId: string,
    stepKey: string,
    decision: string,
    reason?: string | null,
  ) {
    const dog = await this.requireOwnedDog(customerId, dogId);

    const normalized = String(decision || '')
      .trim()
      .toUpperCase();
    if (normalized !== 'SKIP') {
      throw new BadRequestException(
        '现在只支持 SKIP（这次先不打 / 不再接种了）',
      );
    }

    // 步骤标识必须是**这只狗**程序里真实存在的，并且由它决定挂到哪一类
    const records = await this.prisma.vaccineRecord.findMany({
      where: { dogId },
    });
    const step = materializeSteps({
      birthday: dog.birthday,
      records: records.map((record) => this.toRecordLike(record)),
      today: new Date(),
    }).find((item) => item.key === stepKey);
    if (!step) {
      throw new BadRequestException('这一步不在当前免疫程序里');
    }
    const kind = step.kind;

    /*
     * 2026-10-30（#2）：决定改挂类别，“这次先不打”= 这一类推迟 30 天。
     * 没填原因时按 NOT_NOW 处理（旧客户端可能不带 reason），
     * 不再让它变成永久静默。
     */
    const normalizedReason = this.normalizeReason(reason) ?? 'NOT_NOW';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const snoozeUntil =
      normalizedReason === 'NOT_NOW'
        ? new Date(today.getTime() + SNOOZE_DAYS * DAY_MS)
        : null;

    const saved = await this.prisma.vaccineDecision.upsert({
      where: { dogId_kind: { dogId, kind } },
      create: {
        dogId,
        kind,
        stepKey,
        decision: 'SKIP',
        reason: normalizedReason,
        snoozeUntil,
      },
      update: {
        stepKey,
        decision: 'SKIP',
        reason: normalizedReason,
        snoozeUntil,
      },
    });

    return {
      dogId,
      kind: saved.kind,
      stepKey: saved.stepKey,
      decision: saved.decision,
      reason: saved.reason,
      snoozeUntil: saved.snoozeUntil ? toDateText(saved.snoozeUntil) : null,
    };
  }

  /** 清掉某一类的决定（顾客改主意了 → 一键恢复） */
  async clearDecision(customerId: string, dogId: string, stepKey: string) {
    const dog = await this.requireOwnedDog(customerId, dogId);

    const records = await this.prisma.vaccineRecord.findMany({
      where: { dogId },
    });
    const step = materializeSteps({
      birthday: dog.birthday,
      records: records.map((record) => this.toRecordLike(record)),
      today: new Date(),
    }).find((item) => item.key === stepKey);
    const kind = step?.kind ?? kindOfStepKey(stepKey);
    if (!kind) {
      throw new BadRequestException('这一步不在当前免疫程序里');
    }

    await this.prisma.vaccineDecision.deleteMany({ where: { dogId, kind } });

    return { dogId, kind, stepKey, decision: null };
  }

  /** 这只狗当前所有的决定（`ignored` 之外，前端"已忽略的 N 项"也可能要它） */
  async listDecisions(customerId: string, dogId: string) {
    await this.requireOwnedDog(customerId, dogId);
    const rows = await this.prisma.vaccineDecision.findMany({
      where: { dogId },
    });
    return {
      dogId,
      decisions: Object.fromEntries(
        rows.map((row) => {
          const kind =
            row.kind ??
            (row.stepKey ? kindOfStepKey(row.stepKey) : null);
          return [
            kind ?? row.stepKey ?? row.id,
            {
              kind,
              stepKey: row.stepKey,
              decision: row.decision,
              reason: row.reason,
              snoozeUntil: row.snoozeUntil
                ? toDateText(row.snoozeUntil)
                : null,
              updatedAt: row.updatedAt,
            },
          ];
        }),
      ),
    };
  }

  /**
   * 决定行 → 引擎要的“按类别”映射（#2）。
   *
   * 新行有 `kind`；旧行只有 `stepKey`，按前缀回填；同一类只取最新一行。
   * 旧 NOT_NOW 没有 `snoozeUntil` 时，从 `updatedAt` 起算 30 天，
   * 避免老数据变成永久静默。
   */
  private toDecisionMap(
    rows: Array<{
      kind?: string | null;
      stepKey?: string | null;
      decision: string;
      reason: string | null;
      snoozeUntil?: Date | null;
      updatedAt?: Date;
    }>,
  ): Record<string, VaccineDecisionLike> {
    const sorted = [...rows].sort(
      (a, b) =>
        (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0),
    );
    const map: Record<string, VaccineDecisionLike> = {};
    for (const row of sorted) {
      const kind =
        row.kind ?? (row.stepKey ? kindOfStepKey(row.stepKey) : null);
      if (!kind || map[kind]) continue;
      const updatedAt = row.updatedAt ?? new Date();
      const snoozeUntil = row.snoozeUntil
        ? toDateText(row.snoozeUntil)
        : row.reason === 'NOT_NOW'
          ? toDateText(new Date(updatedAt.getTime() + SNOOZE_DAYS * DAY_MS))
          : null;
      map[kind] = {
        decision: row.decision as VaccineDecisionValue,
        reason: row.reason,
        snoozeUntil,
      };
    }
    return map;
  }

  /**
   * 库里的记录 → 引擎要的形状。
   *
   * 引擎是**纯函数**，只认 `YYYY-MM-DD` 字符串（不认 Date），
   * 这样"生日 + 一堆记录"可以在测试里直接写出来，不用建库。
   */
  private toRecordLike(record: {
    id: string;
    vaccineName: string;
    vaccinationDate: Date;
    components: string[];
    kinds: string[];
    productVerified: boolean;
  }) {
    return {
      id: record.id,
      vaccineName: record.vaccineName,
      vaccinationDate: toDateText(record.vaccinationDate),
      // 病种/类别都在写入时算好了；引擎读的时候会按产品库复核一次
      // （产品库后来补齐了 → 老记录跟着变准）
      components: record.components,
      kinds: record.kinds,
      // 没核对过的（识别出来且我们有理由怀疑的）不算进计划
      productVerified: record.productVerified,
    };
  }

  private normalizeReason(
    reason?: string | null,
  ): VaccineDecisionReason | null {
    if (
      reason === undefined ||
      reason === null ||
      String(reason).trim() === ''
    ) {
      return null;
    }
    const normalized = String(reason).trim().toUpperCase();
    if (!(VACCINE_DECISION_REASONS as readonly string[]).includes(normalized)) {
      throw new BadRequestException(
        '原因只能是 NOT_NOW（这次先不打）/ STOPPED（不再接种了）',
      );
    }
    return normalized as VaccineDecisionReason;
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

/** 供测试与调用方复用的日期解析（避免各处重复实现） */
export { parseDateText };
