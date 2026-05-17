import {
  FEDIAF_2025_DOG_NUTRIENTS,
  FEDIAF_2025_DOG_STANDARD_ENTRIES,
  FEDIAF_2025_DOG_STANDARD_VERSION,
  type FediafStandardEntrySeed,
} from './fediaf-2025-dog.data';

type VersionSnapshot = Pick<
  typeof FEDIAF_2025_DOG_STANDARD_VERSION,
  | 'code'
  | 'standardCode'
  | 'species'
  | 'importBatch'
  | 'importStatus'
  | 'isActive'
>;

export type Fediaf2025DogAuditEntry = Pick<
  FediafStandardEntrySeed,
  | 'nutrientCode'
  | 'sourceTable'
  | 'sourceType'
  | 'pdfPage'
  | 'species'
  | 'lifeStage'
  | 'basis'
  | 'unit'
  | 'minValue'
  | 'maxValue'
  | 'recommendedValue'
  | 'maxType'
>;

export interface Fediaf2025DogDatabaseSnapshot {
  version: VersionSnapshot | null;
  nutrientCount: number;
  entries: Fediaf2025DogAuditEntry[];
}

export interface Fediaf2025DogExpectedSummary {
  nutrientCount: number;
  entryCount: number;
  tableCounts: Record<string, number>;
  sourceTypeCounts: Record<string, number>;
  basisCounts: Record<string, number>;
  lifeStageCounts: Record<string, number>;
}

export interface Fediaf2025DogAuditReport {
  ok: boolean;
  summary: Fediaf2025DogExpectedSummary;
  failures: string[];
}

type SpotCheck = {
  nutrientCode: string;
  sourceTable: string;
  lifeStage: string;
  basis: string;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  recommendedValue: number | null;
  maxType: string;
};

const EXPECTED_SOURCE_TABLES = [
  'III-3a',
  'III-3b',
  'III-3c',
  'VII-17a',
  'VII-17b',
  'VII-17c',
  'VII-17d',
] as const;

const EXPECTED_SOURCE_TYPES = ['CORE_RECOMMENDATION', 'ANNEX_7_8'] as const;

const EXPECTED_BASES = [
  'PER_100G_DRY_MATTER',
  'PER_1000_KCAL_ME',
  'PER_MJ_ME',
] as const;

const EXPECTED_LIFE_STAGES = [
  'ADULT_MER_95',
  'ADULT_MER_110',
  'EARLY_GROWTH_UNDER_14_WEEKS',
  'REPRODUCTION',
  'LATE_GROWTH_FROM_14_WEEKS',
] as const;

const EXPECTED_PAGES_BY_TABLE: Record<string, number> = {
  'III-3a': 15,
  'III-3b': 16,
  'III-3c': 17,
  'VII-17a': 73,
  'VII-17b': 74,
  'VII-17c': 75,
  'VII-17d': 76,
};

const EXPECTED_SOURCE_TYPE_BY_TABLE: Record<string, string> = {
  'III-3a': 'CORE_RECOMMENDATION',
  'III-3b': 'CORE_RECOMMENDATION',
  'III-3c': 'CORE_RECOMMENDATION',
  'VII-17a': 'ANNEX_7_8',
  'VII-17b': 'ANNEX_7_8',
  'VII-17c': 'ANNEX_7_8',
  'VII-17d': 'ANNEX_7_8',
};

export const FEDIAF_2025_DOG_AUDIT_SPOT_CHECKS: SpotCheck[] = [
  {
    nutrientCode: 'calcium',
    sourceTable: 'VII-17b',
    lifeStage: 'LATE_GROWTH_FROM_14_WEEKS',
    basis: 'PER_1000_KCAL_ME',
    unit: 'g',
    minValue: 2,
    maxValue: 4.5,
    recommendedValue: 2.5,
    maxType: 'NUTRITIONAL_MAX',
  },
  {
    nutrientCode: 'calciumPhosphorusRatio',
    sourceTable: 'VII-17d',
    lifeStage: 'ADULT_MER_95',
    basis: 'PER_1000_KCAL_ME',
    unit: 'ratio',
    minValue: 1,
    maxValue: 2,
    recommendedValue: null,
    maxType: 'NUTRITIONAL_MAX',
  },
  {
    nutrientCode: 'vitaminD',
    sourceTable: 'VII-17d',
    lifeStage: 'ADULT_MER_95',
    basis: 'PER_1000_KCAL_ME',
    unit: 'IU',
    minValue: 159,
    maxValue: 800,
    recommendedValue: null,
    maxType: 'NUTRITIONAL_MAX',
  },
  {
    nutrientCode: 'iodine',
    sourceTable: 'VII-17c',
    lifeStage: 'ADULT_MER_110',
    basis: 'PER_1000_KCAL_ME',
    unit: 'mg',
    minValue: 0.26,
    maxValue: null,
    recommendedValue: null,
    maxType: 'LEGAL_MAX',
  },
  {
    nutrientCode: 'epaDha',
    sourceTable: 'VII-17d',
    lifeStage: 'ADULT_MER_95',
    basis: 'PER_1000_KCAL_ME',
    unit: 'g',
    minValue: null,
    maxValue: null,
    recommendedValue: null,
    maxType: 'UNSPECIFIED',
  },
];

function createEmptyCounts(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function summarizeEntries(
  entries: ReadonlyArray<Fediaf2025DogAuditEntry>,
): Omit<Fediaf2025DogExpectedSummary, 'nutrientCount' | 'entryCount'> {
  const tableCounts = createEmptyCounts(EXPECTED_SOURCE_TABLES);
  const sourceTypeCounts = createEmptyCounts(EXPECTED_SOURCE_TYPES);
  const basisCounts = createEmptyCounts(EXPECTED_BASES);
  const lifeStageCounts = createEmptyCounts(EXPECTED_LIFE_STAGES);

  for (const entry of entries) {
    increment(tableCounts, entry.sourceTable);
    increment(sourceTypeCounts, entry.sourceType);
    increment(basisCounts, entry.basis);
    increment(lifeStageCounts, entry.lifeStage);
  }

  return {
    tableCounts,
    sourceTypeCounts,
    basisCounts,
    lifeStageCounts,
  };
}

export function buildFediaf2025DogExpectedSummary(): Fediaf2025DogExpectedSummary {
  return {
    nutrientCount: FEDIAF_2025_DOG_NUTRIENTS.length,
    entryCount: FEDIAF_2025_DOG_STANDARD_ENTRIES.length,
    ...summarizeEntries(FEDIAF_2025_DOG_STANDARD_ENTRIES),
  };
}

function formatValue(value: number | string | boolean | null): string {
  return value === null ? 'null' : String(value);
}

function valuesMatch(
  actual: number | string | boolean | null,
  expected: number | string | boolean | null,
): boolean {
  return actual === expected;
}

function identity(entry: {
  nutrientCode: string;
  sourceTable: string;
  lifeStage: string;
  basis: string;
  unit: string;
}): string {
  return [
    entry.nutrientCode,
    entry.sourceTable,
    entry.lifeStage,
    entry.basis,
    entry.unit,
  ].join('|');
}

function compareField(
  failures: string[],
  spotIdentity: string,
  fieldName: keyof Pick<
    SpotCheck,
    'minValue' | 'maxValue' | 'recommendedValue' | 'maxType'
  >,
  actual: number | string | null,
  expected: number | string | null,
) {
  if (!valuesMatch(actual, expected)) {
    failures.push(
      `Spot check ${spotIdentity} ${fieldName} is ${formatValue(
        actual,
      )}; expected ${formatValue(expected)}.`,
    );
  }
}

export function auditFediaf2025DogStandardSnapshot(
  snapshot: Fediaf2025DogDatabaseSnapshot,
): Fediaf2025DogAuditReport {
  const expected = buildFediaf2025DogExpectedSummary();
  const actual = {
    nutrientCount: snapshot.nutrientCount,
    entryCount: snapshot.entries.length,
    ...summarizeEntries(snapshot.entries),
  };
  const failures: string[] = [];

  if (!snapshot.version) {
    failures.push('Version FEDIAF_2025_DOG is missing.');
  } else {
    for (const key of [
      'code',
      'standardCode',
      'species',
      'importBatch',
      'importStatus',
      'isActive',
    ] as const) {
      if (
        !valuesMatch(
          snapshot.version[key],
          FEDIAF_2025_DOG_STANDARD_VERSION[key],
        )
      ) {
        failures.push(
          `Version ${key} is ${formatValue(
            snapshot.version[key],
          )}; expected ${formatValue(FEDIAF_2025_DOG_STANDARD_VERSION[key])}.`,
        );
      }
    }
  }

  if (actual.nutrientCount !== expected.nutrientCount) {
    failures.push(
      `Nutrient definition count is ${actual.nutrientCount}; expected ${expected.nutrientCount}.`,
    );
  }

  if (actual.entryCount !== expected.entryCount) {
    failures.push(
      `Standard entry count is ${actual.entryCount}; expected ${expected.entryCount}.`,
    );
  }

  for (const table of EXPECTED_SOURCE_TABLES) {
    if (actual.tableCounts[table] !== expected.tableCounts[table]) {
      failures.push(
        `Source table ${table} has ${actual.tableCounts[table]} entries; expected ${expected.tableCounts[table]}.`,
      );
    }
  }

  for (const sourceType of EXPECTED_SOURCE_TYPES) {
    if (
      actual.sourceTypeCounts[sourceType] !==
      expected.sourceTypeCounts[sourceType]
    ) {
      failures.push(
        `Source type ${sourceType} has ${actual.sourceTypeCounts[sourceType]} entries; expected ${expected.sourceTypeCounts[sourceType]}.`,
      );
    }
  }

  for (const basis of EXPECTED_BASES) {
    if (actual.basisCounts[basis] !== expected.basisCounts[basis]) {
      failures.push(
        `Basis ${basis} has ${actual.basisCounts[basis]} entries; expected ${expected.basisCounts[basis]}.`,
      );
    }
  }

  for (const lifeStage of EXPECTED_LIFE_STAGES) {
    if (
      actual.lifeStageCounts[lifeStage] !== expected.lifeStageCounts[lifeStage]
    ) {
      failures.push(
        `Life stage ${lifeStage} has ${actual.lifeStageCounts[lifeStage]} entries; expected ${expected.lifeStageCounts[lifeStage]}.`,
      );
    }
  }

  for (const entry of snapshot.entries) {
    const expectedPage = EXPECTED_PAGES_BY_TABLE[entry.sourceTable];
    if (expectedPage !== undefined && entry.pdfPage !== expectedPage) {
      failures.push(
        `Entry ${identity(entry)} pdfPage is ${entry.pdfPage}; expected ${expectedPage}.`,
      );
    }

    const expectedSourceType = EXPECTED_SOURCE_TYPE_BY_TABLE[entry.sourceTable];
    if (
      expectedSourceType !== undefined &&
      entry.sourceType !== expectedSourceType
    ) {
      failures.push(
        `Entry ${identity(entry)} sourceType is ${entry.sourceType}; expected ${expectedSourceType}.`,
      );
    }

    if (entry.species !== FEDIAF_2025_DOG_STANDARD_VERSION.species) {
      failures.push(
        `Entry ${identity(entry)} species is ${entry.species}; expected ${FEDIAF_2025_DOG_STANDARD_VERSION.species}.`,
      );
    }
  }

  const entriesByIdentity = new Map(
    snapshot.entries.map((entry) => [identity(entry), entry]),
  );
  for (const spotCheck of FEDIAF_2025_DOG_AUDIT_SPOT_CHECKS) {
    const spotIdentity = identity(spotCheck);
    const entry = entriesByIdentity.get(spotIdentity);
    if (!entry) {
      failures.push(`Spot check ${spotIdentity} is missing.`);
      continue;
    }
    compareField(
      failures,
      spotIdentity,
      'minValue',
      entry.minValue,
      spotCheck.minValue,
    );
    compareField(
      failures,
      spotIdentity,
      'maxValue',
      entry.maxValue,
      spotCheck.maxValue,
    );
    compareField(
      failures,
      spotIdentity,
      'recommendedValue',
      entry.recommendedValue,
      spotCheck.recommendedValue,
    );
    compareField(
      failures,
      spotIdentity,
      'maxType',
      entry.maxType,
      spotCheck.maxType,
    );
  }

  return {
    ok: failures.length === 0,
    summary: expected,
    failures,
  };
}
