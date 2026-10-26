import { IngredientPreparationHistoryService } from 'src/application/recipe/ingredient-preparation-history.service';

const OLD = new Date('2026-10-01T00:00:00.000Z');
const MID = new Date('2026-10-10T00:00:00.000Z');
const NEW = new Date('2026-10-20T00:00:00.000Z');

function catalogRow(
  preparationMethod: string | null,
  createdAt: Date = OLD,
  ingredientId = 'ing-1',
) {
  return {
    ingredientId,
    preparationMethod,
    recipe: {
      isCustomRecipe: false,
      status: 'PUBLIC',
      createdAt,
      deliveries: [],
    },
  };
}

function customRow(input: {
  preparationMethod: string | null;
  deliveredAt?: Date | null;
  ingredientId?: string;
}) {
  return {
    ingredientId: input.ingredientId ?? 'ing-1',
    preparationMethod: input.preparationMethod,
    recipe: {
      isCustomRecipe: true,
      status: 'PRIVATE_CUSTOM',
      createdAt: OLD,
      deliveries:
        input.deliveredAt === null
          ? []
          : [{ deliveredAt: input.deliveredAt ?? NEW }],
    },
  };
}

function createService(
  recipeRows: unknown[],
  methodRows: unknown[] = [],
  batchRows: unknown[] = [],
) {
  const prisma = {
    recipeItem: {
      findMany: jest.fn().mockResolvedValue(recipeRows),
    },
    customRecipeDeliveryBatch: {
      findMany: jest.fn().mockResolvedValue(batchRows),
    },
    preparationMethod: {
      findMany: jest.fn().mockResolvedValue(methodRows),
    },
  } as any;
  const service = new IngredientPreparationHistoryService(prisma);
  return { service, prisma };
}

describe('IngredientPreparationHistoryService', () => {
  it('includes PUBLIC non-custom recipe items', async () => {
    const { service } = createService([catalogRow('去皮', NEW)]);

    const history = await service.getHistory('ing-1');

    expect(history).toEqual([
      { text: '去皮', usageCount: 1, lastUsedAt: NEW },
    ]);
  });

  it('includes only current effective custom deliveries', async () => {
    const { service, prisma } = createService([
      customRow({ preparationMethod: '去骨', deliveredAt: NEW }),
      customRow({ preparationMethod: '去油', deliveredAt: null }),
    ]);

    const history = await service.getHistory('ing-1');

    expect(history.map((entry) => entry.text)).toEqual(['去骨']);
    expect(prisma.recipeItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ingredientId: { in: ['ing-1'] },
          OR: expect.arrayContaining([
            expect.objectContaining({
              recipe: expect.objectContaining({
                isCustomRecipe: true,
                deliveries: {
                  some: {
                    revokedAt: null,
                    replacedByDeliveryId: null,
                  },
                },
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('excludes design drafts', async () => {
    const { service } = createService([
      {
        ...catalogRow('生重', NEW),
        recipe: {
          isCustomRecipe: false,
          status: 'DRAFT',
          createdAt: NEW,
          deliveries: [],
        },
      },
    ]);

    await expect(service.getHistory('ing-1')).resolves.toEqual([]);
  });

  it('dedupes normalized text, counts usages and uses the newest time', async () => {
    const { service } = createService([
      catalogRow('去皮，切块', OLD),
      catalogRow('去皮、切块', NEW),
      catalogRow('去骨', MID),
    ]);

    const history = await service.getHistory('ing-1');

    expect(history[0]).toEqual({
      text: '去皮、切块',
      usageCount: 2,
      lastUsedAt: NEW,
    });
    expect(history.map((entry) => entry.text)).toEqual(['去皮、切块', '去骨']);
  });

  it('resolves legacy dictionary IDs before returning text', async () => {
    const { service } = createService(
      [catalogRow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NEW)],
      [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: '生重' }],
    );

    const history = await service.getHistory('ing-1');

    expect(history[0]?.text).toBe('生重');
  });

  it('caps history text at the 100-character database limit', async () => {
    const { service } = createService([catalogRow('x'.repeat(120), NEW)]);

    const history = await service.getHistory('ing-1');

    expect(history[0]?.text).toHaveLength(100);
  });

  it('limits to the requested number of distinct entries', async () => {
    const { service } = createService([
      catalogRow('A', new Date('2026-10-03T00:00:00.000Z')),
      catalogRow('B', new Date('2026-10-02T00:00:00.000Z')),
      catalogRow('C', new Date('2026-10-01T00:00:00.000Z')),
      catalogRow('D', new Date('2026-09-30T00:00:00.000Z')),
    ]);

    const history = await service.getHistory('ing-1', 3);

    expect(history.map((entry) => entry.text)).toEqual(['A', 'B', 'C']);
  });

  it('getLatestText returns the newest text', async () => {
    const { service } = createService([
      catalogRow('旧文案', OLD),
      catalogRow('新文案', NEW),
    ]);

    await expect(service.getLatestText('ing-1')).resolves.toBe('新文案');
  });

  it('getLatestTextMap picks the newest text per ingredient', async () => {
    const { service } = createService([
      catalogRow('鸭肉旧', OLD, 'ing-duck'),
      catalogRow('鸭肉新', NEW, 'ing-duck'),
      customRow({
        preparationMethod: '牛肉定制',
        deliveredAt: MID,
        ingredientId: 'ing-beef',
      }),
    ]);

    const map = await service.getLatestTextMap(['ing-duck', 'ing-beef']);

    expect(map.get('ing-duck')).toBe('鸭肉新');
    expect(map.get('ing-beef')).toBe('牛肉定制');
  });
  it('includes batch-delivered custom recipes from the latest batch only', async () => {
    const { service, prisma } = createService(
      [],
      [],
      [
        {
          orderId: 'order-1',
          version: 2,
          deliveredAt: NEW,
          items: [
            {
              contentSnapshot: {
                recipe: {
                  items: [
                    {
                      ingredientId: 'ing-1',
                      preparation: '牛里脊/生/去油',
                    },
                  ],
                },
              },
            },
          ],
        },
        {
          orderId: 'order-1',
          version: 1,
          deliveredAt: OLD,
          items: [
            {
              contentSnapshot: {
                recipe: {
                  items: [
                    {
                      ingredientId: 'ing-1',
                      preparation: '旧批次/生/去筋膜',
                    },
                  ],
                },
              },
            },
          ],
        },
        {
          orderId: 'order-2',
          version: 1,
          deliveredAt: MID,
          items: [
            {
              contentSnapshot: {
                recipe: {
                  items: [
                    {
                      ingredientId: 'ing-1',
                      preparation: '牛里脊/生/去筋膜',
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    );

    const history = await service.getHistory('ing-1');

    expect(history.map((entry) => entry.text)).toEqual([
      '牛里脊/生/去油',
      '牛里脊/生/去筋膜',
    ]);
    expect(history[0]).toEqual({
      text: '牛里脊/生/去油',
      usageCount: 1,
      lastUsedAt: NEW,
    });
  });

  it('resolves legacy IDs inside a batch snapshot', async () => {
    const { service } = createService(
      [],
      [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: '生重' }],
      [
        {
          orderId: 'order-1',
          version: 1,
          deliveredAt: NEW,
          items: [
            {
              contentSnapshot: {
                recipe: {
                  items: [
                    {
                      ingredientId: 'ing-1',
                      preparation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    );

    const history = await service.getHistory('ing-1');

    expect(history[0]?.text).toBe('生重');
  });

  it('getLatestTextMap includes batch entries for the requested ingredient', async () => {
    const { service } = createService(
      [],
      [],
      [
        {
          orderId: 'order-1',
          version: 1,
          deliveredAt: NEW,
          items: [
            {
              contentSnapshot: {
                recipe: {
                  items: [
                    {
                      ingredientId: 'ing-batch',
                      preparation: '鸡胸/生/去皮',
                    },
                    {
                      ingredientId: 'ing-other',
                      preparation: '鸭肉/生/去骨',
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    );

    const map = await service.getLatestTextMap(['ing-batch']);

    expect(map.get('ing-batch')).toBe('鸡胸/生/去皮');
    expect(map.has('ing-other')).toBe(false);
  });

});
