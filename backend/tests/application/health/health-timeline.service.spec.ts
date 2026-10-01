import {
  HealthTimelineService,
  compareTimelineEvents,
  daysFromToday,
  formatAgeText,
  formatCheckupType,
  formatMedicalStatus,
  isDueSoon,
  isOverdue,
  toDateText,
  type HealthTimelineEvent,
} from '../../../src/application/health/health-timeline.service';

/**
 * 健康时间线与就诊前摘要（2026-10-01，第二期）。
 *
 * 这两个接口是需求 7、8 的落地：把五类记录合成一条时间线，
 * 并给出一份"带狗看病前最该看到"的摘要。
 */
describe('HealthTimelineService', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';

  function createPrisma(overrides: Record<string, any> = {}) {
    const dog = {
      id: DOG_ID,
      ownerId: CUSTOMER_ID,
      name: '面包',
      breedId: 'breed-1',
      customBreedName: null,
      birthday: new Date('2023-05-10T00:00:00.000Z'),
      gender: 'MALE',
      isNeutered: true,
      currentWeightKg: 12.4,
      weightUpdatedAt: new Date('2026-09-20T00:00:00.000Z'),
      bcsScore: 5,
      preferredFoods: '鸡胸肉、南瓜',
      pickyFoods: '胡萝卜',
      medicalHistory: '2024 年有过一次肠胃炎',
      ...overrides.dog,
    }

    return {
      dog: { findUnique: jest.fn().mockResolvedValue(dog) },
      dogBreed: {
        findUnique: jest.fn().mockResolvedValue({ id: 'breed-1', name: '比熊' }),
      },
      medicalRecord: { findMany: jest.fn().mockResolvedValue([]) },
      checkupRecord: { findMany: jest.fn().mockResolvedValue([]) },
      allergyRecord: { findMany: jest.fn().mockResolvedValue([]) },
      vaccineRecord: { findMany: jest.fn().mockResolvedValue([]) },
      weightRecord: { findMany: jest.fn().mockResolvedValue([]) },
      // 第五期起时间线会读饮食偏好的变更历史
      dogDietPreferenceChange: { findMany: jest.fn().mockResolvedValue([]) },
    } as any
  }

  describe('归属校验', () => {
    it('不是自己的狗 → 403', async () => {
      const prisma = createPrisma({ dog: { ownerId: 'someone-else' } })
      const service = new HealthTimelineService(prisma)

      await expect(service.getTimeline(CUSTOMER_ID, DOG_ID)).rejects.toThrow(
        'Access denied',
      )
      await expect(
        service.getVisitSummary(CUSTOMER_ID, DOG_ID),
      ).rejects.toThrow('Access denied')
    })

    it('狗不存在 → 404', async () => {
      const prisma = createPrisma()
      prisma.dog.findUnique = jest.fn().mockResolvedValue(null)
      const service = new HealthTimelineService(prisma)

      await expect(service.getTimeline(CUSTOMER_ID, DOG_ID)).rejects.toThrow(
        'Dog not found',
      )
    })
  })

  describe('时间线', () => {
    it('五类记录合成一条线，按日期从新到旧', async () => {
      const prisma = createPrisma()
      prisma.medicalRecord.findMany = jest.fn().mockResolvedValue([
        {
          id: 'm1',
          visitDate: new Date('2026-03-01T00:00:00.000Z'),
          diagnosis: '急性胃炎',
          chiefComplaint: '呕吐',
          treatment: '禁食',
          veterinarian: '张医生',
          attachments: [],
        },
      ])
      prisma.checkupRecord.findMany = jest.fn().mockResolvedValue([
        {
          id: 'c1',
          checkupDate: new Date('2026-06-01T00:00:00.000Z'),
          checkupType: 'ROUTINE',
          findings: '未见异常',
          recommendations: '',
          veterinarian: '',
          attachments: [],
        },
      ])
      prisma.weightRecord.findMany = jest.fn().mockResolvedValue([
        {
          id: 'w1',
          recordDate: new Date('2026-01-01T00:00:00.000Z'),
          weightKg: 12.1,
          note: '',
        },
      ])

      const service = new HealthTimelineService(prisma)
      const result = await service.getTimeline(CUSTOMER_ID, DOG_ID)

      expect(result.events.map((event) => event.id)).toEqual(['c1', 'm1', 'w1'])
      expect(result.dogName).toBe('面包')
      expect(result.total).toBe(3)
    })

    it('同一天里按固定类型顺序排，结果稳定可复现', async () => {
      const prisma = createPrisma()
      const sameDay = new Date('2026-06-01T00:00:00.000Z')
      prisma.medicalRecord.findMany = jest.fn().mockResolvedValue([
        { id: 'm1', visitDate: sameDay, diagnosis: 'A', attachments: [] },
      ])
      prisma.checkupRecord.findMany = jest.fn().mockResolvedValue([
        { id: 'c1', checkupDate: sameDay, checkupType: 'ROUTINE', attachments: [] },
      ])
      prisma.weightRecord.findMany = jest.fn().mockResolvedValue([
        { id: 'w1', recordDate: sameDay, weightKg: 12, note: '' },
      ])

      const service = new HealthTimelineService(prisma)
      const result = await service.getTimeline(CUSTOMER_ID, DOG_ID)

      expect(result.events.map((event) => event.id)).toEqual(['m1', 'c1', 'w1'])
    })

    it('疫苗逾期与即将到期会被标出来', async () => {
      const future = new Date(Date.now() + 30 * 86400000)
      const past = new Date(Date.now() - 30 * 86400000)
      const far = new Date(Date.now() + 300 * 86400000)

      const prisma = createPrisma()
      prisma.vaccineRecord.findMany = jest.fn().mockResolvedValue([
        {
          id: 'v-overdue',
          vaccineName: '狂犬',
          vaccinationDate: past,
          nextDueDate: past,
          notes: '',
        },
        {
          id: 'v-soon',
          vaccineName: '六联',
          vaccinationDate: past,
          nextDueDate: future,
          notes: '',
        },
        {
          id: 'v-far',
          vaccineName: '六联',
          vaccinationDate: past,
          nextDueDate: far,
          notes: '',
        },
      ])

      const service = new HealthTimelineService(prisma)
      const result = await service.getTimeline(CUSTOMER_ID, DOG_ID)

      const flagOf = (id: string) =>
        result.events.find((event) => event.id === id)?.flag
      expect(flagOf('v-overdue')).toBe('overdue')
      expect(flagOf('v-soon')).toBe('due-soon')
      expect(flagOf('v-far')).toBeUndefined()
    })

    it('一条记录都没有时返回空列表而不是报错', async () => {
      const service = new HealthTimelineService(createPrisma())
      const result = await service.getTimeline(CUSTOMER_ID, DOG_ID)

      expect(result.events).toEqual([])
      expect(result.total).toBe(0)
    })

    it('饮食偏好的变更进时间线（第五期补上：此前没有"什么时候改的"这个事实）', async () => {
      const prisma = createPrisma()
      prisma.dogDietPreferenceChange.findMany = jest.fn().mockResolvedValue([
        {
          id: 'd1',
          kind: 'LIKED',
          foodName: '鸡胸肉',
          action: 'ADDED',
          changedAt: new Date('2026-09-20T00:00:00.000Z'),
        },
      ])
      const service = new HealthTimelineService(prisma)
      const result = await service.getTimeline(CUSTOMER_ID, DOG_ID)

      const dietEvent = result.events.find((event) => event.type === 'diet')
      expect(dietEvent).toBeDefined()
      expect(dietEvent!.title).toContain('鸡胸肉')
      expect(dietEvent!.detail).toBe('爱吃')
    })

    it('没有饮食变更时时间线里也没有饮食事件', async () => {
      const service = new HealthTimelineService(createPrisma())
      const result = await service.getTimeline(CUSTOMER_ID, DOG_ID)

      expect(result.events.some((event) => event.type === 'diet')).toBe(false)
    })
  })

  describe('就诊前摘要', () => {
    function buildSummaryPrisma() {
      const prisma = createPrisma()
      prisma.medicalRecord.findMany = jest.fn().mockResolvedValue([
        {
          id: 'm-open',
          visitDate: new Date('2026-08-01T00:00:00.000Z'),
          diagnosis: '慢性胃炎',
          status: 'CHRONIC',
          treatment: '处方粮',
          veterinarian: '张医生',
          followUpDate: new Date('2026-11-01T00:00:00.000Z'),
          attachments: ['a.jpg'],
          chiefComplaint: '呕吐',
        },
        {
          id: 'm-done',
          visitDate: new Date('2026-01-01T00:00:00.000Z'),
          diagnosis: '外伤',
          status: 'RECOVERED',
          treatment: '清创',
          veterinarian: '',
          followUpDate: null,
          attachments: [],
          chiefComplaint: '跛行',
        },
      ])
      prisma.checkupRecord.findMany = jest.fn().mockResolvedValue([
        {
          id: 'c1',
          checkupDate: new Date('2026-06-01T00:00:00.000Z'),
          checkupType: 'SENIOR_WELLNESS',
          findings: '血常规未见异常',
          recommendations: '半年后复查',
          attachments: ['b.jpg'],
        },
      ])
      prisma.allergyRecord.findMany = jest.fn().mockResolvedValue([
        {
          id: 'a1',
          allergen: '鸡肉',
          notes: '皮肤瘙痒',
          createdAt: new Date('2025-12-01T00:00:00.000Z'),
        },
      ])
      prisma.vaccineRecord.findMany = jest.fn().mockResolvedValue([
        {
          id: 'v1',
          vaccineName: '狂犬',
          vaccinationDate: new Date('2025-06-01T00:00:00.000Z'),
          nextDueDate: new Date(Date.now() - 10 * 86400000),
        },
      ])
      prisma.weightRecord.findMany = jest.fn().mockResolvedValue([
        { id: 'w1', recordDate: new Date('2026-09-01T00:00:00.000Z'), weightKg: 12.4 },
        { id: 'w2', recordDate: new Date('2026-08-01T00:00:00.000Z'), weightKg: 12.0 },
      ])
      return prisma
    }

    it('过敏排在最前（安全底线），并带上狗的档案信息', async () => {
      const service = new HealthTimelineService(buildSummaryPrisma())
      const summary = await service.getVisitSummary(CUSTOMER_ID, DOG_ID)

      expect(summary.allergies).toHaveLength(1)
      expect(summary.allergies[0].allergen).toBe('鸡肉')
      expect(summary.dog.name).toBe('面包')
      expect(summary.dog.breedName).toBe('比熊')
      expect(summary.dog.gender).toBe('公')
      // 档案里填过的自由文本病史 —— 医生最常问的"以前得过什么"
      expect(summary.medicalHistory).toContain('肠胃炎')
    })

    it('只把"还没结束"的病史算进 ongoingConditions', async () => {
      const service = new HealthTimelineService(buildSummaryPrisma())
      const summary = await service.getVisitSummary(CUSTOMER_ID, DOG_ID)

      expect(summary.ongoingConditions.map((item) => item.id)).toEqual(['m-open'])
      expect(summary.ongoingConditions[0].status).toBe('慢性')
      // 已康复的那条仍然出现在"最近就诊"里
      expect(summary.recentVisits.map((item) => item.id)).toEqual([
        'm-open',
        'm-done',
      ])
    })

    it('体检类型与附件数带出来，方便医生判断要不要看报告', async () => {
      const service = new HealthTimelineService(buildSummaryPrisma())
      const summary = await service.getVisitSummary(CUSTOMER_ID, DOG_ID)

      expect(summary.recentCheckups[0].checkupType).toBe('老年健康检查')
      expect(summary.recentCheckups[0].attachmentCount).toBe(1)
    })

    it('逾期疫苗进 upcoming 并标记 overdue', async () => {
      const service = new HealthTimelineService(buildSummaryPrisma())
      const summary = await service.getVisitSummary(CUSTOMER_ID, DOG_ID)

      expect(summary.vaccines.upcoming).toHaveLength(1)
      expect(summary.vaccines.upcoming[0].overdue).toBe(true)
    })

    it('体重给出最近变化量', async () => {
      const service = new HealthTimelineService(buildSummaryPrisma())
      const summary = await service.getVisitSummary(CUSTOMER_ID, DOG_ID)

      expect(summary.weight.current).toBe(12.4)
      expect(summary.weight.recentChangeKg).toBe(0.4)
    })

    it('体重不足两条时不给变化量（不编造趋势）', async () => {
      const prisma = buildSummaryPrisma()
      prisma.weightRecord.findMany = jest
        .fn()
        .mockResolvedValue([
          { id: 'w1', recordDate: new Date('2026-09-01T00:00:00.000Z'), weightKg: 12.4 },
        ])
      const service = new HealthTimelineService(prisma)
      const summary = await service.getVisitSummary(CUSTOMER_ID, DOG_ID)

      expect(summary.weight.recentChangeKg).toBeNull()
    })

    it('各类记录条数汇总出来', async () => {
      const service = new HealthTimelineService(buildSummaryPrisma())
      const summary = await service.getVisitSummary(CUSTOMER_ID, DOG_ID)

      expect(summary.counts).toEqual({
        visits: 2,
        checkups: 1,
        allergies: 1,
        vaccines: 1,
        weights: 2,
      })
    })
  })

  describe('格式化与日期工具', () => {
    it('日期一律 YYYY-MM-DD', () => {
      expect(toDateText(new Date(2026, 5, 1))).toBe('2026-06-01')
      expect(toDateText('2026-06-01T00:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(toDateText(null)).toBe('')
      expect(toDateText('不是日期')).toBe('')
    })

    it('体检类型翻成中文，未知值原样返回', () => {
      expect(formatCheckupType('ROUTINE')).toBe('常规体检')
      expect(formatCheckupType('SENIOR_WELLNESS')).toBe('老年健康检查')
      expect(formatCheckupType('')).toBe('体检')
      expect(formatCheckupType('SOMETHING_NEW')).toBe('SOMETHING_NEW')
    })

    it('病史状态翻成中文', () => {
      expect(formatMedicalStatus('PENDING_CONFIRMATION')).toBe('待确认')
      expect(formatMedicalStatus('CHRONIC')).toBe('慢性')
    })

    it('年龄写成"X 岁 Y 个月"', () => {
      const today = new Date(2026, 9, 1) // 2026-10-01
      expect(formatAgeText(new Date(2023, 4, 10), today)).toBe('3 岁 4 个月')
      expect(formatAgeText(new Date(2026, 5, 1), today)).toBe('4 个月')
      expect(formatAgeText(new Date(2023, 9, 1), today)).toBe('3 岁')
      expect(formatAgeText(null, today)).toBe('')
    })

    it('逾期与即将到期的判定', () => {
      const today = new Date(2026, 9, 1)
      const past = '2026-09-01'
      const soon = '2026-10-20'
      const far = '2027-06-01'

      expect(isOverdue(past, today)).toBe(true)
      expect(isDueSoon(past, today)).toBe(false)
      expect(isDueSoon(soon, today)).toBe(true)
      expect(isDueSoon(far, today)).toBe(false)
      expect(daysFromToday(soon, today)).toBe(19)
    })

    it('时间线排序：日期倒序，同日按类型顺序', () => {
      const events: HealthTimelineEvent[] = [
        { id: 'w', type: 'weight', date: '2026-06-01', title: '', detail: '' },
        { id: 'c', type: 'checkup', date: '2026-06-01', title: '', detail: '' },
        { id: 'm', type: 'visit', date: '2026-06-01', title: '', detail: '' },
        { id: 'newer', type: 'visit', date: '2026-07-01', title: '', detail: '' },
      ]

      expect([...events].sort(compareTimelineEvents).map((e) => e.id)).toEqual([
        'newer',
        'm',
        'c',
        'w',
      ])
    })
  })
})
