import {
  FEDIAF_2025_DOG_STANDARD_ENTRIES,
  FEDIAF_2025_DOG_STANDARD_VERSION,
} from '../../../src/application/nutrition-standard/fediaf-2025-dog.data';
import {
  auditFediaf2025DogStandardSnapshot,
  buildFediaf2025DogExpectedSummary,
  type Fediaf2025DogDatabaseSnapshot,
} from '../../../src/application/nutrition-standard/fediaf-2025-dog-audit';

function buildCompleteSnapshot(): Fediaf2025DogDatabaseSnapshot {
  return {
    version: {
      code: FEDIAF_2025_DOG_STANDARD_VERSION.code,
      standardCode: FEDIAF_2025_DOG_STANDARD_VERSION.standardCode,
      species: FEDIAF_2025_DOG_STANDARD_VERSION.species,
      importBatch: FEDIAF_2025_DOG_STANDARD_VERSION.importBatch,
      importStatus: FEDIAF_2025_DOG_STANDARD_VERSION.importStatus,
      isActive: FEDIAF_2025_DOG_STANDARD_VERSION.isActive,
    },
    nutrientCount: 46,
    entries: FEDIAF_2025_DOG_STANDARD_ENTRIES,
  };
}

describe('FEDIAF 2025 dog standard import audit', () => {
  it('builds the approved expected import summary', () => {
    const summary = buildFediaf2025DogExpectedSummary();

    expect(summary.nutrientCount).toBe(46);
    expect(summary.entryCount).toBe(1341);
    expect(summary.tableCounts).toEqual({
      'III-3a': 225,
      'III-3b': 225,
      'III-3c': 225,
      'VII-17a': 264,
      'VII-17b': 132,
      'VII-17c': 135,
      'VII-17d': 135,
    });
    expect(summary.sourceTypeCounts).toEqual({
      CORE_RECOMMENDATION: 675,
      ANNEX_7_8: 666,
    });
  });

  it('passes a complete snapshot imported from the seed data', () => {
    const report = auditFediaf2025DogStandardSnapshot(buildCompleteSnapshot());

    expect(report.ok).toBe(true);
    expect(report.failures).toHaveLength(0);
  });

  it('fails when a source table count is missing from the database snapshot', () => {
    const snapshot = buildCompleteSnapshot();
    snapshot.entries = snapshot.entries.filter(
      (entry) => entry.sourceTable !== 'VII-17d',
    );

    const report = auditFediaf2025DogStandardSnapshot(snapshot);

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      'Source table VII-17d has 0 entries; expected 135.',
    );
  });

  it('fails when a high-risk spot-check value does not match the seed source', () => {
    const snapshot = buildCompleteSnapshot();
    snapshot.entries = snapshot.entries.map((entry) =>
      entry.nutrientCode === 'vitaminD' &&
      entry.sourceTable === 'VII-17d' &&
      entry.lifeStage === 'ADULT_MER_95' &&
      entry.basis === 'PER_1000_KCAL_ME'
        ? { ...entry, minValue: 158 }
        : entry,
    );

    const report = auditFediaf2025DogStandardSnapshot(snapshot);

    expect(report.ok).toBe(false);
    expect(report.failures).toContain(
      'Spot check vitaminD|VII-17d|ADULT_MER_95|PER_1000_KCAL_ME|IU minValue is 158; expected 159.',
    );
  });
});
