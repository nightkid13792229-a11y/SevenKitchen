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
