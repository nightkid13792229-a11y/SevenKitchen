import { NutritionGovernanceSourceType } from '@prisma/client';
import { getNutritionSourceDefinition } from '../../../src/domain/ingredient/nutrition-source-contract';
import {
  getNutritionLibrary,
  LOCAL_LIBRARY_SOURCE_TYPES,
  NUTRITION_LIBRARIES,
  ONLINE_TRUSTED_HOSTS,
} from '../../../src/domain/nutrition-governance/nutrition-source-registry';

const EXPECTED_L1_KEYS = [
  'cfct',
  'cnf',
  'ko_rda',
  'mext',
  'nzfcd',
  'tfda',
  'usda',
];

function expectBareHost(host: string): void {
  expect(host).toBe(host.trim().toLowerCase());
  expect(host).not.toMatch(/[\/:?#\s]/u);
  expect(host).toMatch(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u);
}

describe('nutrition source registry', () => {
  it('登记表覆盖 15 个库，L1 恰好 7 个且都有本地库', () => {
    expect(NUTRITION_LIBRARIES).toHaveLength(15);

    const l1 = NUTRITION_LIBRARIES.filter((library) => library.role === 'L1');
    expect(l1).toHaveLength(7);
    expect(l1.every((library) => library.local)).toBe(true);
    expect(l1.map((library) => library.key).sort()).toEqual(EXPECTED_L1_KEYS);

    // 只有 L1 才允许 local=true：L2 / CANDIDATE 都是未导入或仅线上。
    expect(
      NUTRITION_LIBRARIES.filter((library) => library.role !== 'L1').every(
        (library) => library.local === false,
      ),
    ).toBe(true);
  });

  it('每个 L1 sourceType 都是 Prisma 枚举值，sourceCode 都能被注册口径解析', () => {
    const prismaSourceTypes = Object.values(NutritionGovernanceSourceType);
    expect(prismaSourceTypes).toHaveLength(12);

    for (const library of NUTRITION_LIBRARIES.filter(
      (entry) => entry.role === 'L1',
    )) {
      expect(library.sourceType).not.toBeNull();
      expect(prismaSourceTypes).toContain(library.sourceType);

      const definition = getNutritionSourceDefinition(library.sourceCode);
      expect(definition).toBeDefined();
      expect(definition?.sourceKind).toBe('FOOD_DATABASE');
    }
  });

  it('NEVO 不在 L1；COFID / CIQUAL 标记为未导入', () => {
    const nevo = getNutritionLibrary('NEVO');
    expect(nevo).toBeDefined();
    expect(nevo?.role).not.toBe('L1');
    expect(nevo?.role).toBe('L2');
    expect(nevo?.local).toBe(false);

    for (const sourceType of ['COFID', 'CIQUAL']) {
      const library = getNutritionLibrary(sourceType);
      expect(library).toBeDefined();
      expect(library?.local).toBe(false);
      expect(library?.role).toBe('L2');
    }
  });

  it('LOCAL_LIBRARY_SOURCE_TYPES 恰好 7 个唯一值，与 L1 一一对应', () => {
    expect(LOCAL_LIBRARY_SOURCE_TYPES).toHaveLength(7);
    expect(new Set(LOCAL_LIBRARY_SOURCE_TYPES).size).toBe(7);

    const l1SourceTypes = NUTRITION_LIBRARIES.filter(
      (library) => library.role === 'L1',
    ).map((library) => library.sourceType);
    expect([...LOCAL_LIBRARY_SOURCE_TYPES].sort()).toEqual(
      l1SourceTypes.sort(),
    );
  });

  it('key / sourceType / sourceCode 都不重复', () => {
    const keys = NUTRITION_LIBRARIES.map((library) => library.key);
    expect(new Set(keys).size).toBe(keys.length);

    const sourceCodes = NUTRITION_LIBRARIES.map(
      (library) => library.sourceCode,
    );
    expect(new Set(sourceCodes).size).toBe(sourceCodes.length);

    const sourceTypes = NUTRITION_LIBRARIES.filter(
      (library) => library.sourceType !== null,
    ).map((library) => library.sourceType);
    expect(new Set(sourceTypes).size).toBe(sourceTypes.length);
  });

  it('线上域名都是裸域名，不含协议 / 路径 / 空白', () => {
    const libraryHosts = NUTRITION_LIBRARIES.flatMap(
      (library) => library.onlineHosts,
    );
    expect(libraryHosts.length).toBeGreaterThan(0);

    for (const host of libraryHosts) {
      expectBareHost(host);
    }
    for (const host of ONLINE_TRUSTED_HOSTS) {
      expectBareHost(host);
    }
  });

  it('ONLINE_TRUSTED_HOSTS 是所有库域名的并集，且不含抓取代理', () => {
    const expectedHosts = [
      ...new Set(NUTRITION_LIBRARIES.flatMap((library) => library.onlineHosts)),
    ];

    expect([...ONLINE_TRUSTED_HOSTS].sort()).toEqual(expectedHosts.sort());
    expect(ONLINE_TRUSTED_HOSTS).not.toContain('r.jina.ai');
    expect(
      NUTRITION_LIBRARIES.flatMap((library) => library.onlineHosts),
    ).not.toContain('r.jina.ai');
  });

  it('getNutritionLibrary 只按数据库 sourceType 查找，空值返回 undefined', () => {
    expect(getNutritionLibrary('USDA')?.key).toBe('usda');
    expect(getNutritionLibrary('KO_RDA')?.key).toBe('ko_rda');
    expect(getNutritionLibrary(null)).toBeUndefined();
    expect(getNutritionLibrary(undefined)).toBeUndefined();
    expect(getNutritionLibrary('')).toBeUndefined();
    // 纯线上库没有 sourceType，不能从这里查到。
    expect(getNutritionLibrary('FINELI')).toBeUndefined();
  });
});
