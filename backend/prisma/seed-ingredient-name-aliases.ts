import { PrismaClient } from '@prisma/client';

import { listChineseEnglishFoodAliasSeeds } from '../src/domain/nutrition-governance/nutrition-governance.utils';

/**
 * 把代码里手写的 `CHINESE_TO_ENGLISH_FOOD_ALIASES` 全部导入数据库词典。
 *
 * - `source = MANUAL_SEED`：这批词是人工维护过的，不是模型猜的；
 * - 唯一键 `(zhTerm, foreignTerm, language)` + `skipDuplicates` 保证幂等，
 *   重复跑不会重复插，也不会改动已经沉淀出来的 `hitCount` / `sourceRecordId`。
 *
 * 运行：`cd backend && npm run seed:ingredient-name-aliases`
 */
export interface IngredientNameAliasSeedRow {
  zhTerm: string;
  foreignTerm: string;
  language: string;
  source: 'MANUAL_SEED';
}

/** 只依赖 `createMany`，单元测试可以传内存假实现。 */
export interface AliasSeedPrisma {
  ingredientNameAlias: {
    createMany(args: {
      data: IngredientNameAliasSeedRow[];
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
  };
}

export function buildIngredientNameAliasSeedRows(): IngredientNameAliasSeedRow[] {
  const rows: IngredientNameAliasSeedRow[] = [];
  const seen = new Set<string>();

  for (const entry of listChineseEnglishFoodAliasSeeds()) {
    const zhTerm = entry.zh.trim();
    if (!zhTerm) continue;

    for (const alias of entry.aliases) {
      const foreignTerm = alias.trim();
      if (!foreignTerm) continue;

      // 同一张表里偶有重复（圆白菜 / 包菜 都映射 cabbage），词典唯一键
      // 是 (zhTerm, foreignTerm, language)，只去重完全相同的三元组。
      const key = `${zhTerm}\u0000${foreignTerm}\u0000en`;
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        zhTerm,
        foreignTerm,
        language: 'en',
        source: 'MANUAL_SEED',
      });
    }
  }

  return rows;
}

export async function seedIngredientNameAliases(
  prisma: AliasSeedPrisma,
): Promise<{ total: number; inserted: number }> {
  const rows = buildIngredientNameAliasSeedRows();
  if (rows.length === 0) {
    return { total: 0, inserted: 0 };
  }

  const result = await prisma.ingredientNameAlias.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return { total: rows.length, inserted: result.count };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const { total, inserted } = await seedIngredientNameAliases(prisma);
    console.log(
      `Ingredient name aliases: ${total} rows in seed, ${inserted} inserted, ${
        total - inserted
      } already present.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to seed ingredient name aliases:', error);
    process.exitCode = 1;
  });
}
