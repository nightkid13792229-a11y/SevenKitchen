import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { HealthTimelineService, toDateText } from './health-timeline.service';

/**
 * 健康信息分享（2026-10-01，第三期）。
 *
 * ── 老板定的六条 ──────────────────────────────────────────
 *   1. 主要分享给换新医生，兼顾家人朋友
 *   2. 内容三选一：摘要 / 报告原件 / 合并
 *   3. 形式只要小程序分享卡片
 *   4. 不设有效期
 *   5. 医疗信息默认全给，顾客可以逐项取消
 *   6. 医生点开链接不需要登录
 *
 * ── 两个关键设计决定（都是为了守住"医疗数据"这条线）──────
 *
 * ① **存快照，不存"指向档案的引用"。**
 *    "不设有效期"如果配实时档案，等于给了一个永久实时链接 ——
 *    顾客今天分享，半年后新加的化验单也会被同一个链接看到。
 *    存快照之后，分享出去的就是**生成那一刻的那一份**，之后档案怎么变都不影响它；
 *    "逐项取消"也因此可靠：取消掉的项在快照里根本不存在。
 *
 * ② **报告原件走本服务代理，不直接给 COS 地址。**
 *    文件上传后拿到的是公开 CDN 地址（谁拿到链接谁就能看）。
 *    如果直接把地址写进快照，"停止分享"就只是删了个索引 ——
 *    已经打开过的人照样能看、能存、能转发，这与老板要的"能停止分享"相悖。
 *    所以快照里存的是 `附件序号`，真实地址由这里在**校验令牌之后**取回并转发；
 *    令牌一撤销，附件立刻取不到。
 */

/** 分享形态 */
export type HealthShareContentMode = 'SUMMARY' | 'FILES' | 'BOTH';

/** 可以逐项开关的摘要分区（老板第 5 条：默认全给，顾客自己取消） */
export const HEALTH_SHARE_SECTIONS = [
  'allergies',
  'ongoing',
  'visits',
  'checkups',
  'vaccines',
  'weight',
  'diet',
  'history',
] as const;

export type HealthShareSection = (typeof HEALTH_SHARE_SECTIONS)[number];

export const HEALTH_SHARE_SECTION_LABELS: Record<HealthShareSection, string> = {
  allergies: '过敏',
  ongoing: '还没结束的问题',
  visits: '最近就诊',
  checkups: '最近体检',
  vaccines: '疫苗',
  weight: '体重',
  diet: '饮食偏好',
  history: '档案里的病史描述',
};

export interface HealthShareAttachment {
  /** 展示用：来自哪条记录 */
  label: string
  /** 展示用：文件名/序号 */
  name: string
  /** ⚠️ 真实地址**不下发给前端**，由 attachment 接口按令牌转发 */
  sourceUrl: string
}

export interface HealthShareSnapshot {
  dogName: string
  dogLine: string
  contentMode: HealthShareContentMode
  /** 生成时就只包含顾客勾选的分区 */
  summary: Record<string, unknown>
  attachments: HealthShareAttachment[]
  generatedAt: string
  /** 给医生看的一句话说明 */
  note: string
}

export interface CreateHealthShareOptions {
  contentMode?: string
  /** 不传 = 全部（老板第 5 条：默认全给） */
  sections?: string[]
}

const TOKEN_BYTES = 16; // 32 位十六进制

@Injectable()
export class HealthShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timelineService: HealthTimelineService,
  ) {}

  /** 生成一份分享（快照 + 令牌） */
  async createShare(
    customerId: string,
    dogId: string,
    options: CreateHealthShareOptions = {},
  ) {
    // 归属校验**自己做一遍**，不靠下游的摘要接口代劳 ——
    // 只依赖间接校验的话，哪天那个调用被挪走或换掉，校验就静默消失了。
    // 这是医疗数据，宁可多查一次。
    await this.requireOwnedDog(customerId, dogId);

    const contentMode = normalizeContentMode(options.contentMode);
    const sections = normalizeSections(options.sections);

    // 摘要与附件都从同一个聚合接口取，保证"顾客看到的"和"分享出去的"一致
    const summary = await this.timelineService.getVisitSummary(
      customerId,
      dogId,
    );

    // 报告原件要单独查：摘要接口只给了"有几个附件"，拿不到地址
    const attachments =
      contentMode === 'FILES' || contentMode === 'BOTH'
        ? await this.collectAttachments(dogId)
        : [];

    const snapshot = buildSnapshot({
      summary,
      contentMode,
      sections,
      attachments,
    });

    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const record = await this.prisma.dogHealthShareToken.create({
      data: {
        dogId,
        token,
        snapshot: snapshot as unknown as object,
        contentMode,
        createdBy: customerId,
      },
    });

    return {
      token: record.token,
      contentMode: record.contentMode,
      createdAt: record.createdAt,
      attachmentCount: snapshot.attachments.length,
      includedSections: sections,
    };
  }

  /** 这只狗还没被停止分享的记录 */
  async listShares(customerId: string, dogId: string) {
    await this.requireOwnedDog(customerId, dogId);

    const records = await this.prisma.dogHealthShareToken.findMany({
      where: { dogId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => {
      const snapshot = record.snapshot as unknown as HealthShareSnapshot;
      return {
        token: record.token,
        contentMode: record.contentMode,
        createdAt: record.createdAt,
        attachmentCount: Array.isArray(snapshot?.attachments)
          ? snapshot.attachments.length
          : 0,
      };
    });
  }

  /** 停止分享：写 revokedAt，链接与附件立刻失效 */
  async revokeShare(customerId: string, dogId: string, token: string) {
    await this.requireOwnedDog(customerId, dogId);

    const record = await this.prisma.dogHealthShareToken.findFirst({
      where: { dogId, token },
    });
    if (!record) {
      throw new NotFoundException('Share not found');
    }

    if (!record.revokedAt) {
      await this.prisma.dogHealthShareToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    }

    return { token, revoked: true };
  }

  /**
   * 医生侧读取（**不需要登录**，老板第 6 条）。
   *
   * 附件的真实地址在这里被剥掉，换成走本服务转发的相对路径。
   */
  async getPublicShare(token: string) {
    const record = await this.findActiveShare(token);
    const snapshot = record.snapshot as unknown as HealthShareSnapshot;

    return {
      dogName: snapshot?.dogName || '',
      dogLine: snapshot?.dogLine || '',
      contentMode: snapshot?.contentMode || 'SUMMARY',
      summary: snapshot?.summary || {},
      generatedAt: snapshot?.generatedAt || '',
      note: snapshot?.note || '',
      attachments: (Array.isArray(snapshot?.attachments)
        ? snapshot.attachments
        : []
      ).map((attachment, index) => ({
        label: attachment.label,
        name: attachment.name,
        // 走令牌校验的转发地址，而不是 COS 直链 ——
        // 这样"停止分享"才真的能撤掉已经发出去的图片
        url: `/api/v1/shared-health/${token}/attachment/${index}`,
      })),
    };
  }

  /** 取某个附件的真实地址（仅供转发接口内部使用） */
  async resolveAttachmentSource(
    token: string,
    index: number,
  ): Promise<HealthShareAttachment> {
    const record = await this.findActiveShare(token);
    const snapshot = record.snapshot as unknown as HealthShareSnapshot;
    const attachments = Array.isArray(snapshot?.attachments)
      ? snapshot.attachments
      : [];

    if (!Number.isInteger(index) || index < 0 || index >= attachments.length) {
      throw new NotFoundException('Attachment not found');
    }

    return attachments[index];
  }

  /** 令牌有效性与归属的单一入口 */
  private async findActiveShare(token: string) {
    const record = await this.prisma.dogHealthShareToken.findUnique({
      where: { token },
    });

    if (!record) {
      throw new NotFoundException('Share link not found');
    }
    if (record.revokedAt) {
      // 410 而不是 404：告诉医生"这份分享被主人停掉了"，不是链接打错了
      throw new GoneException('This share has been stopped');
    }

    return record;
  }

  /**
   * 收集这只狗的全部报告原件。
   *
   * 按上传时间从新到旧排，医生最想看的是最近那几张。
   * 记录被删掉时附件也就没了 —— 这是对的，顾客删记录就是不想留。
   */
  private async collectAttachments(dogId: string): Promise<HealthShareAttachment[]> {
    const [medical, checkups] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where: { dogId },
        orderBy: { visitDate: 'desc' },
      }),
      this.prisma.checkupRecord.findMany({
        where: { dogId },
        orderBy: { checkupDate: 'desc' },
      }),
    ]);

    const out: HealthShareAttachment[] = [];

    for (const record of medical) {
      record.attachments.forEach((url, index) => {
        out.push({
          label: `就诊 ${toDateText(record.visitDate)} · ${record.diagnosis || '未填写诊断'}`,
          name: `报告 ${index + 1}`,
          sourceUrl: url,
        });
      });
    }

    for (const record of checkups) {
      record.attachments.forEach((url, index) => {
        out.push({
          label: `体检 ${toDateText(record.checkupDate)} · ${record.checkupType || '体检'}`,
          name: `报告 ${index + 1}`,
          sourceUrl: url,
        });
      });
    }

    return out;
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
// 纯函数，便于单测
// ---------------------------------------------------------------------------

export function normalizeContentMode(value: unknown): HealthShareContentMode {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'FILES' || key === 'BOTH' || key === 'SUMMARY') {
    return key;
  }
  // 缺省给"合并"：老板第 5 条说医疗信息默认全给
  return 'BOTH';
}

/**
 * 分区白名单。
 *
 * 只认已知分区名，未知值直接忽略 —— 前端传错或有人手工构造请求，
 * 都不会让快照里多出顾客没授权的分区。
 */
export function normalizeSections(value: unknown): HealthShareSection[] {
  if (!Array.isArray(value)) {
    return [...HEALTH_SHARE_SECTIONS];
  }

  const allowed = new Set<string>(HEALTH_SHARE_SECTIONS);
  const picked = value
    .map((item) => String(item || '').trim())
    .filter((item) => allowed.has(item)) as HealthShareSection[];

  // 传了但全是无效值 → 当"没传"处理，避免生成一份空摘要
  return picked.length > 0 ? picked : [...HEALTH_SHARE_SECTIONS];
}

/**
 * 组装快照。
 *
 * 三条硬规则：
 *   ① 顾客没勾的分区**根本不写进快照**（不是写进去再在前端隐藏）；
 *   ② contentMode 不含 FILES 时，报告原件一条都不带；
 *   ③ 附件一条都不带 COS 直链 —— 只留原始地址给服务端转发时用，
 *      下发给前端时会剥掉（见 getPublicShare）。
 */
export function buildSnapshot(input: {
  summary: any
  contentMode: HealthShareContentMode
  sections: HealthShareSection[]
  /** 已经查好的报告原件；contentMode 不含 FILES 时传空数组 */
  attachments?: HealthShareAttachment[]
}): HealthShareSnapshot {
  const { summary, contentMode, sections } = input;
  const picked = new Set<string>(sections)
  const summaryOut: Record<string, unknown> = {}

  if (picked.has('allergies')) summaryOut.allergies = summary.allergies ?? []
  if (picked.has('ongoing')) summaryOut.ongoingConditions = summary.ongoingConditions ?? []
  if (picked.has('visits')) summaryOut.recentVisits = summary.recentVisits ?? []
  if (picked.has('checkups')) summaryOut.recentCheckups = summary.recentCheckups ?? []
  if (picked.has('vaccines')) summaryOut.vaccines = summary.vaccines ?? { latest: [], upcoming: [] }
  if (picked.has('weight')) summaryOut.weight = summary.weight ?? {}
  if (picked.has('diet')) summaryOut.diet = summary.diet ?? {}
  if (picked.has('history')) summaryOut.medicalHistory = summary.medicalHistory ?? ''

  // 附件由调用方按形态决定要不要查；这里只做一次兜底，保证 FILES/BOTH 不会空手
  const attachments =
    contentMode === 'FILES' || contentMode === 'BOTH'
      ? input.attachments || []
      : [];

  const dog = summary?.dog || {}

  return {
    dogName: String(dog.name || ''),
    dogLine: [dog.breedName, dog.gender, dog.ageText].filter(Boolean).join(' · '),
    contentMode,
    summary: summaryOut,
    attachments,
    generatedAt: new Date().toISOString(),
    note: '本摘要由主人自己记录的内容整理而成，仅供就诊时参考，不构成诊断。',
  }
}
