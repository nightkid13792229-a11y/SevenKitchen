import {
  DietPreferenceService,
  normalizeFoodName,
  normalizeKind,
  normalizeNameList,
  parseFoodList,
} from '../../../src/application/health/diet-preference.service';

/**
 * 饮食偏好结构化 + 变更历史（2026-10-01，第五期）。
 *
 * 老板第 9 条："饮食偏好的变化，最好是能看到历史的变化。"
 *
 * 这组测试重点锁三件事：
 *   ① 旧的两个文本框**一个字符都不动**（保守做法，不能把顾客原来的话改坏）
 *   ② 从旧文本整理出来的只是**候选**，不确认就不入库
 *   ③ 每加一条、去一条都留下可追溯的变更
 */
describe('DietPreferenceService', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';

  function createPrisma(overrides: Record<string, any> = {}) {
    return {
      dog: {
        findUnique: jest.fn().mockResolvedValue({
          id: DOG_ID,
          ownerId: CUSTOMER_ID,
          preferredFoods: '鸡胸肉、南瓜、三文鱼',
          pickyFoods: '胡萝卜、羊肉',
        }),
      },
      dogDietPreference: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      dogDietPreferenceChange: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
      ...overrides,
    } as any;
  }

  describe('旧文本解析（只用于生成候选）', () => {
    it('按顿号、逗号、斜杠、换行拆分', () => {
      expect(parseFoodList('鸡胸肉、南瓜')).toEqual(['鸡胸肉', '南瓜']);
      expect(parseFoodList('鸡胸肉, 南瓜，三文鱼')).toEqual(['鸡胸肉', '南瓜', '三文鱼']);
      expect(parseFoodList('鸡胸肉/南瓜')).toEqual(['鸡胸肉', '南瓜']);
      expect(parseFoodList('鸡胸肉\n南瓜')).toEqual(['鸡胸肉', '南瓜']);
    })

    it('去重、去空白', () => {
      expect(parseFoodList('  鸡胸肉 、 鸡胸肉  ')).toEqual(['鸡胸肉']);
    })

    it('空输入返回空数组，不炸', () => {
      expect(parseFoodList('')).toEqual([]);
      expect(parseFoodList(null)).toEqual([]);
      expect(parseFoodList(undefined)).toEqual([]);
    })

    it('超长文本会被截断（防止旧文本里塞了几百个词）', () => {
      const result = parseFoodList('鸡'.repeat(1000));
      expect(result.length).toBeLessThanOrEqual(1);
      expect(result[0].length).toBeLessThanOrEqual(60);
    })
  })

  describe('列表：结构化 + 旧文本 + 候选', () => {
    it('结构化表为空时，给出旧文本拆出来的候选（不写库）', async () => {
      const prisma = createPrisma()
      const service = new DietPreferenceService(prisma)

      const result = await service.list(CUSTOMER_ID, DOG_ID)

      expect(result.liked).toEqual([])
      expect(result.disliked).toEqual([])
      expect(result.suggestions.liked).toEqual(['鸡胸肉', '南瓜', '三文鱼'])
      expect(result.suggestions.disliked).toEqual(['胡萝卜', '羊肉'])
      // 关键：只是候选，没有写库
      expect(prisma.dogDietPreference.create).not.toHaveBeenCalled()
    })

    it('旧文本框原样返回（配方设计仍在用它们）', async () => {
      const service = new DietPreferenceService(createPrisma())
      const result = await service.list(CUSTOMER_ID, DOG_ID)

      expect(result.legacy.preferredFoods).toBe('鸡胸肉、南瓜、三文鱼')
      expect(result.legacy.pickyFoods).toBe('胡萝卜、羊肉')
    })

    it('结构化表已有内容时不再给候选（避免反复提示）', async () => {
      const prisma = createPrisma({
        dogDietPreference: {
          findMany: jest.fn().mockResolvedValue([
            { kind: 'LIKED', foodName: '鸡胸肉', source: 'MANUAL', createdAt: new Date('2026-10-01') },
          ]),
          findUnique: jest.fn(),
          create: jest.fn(),
          delete: jest.fn(),
        },
      })
      const service = new DietPreferenceService(prisma)

      const result = await service.list(CUSTOMER_ID, DOG_ID)
      expect(result.liked).toHaveLength(1)
      expect(result.suggestions.liked).toEqual([])
      expect(result.suggestions.disliked).toEqual([])
    })

    it('如实说明历史从什么时候开始有', async () => {
      const service = new DietPreferenceService(createPrisma())
      const result = await service.list(CUSTOMER_ID, DOG_ID)

      expect(result.historyNote).toContain('从这个功能上线开始')
    })

    it('不是自己的狗 → 拒绝', async () => {
      const prisma = createPrisma({
        dog: { findUnique: jest.fn().mockResolvedValue({ id: DOG_ID, ownerId: 'other' }) },
      })
      const service = new DietPreferenceService(prisma)

      await expect(service.list(CUSTOMER_ID, DOG_ID)).rejects.toThrow('Access denied')
    })
  })

  describe('增删与变更历史', () => {
    it('加一条会同时写偏好与变更记录', async () => {
      const prisma = createPrisma()
      const service = new DietPreferenceService(prisma)

      const result = await service.add(CUSTOMER_ID, DOG_ID, 'LIKED', '鸡胸肉')

      expect(result.added).toBe(true)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      const changeArg = prisma.dogDietPreferenceChange.create.mock.calls[0][0].data
      expect(changeArg).toMatchObject({
        dogId: DOG_ID,
        kind: 'LIKED',
        foodName: '鸡胸肉',
        action: 'ADDED',
      })
    })

    it('去一条也会留变更记录（这样历史才看得出"什么时候不吃了"）', async () => {
      const prisma = createPrisma({
        dogDietPreference: {
          findMany: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({ id: 'pref-1' }),
          create: jest.fn(),
          delete: jest.fn(),
        },
      })
      const service = new DietPreferenceService(prisma)

      const result = await service.remove(CUSTOMER_ID, DOG_ID, 'LIKED', '鸡胸肉')

      expect(result.removed).toBe(true)
      const changeArg = prisma.dogDietPreferenceChange.create.mock.calls[0][0].data
      expect(changeArg.action).toBe('REMOVED')
    })

    it('重复添加不会产生无意义的重复历史', async () => {
      const prisma = createPrisma({
        dogDietPreference: {
          findMany: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({ id: 'pref-1' }),
          create: jest.fn(),
          delete: jest.fn(),
        },
      })
      const service = new DietPreferenceService(prisma)

      const result = await service.add(CUSTOMER_ID, DOG_ID, 'LIKED', '鸡胸肉')

      expect(result.added).toBe(false)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('去掉一条不存在的，不报错也不留历史', async () => {
      const prisma = createPrisma()
      const service = new DietPreferenceService(prisma)

      const result = await service.remove(CUSTOMER_ID, DOG_ID, 'LIKED', '不存在的')

      expect(result.removed).toBe(false)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('整理旧文本（顾客确认后才入库）', () => {
    it('逐条写入并标出来源是整理过来的', async () => {
      const prisma = createPrisma()
      const service = new DietPreferenceService(prisma)

      const result = await service.importFromLegacy(CUSTOMER_ID, DOG_ID, {
        liked: ['鸡胸肉', '南瓜'],
        disliked: ['胡萝卜'],
      })

      expect(result.added).toBe(3)
      expect(prisma.dogDietPreference.create).toHaveBeenCalledTimes(3)
      const firstArg = prisma.dogDietPreference.create.mock.calls[0][0].data
      expect(firstArg.source).toBe('IMPORTED')
    })

    it('两边都是空时报错（不做无意义的事）', async () => {
      const service = new DietPreferenceService(createPrisma())

      await expect(
        service.importFromLegacy(CUSTOMER_ID, DOG_ID, {}),
      ).rejects.toThrow('没有要整理的条目')
    })

    it('同一批里的重复项会被合并', async () => {
      const prisma = createPrisma()
      const service = new DietPreferenceService(prisma)

      await service.importFromLegacy(CUSTOMER_ID, DOG_ID, {
        liked: ['鸡胸肉', '鸡胸肉', ' 鸡胸肉 '],
      })

      expect(prisma.dogDietPreference.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('输入校验', () => {
    it('kind 只认两种', () => {
      expect(normalizeKind('LIKED')).toBe('LIKED')
      expect(normalizeKind('disliked')).toBe('DISLIKED')
      expect(() => normalizeKind('随便')).toThrow('kind')
      expect(() => normalizeKind('')).toThrow('kind')
    })

    it('食物名去空白、限长、空值报错', () => {
      expect(normalizeFoodName('  鸡胸肉  ')).toBe('鸡胸肉')
      expect(normalizeFoodName('鸡'.repeat(200)).length).toBe(60)
      expect(() => normalizeFoodName('   ')).toThrow('请填写食物名称')
    })

    it('名单去重、去空、限长', () => {
      expect(normalizeNameList(['鸡胸肉', '鸡胸肉', '', '  '])).toEqual(['鸡胸肉'])
      expect(normalizeNameList('不是数组')).toEqual([])
      expect(normalizeNameList(null)).toEqual([])
    })
  })

  describe('时间线用', () => {
    it('按时间倒序取变更', async () => {
      const prisma = createPrisma({
        dogDietPreferenceChange: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'c1',
              kind: 'LIKED',
              foodName: '鸡胸肉',
              action: 'ADDED',
              changedAt: new Date('2026-10-01T00:00:00'),
            },
          ]),
          create: jest.fn(),
        },
      })
      const service = new DietPreferenceService(prisma)

      const changes = await service.listChangesForTimeline(DOG_ID)

      expect(changes).toHaveLength(1)
      expect(changes[0].foodName).toBe('鸡胸肉')
      expect(prisma.dogDietPreferenceChange.findMany.mock.calls[0][0].orderBy)
        .toEqual({ changedAt: 'desc' })
    })
  })
})
