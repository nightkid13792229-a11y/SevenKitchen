import { Test, type TestingModule } from '@nestjs/testing';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import type { CandidateSearchResult } from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { auditNutritionProfileForImport } from '../../../src/application/standard-ingredient-import/nutrition-audit';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import type { NutritionGovernanceSourceType } from '../../../src/domain/nutrition-governance/nutrition-governance.types';
import type { PreparationState } from '../../../src/domain/ingredient-creation/preparation-state';

interface SourceRecordFixture {
  id: string;
  sourceType: NutritionGovernanceSourceType;
  foodName: string;
  foodNameEn?: string | null;
  status?: 'ACTIVE' | 'DEPRECATED';
  /** 来源给的生熟原文（normalizedNutrition.meta.sampleState） */
  sampleState?: string | null;
  /** 营养档案里的值，键为目录字段路径（如 macros.crudeProtein） */
  values?: Record<string, number>;
}

type FixtureRow = {
  id: string;
  sourceType: NutritionGovernanceSourceType;
  foodName: string;
  foodNameEn: string | null;
  status: 'ACTIVE' | 'DEPRECATED';
  normalizedNutrition: Record<string, unknown>;
};

function buildNormalizedNutrition(
  fixture: SourceRecordFixture,
): Record<string, unknown> {
  const profile: Record<string, unknown> = {
    meta: {
      rawBasisType: 'PER_100_G',
      sourceForms: {},
      ...(fixture.sampleState ? { sampleState: fixture.sampleState } : {}),
    },
    macros: {},
    minerals: {},
    vitamins: {},
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  };

  for (const [fieldPath, value] of Object.entries(fixture.values ?? {})) {
    const [tabKey, fieldKey] = fieldPath.split('.');
    const tab = profile[tabKey] as Record<string, number>;
    tab[fieldKey] = value;
  }

  return profile;
}

/**
 * 内存版 Prisma 假实现：只覆盖候选检索用到的 `findMany`。
 *
 * 按 `where` 里的 status / sourceType.notIn / id.in 过滤，
 * 并按 `select` 投影——服务如果漏了某条过滤条件，测试就会看到不该出现的词条。
 */
function createPrismaMock(fixtures: SourceRecordFixture[]) {
  const rows: FixtureRow[] = fixtures.map((fixture) => ({
    id: fixture.id,
    sourceType: fixture.sourceType,
    foodName: fixture.foodName,
    foodNameEn: fixture.foodNameEn ?? null,
    status: fixture.status ?? 'ACTIVE',
    normalizedNutrition: buildNormalizedNutrition(fixture),
  }));

  const findMany = jest.fn(async (args: any) => {
    const where = args?.where ?? {};
    let matched = rows;

    if (where.status) {
      matched = matched.filter((row) => row.status === where.status);
    }
    if (where.sourceType?.notIn) {
      matched = matched.filter(
        (row) => !where.sourceType.notIn.includes(row.sourceType),
      );
    }
    if (where.id?.in) {
      matched = matched.filter((row) => where.id.in.includes(row.id));
    }

    return matched.map((row) => {
      const select = args?.select;
      if (!select) {
        return { ...row };
      }
      return Object.fromEntries(
        Object.keys(select)
          .filter((key) => key in row)
          .map((key) => [key, (row as Record<string, unknown>)[key]]),
      );
    });
  });

  return { nutritionSourceRecord: { findMany } };
}

async function createService(fixtures: SourceRecordFixture[]) {
  const prisma = createPrismaMock(fixtures);
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      IngredientCreationCandidateService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();

  return { service: moduleRef.get(IngredientCreationCandidateService) };
}

function candidateNames(result: CandidateSearchResult): string[] {
  return result.candidates.map((candidate) => candidate.foodName);
}

function candidateIds(result: CandidateSearchResult): string[] {
  return result.candidates.map((candidate) => candidate.sourceRecordId);
}

function chickenLiverFixture(
  overrides: Partial<SourceRecordFixture> & Pick<SourceRecordFixture, 'id'>,
): SourceRecordFixture {
  return {
    sourceType: 'USDA',
    foodName: 'Chicken, liver, raw',
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('IngredientCreationCandidateService', () => {
  describe('findCandidates 生熟筛选', () => {
    it('生查询不返回熟词条', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'usda-raw',
          foodName: 'Chicken, liver, all classes, raw',
        }),
        chickenLiverFixture({
          id: 'nzfcd-raw-from-meta',
          sourceType: 'NZFCD',
          foodName: 'Chicken liver, fresh, composite',
          sampleState: 'RAW',
        }),
        chickenLiverFixture({
          id: 'usda-cooked-from-meta',
          foodName: 'Chicken liver, simmered',
          sampleState: 'COOKED',
        }),
      ]);

      const result = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'RAW',
      });

      expect(candidateIds(result)).toEqual(['usda-raw', 'nzfcd-raw-from-meta']);
      expect(candidateNames(result)).not.toContain('Chicken liver, simmered');
      expect(
        result.candidates.map((candidate) => candidate.preparationState),
      ).toEqual<Array<PreparationState | null>>(['RAW', 'RAW']);
    });

    it('熟查询不回退到生词条', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'usda-raw',
          foodName: 'Chicken, liver, all classes, raw',
        }),
        chickenLiverFixture({
          id: 'usda-cooked-from-meta',
          foodName: 'Chicken liver, simmered',
          sampleState: 'COOKED',
        }),
      ]);

      const result = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'COOKED',
      });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].sourceRecordId).toBe('usda-cooked-from-meta');
      expect(result.candidates[0].preparationState).toBe('COOKED');
    });
  });

  describe('findCandidates 做法策略', () => {
    it('熟查询过滤掉烤和煎', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'boiled',
          foodName: 'Chicken liver, boiled',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'steamed',
          foodName: 'Chicken liver, steamed',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'roasted',
          foodName: 'Chicken liver, roasted',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'pan-fried',
          foodName: 'Chicken liver, pan-fried',
          sampleState: 'COOKED',
        }),
      ]);

      const result = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'COOKED',
      });

      const names = candidateNames(result);
      expect(names).toEqual([
        'Chicken liver, boiled',
        'Chicken liver, steamed',
      ]);
      expect(names).not.toContain('Chicken liver, roasted');
      expect(names).not.toContain('Chicken liver, pan-fried');
      expect(
        result.candidates.map((candidate) => candidate.cookingMethod),
      ).toEqual(['BOILED', 'STEAMED']);
    });

    it('水煮与蒸排在其它可接受做法前面', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'simmered',
          foodName: 'Chicken liver, cooked, simmered',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'boiled',
          foodName: 'Chicken liver, boiled',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'steamed',
          foodName: 'Chicken liver, steamed',
          sampleState: 'COOKED',
        }),
      ]);

      const result = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'COOKED',
      });

      const names = candidateNames(result);
      const simmeredIndex = names.indexOf('Chicken liver, cooked, simmered');
      expect(simmeredIndex).toBeGreaterThan(0);
      expect(names.slice(0, simmeredIndex).sort()).toEqual([
        'Chicken liver, boiled',
        'Chicken liver, steamed',
      ]);

      // 排序权重落在 matchScore 上，页面按分数降序读也不会错位
      for (let index = 1; index < result.candidates.length; index += 1) {
        expect(result.candidates[index - 1].matchScore).toBeGreaterThanOrEqual(
          result.candidates[index].matchScore,
        );
      }
      expect(result.candidates[0].matchScore).toBeGreaterThan(
        result.candidates[simmeredIndex].matchScore,
      );
    });

    it('做法认不出的熟词条保留、排在可接受做法之后，并标 COOKING_METHOD_UNKNOWN', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'boiled',
          foodName: 'Chicken liver, boiled',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'method-unknown',
          foodName: 'Chicken liver, cooked, simmered',
          sampleState: 'COOKED',
        }),
      ]);

      const result = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'COOKED',
      });

      expect(candidateIds(result)).toEqual(['boiled', 'method-unknown']);

      const unknownMethod = result.candidates.find(
        (candidate) => candidate.sourceRecordId === 'method-unknown',
      );
      expect(unknownMethod?.cookingMethod).toBeNull();
      expect(unknownMethod?.notes).toContain('COOKING_METHOD_UNKNOWN');
      expect(result.candidates[0].notes).not.toContain(
        'COOKING_METHOD_UNKNOWN',
      );
    });

    it('被排除条数只数名字对得上、因烤/煎被排除的词条', async () => {
      const fixtures: SourceRecordFixture[] = [
        chickenLiverFixture({
          id: 'boiled',
          foodName: 'Chicken liver, boiled',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'grilled',
          foodName: 'Chicken liver, grilled',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'roasted',
          foodName: 'Chicken liver, roasted',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'pan-fried',
          foodName: 'Chicken liver, pan-fried',
          sampleState: 'COOKED',
        }),
        chickenLiverFixture({
          id: 'raw',
          foodName: 'Chicken liver, raw',
        }),
        chickenLiverFixture({
          id: 'unrelated-grilled',
          foodName: 'Chicken heart, roasted',
          sampleState: 'COOKED',
        }),
      ];
      const { service } = await createService(fixtures);

      const cooked = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'COOKED',
      });

      expect(cooked.excludedCount).toBe(3);
      expect(candidateIds(cooked)).toEqual(['boiled']);

      // 生查询里生熟不符属于状态筛选，不计入「因烤/煎被排除」
      const raw = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'RAW',
      });

      expect(raw.excludedCount).toBe(0);
      expect(candidateIds(raw)).toEqual(['raw']);
    });
  });

  describe('findCandidates 同名不同部位', () => {
    it('名字只差一个部位词时标 DIFFERENT_PART，且匹配分明显低于同名命中', async () => {
      const { service } = await createService([
        {
          id: 'rabbit-liver',
          sourceType: 'CFCT',
          foodName: '兔肝',
          sampleState: 'RAW',
        },
        {
          id: 'rabbit-meat',
          sourceType: 'CFCT',
          foodName: '兔肉',
          sampleState: 'RAW',
        },
        {
          id: 'chicken-liver',
          sourceType: 'CFCT',
          foodName: '鸡肝',
          sampleState: 'RAW',
        },
      ]);

      const result = await service.findCandidates({
        name: '兔肝',
        nameEn: 'Rabbit liver',
        state: 'RAW',
      });

      const exact = result.candidates.find(
        (candidate) => candidate.sourceRecordId === 'rabbit-liver',
      );
      const differentPart = result.candidates.find(
        (candidate) => candidate.sourceRecordId === 'rabbit-meat',
      );
      expect(exact).toBeDefined();
      expect(differentPart).toBeDefined();
      expect(differentPart?.notes).toContain('DIFFERENT_PART');
      expect(exact?.matchScore).toBeGreaterThanOrEqual(0.75);
      expect(differentPart?.matchScore).toBeLessThanOrEqual(0.3);
      expect(
        (exact?.matchScore ?? 0) - (differentPart?.matchScore ?? 0),
      ).toBeGreaterThan(0.4);

      // 不同动物不能靠「都有肝」混进来
      expect(candidateIds(result)).not.toContain('chicken-liver');
    });

    it('鸡肝 vs 鸡胸同样按不同部位处理', async () => {
      const { service } = await createService([
        {
          id: 'chicken-liver',
          sourceType: 'CFCT',
          foodName: '鸡肝',
          sampleState: 'RAW',
        },
        {
          id: 'chicken-breast',
          sourceType: 'CFCT',
          foodName: '鸡胸',
          sampleState: 'RAW',
        },
      ]);

      const result = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'RAW',
      });

      const breast = result.candidates.find(
        (candidate) => candidate.sourceRecordId === 'chicken-breast',
      );
      expect(breast?.notes).toContain('DIFFERENT_PART');
      expect(breast?.matchScore).toBeLessThan(0.35);
    });
  });

  describe('findCandidates 状态推导', () => {
    it('状态推导不出来时标 STATE_UNKNOWN，但不丢候选', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'pate',
          foodName: 'Chicken liver pate',
        }),
      ]);

      const raw = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'RAW',
      });
      const cooked = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'COOKED',
      });

      for (const result of [raw, cooked]) {
        const candidate = result.candidates.find(
          (row) => row.sourceRecordId === 'pate',
        );
        expect(candidate).toBeDefined();
        expect(candidate?.preparationState).toBeNull();
        expect(candidate?.notes).toContain('STATE_UNKNOWN');
      }
    });
  });

  describe('findCandidates 覆盖率', () => {
    it('覆盖率与缺失字段直接来自 nutrition-audit，不另算一套', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'audited',
          foodName: 'Chicken liver, raw',
          sampleState: 'RAW',
          values: {
            'macros.crudeProtein': 20,
            'macros.crudeFat': 5,
            'minerals.calcium': 12,
          },
        }),
      ]);

      const result = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'RAW',
      });

      const candidate = result.candidates[0];
      const expected = auditNutritionProfileForImport({
        nutrients: {
          crudeProtein: { value: 20, unit: 'g' },
          crudeFat: { value: 5, unit: 'g' },
          calcium: { value: 12, unit: 'mg' },
        },
      });

      expect(candidate.coveragePercent).toBeCloseTo(
        expected.essentialCoveragePercent,
        10,
      );
      expect(candidate.missingFields).toEqual(
        expected.missingEssentialNutrients,
      );

      expect(result.coverage.state).toBe('RAW');
      expect(result.coverage.candidateCount).toBe(1);
      expect(result.coverage.bestCoveragePercent).toBeCloseTo(
        expected.essentialCoveragePercent,
        10,
      );
      expect(result.coverage.bestMissingFieldCount).toBe(
        expected.missingEssentialNutrients.length,
      );
    });

    it('零候选时 coverage 用 null，不写成 0', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'unrelated',
          foodName: 'Cabbage, raw',
        }),
      ]);

      const result = await service.findCandidates({
        name: '兔肝',
        nameEn: 'Rabbit liver',
        state: 'RAW',
      });

      expect(result.candidates).toEqual([]);
      expect(result.excludedCount).toBe(0);
      expect(result.coverage).toEqual({
        state: 'RAW',
        candidateCount: 0,
        bestCoveragePercent: null,
        bestMissingFieldCount: null,
      });
    });
  });

  describe('findCandidates 中英别名与匹配依据', () => {
    const watercressFixture = (
      overrides: Partial<SourceRecordFixture> & Pick<SourceRecordFixture, 'id'>,
    ): SourceRecordFixture => ({
      sourceType: 'USDA',
      foodName: 'Watercress, raw',
      status: 'ACTIVE',
      ...overrides,
    });

    it('中文关键词通过中英别名命中英文词条，并给出 matchedBy / matchedKeyword / score', async () => {
      const { service } = await createService([
        watercressFixture({ id: 'usda-watercress' }),
      ]);

      const result = await service.findCandidates({
        name: '西洋菜',
        state: 'RAW',
      });

      expect(result.keywords).toEqual(['西洋菜', 'watercress']);
      expect(result.candidates).toHaveLength(1);
      const [candidate] = result.candidates;
      expect(candidate).toMatchObject({
        sourceRecordId: 'usda-watercress',
        foodName: 'Watercress, raw',
        preparationState: 'RAW',
        matchedBy: 'ZH_ALIAS',
        matchedKeyword: '西洋菜',
        matchedSourceName: 'Watercress, raw',
      });
      expect(candidate?.matchScore).toBeGreaterThanOrEqual(0.35);
      expect(candidate?.notes).not.toContain('STATE_UNKNOWN');
    });

    it('英文关键词命中英文词条，标 EN_PARTIAL', async () => {
      const { service } = await createService([
        watercressFixture({ id: 'usda-watercress' }),
      ]);

      const result = await service.findCandidates({
        name: 'Watercress',
        state: 'RAW',
      });

      expect(result.keywords).toEqual(['Watercress']);
      expect(result.candidates).toHaveLength(1);
      const [candidate] = result.candidates;
      expect(candidate).toMatchObject({
        matchedBy: 'EN_PARTIAL',
        matchedKeyword: 'Watercress',
        matchedSourceName: 'Watercress, raw',
      });
      expect(candidate?.matchScore).toBeGreaterThanOrEqual(0.35);
    });

    it('零命中时 keywords 仍然回传，候选为空数组', async () => {
      const { service } = await createService([
        watercressFixture({
          id: 'unrelated',
          foodName: 'Cabbage, raw',
        }),
      ]);

      const result = await service.findCandidates({
        name: '西洋菜',
        state: 'RAW',
      });

      expect(result.keywords).toEqual(['西洋菜', 'watercress']);
      expect(result.candidates).toEqual([]);
    });
  });

  describe('findCandidates 排序与来源范围', () => {
    it('候选按匹配分降序排列', async () => {
      const { service } = await createService([
        {
          id: 'chicken-liver',
          sourceType: 'CFCT',
          foodName: '鸡肝',
          sampleState: 'RAW',
        },
        chickenLiverFixture({
          id: 'usda-liver',
          foodName: 'Chicken liver, raw',
        }),
        {
          id: 'chicken-breast',
          sourceType: 'CFCT',
          foodName: '鸡胸',
          sampleState: 'RAW',
        },
      ]);

      const result = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'RAW',
      });

      expect(candidateIds(result)).toEqual([
        'chicken-liver',
        'usda-liver',
        'chicken-breast',
      ]);
      for (let index = 1; index < result.candidates.length; index += 1) {
        expect(result.candidates[index - 1].matchScore).toBeGreaterThanOrEqual(
          result.candidates[index].matchScore,
        );
      }
    });

    it('limit 生效，截断前的排序是确定的', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'alpha',
          foodName: 'Chicken liver, alpha',
          sampleState: 'COOKED',
          values: {
            'macros.crudeProtein': 20,
            'macros.crudeFat': 5,
            'minerals.calcium': 12,
          },
        }),
        chickenLiverFixture({
          id: 'beta',
          foodName: 'Chicken liver, beta',
          sampleState: 'COOKED',
          values: { 'macros.crudeProtein': 20 },
        }),
        chickenLiverFixture({
          id: 'gamma',
          foodName: 'Chicken liver, gamma',
          sampleState: 'COOKED',
          values: { 'macros.crudeProtein': 20, 'macros.crudeFat': 5 },
        }),
      ]);

      const limited = await service.findCandidates(
        { name: '鸡肝', nameEn: 'Chicken liver', state: 'COOKED' },
        2,
      );
      expect(candidateIds(limited)).toEqual(['alpha', 'gamma']);
      expect(limited.coverage.candidateCount).toBe(2);

      const all = await service.findCandidates(
        { name: '鸡肝', nameEn: 'Chicken liver', state: 'COOKED' },
        10,
      );
      expect(candidateIds(all)).toEqual(['alpha', 'gamma', 'beta']);
    });

    it('只查启用状态的食品来源词条', async () => {
      const { service } = await createService([
        chickenLiverFixture({
          id: 'usda-active',
          foodName: 'Chicken liver, raw',
        }),
        chickenLiverFixture({
          id: 'usda-deprecated',
          foodName: 'Chicken liver, raw (deprecated)',
          status: 'DEPRECATED',
        }),
        chickenLiverFixture({
          id: 'supplement-label',
          sourceType: 'SUPPLEMENT_LABEL',
          foodName: 'Chicken liver powder',
        }),
        chickenLiverFixture({
          id: 'cnf-active',
          sourceType: 'CNF',
          foodName: 'Chicken liver, raw',
        }),
      ]);

      const result = await service.findCandidates({
        name: '鸡肝',
        nameEn: 'Chicken liver',
        state: 'RAW',
      });

      expect(candidateIds(result)).toEqual(['usda-active', 'cnf-active']);
    });
  });
});
