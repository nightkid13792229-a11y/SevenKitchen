import type { NameClassification } from '../../../src/application/ingredient-creation/ingredient-name-classifier.service';
import {
  buildClassificationListing,
  buildClassificationNarrowing,
  resolveClassificationGroupScope,
} from '../../../src/application/ingredient-creation/ingredient-name-narrowing';

const NAMES = [
  { id: 'r1', name: 'Beef, ground, raw', sourceType: 'USDA_FDC' },
  { id: 'r2', name: 'Beef, ground, cooked', sourceType: 'USDA_FDC' },
  { id: 'r3', name: 'Beef, chuck, raw', sourceType: 'USDA_FDC' },
  { id: 'r4', name: '牛バラ肉 蒸し焼き', sourceType: 'CFCT' },
  { id: 'r5', name: 'Beef, brisket, raw', sourceType: 'USDA_FDC' },
  { id: 'r6', name: 'Beef, rib, raw', sourceType: 'USDA_FDC' },
];

function classification(
  id: string,
  overrides: Partial<NameClassification> = {},
): NameClassification {
  return {
    id,
    state: 'RAW',
    method: 'NONE',
    cutLabel: '牛绞肉',
    cutGroup: 'ground',
    evidence: 'ground',
    confidence: 0.9,
    ...overrides,
  };
}

function results(): NameClassification[] {
  return [
    classification('r1'),
    classification('r2', {
      state: 'COOKED',
      method: 'BOILED',
      cutLabel: '牛绞肉',
      evidence: 'cooked',
    }),
    classification('r3', {
      cutLabel: '牛肩',
      cutGroup: 'chuck',
      evidence: 'chuck',
    }),
    classification('r4', {
      state: 'COOKED',
      method: 'STEAMED',
      cutLabel: '牛腩',
      cutGroup: 'brisket',
      evidence: '蒸し焼き',
    }),
    classification('r5', {
      cutLabel: '牛腩',
      cutGroup: 'brisket',
      evidence: 'brisket',
    }),
    classification('r6', {
      cutLabel: '牛肋排',
      cutGroup: 'rib',
      evidence: 'rib',
    }),
  ];
}

describe('AI 分类驱动的收窄', () => {
  it('未指定状态：用真实统计发问，选项带条数，且「生 + 熟都要」是合法选项', () => {
    const built = buildClassificationNarrowing({
      keyword: '牛肉',
      names: NAMES,
      classifications: results(),
      stateSpecified: false,
    });

    expect(built.selectedStates).toEqual([]);
    expect(built.narrowing.required).toBe(true);
    expect(built.narrowing.kind).toBe('STATE');
    expect(built.narrowing.question).toContain('共 6 条');
    expect(built.narrowing.question).toContain('生 4 条');
    expect(built.narrowing.question).toContain('熟 2 条');
    expect(built.narrowing.question).toContain('水煮 1 条');
    expect(built.narrowing.question).toContain('蒸 1 条');
    expect(built.narrowing.question).toContain('绞肉');
    expect(built.narrowing.options).toEqual([
      '生（4 条）',
      '熟（2 条）',
      '生 + 熟都要（6 条）',
    ]);
    expect(built.narrowing.choices[2]).toMatchObject({
      kind: 'STATE',
      key: 'RAW+COOKED',
      states: ['RAW', 'COOKED'],
      count: 6,
    });
    expect(built.narrowing.stats?.total).toBe(6);
    expect(built.narrowing.stats?.byState).toEqual({
      RAW: 4,
      COOKED: 2,
      UNKNOWN: 0,
    });
  });

  it('已选「生 + 熟都要」：按部位发收窄问句，选组前不列具体词条', () => {
    const built = buildClassificationNarrowing({
      keyword: '牛肉',
      names: NAMES,
      classifications: results(),
      stateSpecified: true,
      states: ['RAW', 'COOKED'],
    });

    expect(built.selectedStates).toEqual(['RAW', 'COOKED']);
    expect(built.selectedGroupKey).toBe(null);
    expect(built.narrowing.required).toBe(true);
    expect(built.narrowing.kind).toBe('GROUP');
    expect(built.narrowing.options).toEqual([
      '绞肉（2 条）',
      '腩（2 条）',
      '肩（1 条）',
      '肋排（1 条）',
    ]);
    expect(built.narrowing.options.join('')).not.toContain('Beef');
  });

  it('选组后不再收窄，并把该组词条筛出来', () => {
    const built = buildClassificationNarrowing({
      keyword: '牛肉',
      names: NAMES,
      classifications: results(),
      stateSpecified: true,
      states: ['RAW', 'COOKED'],
      groupKey: 'ground',
    });

    expect(built.narrowing.required).toBe(false);
    expect(built.selectedGroupKey).toBe('ground');
    const scoped = resolveClassificationGroupScope({
      names: NAMES,
      classifications: results(),
      groups: built.narrowing.stats?.cutGroups ?? [],
      groupKey: 'ground',
    });
    expect(scoped.map((entry) => entry.name.id)).toEqual(['r1', 'r2']);
  });

  it('全部 UNKNOWN 时不硬问生熟：返回不收窄，交给调用方列名字', () => {
    const built = buildClassificationNarrowing({
      keyword: '牛肉',
      names: NAMES.slice(0, 3),
      classifications: NAMES.slice(0, 3).map((name) =>
        classification(name.id, {
          state: 'UNKNOWN',
          method: 'NONE',
          cutLabel: null,
          cutGroup: null,
          evidence: null,
        }),
      ),
      stateSpecified: false,
    });

    expect(built.narrowing.required).toBe(false);
    expect(built.narrowing.options).toEqual([]);
    expect(built.narrowing.stats?.byState.UNKNOWN).toBe(3);
  });

  it('收窄后的词条选项 ≤5 条 + 最后一条「都不对，我直接说」，带 AI 分类', () => {
    const listing = buildClassificationListing({
      title: '「牛肉·生 + 熟」',
      items: NAMES.map((name, index) => ({
        name,
        classification: results()[index]!,
        coveragePercent: 80,
        verdict: 'RELEVANT',
        reason: '就是牛肉',
      })),
      maxEntries: 5,
    });

    expect(listing.entries).toHaveLength(5);
    expect(listing.options).toHaveLength(6);
    expect(listing.options.at(-1)).toBe('都不对，我直接说');
    expect(listing.options[0]).toContain('Beef, ground, raw');
    expect(listing.options[0]).toContain('来源 USDA_FDC');
    expect(listing.options[0]).toContain('覆盖率 80%');
    expect(listing.entries[0]?.classification).toMatchObject({
      state: 'RAW',
      cutGroup: 'ground',
      evidence: 'ground',
    });
  });

  it('选熟之后部位条数只统计熟词条，不把生词条的部位数混进来', () => {
    const names = [
      { id: 'r1', name: 'Beef, ground, raw 1', sourceType: 'USDA_FDC' },
      { id: 'r2', name: 'Beef, ground, raw 2', sourceType: 'USDA_FDC' },
      { id: 'r3', name: 'Beef, ground, cooked', sourceType: 'USDA_FDC' },
      { id: 'r4', name: 'Beef, chuck, cooked 1', sourceType: 'USDA_FDC' },
      { id: 'r5', name: 'Beef, chuck, cooked 2', sourceType: 'USDA_FDC' },
      { id: 'r6', name: 'Beef, chuck, cooked 3', sourceType: 'USDA_FDC' },
      { id: 'r7', name: 'Beef, chuck, cooked 4', sourceType: 'USDA_FDC' },
      { id: 'r8', name: 'Beef, chuck, cooked 5', sourceType: 'USDA_FDC' },
    ]
    const classifications = [
      classification('r1', { cutGroup: 'ground', evidence: 'ground' }),
      classification('r2', { cutGroup: 'ground', evidence: 'ground' }),
      classification('r3', {
        state: 'COOKED',
        method: 'BOILED',
        cutGroup: 'ground',
        evidence: 'cooked',
      }),
      classification('r4', {
        state: 'COOKED',
        method: 'BOILED',
        cutGroup: 'chuck',
        evidence: 'cooked',
      }),
      classification('r5', {
        state: 'COOKED',
        method: 'BOILED',
        cutGroup: 'chuck',
        evidence: 'cooked',
      }),
      classification('r6', {
        state: 'COOKED',
        method: 'BOILED',
        cutGroup: 'chuck',
        evidence: 'cooked',
      }),
      classification('r7', {
        state: 'COOKED',
        method: 'BOILED',
        cutGroup: 'chuck',
        evidence: 'cooked',
      }),
      classification('r8', {
        state: 'COOKED',
        method: 'BOILED',
        cutGroup: 'chuck',
        evidence: 'cooked',
      }),
    ]

    const built = buildClassificationNarrowing({
      keyword: '牛肉',
      names,
      classifications,
      stateSpecified: true,
      states: ['COOKED'],
    });

    expect(built.narrowing.kind).toBe('GROUP');
    expect(built.narrowing.options).toEqual(['肩（5 条）', '绞肉（1 条）']);
    expect(built.narrowing.question).toContain('熟 6 条');
    expect(built.narrowing.question).toContain('肩 5 条');
    expect(built.narrowing.question).not.toContain('绞肉 3 条');
    expect(built.narrowing.groups).toEqual([
      { key: 'chuck', label: '肩', count: 5, states: ['COOKED'] },
      { key: 'ground', label: '绞肉', count: 1, states: ['COOKED'] },
    ]);
  })

});
