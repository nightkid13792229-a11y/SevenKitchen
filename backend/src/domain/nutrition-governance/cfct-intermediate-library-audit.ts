export interface CfctIntermediateLibrarySourceSegment {
  kind?: string;
  page?: string | number;
  row?: string | number;
  nutrientKeys?: string[];
}

export interface CfctIntermediateLibraryRow {
  volume?: string | null;
  page?: string | number | null;
  row?: string | number | null;
  foodName?: string | null;
  foodCode?: string | null;
  nutrients?: Record<string, number | null | undefined>;
  qualityFlags?: string[];
  reviewStatus?: string | null;
  sourceSegments?: CfctIntermediateLibrarySourceSegment[];
}

export type CfctNutrientGroup =
  | 'macros'
  | 'minerals'
  | 'vitamins'
  | 'fattyAcids'
  | 'aminoAcids';

export interface CfctGroupCoverage {
  present: boolean;
  fieldCount: number;
  fields: string;
}

export interface CfctFoodCodeCoverageRow {
  volume: string;
  foodCode: string;
  foodName: string;
  firstPage: string;
  firstRow: string;
  rowCount: number;
  sourceSegmentCount: number;
  nutrientFieldCount: number;
  presentGroups: string;
  missingCoreGroups: string;
  qualityFlags: string;
  reviewStatus: string;
  coverage: Record<CfctNutrientGroup, CfctGroupCoverage>;
}

export interface CfctNoFoodCodeCoverageRow {
  volume: string;
  foodName: string;
  page: string;
  row: string;
  nutrientFieldCount: number;
  presentGroups: string;
  qualityFlags: string;
  reviewStatus: string;
}

export interface CfctIntermediateLibraryAuditSummary {
  totalRows: number;
  rowsWithFoodCode: number;
  rowsWithoutFoodCode: number;
  uniqueFoodCodeCount: number;
  autoStructuredRows: number;
  needsReviewRows: number;
  groupCoverageCounts: Record<CfctNutrientGroup, number>;
  qualityFlagCounts: Record<string, number>;
}

export interface CfctIntermediateLibraryAudit {
  summary: CfctIntermediateLibraryAuditSummary;
  foodCodeRows: CfctFoodCodeCoverageRow[];
  noFoodCodeRows: CfctNoFoodCodeCoverageRow[];
}

const GROUP_FIELDS: Record<CfctNutrientGroup, Set<string>> = {
  macros: new Set([
    'energyKcal',
    'moisture',
    'crudeProtein',
    'crudeFat',
    'ash',
    'carbohydrate',
    'fiber',
    'solubleFiber',
    'insolubleFiber',
  ]),
  minerals: new Set([
    'calcium',
    'phosphorus',
    'potassium',
    'sodium',
    'magnesium',
    'chloride',
    'iron',
    'zinc',
    'copper',
    'manganese',
    'selenium',
    'iodine',
  ]),
  vitamins: new Set([
    'vitaminA',
    'vitaminD',
    'vitaminE',
    'vitaminK',
    'vitaminB1',
    'vitaminB2',
    'vitaminB3',
    'vitaminB5',
    'vitaminB6',
    'vitaminB7',
    'vitaminB9',
    'vitaminB12',
    'choline',
    'vitaminC',
  ]),
  fattyAcids: new Set([
    'saturatedFattyAcids',
    'monounsaturatedFattyAcids',
    'polyunsaturatedFattyAcids',
    'linoleicAcid',
    'alphaLinolenicAcid',
    'arachidonicAcid',
    'epa',
    'dpa',
    'dha',
  ]),
  aminoAcids: new Set([
    'arginine',
    'lysine',
    'methionine',
    'cystine',
    'taurine',
    'tryptophan',
    'threonine',
    'leucine',
    'isoleucine',
    'valine',
    'phenylalanine',
    'tyrosine',
    'histidine',
    'glutamicAcid',
    'glycine',
    'proline',
  ]),
};

const GROUP_ORDER: CfctNutrientGroup[] = [
  'macros',
  'minerals',
  'vitamins',
  'fattyAcids',
  'aminoAcids',
];

export function buildCfctIntermediateLibraryAudit(
  rows: CfctIntermediateLibraryRow[],
): CfctIntermediateLibraryAudit {
  const foodCodeGroups = new Map<string, CfctIntermediateLibraryRow[]>();
  const noFoodCodeRows: CfctNoFoodCodeCoverageRow[] = [];
  const qualityFlagCounts: Record<string, number> = {};
  let rowsWithFoodCode = 0;
  let autoStructuredRows = 0;
  let needsReviewRows = 0;

  for (const row of rows) {
    if (row.reviewStatus === 'AUTO_STRUCTURED') autoStructuredRows += 1;
    if (row.reviewStatus === 'NEEDS_REVIEW') needsReviewRows += 1;
    for (const flag of row.qualityFlags ?? []) {
      qualityFlagCounts[flag] = (qualityFlagCounts[flag] ?? 0) + 1;
    }

    const foodCode = normalizeText(row.foodCode);
    const volume = normalizeText(row.volume);
    if (foodCode) {
      rowsWithFoodCode += 1;
      const key = `${volume}\u0000${foodCode}`;
      const existing = foodCodeGroups.get(key) ?? [];
      existing.push(row);
      foodCodeGroups.set(key, existing);
      continue;
    }

    const coverage = buildCoverage(row.nutrients ?? {});
    noFoodCodeRows.push({
      volume,
      foodName: normalizeText(row.foodName),
      page: stringifyCell(row.page),
      row: stringifyCell(row.row),
      nutrientFieldCount: countNutrientFields(row.nutrients ?? {}),
      presentGroups: formatPresentGroups(coverage),
      qualityFlags: formatList(row.qualityFlags ?? []),
      reviewStatus: normalizeText(row.reviewStatus),
    });
  }

  const foodCodeRows = Array.from(foodCodeGroups.values())
    .map(buildFoodCodeCoverageRow)
    .sort(compareFoodCodeRows);
  const groupCoverageCounts = initializeGroupCounts();
  for (const row of foodCodeRows) {
    for (const group of GROUP_ORDER) {
      if (row.coverage[group].present) {
        groupCoverageCounts[group] += 1;
      }
    }
  }

  return {
    summary: {
      totalRows: rows.length,
      rowsWithFoodCode,
      rowsWithoutFoodCode: rows.length - rowsWithFoodCode,
      uniqueFoodCodeCount: foodCodeRows.length,
      autoStructuredRows,
      needsReviewRows,
      groupCoverageCounts,
      qualityFlagCounts,
    },
    foodCodeRows,
    noFoodCodeRows,
  };
}

function buildFoodCodeCoverageRow(
  rows: CfctIntermediateLibraryRow[],
): CfctFoodCodeCoverageRow {
  const first = rows.slice().sort(compareRowsByLocation)[0] ?? {};
  const mergedNutrients = rows.reduce<Record<string, number | null | undefined>>(
    (result, row) => ({
      ...result,
      ...(row.nutrients ?? {}),
    }),
    {},
  );
  const coverage = buildCoverage(mergedNutrients);
  const qualityFlags = Array.from(
    new Set(rows.flatMap((row) => row.qualityFlags ?? [])),
  ).sort();
  const reviewStatuses = Array.from(
    new Set(rows.map((row) => normalizeText(row.reviewStatus)).filter(Boolean)),
  ).sort();

  return {
    volume: normalizeText(first.volume),
    foodCode: normalizeText(first.foodCode),
    foodName: normalizeText(first.foodName),
    firstPage: stringifyCell(first.page),
    firstRow: stringifyCell(first.row),
    rowCount: rows.length,
    sourceSegmentCount: rows.reduce(
      (count, row) => count + (row.sourceSegments?.length ?? 0),
      0,
    ),
    nutrientFieldCount: countNutrientFields(mergedNutrients),
    presentGroups: formatPresentGroups(coverage),
    missingCoreGroups: formatMissingGroups(coverage),
    qualityFlags: formatList(qualityFlags),
    reviewStatus: formatList(reviewStatuses),
    coverage,
  };
}

function buildCoverage(
  nutrients: Record<string, number | null | undefined>,
): Record<CfctNutrientGroup, CfctGroupCoverage> {
  return GROUP_ORDER.reduce(
    (result, group) => {
      const fields = Object.entries(nutrients)
        .filter(([key, value]) => GROUP_FIELDS[group].has(key) && isPresent(value))
        .map(([key]) => key)
        .sort();
      result[group] = {
        present: fields.length > 0,
        fieldCount: fields.length,
        fields: fields.join('; '),
      };
      return result;
    },
    {} as Record<CfctNutrientGroup, CfctGroupCoverage>,
  );
}

function countNutrientFields(
  nutrients: Record<string, number | null | undefined>,
): number {
  return Object.values(nutrients).filter(isPresent).length;
}

function isPresent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatPresentGroups(
  coverage: Record<CfctNutrientGroup, CfctGroupCoverage>,
): string {
  return GROUP_ORDER.filter((group) => coverage[group].present).join('; ');
}

function formatMissingGroups(
  coverage: Record<CfctNutrientGroup, CfctGroupCoverage>,
): string {
  return GROUP_ORDER.filter((group) => !coverage[group].present).join('; ');
}

function formatList(values: string[]): string {
  return values.filter(Boolean).join('; ');
}

function stringifyCell(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeText(value: string | number | null | undefined): string {
  return stringifyCell(value).trim();
}

function initializeGroupCounts(): Record<CfctNutrientGroup, number> {
  return {
    macros: 0,
    minerals: 0,
    vitamins: 0,
    fattyAcids: 0,
    aminoAcids: 0,
  };
}

function compareFoodCodeRows(
  left: CfctFoodCodeCoverageRow,
  right: CfctFoodCodeCoverageRow,
): number {
  const volumeDiff = left.volume.localeCompare(right.volume, 'zh-Hans-CN');
  if (volumeDiff !== 0) return volumeDiff;
  return left.foodCode.localeCompare(right.foodCode, 'zh-Hans-CN');
}

function compareRowsByLocation(
  left: CfctIntermediateLibraryRow,
  right: CfctIntermediateLibraryRow,
): number {
  const leftPage = Number(left.page ?? Number.MAX_SAFE_INTEGER);
  const rightPage = Number(right.page ?? Number.MAX_SAFE_INTEGER);
  if (leftPage !== rightPage) return leftPage - rightPage;
  return Number(left.row ?? Number.MAX_SAFE_INTEGER) -
    Number(right.row ?? Number.MAX_SAFE_INTEGER);
}
