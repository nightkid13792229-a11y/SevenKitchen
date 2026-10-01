import {
  StaffDogHealthService,
  applyOverrides,
} from '../../../src/application/health/staff-dog-health.service';
import { parseHealthTagOverrides } from '../../../src/application/recipe-designer/recipe-designer.service';

/**
 * 营养师端 · 健康档案（2026-10-01，第八期）。
 *
 * 老板第 22–25 条：
 *   22. 营养师独立页面看完整健康分析
 *   23. 顾客上传的报告原件后台要能看到
 *   24. 健康标签要能人工纠错
 *   25. 顾客改了健康信息要告知正在设计食谱的营养师
 */
describe('StaffDogHealthService', () => {
  const DOG_ID = 'dog-1';

  function createPrisma(overrides: Record<string, any> = {}) {
    const dogDefaults = {
      findUnique: jest.fn().mockResolvedValue({
          id: DOG_ID,
          ownerId: 'customer-1',
          name: '面包',
          breedId: 'breed-1',
          customBreedName: null,
          gender: 'MALE',
          isNeutered: true,
          birthday: new Date('2023-05-10T00:00:00.000Z'),
          currentWeightKg: 12.4,
          bcsScore: 7,
          preferredFoods: '鸡胸肉',
          pickyFoods: '',
          medicalHistory: '慢性肾病',
          healthTagOverrides: {},
          medicalRecords: [
            {
              id: 'm1',
              visitDate: new Date('2026-08-01T00:00:00.000Z'),
              diagnosis: '慢性肾病',
              chiefComplaint: '多饮多尿',
              treatment: '',
              attachments: ['https://cdn.example.com/report-1.jpg'],
              updatedAt: new Date('2026-09-30T00:00:00.000Z'),
            },
          ],
          checkupRecords: [
            {
              id: 'c1',
              checkupDate: new Date('2026-06-01T00:00:00.000Z'),
              checkupType: 'ROUTINE',
              findings: '肌酐偏高',
              recommendations: '',
              attachments: ['https://cdn.example.com/report-2.jpg'],
              updatedAt: new Date('2026-06-01T00:00:00.000Z'),
            },
          ],
          allergyRecords: [],
          vaccineRecords: [],
          weightRecords: [],
          dietPreferences: [
            { kind: 'LIKED', foodName: '鸡胸肉', createdAt: new Date('2026-10-01') },
            { kind: 'DISLIKED', foodName: '胡萝卜', createdAt: new Date('2026-10-01') },
          ],
      }),
      update: jest.fn().mockResolvedValue({}),
    }

    return {
      dogBreed: {
        findUnique: jest.fn().mockResolvedValue({ id: 'breed-1', name: '比熊' }),
      },
      customRecipeOrder: { findMany: jest.fn().mockResolvedValue([]) },
      // resolveLastHealthUpdatedAt 用 findFirst 取最近更新时间
      medicalRecord: { findFirst: jest.fn().mockResolvedValue({ updatedAt: new Date('2026-09-30T00:00:00.000Z') }) },
      checkupRecord: { findFirst: jest.fn().mockResolvedValue({ updatedAt: new Date('2026-06-01T00:00:00.000Z') }) },
      allergyRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      vaccineRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      weightRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      dogDietPreferenceChange: { findFirst: jest.fn().mockResolvedValue(null) },
      // ⚠️ 顺序要紧：先铺 overrides，再覆盖 dog ——
      // 反过来（overrides 放最后）会把上面合并好的 dog 整个顶掉，
      // 连 findUnique 都没了。
      ...overrides,
      dog: { ...dogDefaults, ...overrides.dog },
    } as any;
  }

  function createService(prisma: any, summaryOverrides: Record<string, any> = {}) {
    const timeline = {
      getVisitSummaryForStaff: jest.fn().mockResolvedValue({
        dog: {
          id: DOG_ID,
          name: '面包',
          breedName: '比熊',
          gender: '公',
          isNeutered: true,
          birthday: '2023-05-10',
          ageText: '3 岁 4 个月',
          currentWeightKg: 12.4,
          bcsScore: 7,
          weightUpdatedAt: null,
        },
        allergies: [{ allergen: '鸡肉', notes: '', date: '2025-12-01' }],
        ongoingConditions: [],
        recentVisits: [],
        recentCheckups: [],
        vaccines: { latest: [], upcoming: [] },
        weight: { current: 12.4, records: [], recentChangeKg: null },
        diet: { preferredFoods: '鸡胸肉', pickyFoods: '' },
        counts: { visits: 1, checkups: 1, allergies: 0, vaccines: 0, weights: 0 },
        medicalHistory: '慢性肾病',
        generatedAt: '2026-10-01T00:00:00.000Z',
        ...summaryOverrides,
      }),
    } as any;

    const analysis = {
      analyzeForStaff: jest.fn().mockResolvedValue({
        dogId: DOG_ID,
        items: [],
        approvedKnowledgeCount: 0,
        insufficientSections: [],
        downgradedSections: [],
        audience: 'nutritionist',
        generatedAt: '2026-10-01T00:00:00.000Z',
      }),
    } as any;

    return { service: new StaffDogHealthService(prisma, timeline, analysis), timeline, analysis };
  }

  describe('第 23 条：报告原件后台可见', () => {
    it('把病历与体检的附件都收集出来，并标清来自哪条记录', async () => {
      const { service } = createService(createPrisma())
      const overview = await service.getHealthOverview(DOG_ID)

      expect(overview.attachments).toHaveLength(2)
      expect(overview.attachments[0]).toMatchObject({
        source: 'visit',
        recordLabel: '慢性肾病',
        url: 'https://cdn.example.com/report-1.jpg',
      })
      expect(overview.attachments[1]).toMatchObject({
        source: 'checkup',
        recordDate: '2026-06-01',
      })
      expect(overview.counts.attachments).toBe(2)
    })

    it('没有附件的狗返回空数组，不炸', async () => {
      // dog.findUnique 的返回值才是被测代码真正读的东西，
      // 所以要改的是它解析出来的对象，不是 mock 上的字段。
      const base = createPrisma()
      const dog = await base.dog.findUnique()
      const prisma = createPrisma({
        dog: {
          findUnique: jest.fn().mockResolvedValue({
            ...dog,
            medicalRecords: [],
            checkupRecords: [],
          }),
        },
      })
      const { service } = createService(prisma)
      const overview = await service.getHealthOverview(DOG_ID)

      expect(overview.attachments).toEqual([])
    })
  })

  describe('第 22 条：完整健康分析', () => {
    it('带出 AI 分析（营养师视角，不受顾客侧开关限制）', async () => {
      const { service, analysis } = createService(createPrisma())
      const overview = await service.getHealthOverview(DOG_ID)

      expect(analysis.analyzeForStaff).toHaveBeenCalledWith(DOG_ID)
      expect(overview.analysis).toBeTruthy()
      expect(overview.analysis.audience).toBe('nutritionist')
    })

    it('分析失败不会连带把整个档案打不开（记录本身才是关键）', async () => {
      const prisma = createPrisma()
      const timeline = {
        getVisitSummaryForStaff: jest.fn().mockResolvedValue({
          dog: { ageText: '3 岁' },
          allergies: [],
          ongoingConditions: [],
          recentVisits: [],
          recentCheckups: [],
          vaccines: { latest: [], upcoming: [] },
          weight: { current: 12.4, records: [], recentChangeKg: null },
          diet: { preferredFoods: '', pickyFoods: '' },
          counts: {},
          medicalHistory: '',
        }),
      } as any
      const analysis = {
        analyzeForStaff: jest.fn().mockRejectedValue(new Error('AI 服务不可用')),
      } as any
      const service = new StaffDogHealthService(prisma, timeline, analysis)

      const overview = await service.getHealthOverview(DOG_ID)
      expect(overview.analysis.error).toContain('AI 服务不可用')
      expect(overview.dog.name).toBe('面包')
    })

    it('结构化饮食偏好带出来（供设计器参考）', async () => {
      const { service } = createService(createPrisma())
      const overview = await service.getHealthOverview(DOG_ID)

      expect(overview.dietPreferences.liked).toEqual(['鸡胸肉'])
      expect(overview.dietPreferences.disliked).toEqual(['胡萝卜'])
    })

    it('狗不存在 → 404', async () => {
      const prisma = createPrisma({ dog: { findUnique: jest.fn().mockResolvedValue(null) } })
      const { service } = createService(prisma)

      await expect(service.getHealthOverview(DOG_ID)).rejects.toThrow('爱犬不存在')
    })
  })

  describe('第 24 条：健康标签纠错', () => {
    it('标签 = 派生 − removed + added', () => {
      const result = applyOverrides(
        ['adult', 'ckd', 'renal', 'dental'],
        { added: ['senior'], removed: ['dental'] },
      )

      expect(result).toContain('senior')
      expect(result).not.toContain('dental')
      expect(result).toContain('ckd')
    })

    it('删掉一个本来就没有的标签也不报错', () => {
      expect(applyOverrides(['adult'], { added: [], removed: ['ckd'] })).toEqual(['adult'])
    })

    it('只接受受控词表里的标签（改了也检索不到的必须拦下）', async () => {
      const { service } = createService(createPrisma())

      await expect(
        service.setHealthTagOverrides(DOG_ID, { added: ['我自己编的标签'] }),
      ).rejects.toThrow('不在受控词表里')
    })

    it('同一个标签不能既加又删', async () => {
      const { service } = createService(createPrisma())

      await expect(
        service.setHealthTagOverrides(DOG_ID, { added: ['ckd'], removed: ['ckd'] }),
      ).rejects.toThrow('不能既加又删')
    })

    it('保存成功后返回规范化后的结果（小写、去重）', async () => {
      const prisma = createPrisma()
      const { service } = createService(prisma)

      const result = await service.setHealthTagOverrides(DOG_ID, {
        added: ['CKD', 'ckd', 'senior'],
        removed: [],
      })

      expect(result.overrides.added).toEqual(['ckd', 'senior'])
      expect(prisma.dog.update).toHaveBeenCalledTimes(1)
    })
  })

  describe('第 25 条：健康信息更新告知', () => {
    it('列出最近改过健康记录的狗，并标出有没有进行中的定制单', async () => {
      const prisma = createPrisma({
        medicalRecord: {
          findMany: jest.fn().mockResolvedValue([
            { dogId: DOG_ID, updatedAt: new Date('2026-09-30T00:00:00.000Z') },
          ]),
        },
        checkupRecord: { findMany: jest.fn().mockResolvedValue([]) },
        allergyRecord: { findMany: jest.fn().mockResolvedValue([]) },
        vaccineRecord: { findMany: jest.fn().mockResolvedValue([]) },
        weightRecord: { findMany: jest.fn().mockResolvedValue([]) },
        dogDietPreferenceChange: { findMany: jest.fn().mockResolvedValue([]) },
        dog: {
          ...(createPrisma().dog as any),
          findMany: jest.fn().mockResolvedValue([{ id: DOG_ID, name: '面包' }]),
        },
        customRecipeOrder: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'o1', dogId: DOG_ID, orderId: 'order-1', status: 'IN_PROGRESS' },
          ]),
        },
      })
      const { service } = createService(prisma)

      const result = await service.listHealthUpdates({ days: 7 })

      expect(result.total).toBe(1)
      expect(result.items[0].dogName).toBe('面包')
      // 有进行中的定制单 → 这才是"正在为它设计食谱"、需要通知的
      expect(result.items[0].activeOrderCount).toBe(1)
      expect(result.items[0].activeOrders[0].status).toBe('IN_PROGRESS')
    })

    it('只看进行中的定制单（已交付/已取消的不该再通知）', async () => {
      const prisma = createPrisma({
        medicalRecord: {
          findMany: jest.fn().mockResolvedValue([
            { dogId: DOG_ID, updatedAt: new Date('2026-09-30T00:00:00.000Z') },
          ]),
        },
        checkupRecord: { findMany: jest.fn().mockResolvedValue([]) },
        allergyRecord: { findMany: jest.fn().mockResolvedValue([]) },
        vaccineRecord: { findMany: jest.fn().mockResolvedValue([]) },
        weightRecord: { findMany: jest.fn().mockResolvedValue([]) },
        dogDietPreferenceChange: { findMany: jest.fn().mockResolvedValue([]) },
        dog: {
          ...(createPrisma().dog as any),
          findMany: jest.fn().mockResolvedValue([{ id: DOG_ID, name: '面包' }]),
        },
      })
      const { service } = createService(prisma)

      await service.listHealthUpdates({ days: 7 })

      const where = prisma.customRecipeOrder.findMany.mock.calls[0][0].where
      expect(where.status.in).toEqual(['PAID', 'IN_PROGRESS'])
    })

    it('最近没有任何改动时返回空列表', async () => {
      const prisma = createPrisma({
        medicalRecord: { findMany: jest.fn().mockResolvedValue([]) },
        checkupRecord: { findMany: jest.fn().mockResolvedValue([]) },
        allergyRecord: { findMany: jest.fn().mockResolvedValue([]) },
        vaccineRecord: { findMany: jest.fn().mockResolvedValue([]) },
        weightRecord: { findMany: jest.fn().mockResolvedValue([]) },
        dogDietPreferenceChange: { findMany: jest.fn().mockResolvedValue([]) },
      })
      const { service } = createService(prisma)

      const result = await service.listHealthUpdates()
      expect(result.total).toBe(0)
      expect(result.items).toEqual([])
    })

    it('回看天数被夹在 1–90 天之间', async () => {
      const prisma = createPrisma({
        medicalRecord: { findMany: jest.fn().mockResolvedValue([]) },
        checkupRecord: { findMany: jest.fn().mockResolvedValue([]) },
        allergyRecord: { findMany: jest.fn().mockResolvedValue([]) },
        vaccineRecord: { findMany: jest.fn().mockResolvedValue([]) },
        weightRecord: { findMany: jest.fn().mockResolvedValue([]) },
        dogDietPreferenceChange: { findMany: jest.fn().mockResolvedValue([]) },
      })
      const { service } = createService(prisma)

      expect((await service.listHealthUpdates({ days: 999 })).days).toBe(90)
      expect((await service.listHealthUpdates({ days: 0 })).days).toBe(7)
    })
  })

  describe('修正数据的容错解析', () => {
    it('读取是宽松的：字段缺失、类型不对、脏值都不炸', () => {
      expect(parseHealthTagOverrides(null)).toEqual({ added: [], removed: [] })
      expect(parseHealthTagOverrides('不是对象')).toEqual({ added: [], removed: [] })
      expect(parseHealthTagOverrides({ added: '不是数组' })).toEqual({ added: [], removed: [] })
      expect(parseHealthTagOverrides({ added: ['CKD', '', 'Senior'] })).toEqual({
        added: ['ckd', 'senior'],
        removed: [],
      })
      // 脏值会被转成字符串留着 —— 这里只负责"读得出来"，
      // 严格校验在写入侧（setHealthTagOverrides 会按受控词表拦下）。
      expect(parseHealthTagOverrides({ added: [123] }).added).toEqual(['123'])
    })
  })
})
