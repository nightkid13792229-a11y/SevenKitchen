import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 数据迁移 `20261117193000_merge_duplicate_recipe_ids` 的静态校验。
 *
 * 这份迁移要在多处重复写「重复编号 → 保留编号」的映射（前置校验、制作单、埋点、计数、
 * 删除）。只要有一处写错，就会把引用指向另一个编号，而且线上跑起来不会报错。
 * 所以这里把映射从 SQL 里读出来做一致性检查 —— 复制粘贴写错立刻红。
 */
const MIGRATION_PATH = resolve(
  process.cwd(),
  'prisma/migrations/20261117193000_merge_duplicate_recipe_ids/migration.sql',
);

const UUID_PAIR = /\('([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',\s*'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'\)/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** 每一处 (重复编号, 保留编号) 都记一次出现次数 */
function collectPairs(sql: string): Map<string, Map<string, number>> {
  const pairs = new Map<string, Map<string, number>>();
  for (const match of sql.matchAll(UUID_PAIR)) {
    const [, dupId, keepId] = match;
    const byKeep = pairs.get(dupId) ?? new Map<string, number>();
    byKeep.set(keepId, (byKeep.get(keepId) ?? 0) + 1);
    pairs.set(dupId, byKeep);
  }
  return pairs;
}

describe('重复食谱编号合并迁移', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  const pairs = collectPairs(sql);

  it('5 组「重复 → 保留」映射在所有 UPDATE 段落里完全一致', () => {
    expect(pairs.size).toBe(5);

    for (const [dupId, byKeep] of pairs) {
      // 一个重复编号只能指向一个保留编号（写岔了会出现两个）
      expect([...byKeep.keys()]).toHaveLength(1);
      // 制作单、埋点、计数三段都要写一遍
      expect([...byKeep.values()][0]).toBe(3);
      expect(dupId).not.toBe([...byKeep.keys()][0]);
    }
  });

  it('前置校验的重复编号列表与映射里的重复编号一致', () => {
    const guardSection = sql.slice(
      sql.indexOf('dup_ids text[]'),
      sql.indexOf('unexpected text;'),
    );
    const guardIds = new Set(guardSection.match(UUID) ?? []);

    expect(guardIds.size).toBe(5);
    for (const dupId of pairs.keys()) {
      expect(guardIds.has(dupId)).toBe(true);
    }
  });

  it('删除段落按「编号 + 名称」双条件删除，且覆盖全部 5 个重复编号', () => {
    const deleteSection = sql.slice(sql.indexOf('DELETE FROM recipe r'));
    const namedPairs = [
      ...deleteSection.matchAll(
        /\('([0-9a-f-]{36})',\s*'([^']+)'\)/g,
      ),
    ].map((match) => ({ recipeId: match[1], name: match[2] }));

    expect(namedPairs).toHaveLength(5);
    expect(new Set(namedPairs.map((row) => row.name)).size).toBe(4);

    for (const dupId of pairs.keys()) {
      expect(namedPairs.some((row) => row.recipeId === dupId)).toBe(true);
    }
  });

  it('保留编号不会出现在删除清单里（别把正式版删了）', () => {
    const deleteSection = sql.slice(sql.indexOf('DELETE FROM recipe r'));
    for (const byKeep of pairs.values()) {
      for (const keepId of byKeep.keys()) {
        expect(deleteSection.includes(keepId)).toBe(false);
      }
    }
  });

  it('迁移不自己开事务（由 prisma migrate 统一包事务）', () => {
    expect(sql).not.toMatch(/^\s*BEGIN;/im);
    expect(sql).not.toMatch(/^\s*COMMIT;/im);
  });
});
