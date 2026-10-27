import { LOCAL_LIBRARY_SOURCE_TYPES } from './nutrition-source-registry';

export interface NutritionCoverageThreshold {
  minRecords: number;
  minEnergyRate: number;
  minProteinRate: number;
  minMineralRate: number;
}

export const NUTRITION_COVERAGE_THRESHOLDS: Record<
  string,
  NutritionCoverageThreshold
> = {
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
};

export interface NutritionCoverageSourceReport {
  sourceType: string;
  records: number;
  uniqueKeys: number;
  energyRate: number;
  proteinRate: number;
  mineralRate: number;
  vitaminRate: number;
  resolvableSourceCodeRate: number;
}

export interface NutritionCoverageReport {
  generatedAt: string;
  sources: NutritionCoverageSourceReport[];
}

function formatRate(rate: number): string {
  return Number.isFinite(rate) ? rate.toFixed(3) : String(rate);
}

/**
 * 按登记表的 L1 清单逐库验收覆盖率。
 *
 * - 缺少某个 L1 库 / 该库记录数低于阈值 / 能量、蛋白、矿物质覆盖低于阈值 /
 *   sourceCode 可解析率低于 100% 都算违规；
 * - 报告里出现阈值表之外的来源也报出来，避免配置漂移被静默忽略；
 * - `vitaminRate` 只记录、不设阈值（验收清单目前只要求至少一种维生素可统计）。
 *
 * 返回空数组 = 通过；顺序稳定：先按登记表顺序检查 L1，再检查未知来源。
 */
export function evaluateNutritionCoverage(
  report: NutritionCoverageReport,
): string[] {
  const violations: string[] = [];
  const bySourceType = new Map(
    report.sources.map((source) => [source.sourceType, source]),
  );

  for (const sourceType of LOCAL_LIBRARY_SOURCE_TYPES) {
    const threshold = NUTRITION_COVERAGE_THRESHOLDS[sourceType];
    if (!threshold) {
      violations.push(`missing coverage threshold: ${sourceType}`);
      continue;
    }

    const actual = bySourceType.get(sourceType);
    if (!actual) {
      violations.push(`missing L1 source: ${sourceType}`);
      continue;
    }

    if (actual.records < threshold.minRecords) {
      violations.push(
        `${sourceType}: records ${actual.records} < ${threshold.minRecords}`,
      );
    }
    if (
      !Number.isFinite(actual.energyRate) ||
      actual.energyRate < threshold.minEnergyRate
    ) {
      violations.push(
        `${sourceType}: energyRate ${formatRate(
          actual.energyRate,
        )} < ${formatRate(threshold.minEnergyRate)}`,
      );
    }
    if (
      !Number.isFinite(actual.proteinRate) ||
      actual.proteinRate < threshold.minProteinRate
    ) {
      violations.push(
        `${sourceType}: proteinRate ${formatRate(
          actual.proteinRate,
        )} < ${formatRate(threshold.minProteinRate)}`,
      );
    }
    if (
      !Number.isFinite(actual.mineralRate) ||
      actual.mineralRate < threshold.minMineralRate
    ) {
      violations.push(
        `${sourceType}: mineralRate ${formatRate(
          actual.mineralRate,
        )} < ${formatRate(threshold.minMineralRate)}`,
      );
    }
    if (
      !Number.isFinite(actual.resolvableSourceCodeRate) ||
      actual.resolvableSourceCodeRate < 1
    ) {
      violations.push(
        `${sourceType}: sourceCode resolvable rate ${formatRate(
          actual.resolvableSourceCodeRate,
        )} < 1.000`,
      );
    }
  }

  for (const source of report.sources) {
    if (!(source.sourceType in NUTRITION_COVERAGE_THRESHOLDS)) {
      violations.push(`unknown source: ${source.sourceType}`);
    }
  }

  return violations;
}
