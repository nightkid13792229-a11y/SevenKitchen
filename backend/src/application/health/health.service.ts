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
  type VaccineKind,
} from '../../domain/health/vaccine/schedule-table';
import {
  VACCINE_COMPONENT_LABELS,
  classifyRecordKinds,
  classifyVaccineKinds,
  findProductByText,
  kindsOfComponents,
  normalizeVaccineComponent,
  type VaccineComponent,
} from '../../domain/health/vaccine/products';
import {
  AntibodyTestResponseDto,
  AntibodyTestListResponseDto,
} from '../../interfaces/dto/health/antibody-test-response.dto';
import { CreateAntibodyTestDto } from '../../interfaces/dto/health/create-antibody-test.dto';
import { UpdateAntibodyTestDto } from '../../interfaces/dto/health/update-antibody-test.dto';
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
   * 同一天、同一支苗不许记两遍（2026-10-07 老板审计第 3 块定）。
   *
   * 起因：接口层原来**没有任何查重** —— 重复提交（顾客连点两下、扫疫苗本时
   * 网络慢又重试一次）会真的存成两条。实测见过一次库里出现两份一模一样的
   * 接种记录，计划跟着算出一串重复命中的步骤。
   *
   * 界面上的去重只在"扫疫苗本"那一条路上做（isAlreadyRecorded），
   * 手动录入、后台录入、AI 确认后的保存都不经过它 —— 所以这道关放在服务端。
   *
   * 判据是"同一天 + 同一支苗（按名字去掉首尾空格比）"。同一天打两支不同的苗
   * 不受影响；不同天的同一支苗也不受影响。
   */
  private async assertNotDuplicated(
    dogId: string,
    vaccineName: string,
    vaccinationDate: string,
  ) {
    const name = String(vaccineName || '').trim();
    const day = String(vaccinationDate || '').slice(0, 10);
    if (!name || !day) return;

    const existing = await this.vaccineRecordRepo.findByDogId(dogId);
    const duplicated = existing.find(
      (item) =>
        String(item.vaccineName || '').trim() === name &&
        this.toDayText(item.vaccinationDate) === day,
    );
    if (duplicated) {
      throw new BadRequestException('这一针已经记过了（同一天、同一支苗）');
    }
  }

  /** 日期 → YYYY-MM-DD（按本地时区，与界面显示一致） */
  private toDayText(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

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
    this.assertDateNotFuture(dateText, '接种日期不能晚于今天');
  }

  /** 同上，消息由调用方给（抗体检测用的是"检测日期"） */
  private assertDateNotFuture(dateText: string | null | undefined, message: string) {
    if (!dateText) return;
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return; // 格式问题由 DTO 校验负责
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (date.getTime() > endOfToday.getTime()) {
      throw new BadRequestException(message);
    }
  }

  async createVaccineRecord(
    customerId: string,
    dto: CreateVaccineDto & { dogId: string },
  ): Promise<VaccineRecordResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId);
    this.assertVaccinationDateNotFuture(dto.vaccinationDate);
    await this.assertNotDuplicated(dto.dogId, dto.vaccineName, dto.vaccinationDate);

    // 病种是主数据，类别由它推导（2026-10-06）
    const components = this.resolveComponents(
      (dto as { components?: unknown }).components,
      dto.vaccineName,
    );

    const record = await this.vaccineRecordRepo.create({
      dogId: dto.dogId,
      vaccineName: dto.vaccineName,
      vaccinationDate: new Date(dto.vaccinationDate),
      notes: dto.notes ?? null,
      attachments: dto.attachments ?? [],
      components,
      // 类别**一律由后端算**：有成分由成分推，没有则按名字字面判；
      // 两条都判不出 → 不保存（需求 R6：不允许"存了但不影响计划"的记录）
      kinds: this.requireKinds(components, dto.vaccineName),
      // 安全默认值（2026-10-09）：识别出来且我们有理由怀疑的那一针，
      // 小程序显式传 false —— 在顾客点「我已对照本子核对」之前不算进计划 ✓
      productVerified:
        (dto as { productVerified?: boolean }).productVerified ?? true,
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
     * 注意 undefined 与 null 的区别：undefined = "别动它"，null = "清空"。
     */
    const updated = await this.vaccineRecordRepo.update(id, {
      vaccineName: dto.vaccineName ?? undefined,
      vaccinationDate: dto.vaccinationDate
        ? new Date(dto.vaccinationDate)
        : undefined,
      // notes 前端**每次都带**（空的时候传 null 或空串，用来清空备注），
      // 所以 null / '' 都要照写；只有"整个字段没传"才表示别动它
      notes:
        dto.notes === undefined
          ? undefined
          : String(dto.notes || '').trim() === ''
            ? null
            : dto.notes,
      // 没核对过的（识别出来且我们有理由怀疑的）显式落 false；不传就是 true ✓
      productVerified:
        (dto as { productVerified?: boolean }).productVerified === undefined
          ? undefined
          : (dto as { productVerified?: boolean }).productVerified,
      // 病种/类别：顾客手动改过就以他为准（闭集校验在 resolve* 里）。
      // 不传 = 别动它，不重判 —— 免得改个备注把人家自己选的冲掉。
      // 传了病种就由它重新推导类别（两处必须一起更新，否则会打架）。
      components: this.resolveUpdatedComponents(record, dto, dtoComponents),
      // 类别不接受入参（DTO 里也没有这个字段了）：改了病种或名字就重推一次
      kinds: this.resolveUpdatedKinds(record, dto, dtoComponents),
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

    void days;
    // 2026-10-15：原来按记录上人工填的"下次到期日"查即将到期 —— 那个字段
    // 整个不用了（老板 2026-10-15 定）。疫苗的"下一次"只由免疫计划回答，
    // 而本接口是订阅消息的预留口（不做推送），所以这里如实返回空。
    void this.vaccineRecordRepo;
    return { total: 0, records: [] };
  }

  // ==================== Antibody Tests（2026-10-15 新增，需求 R9）====================

  /** 抗体检测 · 检了什么 → 中文名（界面上显示的就是它） */
  private static readonly ANTIBODY_TARGET_LABELS: Record<string, string> = {
    CORE: '核心三项',
    RABIES: '狂犬',
  };

  /** 抗体检测 · 结论 → 中文名。**我们不设阈值**：合格与否以报告/兽医判定为准 */
  private static readonly ANTIBODY_RESULT_LABELS: Record<string, string> = {
    PASS: '合格',
    FAIL: '不合格',
    UNKNOWN: '请让兽医判读',
  };

  /** 目标闭集（CORE / RABIES），脏值不许进库 —— 它会决定"这一针能不能不打" */
  private resolveAntibodyTargets(explicit: unknown): string[] {
    const given = Array.isArray(explicit) ? explicit : [];
    const normalized = given
      .map((item) => String(item || '').trim().toUpperCase())
      .filter((item) => Object.keys(HealthService.ANTIBODY_TARGET_LABELS).includes(item));
    return Array.from(new Set(normalized));
  }

  /**
   * 下次评估时间：**合格 = 检测日 + 3 年**（技术方案 1.2）。
   *
   * 不合格 / 未判读留空 —— 那两种情况下一针照常按计划打，没有"下次评估"这一说。
   * 调用方显式传了就以他为准（兽医可能给别的复查节奏）。
   */
  private computeAntibodyNextReviewAt(
    result: string,
    testedAt: string,
    explicit?: string,
  ): Date | null {
    if (explicit) {
      const date = new Date(explicit);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (result !== 'PASS') return null;
    const base = new Date(testedAt);
    if (Number.isNaN(base.getTime())) return null;
    const next = new Date(base.getTime());
    next.setFullYear(next.getFullYear() + 3);
    return next;
  }

  async createAntibodyTest(
    customerId: string,
    dto: CreateAntibodyTestDto & { dogId: string },
  ): Promise<AntibodyTestResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId);
    this.assertDateNotFuture(dto.testedAt, '检测日期不能晚于今天');

    const result = String(dto.result || 'UNKNOWN').trim().toUpperCase();
    const record = await this.prisma.antibodyTestRecord.create({
      data: {
        dogId: dto.dogId,
        testedAt: new Date(dto.testedAt),
        targets: this.resolveAntibodyTargets(dto.targets),
        result: result as 'PASS' | 'FAIL' | 'UNKNOWN',
        value: dto.value ?? null,
        unit: dto.unit ?? null,
        nextReviewAt: this.computeAntibodyNextReviewAt(
          result,
          dto.testedAt,
          dto.nextReviewAt,
        ),
        notes: dto.notes ?? null,
        attachments: dto.attachments ?? [],
      },
    });

    return this.mapAntibodyTestToDto(record);
  }

  async getAntibodyTests(
    dogId: string,
    customerId: string,
  ): Promise<AntibodyTestListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId);

    const records = await this.prisma.antibodyTestRecord.findMany({
      where: { dogId },
      orderBy: { testedAt: 'desc' },
    });

    return {
      total: records.length,
      records: records.map((record) => this.mapAntibodyTestToDto(record)),
    };
  }

  async getAntibodyTest(
    id: string,
    customerId: string,
  ): Promise<AntibodyTestResponseDto> {
    const record = await this.prisma.antibodyTestRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Antibody test record not found');
    }
    await this.verifyDogOwnership(record.dogId, customerId);
    return this.mapAntibodyTestToDto(record);
  }

  async updateAntibodyTest(
    id: string,
    customerId: string,
    dto: UpdateAntibodyTestDto,
  ): Promise<AntibodyTestResponseDto> {
    const record = await this.prisma.antibodyTestRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Antibody test record not found');
    }
    await this.verifyDogOwnership(record.dogId, customerId);
    this.assertDateNotFuture(dto.testedAt, '检测日期不能晚于今天');

    /**
     * ⚠️ `undefined` = 别动它（与疫苗记录的改法一致）。
     *
     * 下次评估时间：结果或检测日一变就**重算**（合格才有），
     * 除非调用方显式给了 `nextReviewAt`。
     */
    const testedAtText =
      dto.testedAt ??
      `${record.testedAt.getFullYear()}-${String(record.testedAt.getMonth() + 1).padStart(2, '0')}-${String(record.testedAt.getDate()).padStart(2, '0')}`;
    const result = String(dto.result ?? record.result).trim().toUpperCase();
    const nextReviewAt =
      dto.nextReviewAt !== undefined
        ? this.computeAntibodyNextReviewAt(result, testedAtText, dto.nextReviewAt)
        : dto.result !== undefined || dto.testedAt !== undefined
          ? this.computeAntibodyNextReviewAt(result, testedAtText)
          : undefined;

    const updated = await this.prisma.antibodyTestRecord.update({
      where: { id },
      data: {
        testedAt: dto.testedAt ? new Date(dto.testedAt) : undefined,
        targets:
          dto.targets === undefined
            ? undefined
            : this.resolveAntibodyTargets(dto.targets),
        result: dto.result === undefined ? undefined : (result as 'PASS' | 'FAIL' | 'UNKNOWN'),
        value: dto.value === undefined ? undefined : (dto.value ?? null),
        unit: dto.unit === undefined ? undefined : (dto.unit ?? null),
        nextReviewAt,
        notes: dto.notes === undefined ? undefined : (dto.notes ?? null),
        attachments: dto.attachments ?? undefined,
      },
    });

    return this.mapAntibodyTestToDto(updated);
  }

  async deleteAntibodyTest(id: string, customerId: string): Promise<void> {
    const record = await this.prisma.antibodyTestRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Antibody test record not found');
    }
    await this.verifyDogOwnership(record.dogId, customerId);

    // 与疫苗记录同一套：原件属于"疫苗本"，但这一条记录自己的附件要跟着走
    await this.purgeRecordAttachments(record.attachments);

    await this.prisma.antibodyTestRecord.delete({ where: { id } });
  }

  private mapAntibodyTestToDto(record: {
    id: string;
    dogId: string;
    testedAt: Date;
    targets: string[];
    result: string;
    value: string | null;
    unit: string | null;
    nextReviewAt: Date | null;
    notes: string | null;
    attachments: string[];
    createdAt: Date;
    updatedAt: Date;
  }): AntibodyTestResponseDto {
    return plainToInstance(AntibodyTestResponseDto, {
      id: record.id,
      dogId: record.dogId,
      testedAt: record.testedAt,
      targets: record.targets ?? [],
      targetLabels: (record.targets ?? []).map(
        (target) => HealthService.ANTIBODY_TARGET_LABELS[target] || target,
      ),
      result: record.result,
      resultLabel:
        HealthService.ANTIBODY_RESULT_LABELS[record.result] || record.result,
      value: record.value,
      unit: record.unit,
      nextReviewAt: record.nextReviewAt,
      notes: record.notes,
      attachments: record.attachments ?? [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
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
   * 类别**一律由后端算**（技术方案 1.1.2 的写入规则）。
   *
   * 需求第六节：**每条记录保存时必须归类**，且必须落到会被排期的三类之一；
   * 归不了类就不保存（不允许"存了但不影响计划"的记录）。
   *
   *   ① `components` 非空（查到了产品，或家长勾了病种）→ 由病种推导类别（唯一事实）
   *   ② `components` 为空、但名字能按字面判类别（"狂犬""六联"）→ 用字面规则
   *   ③ 两条都不成立 → **抛 400**，并告诉家长该怎么办（勾"含哪些疫苗"）
   */
  private requireKinds(
    components: VaccineComponent[],
    vaccineName: string,
  ): string[] {
    if (components.length > 0) {
      /*
       * ⚠️ 这里**不传 `earlySeries`**：那个标记是"这支产品是 4 周龄抢跑苗"
       *    的产品级事实，只在**按产品库推导**时才该说话。
       *    调用方勾了病种就说明他在描述这一针含什么 —— 由病种自己推导
       *    （犬瘟 + 细小两支 = 早期苗，规则本来就在 `kindsOfComponents` 里）。
       *
       *    传了会出事：一支狂犬单苗只要名字里带着"幼犬保"三个字，
       *    勾什么病种都会被压成 core_early（实测）。
       */
      return kindsOfComponents({ components });
    }

    const byName = classifyVaccineKinds(vaccineName);
    if (byName.length > 0) {
      return byName;
    }

    throw new BadRequestException(
      '这支疫苗认不出类别，没法算进接种计划。' +
        '请照疫苗本勾一下它「含哪些疫苗」（例如犬瘟、细小、腺病毒），或者换一个本子上写着的名字。',
    );
  }

  /**
   * 改动时重算类别。
   *
   * 只有"改了病种"或"改了名字"才重算 —— 只改备注不该把人家自己勾的冲掉。
   * 重算规则与新建时一致（`requireKinds`）；名字改成认不出的那种，同样不保存。
   */
  private resolveUpdatedKinds(
    record: { vaccineName: string; components?: unknown; kinds?: unknown },
    dto: UpdateVaccineDto,
    dtoComponents: unknown,
  ): string[] | undefined {
    if (dtoComponents === undefined && dto.vaccineName === undefined) {
      return undefined;
    }

    const name = dto.vaccineName ?? record.vaccineName;
    /*
     * 改名字时**成分也要跟着新名字重算**（新名字查得到产品就用它的成分，
     * 查不到就按名字字面判）—— 否则旧成分会把新名字的归类压回去：
     * 把「宠必威幼犬保」改成「狂犬疫苗」，类别却还是 core_early（实测）。
     */
    const components =
      dtoComponents === undefined
        ? this.resolveComponents(undefined, name)
        : this.resolveComponents(dtoComponents, name);

    return this.requireKinds(components, name);
  }

  /**
   * 改动时重算病种：与 `resolveUpdatedKinds` 一处口径（两者必须一起动，
   * 否则"类别按新名字、成分还是旧的"会在读时又把类别算回去）。
   */
  private resolveUpdatedComponents(
    record: { vaccineName: string; components?: unknown },
    dto: UpdateVaccineDto,
    dtoComponents: unknown,
  ): VaccineComponent[] | undefined {
    if (dtoComponents === undefined && dto.vaccineName === undefined) {
      return undefined;
    }
    const name = dto.vaccineName ?? record.vaccineName;
    return dtoComponents === undefined
      ? this.resolveComponents(undefined, name)
      : this.resolveComponents(dtoComponents, name);
  }

  /** 记录里存着的病种（老记录可能是空数组） */
  private storedComponents(explicit: unknown): VaccineComponent[] {
    const stored = Array.isArray(explicit)
      ? explicit
          .map((item) => normalizeVaccineComponent(item))
          .filter((item): item is VaccineComponent => item !== null)
      : [];
    return Array.from(new Set(stored));
  }

  private mapVaccineRecordToDto(record: any): VaccineRecordResponseDto {
    // 读时规则（技术方案 1.1.2）：成分是空的、而这个名字现在产品库认得出
    // → 按产品库重算一次（产品库变强，老记录跟着变准）
    const resolvedKinds = classifyRecordKinds(record);
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
      notes: record.notes,
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
