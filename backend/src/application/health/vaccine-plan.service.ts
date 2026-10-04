import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  ALL_VACCINE_KINDS,
  buildImmunizationSchedule,
  buildVaccinePlan,
  isVaccinePlanCustomerEnabled,
  parseDateText,
  toDateText,
  type VaccineDecision,
  type VaccinePlanResult,
} from '../../domain/health/immunization-schedule';

/**
 * 疫苗计划服务（2026-10-01，第四期）。
 *
 * 老板的四条要求：
 *   15. 按免疫程序提醒还需要打哪些、什么时候打
 *   16. 首选 WSAVA 指南、结合国内法规；**引导顾客自己决策**
 *   17. 顾客计划与我们不一致时提醒
 *   18. 提醒只在小程序内（所以这里不碰订阅消息）
 *
 * ── 安全边界（老板定的）──────────────────────────────────
 *   免疫程序表由研发依据 WSAVA 2024 与国内法规起草，**尚未经兽医审核**。
 *   所以顾客侧默认关闭：`isVaccinePlanCustomerEnabled()` 为假时，
 *   接口只回"还没开放"，不返回任何建议内容。
 *   营养师/管理端不受此限（他们看得懂"这份还没审"）。
 */

/** 顾客侧未开放时的返回体 —— 说明原因，而不是假装没有这个功能 */
export interface VaccinePlanUnavailable {
  available: false;
  /** 给顾客看的说明 */
  message: string;
  /** 给运营看的开关名 */
  enableWith: string;
}

@Injectable()
export class VaccinePlanService {
  constructor(private readonly prisma: PrismaService) {}

  /** 顾客侧是否已开放 */
  isCustomerEnabled(): boolean {
    return isVaccinePlanCustomerEnabled();
  }

  /**
   * 取某只狗的疫苗计划。
   *
   * @param audience 'customer' 时受开关约束；'staff'（营养师/管理端）始终可取
   */
  async getPlan(
    customerId: string,
    dogId: string,
    audience: 'customer' | 'staff' = 'customer',
  ): Promise<VaccinePlanResult | VaccinePlanUnavailable> {
    const dog = await this.requireOwnedDog(customerId, dogId);

    if (audience === 'customer' && !this.isCustomerEnabled()) {
      return {
        available: false,
        message:
          '疫苗计划还在做专业审核，暂时只对内部开放。审核通过后这里会显示"下一针什么时候打"。',
        enableWith: 'VACCINE_PLAN=customer',
      };
    }

    const [records, plan] = await Promise.all([
      this.prisma.vaccineRecord.findMany({
        where: { dogId },
        orderBy: { vaccinationDate: 'desc' },
      }),
      this.prisma.dogVaccinePlan.findUnique({ where: { dogId } }),
    ]);

    return buildVaccinePlan({
      dogId,
      birthday: toDateText(dog.birthday),
      records: records.map((record) => ({
        id: record.id,
        vaccineName: record.vaccineName,
        vaccinationDate: toDateText(record.vaccinationDate),
        nextDueDate: record.nextDueDate ? toDateText(record.nextDueDate) : null,
      })),
      decisions: (plan?.decisions || {}) as Record<string, VaccineDecision>,
      // 程序表尚未经兽医审核 —— 顾客侧即便开放，也要如实标记
      reviewed: false,
    });
  }

  /**
   * 完整的免疫程序表（这只狗按程序应该打哪些、在第几周）。
   *
   * 给营养师/管理端审核用：他们要能看到"这套程序到底是什么"，
   * 而不是只看到过滤之后的计划。**不对顾客开放。**
   */
  async getSchedule(customerId: string, dogId: string) {
    const dog = await this.requireOwnedDog(customerId, dogId);
    // 营养师/管理端要看**整套**程序表（含非核心苗），
    // 顾客侧则只排 core + rabies + "这只狗已经在打的"非核心苗。
    const schedule = buildImmunizationSchedule(dog.birthday, {
      kinds: ALL_VACCINE_KINDS,
    });

    return {
      dogId,
      birthday: toDateText(dog.birthday),
      reviewed: false,
      note: '本程序由研发依据 WSAVA 2024 与国内法规起草，尚未经兽医审核，暂不对顾客开放。',
      items: schedule.map((item) => ({
        key: item.key,
        kind: item.kind,
        label: item.label,
        windowStart: toDateText(item.windowStart),
        windowEnd: toDateText(item.windowEnd),
        basis: item.basis,
      })),
    };
  }

  /**
   * 记录顾客对某一步的决定（老板第 16 条：引导顾客自己做决策）。
   *
   * 只接受三个取值，且**只认程序里真实存在的步骤标识** ——
   * 前端传错或有人手工构造请求，都不会在库里留下无效键。
   */
  async setDecision(
    customerId: string,
    dogId: string,
    stepKey: string,
    decision: string,
  ) {
    const dog = await this.requireOwnedDog(customerId, dogId);

    const normalized = String(decision || '').trim().toUpperCase();
    if (!['ACCEPT', 'DEFER', 'SKIP'].includes(normalized)) {
      throw new BadRequestException(
        '决定只能是 ACCEPT（按建议）/ DEFER（推迟）/ SKIP（不做）',
      );
    }

    // 步骤标识必须是这只狗的程序里真实存在的
    const validKeys = new Set(
      buildImmunizationSchedule(dog.birthday).map((item) => item.key),
    );
    if (!validKeys.has(stepKey)) {
      throw new BadRequestException('这一步不在当前免疫程序里');
    }

    const existing = await this.prisma.dogVaccinePlan.findUnique({
      where: { dogId },
    });
    const decisions = {
      ...((existing?.decisions || {}) as Record<string, string>),
      [stepKey]: normalized,
    };

    const saved = await this.prisma.dogVaccinePlan.upsert({
      where: { dogId },
      create: { dogId, decisions },
      update: { decisions },
    });

    return {
      dogId,
      decisions: saved.decisions as Record<string, string>,
    };
  }

  /** 清掉某一步的决定（顾客改主意了） */
  async clearDecision(customerId: string, dogId: string, stepKey: string) {
    await this.requireOwnedDog(customerId, dogId);

    const existing = await this.prisma.dogVaccinePlan.findUnique({
      where: { dogId },
    });
    if (!existing) {
      return { dogId, decisions: {} };
    }

    const decisions = { ...((existing.decisions || {}) as Record<string, string>) };
    delete decisions[stepKey];

    const saved = await this.prisma.dogVaccinePlan.update({
      where: { dogId },
      data: { decisions },
    });

    return { dogId, decisions: saved.decisions as Record<string, string> };
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
