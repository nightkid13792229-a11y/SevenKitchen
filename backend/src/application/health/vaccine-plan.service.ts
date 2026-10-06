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
 * ── 开放状态（2026-10-06 老板定）────────────────────────
 *   原来这里写着"尚未经兽医审核 → 顾客侧默认关闭"。
 *   老板拍板：**按审核通过的标准部署**，卡点取消，程序表就是对顾客的口径。
 *   所以现在顾客和营养师拿到的是同一份计划，不再有 available:false 那条路。
 */

/** 顾客侧未开放时的返回体 —— 说明原因，而不是假装没有这个功能 */
@Injectable()
export class VaccinePlanService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取某只狗的疫苗计划。
   *
   * ⚠️ 2026-10-06 老板定：**按审核通过的标准部署**，顾客侧的卡点取消。
   * 原来这里有一道 `VACCINE_PLAN=customer` 的环境变量门，
   * 没开就返回 available:false、顾客只能看到"还在审核"。
   * 现在直接算给顾客看 —— 免疫程序表就是线上口径，不再有"内部/外部"两套。
   *
   * @param audience 保留参数：营养师/管理端与顾客现在拿到的是同一份计划
   */
  async getPlan(
    customerId: string,
    dogId: string,
    audience: 'customer' | 'staff' = 'customer',
  ): Promise<VaccinePlanResult> {
    void audience;
    const dog = await this.requireOwnedDog(customerId, dogId);

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
        // 记录自己存的归类（顾客选的 / AI 判的）；老记录是空数组，
        // buildVaccinePlan 会退回按名字推一次。
        kinds: record.kinds,
      })),
      decisions: (plan?.decisions || {}) as Record<string, VaccineDecision>,
      // 2026-10-06：按审核通过的标准部署（原来恒为 false，
      // 界面因此永远挂着"本计划仍在做专业审核"那句话）
      reviewed: true,
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
      reviewed: true,
      note: '本程序由研发依据 WSAVA 2024 与国内法规起草，已于 2026-10-06 按审核通过的标准发布。',
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
