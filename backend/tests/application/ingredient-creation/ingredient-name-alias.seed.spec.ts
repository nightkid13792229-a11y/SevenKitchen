import {
  buildIngredientNameAliasSeedRows,
  seedIngredientNameAliases,
  type AliasSeedPrisma,
} from '../../../prisma/seed-ingredient-name-aliases';

/**
 * 内存版 `createMany`：按 (zhTerm, foreignTerm, language) 去重，
 * 与数据库唯一键 + `skipDuplicates` 的行为一致。
 */
function createSeedPrismaMock() {
  const existing = new Set<string>();
  const createMany = jest.fn(
    async (args: {
      data: Array<{
        zhTerm: string;
        foreignTerm: string;
        language: string;
      }>;
      skipDuplicates?: boolean;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of args.data) {
        const key = `${row.zhTerm}\u0000${row.foreignTerm}\u0000${row.language}`;
        if (existing.has(key)) continue;
        existing.add(key);
        count += 1;
      }
      return { count };
    },
  );

  return {
    prisma: { ingredientNameAlias: { createMany } } satisfies AliasSeedPrisma,
    existing,
    createMany,
  };
}

describe('ingredient name alias seed', () => {
  it('把代码里的手写别名表全部展开成 MANUAL_SEED 行', () => {
    const rows = buildIngredientNameAliasSeedRows();

    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        (row) => row.source === 'MANUAL_SEED' && row.language === 'en',
      ),
    ).toBe(true);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          zhTerm: '西洋菜',
          foreignTerm: 'watercress',
        }),
      ]),
    );

    const keys = rows.map(
      (row) => `${row.zhTerm}\u0000${row.foreignTerm}\u0000${row.language}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('重复执行不重复插入（幂等）', async () => {
    const { prisma, existing } = createSeedPrismaMock();
    const rows = buildIngredientNameAliasSeedRows();

    const first = await seedIngredientNameAliases(prisma);
    expect(first).toEqual({ total: rows.length, inserted: rows.length });
    expect(existing.size).toBe(rows.length);

    const second = await seedIngredientNameAliases(prisma);
    expect(second).toEqual({ total: rows.length, inserted: 0 });
    expect(existing.size).toBe(rows.length);
  });
});
