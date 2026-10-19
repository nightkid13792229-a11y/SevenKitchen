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
});
