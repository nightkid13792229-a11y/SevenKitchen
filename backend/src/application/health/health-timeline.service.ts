import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * 健康时间线与就诊前摘要（2026-10-01，第二期）。
 *
 * 背景（老板需求 7、8）：
 *   · 五类记录原先各在各的板块里，**没有一个"一眼看全"的视图** ——
 *     带狗看病前想回顾"这只狗过去发生过什么"，只能一个板块一个板块翻。
 *   · 老板明确：时间线**放在健康管理页内**，不新开板块标签。
 *
 * 这一版把六类数据一次取回并归一成同一种"事件"，
 * 时间线与就诊前摘要共用同一份数据 —— 摘要是分享（第三期）的内容来源。
 */

/** 时间线上的事件类型 */
export type HealthTimelineEventType =
  | 'visit' // 就诊
  | 'checkup' // 体检
  | 'allergy' // 过敏
  | 'vaccine' // 疫苗
  | 'weight' // 体重
  | 'diet' // 饮食偏好

export interface HealthTimelineEvent {
  /** 原始记录 id；饮食偏好是虚拟事件，用固定值 */
  id: string
  type: HealthTimelineEventType
  /** YYYY-MM-DD */
  date: string
  /** 一行标题 */
  title: string
  /** 补充说明 */
  detail: string
  /** 需要顾客注意的标记：逾期 / 即将到期 */
  flag?: 'overdue' | 'due-soon'
}

export interface HealthTimelineResponse {
  dogId: string
  dogName: string
  total: number
  /** 按日期从新到旧 */
  events: HealthTimelineEvent[]
  generatedAt: string
}

export interface HealthVisitSummaryResponse {
  dog: {
    id: string
    name: string
    breedName: string | null
    gender: string
    isNeutered: boolean
    birthday: string
    ageText: string
    currentWeightKg: number
    bcsScore: number
    /** 档案里的体重是什么时候录的（判断这个数字还准不准） */
    weightUpdatedAt: string | null
  }
  /** 安全底线：先给医生看过敏 */
  allergies: { allergen: string; notes: string; date: string }[]
  /** 还没结束的病史（待确认 / 治疗中 / 慢性） */
  ongoingConditions: {
    id: string
    date: string
    diagnosis: string
    status: string
    treatment: string
    followUpDate: string | null
  }[]
  recentVisits: {
    id: string
    date: string
    diagnosis: string
    treatment: string
    veterinarian: string
    attachmentCount: number
  }[]
  recentCheckups: {
    id: string
    date: string
    checkupType: string
    findings: string
    recommendations: string
    attachmentCount: number
  }[]
  vaccines: {
    latest: { id: string; name: string; date: string; nextDueDate: string | null }[]
    /** 已逾期或 60 天内到期 */
    upcoming: { id: string; name: string; nextDueDate: string; overdue: boolean }[]
  }
  weight: {
    current: number
    records: { date: string; weightKg: number }[]
    /** 最近两次之间的变化（kg），不足两条时为 null */
    recentChangeKg: number | null
  }
  diet: { preferredFoods: string; pickyFoods: string }
  counts: {
    visits: number
    checkups: number
    allergies: number
    vaccines: number
    weights: number
  }
  /** 档案里填过的自由文本病史 —— 医生最常问的"以前得过什么" */
  medicalHistory: string
  generatedAt: string
}

/** 时间线最多回看多少条（一次拉全部没有意义，也会让页面很长） */
const TIMELINE_EVENT_LIMIT = 100
/** 摘要里"最近几次"取几条 */
const SUMMARY_RECENT_LIMIT = 5
/** 疫苗提前多久算"即将到期" */
const VACCINE_DUE_SOON_DAYS = 60

@Injectable()
export class HealthTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  /** 健康时间线：六类记录按日期倒序排成一条线 */
  async getTimeline(
    customerId: string,
    dogId: string,
  ): Promise<HealthTimelineResponse> {
    const dog = await this.requireOwnedDog(customerId, dogId);

    const [medical, checkups, allergies, vaccines, weights] = await Promise.all([
      this.prisma.medicalRecord.findMany({ where: { dogId } }),
      this.prisma.checkupRecord.findMany({ where: { dogId } }),
      this.prisma.allergyRecord.findMany({ where: { dogId } }),
      this.prisma.vaccineRecord.findMany({ where: { dogId } }),
      this.prisma.weightRecord.findMany({ where: { dogId } }),
    ]);

    const events: HealthTimelineEvent[] = [
      ...medical.map((record) => ({
        id: record.id,
        type: 'visit' as const,
        date: toDateText(record.visitDate),
        title: record.diagnosis || '就诊记录',
        detail: [record.chiefComplaint, record.treatment, record.veterinarian]
          .filter(Boolean)
          .join(' · '),
      })),
      ...checkups.map((record) => ({
        id: record.id,
        type: 'checkup' as const,
        date: toDateText(record.checkupDate),
        title: record.findings || '体检记录',
        detail: [formatCheckupType(record.checkupType), record.veterinarian]
          .filter(Boolean)
          .join(' · '),
      })),
      ...allergies.map((record) => ({
        id: record.id,
        type: 'allergy' as const,
        date: toDateText(record.createdAt),
        title: `过敏：${record.allergen}`,
        detail: record.notes || '',
      })),
      ...vaccines.map((record) => {
        const due = record.nextDueDate ? toDateText(record.nextDueDate) : null
        const flag = due ? resolveVaccineFlag(due) : undefined
        return {
          id: record.id,
          type: 'vaccine' as const,
          date: toDateText(record.vaccinationDate),
          title: `接种 ${record.vaccineName}`,
          detail: due ? `下次到期 ${due}` : record.notes || '',
          ...(flag ? { flag } : {}),
        }
      }),
      ...weights.map((record) => ({
        id: record.id,
        type: 'weight' as const,
        date: toDateText(record.recordDate),
        title: `${record.weightKg} kg`,
        detail: record.note || '',
      })),
    ]

    // 饮食偏好的**变更**进时间线（2026-10-01 第五期补上）。
    //
    // 第二期时这里刻意留空：当时只有两个自由文本框，没有"什么时候改的"
    // 这个事实（dog 表上只有 createdAt，那是建档时间，拿来当变更时间会误导）。
    // 第五期有了变更历史表，才第一次有真实的饮食事件可放。
    const dietChanges = await this.prisma.dogDietPreferenceChange.findMany({
      where: { dogId },
      orderBy: { changedAt: 'desc' },
      take: 50,
    });
    for (const change of dietChanges) {
      events.push({
        id: change.id,
        type: 'diet',
        date: toDateText(change.changedAt),
        title:
          change.action === 'ADDED'
            ? `饮食偏好：新增「${change.foodName}」`
            : `饮食偏好：去掉「${change.foodName}」`,
        detail: change.kind === 'LIKED' ? '爱吃' : '不吃',
      });
    }

    events.sort(compareTimelineEvents)

    return {
      dogId: dog.id,
      dogName: dog.name,
      total: events.length,
      events: events.slice(0, TIMELINE_EVENT_LIMIT),
      generatedAt: new Date().toISOString(),
    }
  }

  /**
   * 就诊前摘要（老板需求 8："带狗去看病前，我最想看到的是过往病史的摘要"）。
   *
   * 排序按医生问诊的实际顺序：
   *   过敏（安全底线）→ 还没好的病 → 最近就诊 → 最近体检 → 疫苗 → 体重 → 饮食
   */
  async getVisitSummary(
    customerId: string,
    dogId: string,
  ): Promise<HealthVisitSummaryResponse> {
    const dog = await this.requireOwnedDog(customerId, dogId);

    const [medical, checkups, allergies, vaccines, weights, breed] =
      await Promise.all([
        this.prisma.medicalRecord.findMany({
          where: { dogId },
          orderBy: { visitDate: 'desc' },
        }),
        this.prisma.checkupRecord.findMany({
          where: { dogId },
          orderBy: { checkupDate: 'desc' },
        }),
        this.prisma.allergyRecord.findMany({
          where: { dogId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.vaccineRecord.findMany({
          where: { dogId },
          orderBy: { vaccinationDate: 'desc' },
        }),
        this.prisma.weightRecord.findMany({
          where: { dogId },
          orderBy: { recordDate: 'desc' },
          take: SUMMARY_RECENT_LIMIT + 1,
        }),
        dog.breedId
          ? this.prisma.dogBreed.findUnique({ where: { id: dog.breedId } })
          : Promise.resolve(null),
      ]);

    const ongoingStatuses = ['PENDING_CONFIRMATION', 'TREATING', 'CHRONIC']
    const ongoingConditions = medical
      .filter((record) => ongoingStatuses.includes(String(record.status)))
      .map((record) => ({
        id: record.id,
        date: toDateText(record.visitDate),
        diagnosis: record.diagnosis,
        status: formatMedicalStatus(record.status),
        treatment: record.treatment || '',
        followUpDate: record.followUpDate ? toDateText(record.followUpDate) : null,
      }))

    const weightRecords = weights.map((record) => ({
      date: toDateText(record.recordDate),
      weightKg: record.weightKg,
    }))

    return {
      dog: {
        id: dog.id,
        name: dog.name,
        breedName: breed?.name ?? dog.customBreedName ?? null,
        gender: dog.gender === 'MALE' ? '公' : '母',
        isNeutered: dog.isNeutered,
        birthday: toDateText(dog.birthday),
        ageText: formatAgeText(dog.birthday),
        currentWeightKg: dog.currentWeightKg,
        bcsScore: dog.bcsScore,
        weightUpdatedAt: dog.weightUpdatedAt
          ? toDateText(dog.weightUpdatedAt)
          : null,
      },
      allergies: allergies.map((record) => ({
        allergen: record.allergen,
        notes: record.notes || '',
        date: toDateText(record.createdAt),
      })),
      ongoingConditions,
      recentVisits: medical.slice(0, SUMMARY_RECENT_LIMIT).map((record) => ({
        id: record.id,
        date: toDateText(record.visitDate),
        diagnosis: record.diagnosis,
        treatment: record.treatment || '',
        veterinarian: record.veterinarian || '',
        attachmentCount: record.attachments.length,
      })),
      recentCheckups: checkups.slice(0, SUMMARY_RECENT_LIMIT).map((record) => ({
        id: record.id,
        date: toDateText(record.checkupDate),
        checkupType: formatCheckupType(record.checkupType),
        findings: record.findings || '',
        recommendations: record.recommendations || '',
        attachmentCount: record.attachments.length,
      })),
      vaccines: {
        latest: vaccines.slice(0, SUMMARY_RECENT_LIMIT).map((record) => ({
          id: record.id,
          name: record.vaccineName,
          date: toDateText(record.vaccinationDate),
          nextDueDate: record.nextDueDate
            ? toDateText(record.nextDueDate)
            : null,
        })),
        upcoming: vaccines
          .filter((record) => record.nextDueDate)
          .map((record) => {
            const due = toDateText(record.nextDueDate)
            return {
              id: record.id,
              name: record.vaccineName,
              nextDueDate: due,
              overdue: isOverdue(due),
            }
          })
          .filter((item) => item.overdue || isDueSoon(item.nextDueDate))
          .sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1)),
      },
      weight: {
        current: dog.currentWeightKg,
        records: weightRecords.slice(0, SUMMARY_RECENT_LIMIT),
        recentChangeKg:
          weightRecords.length >= 2
            ? round1(weightRecords[0].weightKg - weightRecords[1].weightKg)
            : null,
      },
      diet: {
        preferredFoods: dog.preferredFoods || '',
        pickyFoods: dog.pickyFoods || '',
      },
      counts: {
        visits: medical.length,
        checkups: checkups.length,
        allergies: allergies.length,
        vaccines: vaccines.length,
        weights: weights.length,
      },
      medicalHistory: dog.medicalHistory || '',
      generatedAt: new Date().toISOString(),
    }
  }

  /**
   * 员工用（营养师/管理端）：跳过归属校验。
   *
   * 与顾客侧的差别只有一处：顾客侧要验证"这只是你的狗"，
   * 员工侧由 StaffGuard 在控制器上把关，这里不再要求 customerId。
   */
  async getVisitSummaryForStaff(dogId: string) {
    const dog = await this.prisma.dog.findUnique({ where: { id: dogId } });
    if (!dog) {
      throw new NotFoundException('爱犬不存在');
    }
    return this.getVisitSummary(dog.ownerId, dogId);
  }

  /** 顾客只能看自己狗的档案 */
  private async requireOwnedDog(customerId: string, dogId: string) {
    const dog = await this.prisma.dog.findUnique({ where: { id: dogId } })
    if (!dog) {
      throw new NotFoundException('Dog not found')
    }
    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied')
    }
    return dog
  }
}

// ---------------------------------------------------------------------------
// 纯粹的格式化与排序，放在文件底部便于单测
// ---------------------------------------------------------------------------

/** 时间线排序：日期从新到旧；同一天按类型固定顺序，保证结果稳定 */
const TIMELINE_TYPE_ORDER: Record<HealthTimelineEventType, number> = {
  visit: 0,
  checkup: 1,
  allergy: 2,
  vaccine: 3,
  weight: 4,
  diet: 5,
}

export function compareTimelineEvents(
  a: HealthTimelineEvent,
  b: HealthTimelineEvent,
): number {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1
  }
  return TIMELINE_TYPE_ORDER[a.type] - TIMELINE_TYPE_ORDER[b.type]
}

export function toDateText(value: Date | string | null | undefined): string {
  if (!value) {
    return ''
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 距离今天还有几天（负数表示已经过了） */
export function daysFromToday(dateText: string, today = new Date()): number {
  const target = new Date(`${dateText}T00:00:00`)
  if (Number.isNaN(target.getTime())) {
    return Number.NaN
  }
  const base = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )
  return Math.round((target.getTime() - base.getTime()) / 86400000)
}

export function isOverdue(dateText: string, today = new Date()): boolean {
  const days = daysFromToday(dateText, today)
  return !Number.isNaN(days) && days < 0
}

export function isDueSoon(dateText: string, today = new Date()): boolean {
  const days = daysFromToday(dateText, today)
  return !Number.isNaN(days) && days >= 0 && days <= VACCINE_DUE_SOON_DAYS
}

function resolveVaccineFlag(
  dateText: string,
): 'overdue' | 'due-soon' | undefined {
  if (isOverdue(dateText)) {
    return 'overdue'
  }
  if (isDueSoon(dateText)) {
    return 'due-soon'
  }
  return undefined
}

const CHECKUP_TYPE_LABELS: Record<string, string> = {
  ROUTINE: '常规体检',
  PRE_PURCHASE: '购前体检',
  SENIOR_WELLNESS: '老年健康检查',
  PRE_ANESTHESIA: '麻醉前检查',
  EMERGENCY: '急诊检查',
  FOLLOW_UP: '复查',
}

export function formatCheckupType(value: string | null | undefined): string {
  const key = String(value || '').trim()
  if (!key) {
    return '体检'
  }
  return CHECKUP_TYPE_LABELS[key.toUpperCase()] || key
}

const MEDICAL_STATUS_LABELS: Record<string, string> = {
  PENDING_CONFIRMATION: '待确认',
  TREATING: '治疗中',
  RECOVERED: '已康复',
  CHRONIC: '慢性',
}

export function formatMedicalStatus(value: string | null | undefined): string {
  const key = String(value || '').trim()
  return MEDICAL_STATUS_LABELS[key] || key
}

/** 年龄写成"3 岁 2 个月"，医生一眼就知道该按什么阶段看 */
export function formatAgeText(
  birthday: Date | string | null | undefined,
  today = new Date(),
): string {
  if (!birthday) {
    return ''
  }
  const born = birthday instanceof Date ? birthday : new Date(birthday)
  if (Number.isNaN(born.getTime())) {
    return ''
  }

  let months =
    (today.getFullYear() - born.getFullYear()) * 12 +
    (today.getMonth() - born.getMonth())
  if (today.getDate() < born.getDate()) {
    months -= 1
  }
  if (months < 0) {
    return ''
  }

  const years = Math.floor(months / 12)
  const restMonths = months % 12
  if (years === 0) {
    return `${restMonths} 个月`
  }
  if (restMonths === 0) {
    return `${years} 岁`
  }
  return `${years} 岁 ${restMonths} 个月`
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
