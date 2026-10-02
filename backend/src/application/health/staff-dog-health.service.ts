import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { HealthTimelineService } from './health-timeline.service';
import { HealthAnalysisService } from './health-analysis.service';
import {
  deriveKnowledgeTags,
  parseHealthTagOverrides,
} from '../recipe-designer/recipe-designer.service';
import {
  KNOWLEDGE_TAG_VOCABULARY,
} from '../../domain/recipe-designer/knowledge-base/tag-vocabulary';

/**
 * 营养师端 · 健康档案（2026-10-01，第八期）。
 *
 * ── 老板第 22–25 条 ────────────────────────────────────────
 *   22. 营养师需要独立页面看某只狗的完整健康分析；设计食谱时也能看到
 *   23. 顾客上传的报告原件，后台要能看到
 *   24. 营养师/管理员要能修改健康标签用来纠错
 *   25. 顾客改了健康信息，要实时告知正在为这只狗设计食谱的营养师
 *
 * ── 关于"实时告知"的落地方式（保守做法）────────────────────
 *   本项目没有长连接推送设施，为一个提醒去搭 WebSocket 不划算。
 *   这里改成**可查询的更新标记**：
 *     · lastHealthUpdatedAt = 该狗所有健康记录里最近的一次更新时间（实时算，不加字段）
 *     · 配上这只狗**进行中的定制单**，就能回答"谁该知道"
 *   设计器/工作台进来一查就知道"这只狗的健康信息在你上次看之后有更新"。
 *   效果是"打开就看到"，而不是"弹窗推给你"—— 够用，且不会漏。
 */

/** 定制单里算"正在进行"的状态 —— 只有这些才需要通知营养师 */
const ACTIVE_ORDER_STATUSES = ['PAID', 'IN_PROGRESS'];

/** 报告原件在健康档案里的归类 */
export interface StaffAttachmentItem {
  /** 来自哪条记录 */
  source: 'visit' | 'checkup';
  recordId: string;
  recordDate: string;
  recordLabel: string;
  /** 顾客自己上传的报告图片地址 */
  url: string;
}

export interface StaffHealthOverview {
  dog: {
    id: string;
    name: string;
    breedName: string | null;
    gender: string;
    isNeutered: boolean;
    birthday: string;
    ageText: string;
    currentWeightKg: number;
    bcsScore: number;
    preferredFoods: string;
    pickyFoods: string;
    medicalHistory: string;
  };
  counts: Record<string, number>;
  allergies: { allergen: string; notes: string; date: string }[];
  ongoingConditions: any[];
  recentVisits: any[];
  recentCheckups: any[];
  vaccines: any;
  weight: any;
  diet: { preferredFoods: string; pickyFoods: string };
  dietPreferences: { liked: string[]; disliked: string[] };
  /** 顾客上传的报告原件（老板第 23 条） */
  attachments: StaffAttachmentItem[];
  /** 系统从病历里派生的领域标签 */
  derivedTags: string[];
  /** 人工修正 */
  tagOverrides: { added: string[]; removed: string[] };
  /** 派生 − removed + added = 最终用于检索的标签 */
  effectiveTags: string[];
  /** 受控词表（后台加标签时只能从这里选） */
  vocabulary: string[];
  /** AI 健康分析（营养师视角：看得到未审核条目，也看得到"还没审"的标记） */
  analysis: any;
  /** 这只狗的健康信息最近一次更新时间（实时算） */
  lastHealthUpdatedAt: string;
  generatedAt: string;
}

@Injectable()
export class StaffDogHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timelineService: HealthTimelineService,
    private readonly analysisService: HealthAnalysisService,
  ) {}

  /**
   * 某只狗的完整健康档案（营养师视角）。
   *
   * 与顾客侧的区别：
   *   · 看得到全部记录（不限于"最近 5 条"）
   *   · **看得到报告原件**（顾客侧只有本人能看）
   *   · 看得到 AI 分析（含未审核条目），并明确标出哪些还没审
   */
  async getHealthOverview(dogId: string): Promise<StaffHealthOverview> {
    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      include: {
        medicalRecords: { orderBy: { visitDate: 'desc' } },
        checkupRecords: { orderBy: { checkupDate: 'desc' } },
        allergyRecords: { orderBy: { createdAt: 'desc' } },
        vaccineRecords: { orderBy: { vaccinationDate: 'desc' } },
        weightRecords: { orderBy: { recordDate: 'desc' }, take: 30 },
        dietPreferences: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!dog) {
      throw new NotFoundException('爱犬不存在');
    }

    const breed = dog.breedId
      ? await this.prisma.dogBreed.findUnique({ where: { id: dog.breedId } })
      : null;

    // 复用顾客侧那套摘要（过敏/未结束的问题/最近就诊…）
    const summary = await this.timelineService.getVisitSummaryForStaff(dogId);

    // AI 分析：营养师视角，不受顾客侧开关限制
    let analysis: any = null;
    try {
      analysis = await this.analysisService.analyzeForStaff(dogId);
    } catch (error: any) {
      // 分析失败不能连带把整个健康档案打不开 —— 记录本身才是关键
      analysis = { error: error?.message || '分析生成失败' };
    }

    const attachments: StaffAttachmentItem[] = [];
    for (const record of dog.medicalRecords) {
      for (const url of record.attachments) {
        attachments.push({
          source: 'visit',
          recordId: record.id,
          recordDate: toDateText(record.visitDate),
          recordLabel: record.diagnosis || '就诊',
          url,
        });
      }
    }
    for (const record of dog.checkupRecords) {
      for (const url of record.attachments) {
        attachments.push({
          source: 'checkup',
          recordId: record.id,
          recordDate: toDateText(record.checkupDate),
          recordLabel: record.checkupType || '体检',
          url,
        });
      }
    }

    // 派生标签用与食谱设计**同一套**逻辑算出来，避免两处口径不一致：
    // 营养师在这里看到的标签，必须就是设计器实际会用的那一份。
    const derivedTags = deriveKnowledgeTags({
      lifeStageLabel: summary.dog.ageText || null,
      ageMonths: null,
      bcsScore: dog.bcsScore,
      currentWeightKg: dog.currentWeightKg,
      weightTrend: [],
      medicalHistory: dog.medicalHistory,
      checkups: dog.checkupRecords.map((item) => ({
        findings: item.findings,
        labValues: item.labValues,
        recommendations: item.recommendations,
      })),
      medicalRecords: dog.medicalRecords.map((item) => ({
        diagnosis: item.diagnosis,
        chiefComplaint: item.chiefComplaint,
      })),
    }).tags;
    const tagOverrides = parseHealthTagOverrides(dog.healthTagOverrides);
    const effectiveTags = applyOverrides(derivedTags, tagOverrides);

    return {
      dog: {
        id: dog.id,
        name: dog.name,
        breedName: breed?.name ?? dog.customBreedName ?? null,
        gender: dog.gender === 'MALE' ? '公' : '母',
        isNeutered: dog.isNeutered,
        birthday: toDateText(dog.birthday),
        ageText: summary.dog.ageText,
        currentWeightKg: dog.currentWeightKg,
        bcsScore: dog.bcsScore,
        preferredFoods: dog.preferredFoods || '',
        pickyFoods: dog.pickyFoods || '',
        medicalHistory: dog.medicalHistory || '',
      },
      counts: {
        visits: dog.medicalRecords.length,
        checkups: dog.checkupRecords.length,
        allergies: dog.allergyRecords.length,
        vaccines: dog.vaccineRecords.length,
        weights: dog.weightRecords.length,
        attachments: attachments.length,
      },
      allergies: summary.allergies,
      ongoingConditions: summary.ongoingConditions,
      recentVisits: summary.recentVisits,
      recentCheckups: summary.recentCheckups,
      vaccines: summary.vaccines,
      weight: summary.weight,
      diet: summary.diet,
      dietPreferences: {
        liked: dog.dietPreferences
          .filter((item) => item.kind === 'LIKED')
          .map((item) => item.foodName),
        disliked: dog.dietPreferences
          .filter((item) => item.kind === 'DISLIKED')
          .map((item) => item.foodName),
      },
      attachments,
      derivedTags,
      tagOverrides,
      effectiveTags,
      vocabulary: [...KNOWLEDGE_TAG_VOCABULARY].sort(),
      analysis,
      lastHealthUpdatedAt: await this.resolveLastHealthUpdatedAt(dogId),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 保存健康标签的人工修正（老板第 24 条）。
   *
   * 只接受受控词表里的标签 —— 后台手输一个系统不认识的标签，
   * 结果就是"改了但检索不到"，比不改更糟。
   */
  async setHealthTagOverrides(
    dogId: string,
    input: { added?: string[]; removed?: string[] },
  ) {
    const dog = await this.prisma.dog.findUnique({ where: { id: dogId } });
    if (!dog) {
      throw new NotFoundException('爱犬不存在');
    }

    const vocabulary = new Set(
      KNOWLEDGE_TAG_VOCABULARY.map((tag) => tag.toLowerCase()),
    );
    const normalize = (value: unknown, field: string): string[] => {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value)) {
        throw new BadRequestException(`${field} 必须是数组`);
      }
      const list = Array.from(
        new Set(
          value
            .map((item) => String(item ?? '').trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      const unknown = list.filter((tag) => !vocabulary.has(tag));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `这些标签不在受控词表里，改了也检索不到：${unknown.join('、')}`,
        );
      }
      return list.slice(0, 40);
    };

    const overrides = {
      added: normalize(input?.added, 'added'),
      removed: normalize(input?.removed, 'removed'),
    };

    // 同一个标签同时出现在 added 与 removed 里是自相矛盾的，直接拦掉
    const conflict = overrides.added.filter((tag) => overrides.removed.includes(tag));
    if (conflict.length > 0) {
      throw new BadRequestException(
        `同一个标签不能既加又删：${conflict.join('、')}`,
      );
    }

    await this.prisma.dog.update({
      where: { id: dogId },
      data: { healthTagOverrides: overrides as any },
    });

    return { dogId, overrides };
  }

  /**
   * 健康信息有更新的狗（老板第 25 条）。
   *
   * 回答两个问题：
   *   · 哪些狗的健康记录最近被改过
   *   · 其中哪些狗**有进行中的定制单** —— 那才是需要通知营养师的
   *
   * 排序按更新时间倒序，默认看最近 7 天。
   */
  async listHealthUpdates(options: { days?: number } = {}) {
    const days = Math.min(Math.max(Number(options.days) || 7, 1), 90);
    const since = new Date(Date.now() - days * 86400000);

    const [medical, checkups, allergies, vaccines, weights, dietChanges] =
      await Promise.all([
        this.prisma.medicalRecord.findMany({
          where: { updatedAt: { gte: since } },
          select: { dogId: true, updatedAt: true },
        }),
        this.prisma.checkupRecord.findMany({
          where: { updatedAt: { gte: since } },
          select: { dogId: true, updatedAt: true },
        }),
        this.prisma.allergyRecord.findMany({
          where: { updatedAt: { gte: since } },
          select: { dogId: true, updatedAt: true },
        }),
        this.prisma.vaccineRecord.findMany({
          where: { updatedAt: { gte: since } },
          select: { dogId: true, updatedAt: true },
        }),
        this.prisma.weightRecord.findMany({
          where: { createdAt: { gte: since } },
          select: { dogId: true, createdAt: true },
        }),
        this.prisma.dogDietPreferenceChange.findMany({
          where: { changedAt: { gte: since } },
          select: { dogId: true, changedAt: true },
        }),
      ]);

    const latest = new Map<string, Date>();
    const bump = (dogId: string, at: Date) => {
      const current = latest.get(dogId);
      if (!current || at.getTime() > current.getTime()) {
        latest.set(dogId, at);
      }
    };
    for (const item of medical) bump(item.dogId, item.updatedAt);
    for (const item of checkups) bump(item.dogId, item.updatedAt);
    for (const item of allergies) bump(item.dogId, item.updatedAt);
    for (const item of vaccines) bump(item.dogId, item.updatedAt);
    for (const item of weights) bump(item.dogId, item.createdAt);
    for (const item of dietChanges) bump(item.dogId, item.changedAt);

    const dogIds = [...latest.keys()];
    if (dogIds.length === 0) {
      return { days, total: 0, items: [] };
    }

    const [dogs, orders] = await Promise.all([
      this.prisma.dog.findMany({
        where: { id: { in: dogIds } },
        select: { id: true, name: true, ownerId: true },
      }),
      this.prisma.customRecipeOrder.findMany({
        where: {
          dogId: { in: dogIds },
          status: { in: ACTIVE_ORDER_STATUSES as any },
        },
        select: { id: true, dogId: true, orderId: true, status: true },
      }),
    ]);

    const dogNameById = new Map(dogs.map((dog) => [dog.id, dog.name]));
    const ordersByDog = new Map<string, typeof orders>();
    for (const order of orders) {
      const list = ordersByDog.get(order.dogId) || [];
      list.push(order);
      ordersByDog.set(order.dogId, list);
    }

    const items = [...latest.entries()]
      .map(([dogId, at]) => {
        const activeOrders = ordersByDog.get(dogId) || [];
        return {
          dogId,
          dogName: dogNameById.get(dogId) || '',
          updatedAt: at.toISOString(),
          /** 有进行中的定制单 → 这才是"正在为它设计食谱"、需要通知的 */
          activeOrderCount: activeOrders.length,
          activeOrders: activeOrders.map((order) => ({
            orderId: order.orderId,
            status: order.status,
          })),
        };
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    return { days, total: items.length, items };
  }

  /** 一只狗所有健康记录里最近的一次更新时间（实时算，不加字段） */
  private async resolveLastHealthUpdatedAt(dogId: string): Promise<string> {
    const [medical, checkups, allergies, vaccines, weights, dietChanges] =
      await Promise.all([
        this.prisma.medicalRecord.findFirst({
          where: { dogId },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        this.prisma.checkupRecord.findFirst({
          where: { dogId },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        this.prisma.allergyRecord.findFirst({
          where: { dogId },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        this.prisma.vaccineRecord.findFirst({
          where: { dogId },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        this.prisma.weightRecord.findFirst({
          where: { dogId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.dogDietPreferenceChange.findFirst({
          where: { dogId },
          orderBy: { changedAt: 'desc' },
          select: { changedAt: true },
        }),
      ]);

    const times = [
      medical?.updatedAt,
      checkups?.updatedAt,
      allergies?.updatedAt,
      vaccines?.updatedAt,
      weights?.createdAt,
      dietChanges?.changedAt,
    ].filter(Boolean) as Date[];

    if (times.length === 0) {
      return '';
    }
    return new Date(Math.max(...times.map((time) => time.getTime()))).toISOString();
  }
}

/** 派生 − removed + added */
export function applyOverrides(
  derived: string[],
  overrides: { added: string[]; removed: string[] },
): string[] {
  const set = new Set(derived.map((tag) => tag.toLowerCase()));
  for (const tag of overrides.removed) set.delete(tag.toLowerCase());
  for (const tag of overrides.added) set.add(tag.toLowerCase());
  return [...set].sort();
}

function toDateText(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
