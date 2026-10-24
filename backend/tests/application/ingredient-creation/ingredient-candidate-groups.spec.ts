import {
  CANDIDATE_GROUP_FALLBACK_OPTION,
  buildCandidateGroupListing,
  buildCandidateGroups,
  buildCandidateNarrowing,
  candidatePartGroupKey,
  resolveCandidateGroupScope,
  type CandidateGroupCandidate,
} from '../../../src/application/ingredient-creation/ingredient-candidate-groups';

function candidate(
  id: string,
  foodName: string,
  options: Partial<CandidateGroupCandidate> = {},
): CandidateGroupCandidate {
  return {
    sourceRecordId: id,
    sourceType: 'USDA_FDC',
    foodName,
    foodNameEn: foodName,
    preparationState: 'RAW',
    coveragePercent: 80,
    review: { verdict: 'RELEVANT', reason: '就是牛肉' },
    ...options,
  };
}

function beefRows(): CandidateGroupCandidate[] {
  return [
    ...Array.from({ length: 6 }, (_, index) =>
      candidate(`ground-${index}`, `Beef, ground, raw ${index + 1}`),
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      candidate(`tenderloin-${index}`, `Beef, tenderloin, raw ${index + 1}`),
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      candidate(`brisket-${index}`, `Beef, brisket, raw ${index + 1}`),
    ),
  ];
}

describe('候选部位分组', () => {
  it('按候选名识别部位：ground / tenderloin / round / brisket / shank / rib / chuck / sandwich', () => {
    expect(candidatePartGroupKey('Beef, ground, raw')).toBe('ground');
    expect(candidatePartGroupKey('Beef, tenderloin, raw')).toBe('tenderloin');
    expect(candidatePartGroupKey('Beef, round, raw')).toBe('round');
    expect(candidatePartGroupKey('Beef, brisket, raw')).toBe('brisket');
    expect(candidatePartGroupKey('Beef, shank, raw')).toBe('shank');
    expect(candidatePartGroupKey('Beef, rib, raw')).toBe('rib');
    expect(candidatePartGroupKey('Beef, chuck, raw')).toBe('chuck');
    expect(candidatePartGroupKey('Beef, sandwich steak, raw')).toBe('sandwich');
    // 没有部位词的名字进「其他部位」，不能硬套规则。
    expect(candidatePartGroupKey('Beef, liver, raw')).toBe('other');
  });

  it('ground 不能被 round 抢走：按整词匹配，不做子串匹配', () => {
    expect(candidatePartGroupKey('Ground beef, raw')).toBe('ground');
    expect(candidatePartGroupKey('Beef, round, raw')).toBe('round');
    expect(candidatePartGroupKey('Beef, ground round, raw')).toBe('ground');
  });

  it('11 条相关跨 3 组：每组给组名 + 条数，顺序按条数从多到少', () => {
    const groups = buildCandidateGroups(beefRows(), { keyword: '牛肉' });

    expect(groups).toEqual([
      {
        key: 'ground',
        label: '牛绞肉',
        count: 6,
        states: ['RAW'],
      },
      {
        key: 'tenderloin',
        label: '牛里脊',
        count: 3,
        states: ['RAW'],
      },
      {
        key: 'brisket',
        label: '牛腩',
        count: 2,
        states: ['RAW'],
      },
    ]);
  });

  it('「其他部位」永远排在最后', () => {
    const groups = buildCandidateGroups(
      [
        candidate('other-1', 'Beef, liver, raw'),
        candidate('other-2', 'Beef, heart, raw'),
        candidate('ground-1', 'Beef, ground, raw'),
      ],
      { keyword: '牛肉' },
    );

    expect(groups.map((group) => group.key)).toEqual(['ground', 'other']);
    expect(groups[1]).toMatchObject({ label: '其他部位', count: 2 });
  });

  it('11 条相关跨 3 组时先生成收窄问题：选项是组名 + 条数，不列词条', () => {
    const candidates = beefRows();
    const narrowing = buildCandidateNarrowing({
      keyword: '牛肉',
      state: 'RAW',
      stateSpecified: true,
      totalCandidates: 50,
      relevantCount: 11,
      candidates,
    });

    expect(narrowing.required).toBe(true);
    expect(narrowing.kind).toBe('GROUP');
    expect(narrowing.reason).toBe('MULTIPLE_GROUPS');
    expect(narrowing.options).toEqual([
      '牛绞肉（6 条）',
      '牛里脊（3 条）',
      '牛腩（2 条）',
    ]);
    expect(narrowing.options).toHaveLength(3);
    expect(narrowing.choices).toEqual([
      { kind: 'GROUP', key: 'ground', label: '牛绞肉', count: 6 },
      { kind: 'GROUP', key: 'tenderloin', label: '牛里脊', count: 3 },
      { kind: 'GROUP', key: 'brisket', label: '牛腩', count: 2 },
    ]);
    expect(narrowing.question).toContain('11 条相关');
    expect(narrowing.question).toContain('部位');
    // 收窄问题本身不能出现具体词条。
    expect(narrowing.options.join('')).not.toContain('Beef');
  });

  it('用户没指定生熟时，收窄问题必须包含「生 / 熟」', () => {
    const narrowing = buildCandidateNarrowing({
      keyword: '牛肉',
      state: 'RAW',
      stateSpecified: false,
      totalCandidates: 50,
      relevantCount: 11,
      candidates: beefRows(),
    });

    expect(narrowing.required).toBe(true);
    expect(narrowing.kind).toBe('STATE');
    expect(narrowing.reason).toBe('STATE_UNSPECIFIED');
    expect(narrowing.question).toContain('生');
    expect(narrowing.question).toContain('熟');
    expect(narrowing.options).toEqual(['生（查生档案）', '熟（查熟档案）']);
    expect(narrowing.choices.map((choice) => choice.state)).toEqual([
      'RAW',
      'COOKED',
    ]);
  });

  it('候选同时跨生 / 熟时也要先收窄状态', () => {
    const narrowing = buildCandidateNarrowing({
      keyword: '牛肉',
      state: 'RAW',
      stateSpecified: true,
      totalCandidates: 11,
      relevantCount: 11,
      candidates: [
        ...beefRows().slice(0, 8),
        ...beefRows()
          .slice(8)
          .map((row) => ({ ...row, preparationState: 'COOKED' as const })),
      ],
    });

    expect(narrowing.kind).toBe('STATE');
    expect(narrowing.reason).toBe('CROSS_STATE');
    expect(narrowing.options).toEqual(['生（查生档案）', '熟（查熟档案）']);
  });

  it('相关 ≤5 且单组：不问收窄', () => {
    const narrowing = buildCandidateNarrowing({
      keyword: '牛肉',
      state: 'RAW',
      stateSpecified: true,
      totalCandidates: 3,
      relevantCount: 3,
      candidates: beefRows().slice(0, 3),
    });

    expect(narrowing.required).toBe(false);
    expect(narrowing.kind).toBe('NONE');
    expect(narrowing.options).toEqual([]);
    expect(narrowing.groups).toHaveLength(1);
  });

  it('收窄选项最多 5 个：超过时保留前 4 组，其余合并成「其他分组」', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, index) =>
        candidate(`ground-${index}`, `Beef, ground, raw ${index + 1}`),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`tenderloin-${index}`, `Beef, tenderloin, raw ${index + 1}`),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        candidate(`brisket-${index}`, `Beef, brisket, raw ${index + 1}`),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        candidate(`shank-${index}`, `Beef, shank, raw ${index + 1}`),
      ),
      ...Array.from({ length: 1 }, (_, index) =>
        candidate(`rib-${index}`, `Beef, rib, raw ${index + 1}`),
      ),
      ...Array.from({ length: 1 }, (_, index) =>
        candidate(`chuck-${index}`, `Beef, chuck, raw ${index + 1}`),
      ),
    ];

    const narrowing = buildCandidateNarrowing({
      keyword: '牛肉',
      state: 'RAW',
      stateSpecified: true,
      totalCandidates: 16,
      relevantCount: 16,
      candidates: rows,
    });

    expect(narrowing.options).toHaveLength(5);
    expect(narrowing.options[4]).toBe('其他分组（2 条）');
    expect(narrowing.choices[4]).toMatchObject({
      kind: 'GROUP',
      key: '__other__',
      count: 2,
    });
  });

  it('选组后只列该组 ≤5 条，带来源库、覆盖率与 AI 判断，最后一条是兜底', () => {
    const rows = beefRows();
    const groups = buildCandidateGroups(rows, { keyword: '牛肉' });
    const ground = groups.find((group) => group.key === 'ground');
    expect(ground).toBeDefined();

    const listing = buildCandidateGroupListing({
      group: ground!,
      state: 'RAW',
      candidates: rows.filter(
        (row) => candidatePartGroupKey(row.foodName) === 'ground',
      ),
    });

    expect(listing.single).toBe(false);
    // 只列前 5 条，加上兜底选项一共 6 个按钮。
    expect(listing.entries).toHaveLength(5);
    expect(listing.options).toHaveLength(6);
    expect(listing.options[0]).toContain('Beef, ground, raw 1');
    expect(listing.options[0]).toContain('来源 USDA_FDC');
    expect(listing.options[0]).toContain('覆盖率 80%');
    expect(listing.options[0]).toContain('相关：就是牛肉');
    expect(listing.options.at(-1)).toBe(CANDIDATE_GROUP_FALLBACK_OPTION);
    expect(listing.question).toContain('牛绞肉');
    expect(listing.question).toContain('6 条');
  });

  it('该组只剩 1 条：直接用它，不再生成点选问题', () => {
    const rows = [
      candidate('brisket-1', 'Beef, brisket, raw', {
        review: { verdict: 'RELEVANT', reason: '就是牛腩' },
      }),
    ];
    const groups = buildCandidateGroups(rows, { keyword: '牛肉' });
    const listing = buildCandidateGroupListing({
      group: groups[0]!,
      state: 'RAW',
      candidates: rows,
    });

    expect(listing.single).toBe(true);
    expect(listing.entries).toHaveLength(1);
    expect(listing.options).toEqual([]);
  });

  it('筛选分组时支持「其他分组」聚合 key，且不会串到前面的组', () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, index) =>
        candidate(`ground-${index}`, `Beef, ground, raw ${index + 1}`),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`tenderloin-${index}`, `Beef, tenderloin, raw ${index + 1}`),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        candidate(`brisket-${index}`, `Beef, brisket, raw ${index + 1}`),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        candidate(`shank-${index}`, `Beef, shank, raw ${index + 1}`),
      ),
      candidate('rib-1', 'Beef, rib, raw'),
      candidate('chuck-1', 'Beef, chuck, raw'),
    ];
    const groups = buildCandidateGroups(rows, { keyword: '牛肉' });
    const scope = resolveCandidateGroupScope(rows, groups, '__other__');

    expect(scope).not.toBeNull();
    expect(scope!.candidates.map((row) => row.sourceRecordId).sort()).toEqual([
      'chuck-1',
      'rib-1',
    ]);
  });
});
