import {
  HealthShareService,
  buildSnapshot,
  normalizeContentMode,
  normalizeSections,
  type HealthShareSnapshot,
} from '../../../src/application/health/health-share.service';

/**
 * 健康信息分享（2026-10-01，第三期）。
 *
 * 这是**医疗数据**，所以这组测试重点锁三件事：
 *   ① 顾客没勾的分区不能出现在快照里；
 *   ② 报告原件的真实地址不能下发给医生侧（否则"停止分享"撤不回来）；
 *   ③ 停止分享之后，摘要与附件都必须立刻取不到。
 */
describe('HealthShareService', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';
  const TOKEN = 'a'.repeat(32);

  function buildSummary() {
    return {
      dog: {
        id: DOG_ID,
        name: '面包',
        breedName: '比熊',
        gender: '公',
        ageText: '3 岁 4 个月',
      },
      allergies: [{ allergen: '鸡肉', notes: '', date: '2025-12-01' }],
      ongoingConditions: [{ id: 'm1', diagnosis: '慢性胃炎', status: '慢性' }],
      recentVisits: [{ id: 'm1', date: '2026-08-01', diagnosis: '慢性胃炎' }],
      recentCheckups: [{ id: 'c1', date: '2026-06-01', checkupType: '常规体检' }],
      vaccines: { latest: [{ id: 'v1', name: '狂犬' }], upcoming: [] },
      weight: { current: 12.4, records: [], recentChangeKg: 0.4 },
      diet: { preferredFoods: '鸡胸肉', pickyFoods: '胡萝卜' },
      medicalHistory: '2024 年有过一次肠胃炎',
      generatedAt: '2026-10-01T00:00:00.000Z',
    };
  }

  function createPrisma(overrides: Record<string, any> = {}) {
    const shareRow = {
      id: 'share-1',
      dogId: DOG_ID,
      token: TOKEN,
      snapshot: {},
      contentMode: 'BOTH',
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      createdBy: CUSTOMER_ID,
      revokedAt: null as Date | null,
      ...overrides.shareRow,
    };

    return {
      dog: {
        findUnique: jest.fn().mockResolvedValue({
          id: DOG_ID,
          ownerId: CUSTOMER_ID,
        }),
      },
      medicalRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'm1',
            visitDate: new Date('2026-08-01T00:00:00.000Z'),
            diagnosis: '慢性胃炎',
            attachments: ['https://cdn.example.com/m1-a.jpg'],
          },
        ]),
      },
      checkupRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            checkupDate: new Date('2026-06-01T00:00:00.000Z'),
            checkupType: 'ROUTINE',
            attachments: ['https://cdn.example.com/c1-a.jpg'],
          },
        ]),
      },
      dogHealthShareToken: {
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ ...shareRow, ...data }),
        ),
        findMany: jest.fn().mockResolvedValue([shareRow]),
        findUnique: jest.fn().mockResolvedValue(shareRow),
        findFirst: jest.fn().mockResolvedValue(shareRow),
        update: jest.fn().mockResolvedValue({ ...shareRow, revokedAt: new Date() }),
      },
    } as any;
  }

  function createService(prisma: any) {
    const timeline = {
      getVisitSummary: jest.fn().mockResolvedValue(buildSummary()),
    } as any;
    return new HealthShareService(prisma, timeline);
  }

  describe('形态与分区白名单', () => {
    it('形态只认三种，缺省给"合并"（医疗信息默认全给）', () => {
      expect(normalizeContentMode('SUMMARY')).toBe('SUMMARY');
      expect(normalizeContentMode('files')).toBe('FILES');
      expect(normalizeContentMode('BOTH')).toBe('BOTH');
      expect(normalizeContentMode('')).toBe('BOTH');
      expect(normalizeContentMode('随便传的')).toBe('BOTH');
    })

    it('分区只认白名单，不认识的直接丢掉', () => {
      expect(normalizeSections(['allergies', 'weight'])).toEqual([
        'allergies',
        'weight',
      ])
      expect(normalizeSections(['allergies', '偷偷加的'])).toEqual(['allergies'])
    })

    it('不传分区 = 全部；传了但全是无效值也当没传（不生成空摘要）', () => {
      const all = normalizeSections(undefined)
      expect(all.length).toBe(8)
      expect(normalizeSections(['无效'])).toEqual(all)
      expect(normalizeSections([])).toEqual(all)
    })
  })

  describe('快照组装', () => {
    it('顾客没勾的分区不出现在快照里', () => {
      const snapshot = buildSnapshot({
        summary: buildSummary(),
        contentMode: 'SUMMARY',
        sections: ['allergies'],
      })

      expect(Object.keys(snapshot.summary)).toEqual(['allergies'])
      // 关键：不是"写进去但前端不显示"，而是根本没写
      expect(JSON.stringify(snapshot.summary)).not.toContain('慢性胃炎')
      expect(JSON.stringify(snapshot.summary)).not.toContain('鸡胸肉')
    })

    it('只要摘要时一条报告原件都不带', () => {
      const snapshot = buildSnapshot({
        summary: buildSummary(),
        contentMode: 'SUMMARY',
        sections: ['allergies'],
        attachments: [
          { label: 'x', name: 'y', sourceUrl: 'https://cdn.example.com/a.jpg' },
        ],
      })

      expect(snapshot.attachments).toEqual([])
    })

    it('合并形态带上报告原件，并标清来自哪条记录', () => {
      const snapshot = buildSnapshot({
        summary: buildSummary(),
        contentMode: 'BOTH',
        sections: ['allergies'],
        attachments: [
          {
            label: '就诊 2026-08-01 · 慢性胃炎',
            name: '报告 1',
            sourceUrl: 'https://cdn.example.com/m1-a.jpg',
          },
        ],
      })

      expect(snapshot.attachments).toHaveLength(1)
      expect(snapshot.attachments[0].label).toContain('2026-08-01')
    })

    it('带上狗的名字与一句话说明（医生侧第一眼看到的）', () => {
      const snapshot = buildSnapshot({
        summary: buildSummary(),
        contentMode: 'SUMMARY',
        sections: ['allergies'],
      })

      expect(snapshot.dogName).toBe('面包')
      expect(snapshot.dogLine).toContain('比熊')
      expect(snapshot.note).toContain('不构成诊断')
    })
  })

  describe('生成分享', () => {
    it('生成 32 位令牌并落库，快照只含勾选分区', async () => {
      const prisma = createPrisma()
      const service = createService(prisma)

      const result = await service.createShare(CUSTOMER_ID, DOG_ID, {
        contentMode: 'SUMMARY',
        sections: ['allergies', 'weight'],
      })

      expect(result.token).toMatch(/^[0-9a-f]{32}$/)
      expect(result.includedSections).toEqual(['allergies', 'weight'])

      const saved = prisma.dogHealthShareToken.create.mock.calls[0][0].data
      expect(Object.keys(saved.snapshot.summary).sort()).toEqual([
        'allergies',
        'weight',
      ])
      expect(saved.snapshot.attachments).toEqual([])
    })

    it('合并形态会把报告原件查出来写进快照', async () => {
      const prisma = createPrisma()
      const service = createService(prisma)

      await service.createShare(CUSTOMER_ID, DOG_ID, { contentMode: 'BOTH' })

      const saved = prisma.dogHealthShareToken.create.mock.calls[0][0].data
      expect(saved.snapshot.attachments).toHaveLength(2)
      expect(saved.snapshot.attachments[0].sourceUrl).toContain('cdn.example.com')
    })

    it('不是自己的狗 → 拒绝', async () => {
      const prisma = createPrisma()
      prisma.dog.findUnique = jest
        .fn()
        .mockResolvedValue({ id: DOG_ID, ownerId: 'someone-else' })
      const service = createService(prisma)

      await expect(
        service.createShare(CUSTOMER_ID, DOG_ID, {}),
      ).rejects.toThrow('Access denied')
    })
  })

  describe('医生侧读取（免登录）', () => {
    it('返回快照，但**不泄露报告原件的真实地址**', async () => {
      const snapshot: HealthShareSnapshot = {
        dogName: '面包',
        dogLine: '比熊 · 公',
        contentMode: 'BOTH',
        summary: { allergies: [] },
        attachments: [
          {
            label: '就诊 2026-08-01',
            name: '报告 1',
            sourceUrl: 'https://cdn.example.com/secret.jpg',
          },
        ],
        generatedAt: '2026-10-01T00:00:00.000Z',
        note: '不构成诊断',
      }

      const prisma = createPrisma({ shareRow: { snapshot } })
      const service = createService(prisma)

      const data = await service.getPublicShare(TOKEN)

      expect(data.attachments).toHaveLength(1)
      expect(data.attachments[0].url).toBe(
        `/api/v1/shared-health/${TOKEN}/attachment/0`,
      )
      // 整份响应里都不能出现 COS 直链
      expect(JSON.stringify(data)).not.toContain('cdn.example.com')
    })

    it('令牌不存在 → 404', async () => {
      const prisma = createPrisma()
      prisma.dogHealthShareToken.findUnique = jest.fn().mockResolvedValue(null)
      const service = createService(prisma)

      await expect(service.getPublicShare('nope')).rejects.toThrow(
        'Share link not found',
      )
    })
  })

  describe('停止分享', () => {
    it('撤销后摘要立刻 410（不是 404 —— 要告诉医生是主人停掉的）', async () => {
      const prisma = createPrisma({ shareRow: { revokedAt: new Date() } })
      const service = createService(prisma)

      await expect(service.getPublicShare(TOKEN)).rejects.toThrow(
        'This share has been stopped',
      )
    })

    it('撤销后附件也一起取不到', async () => {
      const snapshot: HealthShareSnapshot = {
        dogName: '面包',
        dogLine: '',
        contentMode: 'BOTH',
        summary: {},
        attachments: [
          { label: 'x', name: 'y', sourceUrl: 'https://cdn.example.com/a.jpg' },
        ],
        generatedAt: '',
        note: '',
      }
      const prisma = createPrisma({ shareRow: { snapshot, revokedAt: new Date() } })
      const service = createService(prisma)

      await expect(
        service.resolveAttachmentSource(TOKEN, 0),
      ).rejects.toThrow('This share has been stopped')
    })

    it('写 revokedAt 而不是删行（留痕，且重复点不会报错）', async () => {
      const prisma = createPrisma()
      const service = createService(prisma)

      await service.revokeShare(CUSTOMER_ID, DOG_ID, TOKEN)

      expect(prisma.dogHealthShareToken.update).toHaveBeenCalledTimes(1)
      const arg = prisma.dogHealthShareToken.update.mock.calls[0][0]
      expect(arg.where).toEqual({ id: 'share-1' })
      expect(arg.data.revokedAt).toBeInstanceOf(Date)
    })

    it('已经撤销过的再点一次，不重复写', async () => {
      const prisma = createPrisma({ shareRow: { revokedAt: new Date() } })
      const service = createService(prisma)

      await service.revokeShare(CUSTOMER_ID, DOG_ID, TOKEN)

      expect(prisma.dogHealthShareToken.update).not.toHaveBeenCalled()
    })

    it('附件序号越界 → 404（不泄露"这里本来有几张"）', async () => {
      const snapshot: HealthShareSnapshot = {
        dogName: '',
        dogLine: '',
        contentMode: 'BOTH',
        summary: {},
        attachments: [
          { label: 'x', name: 'y', sourceUrl: 'https://cdn.example.com/a.jpg' },
        ],
        generatedAt: '',
        note: '',
      }
      const prisma = createPrisma({ shareRow: { snapshot } })
      const service = createService(prisma)

      await expect(service.resolveAttachmentSource(TOKEN, 5)).rejects.toThrow(
        'Attachment not found',
      )
    })
  })

  describe('已分享列表', () => {
    it('只列没被停止的，并带上形态与附件数', async () => {
      const snapshot = { attachments: [{}, {}] }
      const prisma = createPrisma({ shareRow: { snapshot } })
      const service = createService(prisma)

      const list = await service.listShares(CUSTOMER_ID, DOG_ID)

      expect(list).toHaveLength(1)
      expect(list[0].token).toBe(TOKEN)
      expect(list[0].contentMode).toBe('BOTH')
      expect(list[0].attachmentCount).toBe(2)
      // 查询条件必须排除已撤销的
      expect(prisma.dogHealthShareToken.findMany.mock.calls[0][0].where).toEqual({
        dogId: DOG_ID,
        revokedAt: null,
      })
    })
  })
})
