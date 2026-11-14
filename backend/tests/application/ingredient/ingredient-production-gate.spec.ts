import { IngredientService } from '../../../src/application/ingredient/ingredient.service';

/**
 * 生产门禁（2026-11-15）：同组超过 2 个产品开生产才拦。
 * 允许 2 个并存，覆盖「决定换料、两个产品都在用」的过渡期。
 */
describe('IngredientService · production pool limit', () => {
  function build(prisma: any) {
    return new IngredientService({} as any, {} as any, prisma);
  }

  it('组内已有 2 个开生产时，第 3 个被拒绝', async () => {
    const prisma = {
      ingredient: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ name: '海藻粉' }, { name: '海带粉胶囊' }]),
      },
    };
    const service = build(prisma);

    await expect(
      (service as any).assertProductionPoolLimit('group-1', 'new-id'),
    ).rejects.toThrow('最多允许 2 个');
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          equivalenceGroupId: 'group-1',
          id: { not: 'new-id' },
          procurementEnabled: true,
        }),
      }),
    );
  });

  it('组内只有 1 个开生产时放行（过渡期）', async () => {
    const prisma = {
      ingredient: {
        findMany: jest.fn().mockResolvedValue([{ name: '海藻粉' }]),
      },
    };
    const service = build(prisma);

    await expect(
      (service as any).assertProductionPoolLimit('group-1', 'new-id'),
    ).resolves.toBeUndefined();
  });

  it('没有归组的原料不做限制', async () => {
    const prisma = {
      ingredient: {
        findUnique: jest.fn().mockResolvedValue({ equivalenceGroupId: null }),
        findMany: jest.fn(),
      },
    };
    const service = build(prisma);

    await expect(
      (service as any).assertProductionPoolLimitOnEnable({
        ingredientId: 'ing-1',
        previousEnabled: false,
        nextEnabled: true,
      }),
    ).resolves.toBeUndefined();
    expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
  });

  it('只拦「打开」，关掉生产不拦', async () => {
    const prisma = {
      ingredient: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const service = build(prisma);

    await expect(
      (service as any).assertProductionPoolLimitOnEnable({
        ingredientId: 'ing-1',
        previousEnabled: true,
        nextEnabled: false,
      }),
    ).resolves.toBeUndefined();
    expect(prisma.ingredient.findUnique).not.toHaveBeenCalled();
  });
});
