import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  PrismaVaccineRecordRepository,
  PrismaCheckupRecordRepository,
  PrismaMedicalRecordRepository,
  PrismaAllergyRecordRepository,
} from '../../infrastructure/repositories/prisma-health.repository';
import {
  VaccineRecordResponseDto,
  VaccineRecordListResponseDto,
} from '../../interfaces/dto/health/vaccine-response.dto';
import {
  VACCINE_KIND_LABELS,
  classifyVaccineKinds,
  kindsOfComponents,
  normalizeVaccineKind,
  resolveRecordKinds,
  type VaccineKind,
} from '../../domain/health/immunization-schedule';
import {
  VACCINE_COMPONENT_LABELS,
  findProductByText,
  normalizeVaccineComponent,
  type VaccineComponent,
} from '../../domain/health/vaccine-products';
import {
  CheckupRecordResponseDto,
  CheckupRecordListResponseDto,
} from '../../interfaces/dto/health/checkup-response.dto';
import {
  MedicalRecordResponseDto,
  MedicalRecordListResponseDto,
} from '../../interfaces/dto/health/medical-record-response.dto';
import {
  AllergyRecordResponseDto,
  AllergyRecordListResponseDto,
} from '../../interfaces/dto/health/allergy-response.dto';
import { CreateVaccineDto } from '../../interfaces/dto/health/create-vaccine.dto';
import { UpdateVaccineDto } from '../../interfaces/dto/health/update-vaccine.dto';
import { CreateCheckupDto } from '../../interfaces/dto/health/create-checkup.dto';
import { UpdateCheckupDto } from '../../interfaces/dto/health/update-checkup.dto';
import { CreateMedicalRecordDto } from '../../interfaces/dto/health/create-medical-record.dto';
import { UpdateMedicalRecordDto } from '../../interfaces/dto/health/update-medical-record.dto';
import { CreateAllergyDto } from '../../interfaces/dto/health/create-allergy.dto';
import { UpdateAllergyDto } from '../../interfaces/dto/health/update-allergy.dto';
import { PrismaDogRepository } from '../../infrastructure/repositories/prisma-dog.repository';
import { DOG_REPOSITORY } from '../dog/dog.service';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';

// Repository tokens
export const VACCINE_RECORD_REPOSITORY = 'VACCINE_RECORD_REPOSITORY';
export const CHECKUP_RECORD_REPOSITORY = 'CHECKUP_RECORD_REPOSITORY';
export const MEDICAL_RECORD_REPOSITORY = 'MEDICAL_RECORD_REPOSITORY';
export const ALLERGY_RECORD_REPOSITORY = 'ALLERGY_RECORD_REPOSITORY';

@Injectable()
export class HealthService {
  constructor(
    @Inject(VACCINE_RECORD_REPOSITORY)
    private readonly vaccineRecordRepo: PrismaVaccineRecordRepository,
    @Inject(CHECKUP_RECORD_REPOSITORY)
    private readonly checkupRecordRepo: PrismaCheckupRecordRepository,
    @Inject(MEDICAL_RECORD_REPOSITORY)
    private readonly medicalRecordRepo: PrismaMedicalRecordRepository,
    @Inject(ALLERGY_RECORD_REPOSITORY)
    private readonly allergyRecordRepo: PrismaAllergyRecordRepository,
    @Inject(DOG_REPOSITORY)
    private readonly dogRepo: PrismaDogRepository,
    private readonly cosService: TencentCosService,
    /**
     * 只用于"删记录时这张图还有没有别人引用"的检查（2026-10-02）。
     * 分享给医生的快照是**永久**的、里面也存着图片地址，
     * 不看一眼就删会把医生那边的报告原件删成裂图。
     */
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 把 COS 地址转成对象 key（去掉域名与查询串，保留完整路径）。
   *
   * 2026-10-02 修：原来用 `split('/').slice(-2)` 只取最后两段 ——
   * 对 `medical-reports/temp/x.jpg` 碰巧对，再深一层（`a/b/c.jpg`）就取错 key，
   * 删除静默失败、文件留在 COS 里。
   */
  private toCosKey(url: string): string {
    const withoutQuery = String(url || '').split('?')[0];
    const withoutHost = withoutQuery.replace(/^https?:\/\/[^/]+\//, '');

    try {
      return decodeURIComponent(withoutHost);
    } catch {
      return withoutHost;
    }
  }

  /**
   * 这个附件还被别处引用着吗？
   *
   * 三种"别处"：
   *   · 另外三条记录表的 attachments
   *   · 其它狗的记录（同一张图理论上可能被重复挂）
   *   · **未撤销的分享快照**（永久链接，删了图医生那边就裂了）
   */
  private async isAttachmentStillReferenced(url: string): Promise<boolean> {
    const [medical, checkup, allergy, vaccine, shares] = await Promise.all([
      this.prisma.medicalRecord.count({ where: { attachments: { has: url } } }),
      this.prisma.checkupRecord.count({ where: { attachments: { has: url } } }),
      this.prisma.allergyRecord.count({ where: { attachments: { has: url } } }),
      this.prisma.vaccineRecord.count({ where: { attachments: { has: url } } }),
      this.prisma.dogHealthShareToken.count({
        where: {
          revokedAt: null,
          // 快照里的 attachments: [{ label, name, sourceUrl }]
          snapshot: { path: ['attachments'], array_contains: [{ sourceUrl: url }] },
        },
      }),
    ]);

    return medical + checkup + allergy + vaccine + shares > 0;
  }

  /**
   * 删记录时把它带的附件一并从 COS 清掉（还在被引用的除外）。
   *
   * 删不掉/还被人引用都不该影响"记录已删除"这个结果，所以一律静默处理。
   */
  private async purgeRecordAttachments(
    attachments: string[] | null | undefined,
  ): Promise<void> {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return;
    }

    for (const fileUrl of attachments) {
      try {
        if (await this.isAttachmentStillReferenced(fileUrl)) {
          console.log(
            `[HealthService] 附件仍被引用，保留 COS 文件: ${fileUrl}`,
          );
          continue;
        }

        await this.cosService.deleteImage(this.toCosKey(fileUrl));
        console.log(`[HealthService] Deleted COS file: ${this.toCosKey(fileUrl)}`);
      } catch (error) {
        // 删不掉不该影响记录删除；服务端还有每日清理任务兜底
        console.error('[HealthService] Failed to delete COS file:', error);
      }
    }
  }

  // ==================== Vaccine Records ====================

  /**
   * 接种日期不能晚于今天（2026-10-07 老板审计时定）。
   *
   * 为什么必须拦在入口：计划算法是"有记录就算这一针打过了"，
   * 一条日期填到未来的记录会把"还没打的针"直接标成已完成、提醒随之消失。
   * 实测：把接种日填成 2026-12-01（当天 2026-06-01），
   * 「狂犬疫苗 首针」就变成已完成，第 2 次被推到 2027-11。
   * 常见来源是手写年份写错、拍疫苗本时 OCR 把年份读错。
   *
   * 早于狗狗生日的日期**不在这里拦**（生日本身可能是估的），
   * 交给计划里的"请核对"提示和窗口夹取兜底。
   */
  private assertVaccinationDateNotFuture(dateText?: string | null) {
    if (!dateText) return;
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return; // 格式问题由 DTO 校验负责
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (date.getTime() > endOfToday.getTime()) {
      throw new BadRequestException('接种日期不能晚于今天');
    }
  }

  async createVaccineRecord(
    customerId: string,
    dto: CreateVaccineDto & { dogId: string },
  ): Promise<VaccineRecordResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId);
    this.assertVaccinationDateNotFuture(dto.vaccinationDate);

    // 病种是主数据，类别由它推导（2026-10-06）
    const components = this.resolveComponents(
      (dto as { components?: unknown }).components,
      dto.vaccineName,
    );

    const record = await this.vaccineRecordRepo.create({
      dogId: dto.dogId,
      vaccineName: dto.vaccineName,
      vaccinationDate: new Date(dto.vaccinationDate),
      nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
      notes: dto.notes ?? null,
      status: dto.status || 'COMPLETED',
      attachments: dto.attachments ?? [],
      components,
      kinds: this.resolveKinds(
        (dto as { components?: unknown }).components,
        dto.kinds,
        dto.vaccineName,
      ),
    });

    return this.mapVaccineRecordToDto(record);
  }

  async getVaccineRecords(
    dogId: string,
    customerId: string,
  ): Promise<VaccineRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId);

    const records = await this.vaccineRecordRepo.findByDogId(dogId);

    return {
      total: records.length,
      records: records.map((r) => this.mapVaccineRecordToDto(r)),
    };
  }

  async getVaccineRecord(
    id: string,
    customerId: string,
  ): Promise<VaccineRecordResponseDto> {
    const record = await this.vaccineRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Vaccine record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    return this.mapVaccineRecordToDto(record);
  }

  async updateVaccineRecord(
    id: string,
    customerId: string,
    dto: UpdateVaccineDto,
  ): Promise<VaccineRecordResponseDto> {
    const record = await this.vaccineRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Vaccine record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);
    this.assertVaccinationDateNotFuture(dto.vaccinationDate);

    const dtoComponents = (dto as { components?: unknown }).components;

    /**
     * ⚠️ 2026-10-06 老板报的 bug："不管点哪一个分类，都改不动，还是原来的这个分类。"
     *
     * 根因就在下面这个 data 里 —— 原来的字段清单**漏了 kinds**：
     * 前端点分类 → 自动保存 PATCH → 服务端把 kinds 丢掉 → 回读还是旧值
     * → 界面看起来"点了没反应"。字段在 DTO 里明明有（update-vaccine.dto.ts），
     * 只是这一处没往仓储写。创建那条路一直是好的，所以只有"改"会失灵。
     *
     * 顺带修了同一段里的 nextDueDate：原来是 `dto.nextDueDate ? ... : null`，
     * 而前端只在有值时才带这个字段 —— 于是"改个备注"会把已存的
     * 下次接种日期悄悄清成 null。undefined 必须表示"别动它"，
     * 和上面 vaccineName / status 保持同一种写法。
     */
    const updated = await this.vaccineRecordRepo.update(id, {
      vaccineName: dto.vaccineName ?? undefined,
      vaccinationDate: dto.vaccinationDate
        ? new Date(dto.vaccinationDate)
        : undefined,
      nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined,
      // notes 前端**每次都带**（空的时候传 null，用来清空备注），
      // 所以 null 要照写；只有"整个字段没传"才表示别动它
      notes: dto.notes === undefined ? undefined : (dto.notes ?? null),
      status: dto.status ?? undefined,
      // 病种/类别：顾客手动改过就以他为准（闭集校验在 resolve* 里）。
      // 不传 = 别动它，不重判 —— 免得改个备注把人家自己选的冲掉。
      // 传了病种就由它重新推导类别（两处必须一起更新，否则会打架）。
      components:
        dtoComponents === undefined
          ? undefined
          : this.resolveComponents(
              dtoComponents,
              dto.vaccineName ?? record.vaccineName,
            ),
      kinds:
        dtoComponents === undefined && dto.kinds === undefined
          ? undefined
          : this.resolveKinds(
              dtoComponents,
              dto.kinds,
              dto.vaccineName ?? record.vaccineName,
            ),
      // 只有顾客明确传了 attachments 才动它 —— 不传就保持原样，
      // 免得改个备注顺手把原件清空
      attachments: dto.attachments ?? undefined,
    });

    return this.mapVaccineRecordToDto(updated);
  }

  async deleteVaccineRecord(id: string, customerId: string): Promise<void> {
    const record = await this.vaccineRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Vaccine record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    // 2026-10-02 补：第九期给疫苗记录加了"报告原件"，
    // 但删除逻辑还停在之前 —— 疫苗本原图会一直留在 COS 上。
    await this.purgeRecordAttachments(record.attachments);

    await this.vaccineRecordRepo.delete(id);
  }

  async getUpcomingVaccines(
    dogId: string,
    customerId: string,
    days: number = 30,
  ): Promise<VaccineRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId);

    const records = await this.vaccineRecordRepo.findUpcoming(dogId, days);

    return {
      total: records.length,
      records: records.map((r) => this.mapVaccineRecordToDto(r)),
    };
  }

  // ==================== Checkup Records ====================

  async createCheckupRecord(
    customerId: string,
    dto: CreateCheckupDto & { dogId: string },
  ): Promise<CheckupRecordResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId);

    const record = await this.checkupRecordRepo.create({
      dogId: dto.dogId,
      checkupType: dto.checkupType,
      checkupDate: new Date(dto.checkupDate),
      findings: dto.findings ?? null,
      labValues: dto.labValues ?? null,
      recommendations: dto.recommendations ?? null,
      notes: dto.notes ?? null,
      veterinarian: dto.veterinarian ?? null,
      attachments: dto.attachments || [],
    });

    return this.mapCheckupRecordToDto(record);
  }

  async getCheckupRecords(
    dogId: string,
    customerId: string,
  ): Promise<CheckupRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId);

    const records = await this.checkupRecordRepo.findByDogId(dogId);

    return {
      total: records.length,
      records: records.map((r) => this.mapCheckupRecordToDto(r)),
    };
  }

  async getCheckupRecord(
    id: string,
    customerId: string,
  ): Promise<CheckupRecordResponseDto> {
    const record = await this.checkupRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Checkup record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    return this.mapCheckupRecordToDto(record);
  }

  async updateCheckupRecord(
    id: string,
    customerId: string,
    dto: UpdateCheckupDto,
  ): Promise<CheckupRecordResponseDto> {
    const record = await this.checkupRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Checkup record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    const updated = await this.checkupRecordRepo.update(id, {
      checkupType: dto.checkupType ?? undefined,
      checkupDate: dto.checkupDate ? new Date(dto.checkupDate) : undefined,
      findings: dto.findings ?? null,
      labValues: dto.labValues ?? null,
      recommendations: dto.recommendations ?? null,
      notes: dto.notes ?? null,
      veterinarian: dto.veterinarian ?? null,
      attachments: dto.attachments ?? undefined,
    });

    return this.mapCheckupRecordToDto(updated);
  }

  async deleteCheckupRecord(id: string, customerId: string): Promise<void> {
    const record = await this.checkupRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Checkup record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    await this.purgeRecordAttachments(record.attachments);

    await this.checkupRecordRepo.delete(id);
  }

  // ==================== Medical Records ====================

  async createMedicalRecord(
    customerId: string,
    dto: CreateMedicalRecordDto & { dogId: string },
  ): Promise<MedicalRecordResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId);

    const record = await this.medicalRecordRepo.create({
      dogId: dto.dogId,
      visitDate: new Date(dto.visitDate),
      chiefComplaint: dto.chiefComplaint,
      labValues: dto.labValues ?? null,
      diagnosis: dto.diagnosis,
      treatment: dto.treatment ?? null,
      exams: dto.exams ?? null,
      vitals: dto.vitals ?? null,
      medications: dto.medications || [],
      status: dto.status || 'TREATING',
      followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
      veterinarian: dto.veterinarian ?? null,
      notes: dto.notes ?? null,
      attachments: dto.attachments || [],
    });

    return this.mapMedicalRecordToDto(record);
  }

  async getMedicalRecords(
    dogId: string,
    customerId: string,
    status?: string,
  ): Promise<MedicalRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId);

    const records = status
      ? await this.medicalRecordRepo.findByStatus(dogId, status)
      : await this.medicalRecordRepo.findByDogId(dogId);

    return {
      total: records.length,
      records: records.map((r) => this.mapMedicalRecordToDto(r)),
    };
  }

  async getMedicalRecord(
    id: string,
    customerId: string,
  ): Promise<MedicalRecordResponseDto> {
    const record = await this.medicalRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Medical record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    return this.mapMedicalRecordToDto(record);
  }

  async updateMedicalRecord(
    id: string,
    customerId: string,
    dto: UpdateMedicalRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    const record = await this.medicalRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Medical record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    const updated = await this.medicalRecordRepo.update(id, {
      visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
      chiefComplaint: dto.chiefComplaint ?? undefined,
      diagnosis: dto.diagnosis ?? undefined,
      // 2026-10-02 修：原来漏了 labValues —— 家长在表单里改化验数据，保存后永远不变
      labValues: dto.labValues ?? null,
      treatment: dto.treatment ?? null,
      exams: dto.exams ?? null,
      vitals: dto.vitals ?? null,
      medications: dto.medications ?? undefined,
      status: dto.status ?? undefined,
      followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
      veterinarian: dto.veterinarian ?? null,
      notes: dto.notes ?? null,
      attachments: dto.attachments ?? undefined,
    });

    return this.mapMedicalRecordToDto(updated);
  }

  async deleteMedicalRecord(id: string, customerId: string): Promise<void> {
    const record = await this.medicalRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Medical record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    await this.purgeRecordAttachments(record.attachments);

    await this.medicalRecordRepo.delete(id);
  }

  // ==================== Allergy Records ====================

  async createAllergyRecord(
    customerId: string,
    dto: CreateAllergyDto & { dogId: string },
  ): Promise<AllergyRecordResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId);

    // 过敏原去空白后再校验 —— 数据库上有 CHECK (btrim(allergen) <> '')
    // 与 UNIQUE(dog_id, allergen) 两道约束，这里先给出可读的错误信息，
    // 而不是把 23505 / 23514 这种数据库错误抛给顾客。
    const allergen = String(dto.allergen ?? '').trim();
    if (!allergen) {
      throw new BadRequestException('请填写过敏原');
    }

    const existing = await this.allergyRecordRepo.findByDogId(dto.dogId);
    if (
      existing.some(
        (record: { allergen?: string | null }) =>
          String(record?.allergen ?? '').trim() === allergen,
      )
    ) {
      throw new ConflictException(`档案里已经有「${allergen}」这一条了`);
    }

    const record = await this.allergyRecordRepo.create({
      dogId: dto.dogId,
      allergen,
      notes: dto.notes ?? null,
      certainty: dto.certainty ?? 'SUSPECTED',
      source: dto.source ?? 'OWNER',
      attachments: dto.attachments ?? [],
    });

    return this.mapAllergyRecordToDto(record);
  }

  async getAllergyRecords(
    dogId: string,
    customerId: string,
  ): Promise<AllergyRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId);

    const records = await this.allergyRecordRepo.findByDogId(dogId);

    return {
      total: records.length,
      records: records.map((r) => this.mapAllergyRecordToDto(r)),
    };
  }

  async getAllergyRecord(
    id: string,
    customerId: string,
  ): Promise<AllergyRecordResponseDto> {
    const record = await this.allergyRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Allergy record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    return this.mapAllergyRecordToDto(record);
  }

  async updateAllergyRecord(
    id: string,
    customerId: string,
    dto: UpdateAllergyDto,
  ): Promise<AllergyRecordResponseDto> {
    const record = await this.allergyRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Allergy record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    let allergen = dto.allergen !== undefined ? String(dto.allergen).trim() : undefined;
    if (allergen !== undefined) {
      if (!allergen) {
        throw new BadRequestException('请填写过敏原');
      }
      // 改名时要避开同一只狗下已存在的同名记录（数据库上有唯一约束）
      const siblings = await this.allergyRecordRepo.findByDogId(record.dogId);
      const clash = siblings.some(
        (item: { id: string; allergen?: string | null }) =>
          item.id !== id && String(item?.allergen ?? '').trim() === allergen,
      );
      if (clash) {
        throw new ConflictException(`档案里已经有「${allergen}」这一条了`);
      }
    }

    const updated = await this.allergyRecordRepo.update(id, {
      allergen,
      // ── 2026-10-04 修复 ────────────────────────────────────
      // 改造前这里是 `notes: dto.notes ?? null`：
      // 只改过敏原名称（没传 notes）会把原来的说明**悄悄抹掉**。
      // 现在与其它字段一致，用 `?? undefined` 表示"没传就不动"。
      // 想把备注清空，显式传 null / 空串即可。
      notes: dto.notes ?? undefined,
      certainty: dto.certainty ?? undefined,
      source: dto.source ?? undefined,
      attachments: dto.attachments ?? undefined,
    });

    return this.mapAllergyRecordToDto(updated);
  }

  async deleteAllergyRecord(id: string, customerId: string): Promise<void> {
    const record = await this.allergyRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException('Allergy record not found');
    }

    await this.verifyDogOwnership(record.dogId, customerId);

    await this.purgeRecordAttachments(record.attachments);

    await this.allergyRecordRepo.delete(id);
  }

  // ==================== Helper Methods ====================

  private async verifyDogOwnership(
    dogId: string,
    customerId: string,
  ): Promise<void> {
    const dog = await this.dogRepo.findById(dogId);
    if (!dog) {
      throw new NotFoundException('Dog not found');
    }
    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }
  }

  /**
   * 归属校验的公开入口（2026-10-04 第一期）。
   *
   * 新加的只读接口（如过敏档案）需要同一套校验，
   * 与其各写一遍，不如暴露同一个实现 ——
   * 校验逻辑只有一份，就不会出现"某个接口忘了校验"的漏子。
   */
  async assertDogOwnership(dogId: string, customerId: string): Promise<void> {
    await this.verifyDogOwnership(dogId, customerId);
  }

  /**
   * 一条记录的归类从哪来（2026-10-05）。
   *
   * 优先级：
   *   ① 调用方显式传的（界面选的、AI 判的）—— 过滤掉非法值；
   *   ② 没传就按名字推一次（老客户端兼容）；
   *   ③ 推不出来就是**未归类**（空数组），**绝不硬塞成核心苗**。
   *
   * 第 ③ 条是这次的关键：以前推不出来默认当核心苗，一针驱虫药
   * 「拜宠清」也能把核心苗的某一针标记成已完成，我们从此不再提醒。
   */
  /**
   * 这一针**含哪些病种**（2026-10-06 老板定的新模型）。
   *
   * 优先级：
   *   ① 调用方显式传的（顾客勾的）—— 过滤掉词表以外的值，去重；
   *   ② 没传就按名字查产品库（库里有就是它的成分）；
   *   ③ 都得不到 → 空数组（未登记成分），**绝不猜**。
   */
  private resolveComponents(
    explicit: unknown,
    vaccineName: string,
  ): VaccineComponent[] {
    const given = Array.isArray(explicit)
      ? explicit
          .map((item) => normalizeVaccineComponent(item))
          .filter((item): item is VaccineComponent => item !== null)
      : [];

    if (given.length > 0) {
      return Array.from(new Set(given));
    }

    return findProductByText(vaccineName)
      ? [...(findProductByText(vaccineName) as { components: VaccineComponent[] })
          .components]
      : [];
  }

  /**
   * 类别**由成分推导**（2026-10-06）。
   *
   * 顾客勾的是病种，类别是后台的事 —— 老板原话：
   * "至于分类的判定则交由后台来完成。"
   *
   * 成分是空的时候（老记录 / 库里没有又没勾）退回按名字的字面规则，
   * 这是**历史兼容路径**，不是主路径。
   */
  private resolveKinds(
    explicitComponents: unknown,
    explicitKinds: unknown,
    vaccineName: string,
  ): string[] {
    const product = findProductByText(vaccineName);

    /*
     * ① 调用方**显式勾了病种** → 类别由病种推导（新模型的主路径）。
     *
     *    这里必须判"是不是显式传的"，而不是"推导出来有没有值" ——
     *    否则老客户端只传 kinds 的时候会被名字推出来的成分盖掉。
     */
    if (Array.isArray(explicitComponents)) {
      const components = this.resolveComponents(explicitComponents, vaccineName);
      if (components.length > 0) {
        return kindsOfComponents({
          components,
          earlySeries: product?.earlySeries,
        });
      }
    }

    // ② 老客户端只给了类别 → 以他为准（历史兼容；新界面已经不发这个了）
    const given = Array.isArray(explicitKinds)
      ? explicitKinds
          .map((item) => normalizeVaccineKind(item))
          .filter((item): item is VaccineKind => item !== null)
      : [];

    if (given.length > 0) {
      // 去重：调用方传大小写混写（"RABIES" + "rabies"）是常事，
      // 归一化之后会变成同一个值 —— 不去重界面上会出现两个一模一样的标签
      return Array.from(new Set(given));
    }

    // ③ 都没给 → 按名字查产品库（查得到就用它的成分推），查不到退回字面规则
    if (product && product.components.length > 0) {
      return kindsOfComponents({
        components: product.components,
        earlySeries: product.earlySeries,
      });
    }

    return classifyVaccineKinds(vaccineName);
  }

  private mapVaccineRecordToDto(record: any): VaccineRecordResponseDto {
    const resolvedKinds = resolveRecordKinds(record);
    /*
     * 病种：优先用记录自己存的（顾客勾的 / 从产品库带出来的）；
     * 老记录没存过（这一列是后加的）就按名字查一次产品库 —— 兼容路径。
     */
    const stored = Array.isArray(record.components)
      ? record.components
          .map((item: unknown) => normalizeVaccineComponent(item))
          .filter((item: string | null): item is VaccineComponent => item !== null)
      : [];
    const resolvedComponents: VaccineComponent[] =
      stored.length > 0
        ? Array.from(new Set(stored))
        : this.resolveComponents(undefined, record.vaccineName);
    return plainToInstance(VaccineRecordResponseDto, {
      id: record.id,
      dogId: record.dogId,
      vaccineName: record.vaccineName,
      vaccinationDate: record.vaccinationDate,
      nextDueDate: record.nextDueDate,
      notes: record.notes,
      status: record.status,
      attachments: record.attachments ?? [],
      // 归类结果（2026-10-05）：界面要显示"这条算哪一类"。
      // 优先用**记录自己存的**（顾客选的 / AI 判的）；老记录没存过才按名字推。
      // 分类逻辑在 domain 层，这里只做映射 —— 别在前端重写一套。
      kinds: resolvedKinds,
      kindLabels: resolvedKinds.map(
        (kind) => VACCINE_KIND_LABELS[kind] || kind,
      ),
      // 病种（2026-10-06）：顾客看的是这个，不是类别
      components: resolvedComponents,
      componentLabels: resolvedComponents.map(
        (component) => VACCINE_COMPONENT_LABELS[component] || component,
      ),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private mapCheckupRecordToDto(record: any): CheckupRecordResponseDto {
    return plainToInstance(CheckupRecordResponseDto, {
      id: record.id,
      dogId: record.dogId,
      checkupType: record.checkupType,
      checkupDate: record.checkupDate,
      weightKg: record.weightKg,
      bcsScore: record.bcsScore,
      heartRate: record.heartRate,
      temperature: record.temperature,
      findings: record.findings,
      labValues: record.labValues,
      recommendations: record.recommendations,
      notes: record.notes,
      veterinarian: record.veterinarian,
      attachments: record.attachments,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private mapMedicalRecordToDto(record: any): MedicalRecordResponseDto {
    return plainToInstance(MedicalRecordResponseDto, {
      id: record.id,
      dogId: record.dogId,
      visitDate: record.visitDate,
      chiefComplaint: record.chiefComplaint,
      labValues: record.labValues,
      diagnosis: record.diagnosis,
      treatment: record.treatment,
      exams: record.exams,
      vitals: record.vitals,
      medications: record.medications,
      status: record.status,
      followUpDate: record.followUpDate,
      veterinarian: record.veterinarian,
      notes: record.notes,
      attachments: record.attachments || [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private mapAllergyRecordToDto(record: any): AllergyRecordResponseDto {
    return plainToInstance(AllergyRecordResponseDto, {
      id: record.id,
      dogId: record.dogId,
      allergen: record.allergen,
      notes: record.notes,
      certainty: record.certainty ?? 'SUSPECTED',
      source: record.source ?? 'OWNER',
      attachments: record.attachments || [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
