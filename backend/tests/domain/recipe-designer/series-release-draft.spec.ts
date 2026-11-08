import {
  buildSeriesReleaseLiveValues,
  diffSeriesReleaseDraft,
  emptySeriesReleaseDraft,
  formatSeriesReleaseDraftFieldList,
  isSeriesReleaseDraftEqualToLive,
  mergeSeriesReleaseDraft,
  parseSeriesReleaseDraft,
  resolveSeriesReleaseDraftApplied,
} from '../../../src/domain/recipe-designer/series-release-draft';
import { buildSeriesReleaseReadiness } from '../../../src/domain/recipe-designer/series-release-readiness';

const liveValues = buildSeriesReleaseLiveValues({
  coverImageUrl: 'https://cdn.example.com/a.jpg',
  coverTitle: null,
  sellingPoint: '低敏高蛋白，日常维持',
  targetHealthTags: [],
  badgeHealthTagIds: ['tag-a', 'tag-b'],
  taxonomy: [{ kindId: 'kind-1', nodeId: 'node-1' }],
});

describe('series-release-draft', () => {
  it('把脏 JSON 解析成空草稿，不抛错', () => {
    expect(parseSeriesReleaseDraft(null)).toEqual(emptySeriesReleaseDraft());
    expect(parseSeriesReleaseDraft('nope')).toEqual(emptySeriesReleaseDraft());
    expect(parseSeriesReleaseDraft({ sellingPoint: 42 })).toEqual(
      emptySeriesReleaseDraft(),
    );
    expect(
      parseSeriesReleaseDraft({ taxonomy: [{ kindId: '', nodeId: 'x' }] }),
    ).toEqual(emptySeriesReleaseDraft());
  });

  it('解析时去重：同一个分类维度只留最后一个节点', () => {
    const draft = parseSeriesReleaseDraft({
      taxonomy: [
        { kindId: 'kind-1', nodeId: 'node-1' },
        { kindId: 'kind-1', nodeId: 'node-2' },
      ],
    });
    expect(draft.taxonomy).toEqual([{ kindId: 'kind-1', nodeId: 'node-2' }]);
  });

  it('差异按固定顺序返回，角标 / 分类与顺序无关', () => {
    const draft = {
      ...liveValues,
      sellingPoint: '鲜肉低敏，肠胃更稳',
      badgeHealthTagIds: ['tag-b', 'tag-a'],
      taxonomy: [{ kindId: 'kind-1', nodeId: 'node-1' }],
    };
    expect(diffSeriesReleaseDraft(draft, liveValues)).toEqual(['sellingPoint']);
  });

  it('封面 / 角标 / 分类改动都能识别', () => {
    const changed = {
      ...liveValues,
      coverImageUrl: 'https://cdn.example.com/b.jpg',
      badgeHealthTagIds: ['tag-a'],
      taxonomy: [],
    };
    expect(diffSeriesReleaseDraft(changed, liveValues)).toEqual([
      'coverImageUrl',
      'coverBadges',
      'taxonomy',
    ]);
  });

  it('合并时以线上值为基线，只改一个字段不会把别的冲掉', () => {
    const merged = mergeSeriesReleaseDraft(
      null,
      { sellingPoint: '鲜肉低敏，肠胃更稳' },
      liveValues,
    );
    expect(merged.coverImageUrl).toBe(liveValues.coverImageUrl);
    expect(merged.sellingPoint).toBe('鲜肉低敏，肠胃更稳');
    expect(merged.badgeHealthTagIds).toEqual(['tag-a', 'tag-b']);
    expect(merged.taxonomy).toEqual([{ kindId: 'kind-1', nodeId: 'node-1' }]);
  });

  it('已有草稿时在草稿上继续改', () => {
    const current = {
      ...liveValues,
      sellingPoint: '鲜肉低敏，肠胃更稳',
      coverImageUrl: 'https://cdn.example.com/b.jpg',
    };
    const merged = mergeSeriesReleaseDraft(
      current,
      { sellingPoint: '鲜肉低敏，肠胃稳定' },
      liveValues,
    );
    expect(merged.coverImageUrl).toBe('https://cdn.example.com/b.jpg');
    expect(merged.sellingPoint).toBe('鲜肉低敏，肠胃稳定');
  });

  it('显式清空字段', () => {
    const merged = mergeSeriesReleaseDraft(
      null,
      { sellingPoint: null },
      liveValues,
    );
    expect(merged.sellingPoint).toBeNull();
  });

  it('草稿回到线上值时视为没有草稿', () => {
    const merged = mergeSeriesReleaseDraft(
      null,
      { badgeHealthTagIds: ['tag-b', 'tag-a'] },
      liveValues,
    );
    expect(isSeriesReleaseDraftEqualToLive(merged, liveValues)).toBe(true);
  });

  it('变更清单文案按固定顺序拼接', () => {
    expect(
      formatSeriesReleaseDraftFieldList([
        'coverImageUrl',
        'sellingPoint',
        'coverBadges',
      ]),
    ).toBe('封面图 · 一句话卖点 · 封面角标');
  });
});

describe('readiness · 草稿参与 canRelease', () => {
  const stage = (over: Record<string, unknown>) => ({
    stageCode: 'ADULT',
    label: '成犬版',
    status: 'PUBLIC' as const,
    latestRecipeVersion: 4,
    publishedRecipeVersion: 4,
    ...over,
  });

  const input = (over: Record<string, unknown>) => ({
    seriesId: 'series-1',
    designMode: 'CATALOG',
    businessStatus: 'PUBLIC',
    presentation: {
      coverImageUrl: 'https://cdn.example.com/a.jpg',
      sellingPoint: '低敏高蛋白',
      coverBadges: ['高蛋白'],
    },
    taxonomyLinkCount: 1,
    stages: [stage({})],
    ...over,
  });

  it('已上线、没有待发阶段，但有资料草稿 → 可以发布', () => {
    const readiness = buildSeriesReleaseReadiness(
      input({
        releaseDraft: {
          updatedAt: new Date('2026-11-08T03:52:00.000Z'),
          changedFields: ['sellingPoint'],
        },
      }) as any,
    );
    expect(readiness.canRelease).toBe(true);
    expect(readiness.releaseDraft.exists).toBe(true);
    expect(readiness.releaseDraft.changedFields).toEqual(['sellingPoint']);
  });

  it('既没有待发阶段也没有草稿 → 不能发布', () => {
    const readiness = buildSeriesReleaseReadiness(input({}) as any);
    expect(readiness.canRelease).toBe(false);
    expect(readiness.releaseDraft.exists).toBe(false);
  });

  it('还没上线时，只改资料草稿不能发布', () => {
    const readiness = buildSeriesReleaseReadiness(
      input({
        businessStatus: 'DRAFT',
        releaseDraft: { updatedAt: null, changedFields: ['sellingPoint'] },
      }) as any,
    );
    expect(readiness.canRelease).toBe(false);
  });

  it('展示资料不齐时草稿也救不回来', () => {
    const readiness = buildSeriesReleaseReadiness(
      input({
        presentation: { sellingPoint: '低敏高蛋白', coverBadges: [] },
        releaseDraft: { updatedAt: null, changedFields: ['sellingPoint'] },
      }) as any,
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.canRelease).toBe(false);
  });
});

describe('resolveSeriesReleaseDraftApplied · 只应用真正改过的字段', () => {
  it('只改卖点时，期间别人改的角标 / 归类取线上值', () => {
    // 草稿存的是当时的快照：角标 [tag-a, tag-b]、归类 node-1
    const draft = {
      ...liveValues,
      sellingPoint: '鲜肉低敏，肠胃更稳',
      touched: ['sellingPoint'] as const,
    }
    // 期间别人把线上角标改成 [tag-c]、归类改成 node-9
    const liveNow = {
      ...liveValues,
      badgeHealthTagIds: ['tag-c'],
      taxonomy: [{ kindId: 'kind-1', nodeId: 'node-9' }],
    }

    const { applied, fields } = resolveSeriesReleaseDraftApplied(
      { ...draft, touched: [...draft.touched] },
      liveNow,
    )

    expect(fields).toEqual(['sellingPoint'])
    expect(applied.sellingPoint).toBe('鲜肉低敏，肠胃更稳')
    expect(applied.badgeHealthTagIds).toEqual(['tag-c'])
    expect(applied.taxonomy).toEqual([{ kindId: 'kind-1', nodeId: 'node-9' }])
  })

  it('老草稿没有 touched 时退回按差异算，行为与改造前一致', () => {
    const draft = {
      ...liveValues,
      sellingPoint: '鲜肉低敏，肠胃更稳',
      touched: [] as never,
    }
    const { fields, applied } = resolveSeriesReleaseDraftApplied(draft, liveValues)
    expect(fields).toEqual(['sellingPoint'])
    expect(applied.sellingPoint).toBe('鲜肉低敏，肠胃更稳')
  })
})
