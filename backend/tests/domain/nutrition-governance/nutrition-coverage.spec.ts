import {
  evaluateNutritionCoverage,
  NUTRITION_COVERAGE_THRESHOLDS,
  type NutritionCoverageReport,
  type NutritionCoverageSourceReport,
} from '../../../src/domain/nutrition-governance/nutrition-coverage-thresholds';
import { LOCAL_LIBRARY_SOURCE_TYPES } from '../../../src/domain/nutrition-governance/nutrition-source-registry';

/**
 * 生产基线 fixture：记录数取自 2026-10-26 生产实测（设计文档 §四），
 * 覆盖率取各库实测大类覆盖的保守值；用途是证明阈值能通过真实量级，
 * 而不是把阈值本身当预期值。
 */
const PROD_BASELINE_SOURCES: NutritionCoverageSourceReport[] = [
  {
    sourceType: 'USDA',
    records: 8263,
    uniqueKeys: 8263,
    energyRate: 0.995,
    proteinRate: 0.994,
    mineralRate: 0.993,
    vitaminRate: 0.978,
    resolvableSourceCodeRate: 1,
  },
  {
    sourceType: 'CNF',
    records: 5993,
    uniqueKeys: 5993,
    energyRate: 0.999,
    proteinRate: 0.999,
    mineralRate: 0.99,
    vitaminRate: 0.992,
    resolvableSourceCodeRate: 1,
  },
  {
    sourceType: 'NZFCD',
    records: 2857,
    uniqueKeys: 2857,
    energyRate: 1,
    proteinRate: 1,
    mineralRate: 1,
    vitaminRate: 1,
    resolvableSourceCodeRate: 1,
  },
  {
    sourceType: 'MEXT',
    records: 2478,
    uniqueKeys: 2478,
    energyRate: 0.999,
    proteinRate: 0.999,
    mineralRate: 0.999,
    vitaminRate: 0.999,
    resolvableSourceCodeRate: 1,
  },
  {
    sourceType: 'TFDA',
    records: 2213,
    uniqueKeys: 2213,
    energyRate: 0.986,
    proteinRate: 0.98,
    mineralRate: 0.977,
    vitaminRate: 0.979,
    resolvableSourceCodeRate: 1,
  },
  {
    sourceType: 'KO_RDA',
    records: 3366,
    uniqueKeys: 3366,
    energyRate: 0.99,
    proteinRate: 0.99,
    mineralRate: 0.994,
    vitaminRate: 0.966,
    resolvableSourceCodeRate: 1,
  },
  {
    sourceType: 'CFCT',
    records: 1868,
    uniqueKeys: 1868,
    energyRate: 0.993,
    proteinRate: 0.99,
    mineralRate: 0.953,
    vitaminRate: 0.868,
    resolvableSourceCodeRate: 1,
  },
];

function baselineReport(): NutritionCoverageReport {
  return {
    generatedAt: '2026-10-28T00:00:00.000Z',
    sources: PROD_BASELINE_SOURCES.map((source) => ({ ...source })),
  };
}

function sourceOf(
  report: NutritionCoverageReport,
  sourceType: string,
): NutritionCoverageSourceReport {
  const source = report.sources.find(
    (entry) => entry.sourceType === sourceType,
  );
  if (!source) {
    throw new Error(`fixture missing source: ${sourceType}`);
  }
  return source;
}

describe('nutrition coverage thresholds', () => {
  it('7 个 L1 库都有阈值，数值与验收清单一致', () => {
    expect(Object.keys(NUTRITION_COVERAGE_THRESHOLDS).sort()).toEqual(
      [...LOCAL_LIBRARY_SOURCE_TYPES].sort(),
    );

    expect(NUTRITION_COVERAGE_THRESHOLDS).toMatchObject({
      USDA: {
        minRecords: 8000,
        minEnergyRate: 0.85,
        minProteinRate: 0.8,
        minMineralRate: 0.75,
      },
      CNF: {
        minRecords: 5800,
        minEnergyRate: 0.85,
        minProteinRate: 0.8,
        minMineralRate: 0.75,
      },
      NZFCD: {
        minRecords: 2750,
        minEnergyRate: 0.85,
        minProteinRate: 0.8,
        minMineralRate: 0.75,
      },
      MEXT: {
        minRecords: 2400,
        minEnergyRate: 0.85,
        minProteinRate: 0.8,
        minMineralRate: 0.75,
      },
      TFDA: {
        minRecords: 2100,
        minEnergyRate: 0.85,
        minProteinRate: 0.8,
        minMineralRate: 0.75,
      },
      KO_RDA: {
        minRecords: 3250,
        minEnergyRate: 0.85,
        minProteinRate: 0.8,
        minMineralRate: 0.75,
      },
      CFCT: {
        minRecords: 1800,
        minEnergyRate: 0.85,
        minProteinRate: 0.8,
        minMineralRate: 0.75,
      },
    });
  });

  it('生产基线报告通过', () => {
    expect(evaluateNutritionCoverage(baselineReport())).toEqual([]);
  });

  it('把某个库的 minRecords 调到当前记录数 +1 就失败', () => {
    const report = baselineReport();
    const usda = sourceOf(report, 'USDA');
    const original = NUTRITION_COVERAGE_THRESHOLDS.USDA.minRecords;

    try {
      NUTRITION_COVERAGE_THRESHOLDS.USDA.minRecords = usda.records + 1;
      const violations = evaluateNutritionCoverage(report);

      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('USDA');
      expect(violations[0]).toContain(String(usda.records + 1));
    } finally {
      NUTRITION_COVERAGE_THRESHOLDS.USDA.minRecords = original;
    }
  });

  it('缺少一个 L1 库就失败', () => {
    const report = baselineReport();
    report.sources = report.sources.filter(
      (source) => source.sourceType !== 'KO_RDA',
    );

    const violations = evaluateNutritionCoverage(report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('KO_RDA');
  });

  it('sourceCode 可解析率 0.99 就失败', () => {
    const report = baselineReport();
    sourceOf(report, 'USDA').resolvableSourceCodeRate = 0.99;

    const violations = evaluateNutritionCoverage(report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('USDA');
    expect(violations[0]).toContain('sourceCode');
  });

  it('能量 / 蛋白 / 矿物质任一低于阈值都失败', () => {
    const report = baselineReport();
    const usda = sourceOf(report, 'USDA');
    usda.energyRate = 0.84;
    usda.proteinRate = 0.79;
    usda.mineralRate = 0.74;

    const violations = evaluateNutritionCoverage(report);

    expect(violations).toHaveLength(3);
    expect(violations.join('\n')).toContain('energyRate');
    expect(violations.join('\n')).toContain('proteinRate');
    expect(violations.join('\n')).toContain('mineralRate');
  });

  it('报告里出现未知来源时明确报出来，不静默忽略', () => {
    const report = baselineReport();
    report.sources.push({
      sourceType: 'NEVO',
      records: 3,
      uniqueKeys: 3,
      energyRate: 1,
      proteinRate: 1,
      mineralRate: 1,
      vitaminRate: 1,
      resolvableSourceCodeRate: 1,
    });

    const violations = evaluateNutritionCoverage(report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('NEVO');
  });
});
