import { BadRequestException } from '@nestjs/common';

export interface OrderPackagePlanItem {
  packageSpecG: number;
  packageCount: number;
}

export interface OrderPackagePlanSummary {
  totalQuantityG: number;
  totalPackageCount: number;
  primaryPackageSpecG: number;
  packageSpecSummary: string;
}

export function normalizePackagePlan(
  input: Array<Partial<OrderPackagePlanItem>> | null | undefined,
): OrderPackagePlanItem[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new BadRequestException('packagePlan must contain at least one row');
  }

  return input.map((row, index) => {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) {
      throw new BadRequestException(
        `packagePlan[${index}] must be an object with packageSpecG and packageCount`,
      );
    }

    const packageSpecG = Math.floor(Number(row.packageSpecG));
    const packageCount = Math.floor(Number(row.packageCount));

    if (!Number.isFinite(packageSpecG) || packageSpecG < 1) {
      throw new BadRequestException(
        `packagePlan[${index}].packageSpecG must be >= 1`,
      );
    }

    if (!Number.isFinite(packageCount) || packageCount < 1) {
      throw new BadRequestException(
        `packagePlan[${index}].packageCount must be >= 1`,
      );
    }

    return { packageSpecG, packageCount };
  });
}

/**
 * 把相同规格的分装行合并成一行。
 *
 * 试吃装由多道菜组成，若各道菜规格相同（例如每道都是 2 袋 × 80g），
 * 合并后包材只按一个规格档去选袋子，而不是按 5 道菜分别选。
 * 不同规格的行按原有顺序保留。
 */
export function mergePackagePlanRows(
  rows: OrderPackagePlanItem[],
): OrderPackagePlanItem[] {
  const merged = new Map<number, number>();
  const order: number[] = [];

  for (const row of rows) {
    const existing = merged.get(row.packageSpecG);
    if (existing === undefined) {
      merged.set(row.packageSpecG, row.packageCount);
      order.push(row.packageSpecG);
      continue;
    }
    merged.set(row.packageSpecG, existing + row.packageCount);
  }

  return order.map((packageSpecG) => ({
    packageSpecG,
    packageCount: merged.get(packageSpecG)!,
  }));
}

export function summarizePackagePlan(
  packagePlan: OrderPackagePlanItem[],
): OrderPackagePlanSummary {
  const totalQuantityG = packagePlan.reduce(
    (sum, row) => sum + row.packageSpecG * row.packageCount,
    0,
  );
  const totalPackageCount = packagePlan.reduce(
    (sum, row) => sum + row.packageCount,
    0,
  );
  const largestRow = [...packagePlan].sort(
    (left, right) =>
      right.packageCount - left.packageCount ||
      right.packageSpecG - left.packageSpecG,
  )[0];

  return {
    totalQuantityG,
    totalPackageCount,
    primaryPackageSpecG: largestRow.packageSpecG,
    packageSpecSummary: packagePlan
      .map((row) => `${row.packageSpecG}g×${row.packageCount}袋`)
      .join('，'),
  };
}

export function estimatePackagePlanDays(
  totalQuantityG: number,
  dailyIntakeG: number | null | undefined,
): number | null {
  if (
    typeof dailyIntakeG !== 'number' ||
    !Number.isFinite(dailyIntakeG) ||
    dailyIntakeG <= 0
  ) {
    return null;
  }

  return Math.round((totalQuantityG / dailyIntakeG) * 10) / 10;
}
