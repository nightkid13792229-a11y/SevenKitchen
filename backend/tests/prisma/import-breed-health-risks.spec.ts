import {
  BREED_HEALTH_RISK_FIXTURE_SET,
  assertBreedHealthRiskImportTarget,
  buildBreedHealthRiskImportPlan,
  isLocalDatabaseUrl,
  resolveBreedHealthRiskDatabaseUrl,
  validateBreedHealthRiskFixtureSet,
} from '../../prisma/import-breed-health-risks.shared';

describe('breed health risk import fixtures', () => {
  const localBreeds = [
    { id: 'breed-labrador', name: '拉布拉多', aliases: ['拉拉', '拉布拉多犬'] },
    { id: 'breed-golden', name: '金毛', aliases: ['金毛犬', '金毛巡回猎犬'] },
    {
      id: 'breed-mini-schnauzer',
      name: '雪纳瑞(小型)',
      aliases: ['雪纳瑞', '小型雪纳瑞', '雪纳瑞（迷你）'],
    },
  ];

  it('keeps the starter knowledge base source-backed and publishable', () => {
    const errors = validateBreedHealthRiskFixtureSet(
      BREED_HEALTH_RISK_FIXTURE_SET,
    );

    expect(errors).toEqual([]);
    expect(BREED_HEALTH_RISK_FIXTURE_SET.risks.length).toBeGreaterThan(0);
    expect(
      BREED_HEALTH_RISK_FIXTURE_SET.risks.every(
        (risk) => risk.sources.length > 0,
      ),
    ).toBe(true);
  });

  it('uses user-facing health topic names in the starter knowledge base', () => {
    expect(
      BREED_HEALTH_RISK_FIXTURE_SET.conditions.find(
        (condition) => condition.key === 'cardiac-disease',
      )?.nameCn,
    ).toBe('心脏健康筛查');
  });

  it('includes source-backed cancer awareness for golden retrievers', () => {
    const cancerCondition = BREED_HEALTH_RISK_FIXTURE_SET.conditions.find(
      (condition) => condition.key === 'cancer-awareness',
    );
    const goldenCancerRisk = BREED_HEALTH_RISK_FIXTURE_SET.risks.find(
      (risk) =>
        risk.breedKey === 'golden-retriever' &&
        risk.conditionKey === 'cancer-awareness',
    );

    expect(cancerCondition?.nameCn).toBe('肿瘤相关关注');
    expect(goldenCancerRisk?.attentionPriority).toBe('KEY_ATTENTION');
    expect(
      goldenCancerRisk?.sources.map((source) => source.sourceName),
    ).toEqual(
      expect.arrayContaining([
        'Morris Golden Retriever Lifetime Study',
        'AKC Canine Health Foundation',
      ]),
    );
  });

  it('resolves local dog breed rows by name or alias before importing risks', () => {
    const plan = buildBreedHealthRiskImportPlan(
      BREED_HEALTH_RISK_FIXTURE_SET,
      localBreeds,
    );

    expect(plan.missingBreeds).toEqual([]);
    expect(plan.conditions).toHaveLength(
      BREED_HEALTH_RISK_FIXTURE_SET.conditions.length,
    );
    expect(plan.risks).toHaveLength(BREED_HEALTH_RISK_FIXTURE_SET.risks.length);
    expect(plan.sources).toBeGreaterThanOrEqual(plan.risks.length);
    expect(
      plan.risks.some((risk) => risk.breedId === 'breed-mini-schnauzer'),
    ).toBe(true);
  });

  it('blocks accidental writes to a remote database unless explicitly allowed', () => {
    expect(
      isLocalDatabaseUrl(
        'postgresql://postgres:postgres@localhost:5432/sevenkitchen',
      ),
    ).toBe(true);
    expect(
      isLocalDatabaseUrl(
        'postgresql://sevenkitchen:secret@prod-db.example.com:5432/app',
      ),
    ).toBe(false);

    expect(() =>
      assertBreedHealthRiskImportTarget({
        shouldApply: true,
        allowRemote: false,
        databaseUrl:
          'postgresql://sevenkitchen:secret@prod-db.example.com:5432/app',
      }),
    ).toThrow(
      /Refusing to apply breed health risk data to a non-local database/,
    );
  });

  it('uses the local development database URL when no environment value is provided', () => {
    expect(resolveBreedHealthRiskDatabaseUrl(undefined)).toBe(
      'postgresql://postgres:postgres@localhost:5432/sevenkitchen',
    );
  });
});
