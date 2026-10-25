import {
  buildSummaryNarrowing,
  cutGroupLabel,
} from '../../../src/application/ingredient-creation/ingredient-name-narrowing';
import type { NameSummary } from '../../../src/application/ingredient-creation/ingredient-name-summary';

function summary(overrides: Partial<NameSummary> = {}): NameSummary {
  return {
    total: 1651,
    byState: { RAW: 420, COOKED: 980, UNKNOWN: 251 },
    byMethod: {
      BOILED: 300,
      STEAMED: 180,
      GRILLED: 260,
      FRIED: 120,
      OTHER: 120,
      NONE: 671,
    },
    byCutGroup: { ground: 210, chuck: 40, brisket: 30 },
    examples: {
      ground: ['Beef, ground, 85% lean'],
      chuck: ['Beef, chuck, boiled'],
      brisket: ['Beef, brisket, raw'],
    },
    irrelevantExamples: [],
    ...overrides,
  };
}

describe('全部名字一次汇总驱动的收窄', () => {
  it('未指定状态：问句与选项用汇总的 生 / 熟 / 做法 / 部位 条数', () => {
    const built = buildSummaryNarrowing({
      keyword: '牛肉',
      summary: summary(),
      stateSpecified: false,
    });

    expect(built.narrowing.required).toBe(true);
    expect(built.narrowing.kind).toBe('STATE');
    expect(built.narrowing.options).toEqual([
      '生（420 条）',
      '熟（980 条）',
      '生 + 熟都要（1400 条）',
    ]);
    expect(built.narrowing.question).toContain('共 1651 条');
    expect(built.narrowing.question).toContain('生 420 条');
    expect(built.narrowing.question).toContain('熟 980 条');
    expect(built.narrowing.question).toContain('水煮 300 条');
    expect(built.narrowing.question).toContain('绞肉 210 条');
    expect(built.narrowing.stats.byState).toEqual({
      RAW: 420,
      COOKED: 980,
      UNKNOWN: 251,
    });
  });

  it('已选状态：按汇总的部位分组带条数发问，不列具体词条', () => {
    const built = buildSummaryNarrowing({
      keyword: '牛肉',
      summary: summary(),
      stateSpecified: true,
      states: ['RAW', 'COOKED'],
    });

    expect(built.narrowing.required).toBe(true);
    expect(built.narrowing.kind).toBe('GROUP');
    expect(built.narrowing.options).toEqual([
      '绞肉（210 条）',
      '肩（40 条）',
      '腩（30 条）',
    ]);
    expect(built.narrowing.question).not.toContain('Beef');
    expect(cutGroupLabel('ground')).toBe('绞肉');
  });

  it('已选组：不再收窄，交给调用方只列该组 ≤5 条', () => {
    const built = buildSummaryNarrowing({
      keyword: '牛肉',
      summary: summary(),
      stateSpecified: true,
      states: ['RAW', 'COOKED'],
      groupKey: 'ground',
    });

    expect(built.narrowing.required).toBe(false);
    expect(built.selectedGroupKey).toBe('ground');
    expect(
      Object.fromEntries(
        built.narrowing.stats.cutGroups.map((group) => [
          group.key,
          group.count,
        ]),
      ),
    ).toEqual({ ground: 210, chuck: 40, brisket: 30 });
  });

  it('全部 UNKNOWN：不硬问生熟，交给调用方列名字', () => {
    const built = buildSummaryNarrowing({
      keyword: '牛肉',
      summary: summary({
        total: 3,
        byState: { RAW: 0, COOKED: 0, UNKNOWN: 3 },
        byMethod: {
          BOILED: 0,
          STEAMED: 0,
          GRILLED: 0,
          FRIED: 0,
          OTHER: 0,
          NONE: 3,
        },
        byCutGroup: {},
      }),
      stateSpecified: false,
    });

    expect(built.narrowing.required).toBe(false);
    expect(built.narrowing.options).toEqual([]);
    expect(built.narrowing.stats.byState.UNKNOWN).toBe(3);
  });
});
