import { RecipeService } from '../../src/application/recipe/recipe.service';

describe('「低脂」声称的法规数值门槛校验', () => {
  const LOW_FAT_TAG_ID = 'low-fat-tag-id';

  function createService() {
    const prisma = {
      recipeHealthTag: {
        findFirst: jest.fn().mockResolvedValue({ id: LOW_FAT_TAG_ID }),
      },
    } as any;
    return new RecipeService(prisma);
  }

  function assert(service: RecipeService, tags: string[], nutrition: unknown) {
    return (service as any).assertLowFatClaimThreshold(tags, nutrition);
  }

  it('未勾选「低脂」时直接放行（不做营养数据要求）', async () => {
    const service = createService();
    await expect(assert(service, [], null)).resolves.toBeUndefined();
    await expect(assert(service, undefined, null)).resolves.toBeUndefined();
  });

  it('水分 >65% 时门槛为 4%（湿基），超标则拒绝', async () => {
    const service = createService();
    // 水分 70% / 脂肪 14%(DM) → 湿基 4.20% > 4%
    await expect(
      assert(service, [LOW_FAT_TAG_ID], {
        summary: { moisture_pct: 70, fat_dm_pct: 14 },
      }),
    ).rejects.toThrow(/低脂/);
  });

  it('水分 >65% 且湿基脂肪达标时放行', async () => {
    const service = createService();
    // 水分 70% / 脂肪 10%(DM) → 湿基 3.00% ≤ 4%
    await expect(
      assert(service, [LOW_FAT_TAG_ID], {
        summary: { moisture_pct: 70, fat_dm_pct: 10 },
      }),
    ).resolves.toBeUndefined();
  });

  it('水分在 20%~65% 区间时门槛放宽为 7%', async () => {
    const service = createService();
    // 水分 60% / 脂肪 16%(DM) → 湿基 6.40% ≤ 7%，应放行
    await expect(
      assert(service, [LOW_FAT_TAG_ID], {
        summary: { moisture_pct: 60, fat_dm_pct: 16 },
      }),
    ).resolves.toBeUndefined();
    // 水分 60% / 脂肪 20%(DM) → 湿基 8.00% > 7%，应拒绝
    await expect(
      assert(service, [LOW_FAT_TAG_ID], {
        summary: { moisture_pct: 60, fat_dm_pct: 20 },
      }),
    ).rejects.toThrow(/低脂/);
  });

  it('水分 <20% 时门槛为 9%', async () => {
    const service = createService();
    // 水分 10% / 脂肪 9.5%(DM) → 湿基 8.55% ≤ 9%，应放行
    await expect(
      assert(service, [LOW_FAT_TAG_ID], {
        summary: { moisture_pct: 10, fat_dm_pct: 9.5 },
      }),
    ).resolves.toBeUndefined();
  });

  it('勾选了「低脂」但缺少营养数据时拒绝（无法举证）', async () => {
    const service = createService();
    await expect(assert(service, [LOW_FAT_TAG_ID], null)).rejects.toThrow(
      /营养计算/,
    );
    await expect(
      assert(service, [LOW_FAT_TAG_ID], { summary: {} }),
    ).rejects.toThrow(/营养计算/);
  });

  it('兼容不带 summary 包裹的营养数据', async () => {
    const service = createService();
    // 直接是扁平结构：水分 70 / 脂肪 13 → 湿基 3.90% ≤ 4%
    await expect(
      assert(service, [LOW_FAT_TAG_ID], { moisture_pct: 70, fat_dm_pct: 13 }),
    ).resolves.toBeUndefined();
  });

  it('标签表中不存在「低脂」时放行（如已清理）', async () => {
    const prisma = {
      recipeHealthTag: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = new RecipeService(prisma);
    await expect(
      assert(service, ['some-other-tag'], { summary: { moisture_pct: 70, fat_dm_pct: 30 } }),
    ).resolves.toBeUndefined();
  });
});
