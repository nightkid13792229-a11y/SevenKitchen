export type PackagePlanRow = {
  packageSpecG: number;
  packageCount: number;
};

export type LabelPrintFields = {
  labelItemId: string;
  sourceOrderItemId: string;
  sourceOrderIndex: number;
  packageLabelIndex: number;
  packageLabelCount: number;
  packageLabelTitle: string;
  packageTotalWeightG: number;
  isSplitPackageLabel: boolean;
};

type PackagePrintable = {
  orderItemId?: string;
  orderId?: string;
  packageSpecG?: number;
  packageCount?: number;
  packagePlan?: PackagePlanRow[];
};

export function normalizePackagePlanRows(
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
): PackagePlanRow[] {
  return (packagePlan || [])
    .map((row) => {
      const packageSpecG = Math.floor(Number(row?.packageSpecG));
      const packageCount = Math.floor(Number(row?.packageCount));
      if (!Number.isFinite(packageSpecG) || !Number.isFinite(packageCount) || packageSpecG <= 0 || packageCount <= 0) {
        return null;
      }
      return { packageSpecG, packageCount };
    })
    .filter((row): row is PackagePlanRow => row !== null);
}

export function formatPackagePlan(item: PackagePrintable): string {
  const packagePlanRows = normalizePackagePlanRows(item.packagePlan)
    .map((row) => formatPackagePlanRow(row));

  if (packagePlanRows.length > 0) {
    return packagePlanRows.join('，');
  }

  return `${item.packageSpecG || 0}g×${item.packageCount || 0}袋`;
}

export function getPackagePlanTotalWeight(item: PackagePrintable): number {
  const packagePlanRows = normalizePackagePlanRows(item.packagePlan);

  if (packagePlanRows.length > 0) {
    return packagePlanRows.reduce((sum, row) => sum + row.packageSpecG * row.packageCount, 0);
  }

  return Number(item.packageSpecG || 0) * Number(item.packageCount || 0);
}

export function expandOrderPrintLabels<T extends PackagePrintable>(
  items: T[],
): Array<T & LabelPrintFields> {
  return items.flatMap((item, sourceOrderIndex) => expandOrderPrintLabelItem(item, sourceOrderIndex));
}

export function expandOrderPrintLabelItem<T extends PackagePrintable>(
  item: T,
  sourceOrderIndex = 0,
): Array<T & LabelPrintFields> {
  const packagePlanRows = normalizePackagePlanRows(item.packagePlan);

  if (packagePlanRows.length === 0) {
    const fallbackRow = {
      packageSpecG: Number(item.packageSpecG || 0),
      packageCount: Number(item.packageCount || 0),
    };
    return [
      {
        ...item,
        packagePlan: [],
        sourceOrderItemId: item.orderItemId || '',
        sourceOrderIndex,
        packageLabelIndex: 0,
        packageLabelCount: 1,
        packageLabelTitle: formatPackagePlanRow(fallbackRow),
        packageTotalWeightG: fallbackRow.packageSpecG * fallbackRow.packageCount,
        isSplitPackageLabel: false,
        labelItemId: buildLabelItemId(item, fallbackRow, 0),
      },
    ];
  }

  return packagePlanRows.map((row, packageLabelIndex) => ({
    ...item,
    packagePlan: [row],
    packageSpecG: row.packageSpecG,
    packageCount: row.packageCount,
    sourceOrderItemId: item.orderItemId || '',
    sourceOrderIndex,
    packageLabelIndex,
    packageLabelCount: packagePlanRows.length,
    packageLabelTitle: formatPackagePlanRow(row),
    packageTotalWeightG: row.packageSpecG * row.packageCount,
    isSplitPackageLabel: packagePlanRows.length > 1,
    labelItemId: buildLabelItemId(item, row, packageLabelIndex),
  }));
}

function formatPackagePlanRow(row: PackagePlanRow): string {
  return `${row.packageSpecG}g×${row.packageCount}袋`;
}

function buildLabelItemId(item: PackagePrintable, row: PackagePlanRow, index: number): string {
  const sourceId = item.orderItemId || item.orderId || 'order';
  return `${sourceId}:label-${index}-${row.packageSpecG}g-${row.packageCount}`;
}
