import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DIYSheetStorageService } from '../../src/application/diy-sheet/diy-sheet-storage.service';

describe('DIYSheetStorageService package plans', () => {
  const packagePlan = [
    { packageSpecG: 80, packageCount: 10 },
    { packageSpecG: 160, packageCount: 4 },
  ];
  const baseDto = {
    recipeId: 'recipe-1',
    recipeName: '牛肉南瓜鲜食',
    dogId: 'dog-1',
    cycleDays: 7,
    perMealG: 80,
    dailyIntakeG: 160,
    packagePlan,
    purchaseList: [],
    productionSteps: '分装后冷冻保存',
  } as any;

  function createPrismaMock(existingSheet: any = null) {
    const now = new Date('2026-06-13T00:00:00.000Z');
    return {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          dogs: [{ id: 'dog-1', name: '七七' }],
        }),
      },
      dIYSheet: {
        findFirst: jest.fn().mockResolvedValue(existingSheet),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'sheet-1',
          ...data,
          createdAt: now,
          updatedAt: now,
        })),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'sheet-1',
          userId: 'user-1',
          recipeId: baseDto.recipeId,
          dogId: baseDto.dogId,
          ...data,
          createdAt: now,
          updatedAt: now,
        })),
      },
    } as any;
  }

  it('persists packagePlan when creating a DIY sheet and returns it to the client', async () => {
    const prisma = createPrismaMock();
    const service = new DIYSheetStorageService(prisma);

    const result = await service.create('user-1', baseDto);

    expect(prisma.dIYSheet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        packagePlan,
      }),
    });
    expect(result.packagePlan).toEqual(packagePlan);
  });

  it('冻结后内容没变：复用旧单，不覆盖快照', async () => {
    const prisma = createPrismaMock({
      id: 'sheet-frozen',
      recipeName: baseDto.recipeName,
      dogName: '七七',
      cycleDays: baseDto.cycleDays,
      perMealG: baseDto.perMealG,
      dailyIntakeG: baseDto.dailyIntakeG,
      packagePlan: baseDto.packagePlan,
      purchaseList: baseDto.purchaseList,
      productionSteps: baseDto.productionSteps,
      snapshot: { version: 1 },
      snapshotAt: new Date('2026-10-19T00:00:00Z'),
      recipeVersion: 3,
      createdAt: new Date('2026-10-18T00:00:00Z'),
      updatedAt: new Date('2026-10-18T00:00:00Z'),
    });
    const service = new DIYSheetStorageService(prisma);

    const result = await service.create('user-1', baseDto);

    expect(result.id).toBe('sheet-frozen');
    expect(prisma.dIYSheet.update).not.toHaveBeenCalled();
    expect(prisma.dIYSheet.create).not.toHaveBeenCalled();
  });

  it('冻结后内容变化：新建一张，不覆盖旧单', async () => {
    const prisma = createPrismaMock({
      id: 'sheet-frozen',
      recipeName: baseDto.recipeName,
      dogName: '七七',
      cycleDays: 3,
      perMealG: baseDto.perMealG,
      dailyIntakeG: baseDto.dailyIntakeG,
      packagePlan: baseDto.packagePlan,
      purchaseList: baseDto.purchaseList,
      productionSteps: baseDto.productionSteps,
      snapshot: { version: 1 },
      snapshotAt: new Date('2026-10-19T00:00:00Z'),
      recipeVersion: 3,
      createdAt: new Date('2026-10-18T00:00:00Z'),
      updatedAt: new Date('2026-10-18T00:00:00Z'),
    });
    const service = new DIYSheetStorageService(prisma);

    await service.create('user-1', baseDto);

    expect(prisma.dIYSheet.create).toHaveBeenCalled();
    expect(prisma.dIYSheet.update).not.toHaveBeenCalled();
  });

  it('updates packagePlan on the idempotent user recipe dog record', async () => {
    const prisma = createPrismaMock({ id: 'sheet-1' });
    const service = new DIYSheetStorageService(prisma);

    const result = await service.create('user-1', baseDto);

    expect(prisma.dIYSheet.update).toHaveBeenCalledWith({
      where: { id: 'sheet-1' },
      data: expect.objectContaining({
        packagePlan,
      }),
    });
    expect(result.packagePlan).toEqual(packagePlan);
  });

  it('★ 不传 cycleDays 也能建单：落库 null（制作单不再有天数）', async () => {
    const prisma = createPrismaMock();
    const service = new DIYSheetStorageService(prisma);
    const { cycleDays: _omit, ...dto } = baseDto;

    const result = await service.create('user-1', dto as any);

    expect(prisma.dIYSheet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ cycleDays: null }),
    });
    expect(result.cycleDays).toBeNull();
  });

  it('★ 冻结后两次都不传天数：仍视为同一张单（null/undefined 不能造成误判）', async () => {
    const prisma = createPrismaMock({
      id: 'sheet-frozen',
      recipeName: baseDto.recipeName,
      dogName: '七七',
      cycleDays: null,
      perMealG: baseDto.perMealG,
      dailyIntakeG: baseDto.dailyIntakeG,
      packagePlan: baseDto.packagePlan,
      purchaseList: baseDto.purchaseList,
      productionSteps: baseDto.productionSteps,
      snapshot: { version: 1 },
      snapshotAt: new Date('2026-10-19T00:00:00Z'),
      createdAt: new Date('2026-10-18T00:00:00Z'),
      updatedAt: new Date('2026-10-18T00:00:00Z'),
    });
    const service = new DIYSheetStorageService(prisma);
    const { cycleDays: _omit, ...dto } = baseDto;

    const result = await service.create('user-1', dto as any);

    expect(result.id).toBe('sheet-frozen');
    expect(prisma.dIYSheet.create).not.toHaveBeenCalled();
  });

  describe('updatePlan（补剂下单页快速改分装）', () => {
    function sheetRow(overrides: any = {}) {
      return {
        id: 'sheet-1',
        userId: 'user-1',
        recipeId: 'recipe-1',
        recipeName: '牛肉南瓜鲜食',
        dogId: 'dog-1',
        dogName: '七七',
        cycleDays: null,
        perMealG: 80,
        dailyIntakeG: 160,
        packagePlan: [{ packageSpecG: 100, packageCount: 10 }],
        // 客户端存的采购清单形状：netAmount + netAmountStr
        purchaseList: [
          { name: '牛肉', type: 'FOOD', netAmount: 600, netAmountStr: '600g' },
          { name: '钙粉', type: 'SUPPLEMENT', netAmount: 12.5, netAmountStr: '12.5g' },
        ],
        productionSteps: '冷冻',
        recipeVersion: 3,
        supplementSelections: [{ recipeItemId: 'r1', ingredientId: 'i1' }],
        snapshot: null,
        snapshotAt: null,
        createdAt: new Date('2026-10-18T00:00:00Z'),
        updatedAt: new Date('2026-10-18T00:00:00Z'),
        ...overrides,
      };
    }

    function prismaMock(sheet: any) {
      return {
        dIYSheet: {
          findFirst: jest.fn().mockResolvedValue(sheet),
          update: jest.fn().mockImplementation(async ({ data }: any) => ({
            ...sheet,
            ...data,
          })),
          create: jest.fn().mockImplementation(async ({ data }: any) => ({
            ...sheet,
            ...data,
            id: 'sheet-new',
            snapshot: null,
            snapshotAt: null,
          })),
        },
      } as any;
    }

    it('未冻结：就地更新包规，并按总重比例缩放采购清单', async () => {
      const sheet = sheetRow();
      const prisma = prismaMock(sheet);
      const service = new DIYSheetStorageService(prisma);

      // 100g×10 = 1000g → 200g×10 = 2000g，比例 2
      const result = await service.updatePlan('user-1', 'sheet-1', [
        { packageSpecG: 200, packageCount: 10 },
      ]);

      expect(result.id).toBe('sheet-1');
      const data = prisma.dIYSheet.update.mock.calls[0][0].data;
      expect(data.packagePlan).toEqual([{ packageSpecG: 200, packageCount: 10 }]);
      expect(data.purchaseList[0].netAmount).toBe(1200);
      expect(data.purchaseList[1].netAmount).toBe(25);
      // 补剂不按食材取整
      expect(data.purchaseList[1].netAmountStr).toBe('25.0g');
    });

    it('已冻结：新建一张制作单，不覆盖旧快照', async () => {
      const sheet = sheetRow({ snapshot: { version: 1 }, snapshotAt: new Date() });
      const prisma = prismaMock(sheet);
      const service = new DIYSheetStorageService(prisma);

      const result = await service.updatePlan('user-1', 'sheet-1', [
        { packageSpecG: 50, packageCount: 10 },
      ]);

      expect(prisma.dIYSheet.update).not.toHaveBeenCalled();
      expect(prisma.dIYSheet.create).toHaveBeenCalled();
      expect(result.id).toBe('sheet-new');
      const data = prisma.dIYSheet.create.mock.calls[0][0].data;
      // 新单不写天数
      expect(data.cycleDays).toBeNull();
      expect(data.packagePlan).toEqual([{ packageSpecG: 50, packageCount: 10 }]);
    });

    it('包规非法直接拒绝', async () => {
      const prisma = prismaMock(sheetRow());
      const service = new DIYSheetStorageService(prisma);

      await expect(service.updatePlan('user-1', 'sheet-1', [])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.updatePlan('user-1', 'sheet-1', [{ packageSpecG: 0, packageCount: 10 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updatePlan('user-1', 'sheet-1', [{ packageSpecG: 100, packageCount: 0 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('不是自己的制作单：按不存在处理', async () => {
      const prisma = prismaMock(null);
      const service = new DIYSheetStorageService(prisma);

      await expect(
        service.updatePlan('user-1', 'sheet-x', [{ packageSpecG: 100, packageCount: 10 }]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
