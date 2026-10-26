import {
  RecipeAgentPortError,
  type AgentAssessmentEntry,
} from 'src/application/recipe-designer/agent/agent-types';
import {
  computeMarginPercent,
  createCheckTools,
  withComputedMargins,
} from 'src/application/recipe-designer/agent/check-tools';
import {
  createFakeRecipeAgentPort,
  fakeAssessment,
  fakeDraftSnapshot,
} from '../../../helpers/fake-recipe-agent-port';

const tagPolicy = {
  isAllowedTag: (name: string) =>
    ['低脂', '易消化', '单一动物蛋白'].includes(name),
};

describe('computeMarginPercent', () => {
  it('下限 100、值 120 → 20%', () => {
    expect(computeMarginPercent({ value: 120, min: 100, max: null })).toBe(20);
  });

  it('上限 100、值 80 → 20%', () => {
    expect(computeMarginPercent({ value: 80, min: null, max: 100 })).toBe(20);
  });

  it('同时有上下限时取更近的一边', () => {
    expect(computeMarginPercent({ value: 110, min: 100, max: 200 })).toBe(10);
  });

  it('缺值返回 null', () => {
    expect(
      computeMarginPercent({ value: null, min: 100, max: null }),
    ).toBeNull();
  });

  it('分母为 0 或值为 null 都返回 null', () => {
    expect(computeMarginPercent({ value: 10, min: 0, max: null })).toBeNull();
    expect(computeMarginPercent({ value: null, min: 0, max: 100 })).toBeNull();
  });

  it('结果保留 1 位小数', () => {
    // (110 - 90) / 90 * 100 = 22.222…
    expect(computeMarginPercent({ value: 110, min: 90, max: null })).toBe(22.2);
  });
});

describe('withComputedMargins', () => {
  it('只补算缺失的余量，不覆盖已有值，也不改原对象', () => {
    const entries: AgentAssessmentEntry[] = [
      {
        key: 'a',
        label: 'A',
        status: 'COMPLIANT',
        value: 110,
        min: 100,
        max: null,
        marginPercent: null,
      },
      {
        key: 'b',
        label: 'B',
        status: 'COMPLIANT',
        value: 110,
        min: 100,
        max: null,
        marginPercent: 33,
      },
      {
        key: 'c',
        label: 'C',
        status: 'COMPLIANT',
        value: null,
        min: 100,
        max: null,
        marginPercent: null,
      },
    ];
    const normalized = withComputedMargins(fakeAssessment({ entries }));
    expect(normalized.entries[0]?.marginPercent).toBe(10);
    expect(normalized.entries[1]?.marginPercent).toBe(33);
    expect(normalized.entries[2]?.marginPercent).toBeNull();
    expect(entries[0]?.marginPercent).toBeNull();
  });

  it.each([
    ['只有下限', 120, 100, null, 'LOWER'],
    ['只有上限', 80, null, 100, 'UPPER'],
  ] as const)(
    '%s 时标出余量方向',
    (_label, value, min, max, expected) => {
      const normalized = withComputedMargins(
        fakeAssessment({
          entries: [
            {
              key: 'x',
              label: 'X',
              status: 'COMPLIANT',
              value,
              min,
              max,
              marginPercent: null,
            },
          ],
        }),
      );
      expect(normalized.entries[0]?.marginSide).toBe(expected);
    },
  );

  it('同时有上下限时标更小的一边', () => {
    const normalized = withComputedMargins(
      fakeAssessment({
        entries: [
          {
            key: 'x',
            label: 'X',
            status: 'COMPLIANT',
            value: 190,
            min: 100,
            max: 200,
            marginPercent: null,
          },
        ],
      }),
    );
    // 下限余量 90%，上限余量 5% → 更近的是上限。
    expect(normalized.entries[0]?.marginSide).toBe('UPPER');
    expect(normalized.entries[0]?.marginPercent).toBe(5);
  });

  it('无法判断方向时 marginSide 为 null', () => {
    const normalized = withComputedMargins(
      fakeAssessment({
        entries: [
          {
            key: 'x',
            label: 'X',
            status: 'COMPLIANT',
            value: null,
            min: 100,
            max: 200,
            marginPercent: null,
          },
        ],
      }),
    );
    expect(normalized.entries[0]?.marginSide).toBeNull();
  });

  it('已有 marginPercent 时也补 marginSide', () => {
    const normalized = withComputedMargins(
      fakeAssessment({
        entries: [
          {
            key: 'x',
            label: 'X',
            status: 'COMPLIANT',
            value: 110,
            min: 100,
            max: null,
            marginPercent: 33,
          },
        ],
      }),
    );
    expect(normalized.entries[0]?.marginPercent).toBe(33);
    expect(normalized.entries[0]?.marginSide).toBe('LOWER');
  });
});

describe('check tools', () => {
  it('run_assessment 调端口并返回评估', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.run_assessment();
    expect(result.ok).toBe(true);
    expect(port.runAssessment).toHaveBeenCalledWith('draft-1');
    if (!result.ok) return;
    expect(result.data.contentRevision).toBe(4);
    expect(result.summary).toContain('34/34');
  });

  it('run_assessment 也补算评估里缺失的余量', async () => {
    const port = createFakeRecipeAgentPort({
      assessment: fakeAssessment({
        entries: [
          {
            ...fakeAssessment().entries[0],
            value: 110,
            min: 100,
            max: null,
            marginPercent: null,
          },
        ],
      }),
    });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.run_assessment();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries[0]?.marginPercent).toBe(10);
  });

  it('端口抛 RecipeAgentPortError 时 run_assessment 保留错误码', async () => {
    const port = createFakeRecipeAgentPort();
    jest
      .mocked(port.runAssessment)
      .mockRejectedValue(
        new RecipeAgentPortError(
          'ASSESSMENT_STALE',
          '草稿在评估期间被修改，请重新评估',
        ),
      );
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });

    const result = await tools.run_assessment();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ASSESSMENT_STALE');
    expect(result.error.message).toBe('草稿在评估期间被修改，请重新评估');
  });

  it('run_assessment 对普通异常不吞，交给注册表边界', async () => {
    const port = createFakeRecipeAgentPort();
    jest.mocked(port.runAssessment).mockRejectedValue(new Error('db down'));
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });

    await expect(tools.run_assessment()).rejects.toThrow('db down');
  });

  it('评估过期时 check_ready 必须 BLOCKED', async () => {
    const port = createFakeRecipeAgentPort({
      draft: fakeDraftSnapshot({ contentRevision: 5 }),
      assessment: fakeAssessment({ contentRevision: 4 }),
    });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('BLOCKED');
    expect(
      result.data.checks.find((c) => c.key === 'ASSESSMENT_FRESH')?.status,
    ).toBe('FAIL');
  });

  it('有 MISSING_DATA 时不能 PASS', async () => {
    const port = createFakeRecipeAgentPort({
      assessment: fakeAssessment({ missingData: 1 }),
    });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.check_ready();
    if (!result.ok) return;
    expect(result.data.status).toBe('BLOCKED');
  });

  it('正好 20% 余量算 PASS；19.9% 是 PASS_WITH_WARNINGS', async () => {
    const make = (marginPercent: number) =>
      createCheckTools({
        port: createFakeRecipeAgentPort({
          assessment: fakeAssessment({
            entries: [{ ...fakeAssessment().entries[0], marginPercent }],
          }),
        }),
        draftId: 'draft-1',
        tagPolicy,
      });

    const passResult = await make(20).check_ready();
    expect(passResult.ok).toBe(true);
    if (!passResult.ok) return;
    expect(passResult.data.status).toBe('PASS');

    const warnResult = await make(19.9).check_ready();
    expect(warnResult.ok).toBe(true);
    if (!warnResult.ok) return;
    expect(warnResult.data.status).toBe('PASS_WITH_WARNINGS');
  });

  it('缺基础类只 WARN、不阻断；确认过也一样', async () => {
    const draft = fakeDraftSnapshot({
      items: fakeDraftSnapshot().items.filter((i) => i.category !== 'MUSHROOM'),
    });
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({ draft }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const open = await tools.check_ready();
    const confirmed = await tools.check_ready({
      confirmedOmissions: ['MUSHROOM'],
    });
    if (!open.ok || !confirmed.ok) return;

    expect(open.data.status).toBe('PASS_WITH_WARNINGS');
    expect(confirmed.data.status).toBe('PASS_WITH_WARNINGS');
    for (const result of [open, confirmed]) {
      const coverage = result.data.checks.find((c) => c.key === 'COVERAGE');
      expect(coverage?.label).toBe('分类检查');
      expect(coverage?.status).toBe('WARN');
      expect(coverage?.detail).toContain('基础分类还缺「菌藻」');
      expect(coverage?.detail).toContain('分类是选料检查清单，不阻断交付');
      expect(result.data.checks.some((c) => c.status === 'FAIL')).toBe(false);
    }
  });

  it('基础 8 类齐全、只缺建议类 → PASS，并提示建议项', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort(),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('PASS');
    const coverage = result.data.checks.find((c) => c.key === 'COVERAGE');
    expect(coverage?.label).toBe('分类检查');
    expect(coverage?.status).toBe('PASS');
    expect(coverage?.detail).toBe(
      '基础 8 类齐全；建议项未覆盖：蛋、豆、水果。',
    );
  });

  it('11 类检查项齐全 → PASS', async () => {
    const base = fakeDraftSnapshot();
    const suggestedItems = [
      {
        ...base.items[0],
        id: 'item-9',
        name: '鸡蛋',
        category: 'EGG' as const,
      },
      {
        ...base.items[0],
        id: 'item-10',
        name: '鹰嘴豆',
        category: 'LEGUME' as const,
      },
      {
        ...base.items[0],
        id: 'item-11',
        name: '苹果',
        category: 'FRUIT' as const,
      },
    ];
    const draft = fakeDraftSnapshot({
      items: [...base.items, ...suggestedItems],
      totalWeightG:
        base.totalWeightG + suggestedItems.length * base.items[0].weightG,
    });
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({ draft }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('PASS');
    const coverage = result.data.checks.find((c) => c.key === 'COVERAGE');
    expect(coverage?.status).toBe('PASS');
    expect(coverage?.detail).toBe('11 类检查项齐全。');
  });

  it('已批例外可以把达标失败降为警告', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        assessment: fakeAssessment({ deficient: 1 }),
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready({ exceptionApproved: true });
    if (!result.ok) return;
    expect(result.data.status).toBe('PASS_WITH_WARNINGS');
    expect(
      result.data.checks.find((c) => c.key === 'ASSESSMENT_COMPLIANT')?.detail,
    ).toContain('已批例外');
  });

  it('check_coverage 分报基础/建议缺类；确认过也不过滤 missing', async () => {
    const draft = fakeDraftSnapshot({
      items: fakeDraftSnapshot().items.filter((i) => i.category !== 'MUSHROOM'),
    });
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({ draft }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const open = await tools.check_coverage();
    const confirmed = await tools.check_coverage({
      confirmedOmissions: ['MUSHROOM'],
    });
    if (!open.ok || !confirmed.ok) return;

    for (const result of [open, confirmed]) {
      expect(result.data.missing).toEqual(['MUSHROOM']);
      expect(result.data.suggestedCovered).toEqual([]);
      expect(result.data.suggestedMissing).toEqual(['EGG', 'LEGUME', 'FRUIT']);
      expect(result.summary).toContain('分类检查 7/11（基础 7/8，建议 0/3）');
      expect(result.summary).toContain('基础缺「菌藻」');
      expect(result.summary).toContain('建议未覆盖「蛋、豆、水果」');
    }
    expect(open.data.confirmedOmissions).toEqual([]);
    expect(confirmed.data.confirmedOmissions).toEqual(['MUSHROOM']);
  });

  it('check_coverage 把水果算建议类，不算可选类', async () => {
    const base = fakeDraftSnapshot();
    const draft = fakeDraftSnapshot({
      items: [
        ...base.items,
        {
          ...base.items[0],
          id: 'item-9',
          name: '苹果',
          category: 'FRUIT' as const,
          weightG: 30,
        },
      ],
      totalWeightG: base.totalWeightG + 30,
    });
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({ draft }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_coverage();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suggestedCovered).toEqual(['FRUIT']);
    expect(result.data.suggestedMissing).toEqual(['EGG', 'LEGUME']);
    expect(result.data.optionalPresent).toEqual([]);
    expect(result.summary).toContain('分类检查 9/11（基础 8/8，建议 1/3）');
    expect(result.summary).toContain('基础 8 类齐全');
    expect(result.summary).toContain('建议未覆盖「蛋、豆」');
  });

  it('check_coverage 的缺类确认会去重，空白值返回 INVALID_ARGUMENT', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort(),
      draftId: 'draft-1',
      tagPolicy,
    });

    const deduped = await tools.check_coverage({
      confirmedOmissions: ['MUSHROOM', 'MUSHROOM'],
    });
    expect(deduped.ok).toBe(true);
    if (!deduped.ok) return;
    expect(deduped.data.confirmedOmissions).toEqual(['MUSHROOM']);

    const blank = await tools.check_coverage({
      confirmedOmissions: ['MUSHROOM', '   '] as never,
    });
    expect(blank.ok).toBe(false);
    if (blank.ok) return;
    expect(blank.error.code).toBe('INVALID_ARGUMENT');
  });

  it('确认已覆盖的类别不会在摘要里被说成缺类', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort(),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_coverage({
      confirmedOmissions: ['PROTEIN'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 数据保留输入，不被摘要过滤影响。
    expect(result.data.confirmedOmissions).toEqual(['PROTEIN']);
    expect(result.summary).toContain('基础 8 类齐全');
    expect(result.summary).not.toContain('基础缺');
    expect(result.summary).not.toContain('已确认缺类');
  });

  it('没有主蛋白时目录对比返回空证据，不抛错', async () => {
    const draft = fakeDraftSnapshot({
      items: fakeDraftSnapshot().items.filter(
        (i) => i.category !== 'PROTEIN' && i.category !== 'AQUATIC',
      ),
    });
    const port = createFakeRecipeAgentPort({ draft });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.check_catalog_conflicts();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
    expect(result.summary).toContain('没有主蛋白可对比');
    expect(port.getCatalogUsage).not.toHaveBeenCalled();
  });

  it('多种蛋白时取克数最大的作为主蛋白', async () => {
    const items = fakeDraftSnapshot().items.map((item) =>
      item.category === 'PROTEIN'
        ? { ...item, name: '鸭腿肉', weightG: 450 }
        : item,
    );
    items.push({ ...items[0], id: 'item-8', name: '鸡胸肉', weightG: 100 });
    const port = createFakeRecipeAgentPort({
      draft: fakeDraftSnapshot({ items }),
    });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    await tools.check_catalog_conflicts();
    expect(port.getCatalogUsage).toHaveBeenCalledWith({
      mainProteinName: '鸭腿肉',
    });
  });

  it('水产也算主蛋白：克数更大的水产用于目录对比', async () => {
    const base = fakeDraftSnapshot();
    const items = base.items.map((item) =>
      item.category === 'PROTEIN' ? { ...item, weightG: 10 } : item,
    );
    items.push({
      ...base.items[0],
      id: 'salmon',
      name: '三文鱼',
      category: 'AQUATIC',
      weightG: 500,
    });
    const port = createFakeRecipeAgentPort({
      draft: fakeDraftSnapshot({ items }),
    });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    await tools.check_catalog_conflicts();
    expect(port.getCatalogUsage).toHaveBeenCalledWith({
      mainProteinName: '三文鱼',
    });
  });

  it('只重合水产报 HARD', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        catalogUsage: {
          totalPublishedRecipes: 26,
          mainProteinCount: 2,
          recipes: [
            {
              recipeId: 'r-aquatic',
              name: '三文鱼餐',
              mainProteinName: '三文鱼',
              overlappingCategories: ['AQUATIC'],
              overlappingIngredientNames: ['三文鱼'],
            },
          ],
        },
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_catalog_conflicts({
      mainProteinName: '三文鱼',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([
      {
        recipeId: 'r-aquatic',
        recipeName: '三文鱼餐',
        severity: 'HARD',
        categories: ['AQUATIC'],
      },
    ]);
  });

  it('主蛋白重合报 HARD，软类重合只报 SOFT', async () => {
    const catalogUsage = {
      totalPublishedRecipes: 26,
      mainProteinCount: 2,
      recipes: [
        {
          recipeId: 'r1',
          name: '南瓜鸭肉餐',
          mainProteinName: '鸭腿肉',
          overlappingCategories: ['PROTEIN' as const, 'CARB' as const],
          overlappingIngredientNames: ['鸭腿肉', '燕麦'],
        },
      ],
    };
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({ catalogUsage }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_catalog_conflicts({
      mainProteinName: '鸭腿肉',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]?.severity).toBe('HARD');
    expect(result.data[0]?.categories).toEqual(['PROTEIN', 'CARB']);
  });

  it('只重合软类时报 SOFT，完全没有重合的菜跳过', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        catalogUsage: {
          totalPublishedRecipes: 26,
          mainProteinCount: 2,
          recipes: [
            {
              recipeId: 'r2',
              name: '鸭肉燕麦餐',
              mainProteinName: '鸭腿肉',
              overlappingCategories: ['CARB', 'MUSHROOM'],
              overlappingIngredientNames: ['燕麦'],
            },
            {
              recipeId: 'r3',
              name: '清蒸鱼餐',
              mainProteinName: null,
              overlappingCategories: ['OIL', 'SEASONING'],
              overlappingIngredientNames: ['食用盐'],
            },
          ],
        },
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_catalog_conflicts({
      mainProteinName: '鸭腿肉',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      recipeId: 'r2',
      recipeName: '鸭肉燕麦餐',
      severity: 'SOFT',
      categories: ['CARB', 'MUSHROOM'],
    });
  });

  it('只重合水果时报 SOFT', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        catalogUsage: {
          totalPublishedRecipes: 26,
          mainProteinCount: 2,
          recipes: [
            {
              recipeId: 'r4',
              name: '鸭肉苹果餐',
              mainProteinName: '鸭肉',
              overlappingCategories: ['FRUIT'],
              overlappingIngredientNames: ['苹果'],
            },
          ],
        },
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_catalog_conflicts({
      mainProteinName: '鸭腿肉',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toEqual({
      recipeId: 'r4',
      recipeName: '鸭肉苹果餐',
      severity: 'SOFT',
      categories: ['FRUIT'],
    });
  });

  it('只重合调味料时不报冲突', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        catalogUsage: {
          totalPublishedRecipes: 26,
          mainProteinCount: 2,
          recipes: [
            {
              recipeId: 'r5',
              name: '鸭肉海盐餐',
              mainProteinName: '鸭肉',
              overlappingCategories: ['SEASONING'],
              overlappingIngredientNames: ['食用盐'],
            },
          ],
        },
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_catalog_conflicts({
      mainProteinName: '鸭腿肉',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
  });

  it('主蛋白重合加水果重合时只报 HARD', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        catalogUsage: {
          totalPublishedRecipes: 26,
          mainProteinCount: 2,
          recipes: [
            {
              recipeId: 'r6',
              name: '鸭肉苹果餐',
              mainProteinName: '鸭腿肉',
              overlappingCategories: ['PROTEIN', 'FRUIT'],
              overlappingIngredientNames: ['鸭腿肉', '苹果'],
            },
          ],
        },
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_catalog_conflicts({
      mainProteinName: '鸭腿肉',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.severity).toBe('HARD');
    expect(result.data[0]?.categories).toEqual(['PROTEIN', 'FRUIT']);
  });

  it.each(['DAIRY', 'EGG', 'LEGUME'] as const)(
    '只重合 %s 也报 SOFT',
    async (category) => {
      const tools = createCheckTools({
        port: createFakeRecipeAgentPort({
          catalogUsage: {
            totalPublishedRecipes: 26,
            mainProteinCount: 2,
            recipes: [
              {
                recipeId: `r-${category}`,
                name: `${category} 重合餐`,
                mainProteinName: '鸭腿肉',
                overlappingCategories: [category],
                overlappingIngredientNames: [],
              },
            ],
          },
        }),
        draftId: 'draft-1',
        tagPolicy,
      });
      const result = await tools.check_catalog_conflicts({
        mainProteinName: '鸭腿肉',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.severity).toBe('SOFT');
      expect(result.data[0]?.categories).toEqual([category]);
    },
  );

  it('显式主蛋白即使草稿没有 PROTEIN 也会查询目录', async () => {
    const draft = fakeDraftSnapshot({
      items: fakeDraftSnapshot().items.filter(
        (item) => item.category !== 'PROTEIN',
      ),
    });
    const port = createFakeRecipeAgentPort({ draft });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.check_catalog_conflicts({
      mainProteinName: '鸭腿肉',
    });
    expect(port.getCatalogUsage).toHaveBeenCalledWith({
      mainProteinName: '鸭腿肉',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toContain('鸭腿肉');
    expect(result.summary).not.toContain('没有主蛋白可对比');
  });

  it('mainProteinName 不是字符串时返回 INVALID_ARGUMENT', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.check_catalog_conflicts({
      mainProteinName: 123 as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(port.getCatalogUsage).not.toHaveBeenCalled();
  });

  it('文案为空、缺预处理、标签不合规都会 BLOCKED', async () => {
    const draft = fakeDraftSnapshot({
      copy: {
        coverTitle: null,
        sellingPoint: null,
        description: null,
        targetHealthTags: ['体重管理'],
      },
    });
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({ draft }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    if (!result.ok) return;
    expect(result.data.status).toBe('BLOCKED');
    expect(
      result.data.checks.filter((c) => c.status === 'FAIL').map((c) => c.key),
    ).toEqual(expect.arrayContaining(['COPY', 'TAGS']));
  });

  it('lastAssessment 为 null 时 check_ready BLOCKED，且不重跑评估', async () => {
    const port = createFakeRecipeAgentPort({ assessment: null });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('BLOCKED');
    expect(
      result.data.checks.find((c) => c.key === 'ASSESSMENT_FRESH')?.status,
    ).toBe('FAIL');
    expect(port.runAssessment).not.toHaveBeenCalled();
  });

  it('空评估不能靠已批例外降级', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        assessment: fakeAssessment({ entries: [] }),
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready({ exceptionApproved: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('BLOCKED');
    const compliant = result.data.checks.find(
      (c) => c.key === 'ASSESSMENT_COMPLIANT',
    );
    expect(compliant?.status).toBe('FAIL');
    expect(compliant?.detail ?? '').not.toContain('已批例外');
  });

  it('缺预处理或没有制作步骤时 BLOCKED', async () => {
    const draft = fakeDraftSnapshot({
      items: fakeDraftSnapshot().items.map((item, index) =>
        index === 0 ? { ...item, preparationMethod: null } : item,
      ),
      productionSteps: [],
    });
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({ draft }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    if (!result.ok) return;
    expect(result.data.status).toBe('BLOCKED');
    expect(
      result.data.checks.filter((c) => c.status === 'FAIL').map((c) => c.key),
    ).toEqual(expect.arrayContaining(['PREPARATION', 'PRODUCTION_STEPS']));
  });

  it('不要求补剂/调味/油脂/乳制品填写预处理', async () => {
    const base = fakeDraftSnapshot();
    const draft = fakeDraftSnapshot({
      items: base.items.map((item, index) => {
        if (index === 0) {
          return {
            ...item,
            category: 'SEASONING' as const,
            preparationMethod: null,
          };
        }
        if (index === 1) {
          return {
            ...item,
            category: 'OIL' as const,
            preparationMethod: null,
          };
        }
        if (index === 2) {
          return {
            ...item,
            category: 'SUPPLEMENT' as const,
            ingredientType: 'SUPPLEMENT' as const,
            preparationMethod: null,
          };
        }
        return item;
      }),
    });
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({ draft }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    if (!result.ok) return;
    const preparation = result.data.checks.find(
      (check) => check.key === 'PREPARATION',
    );
    expect(preparation?.status).toBe('PASS');
  });

  it('marginPercent 缺失但能补算时按补算结果判 WARN', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        assessment: fakeAssessment({
          entries: [
            {
              ...fakeAssessment().entries[0],
              label: '粗蛋白',
              value: 110,
              min: 100,
              max: null,
              marginPercent: null,
            },
          ],
        }),
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('PASS_WITH_WARNINGS');
    const margin = result.data.checks.find((c) => c.key === 'MARGIN');
    expect(margin?.status).toBe('WARN');
    expect(margin?.detail).toContain('10%');
  });

  it('MARGIN 警告标明是距下限还是距上限', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        assessment: fakeAssessment({
          entries: [
            {
              key: 'calcium',
              label: '钙',
              status: 'COMPLIANT',
              value: 119.1,
              min: 100,
              max: null,
              marginPercent: 19.1,
            },
            {
              key: 'phosphorus',
              label: '磷',
              status: 'COMPLIANT',
              value: 90.7,
              min: null,
              max: 100,
              marginPercent: 9.3,
            },
          ],
        }),
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const margin = result.data.checks.find((c) => c.key === 'MARGIN');
    expect(margin?.status).toBe('WARN');
    expect(margin?.detail).toContain('钙 19.1%（距下限）');
    expect(margin?.detail).toContain('磷 9.3%（距上限）');
  });

  it('MARGIN 警告在方向未知时不加后缀', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        assessment: fakeAssessment({
          entries: [
            {
              key: 'reference',
              label: '参考项',
              status: 'COMPLIANT',
              value: null,
              min: null,
              max: null,
              marginPercent: 5,
            },
          ],
        }),
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const margin = result.data.checks.find((c) => c.key === 'MARGIN');
    expect(margin?.detail).toContain('参考项 5%');
    expect(margin?.detail).not.toContain('距下限');
    expect(margin?.detail).not.toContain('距上限');
  });

  it('余量完全无法计算时 MARGIN 不谎称都已达标', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        assessment: fakeAssessment({
          entries: [
            {
              ...fakeAssessment().entries[0],
              value: null,
              min: null,
              max: null,
              marginPercent: null,
            },
          ],
        }),
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('PASS');
    const margin = result.data.checks.find((c) => c.key === 'MARGIN');
    expect(margin?.status).toBe('PASS');
    expect(margin?.detail).toContain('无法计算余量');
    expect(margin?.detail).not.toContain('都在');
  });

  it('MARGIN 忽略 INFO 条目', async () => {
    const infoEntry: AgentAssessmentEntry = {
      key: 'reference',
      label: '参考项',
      status: 'INFO',
      value: 1,
      min: 10,
      max: null,
      marginPercent: 5,
    };
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({
        assessment: fakeAssessment({
          entries: [...fakeAssessment().entries, infoEntry],
        }),
      }),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('PASS');
    expect(result.data.checks.find((c) => c.key === 'MARGIN')?.status).toBe(
      'PASS',
    );
  });

  it('check_ready 的参数类型不对时返回 INVALID_ARGUMENT', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort(),
      draftId: 'draft-1',
      tagPolicy,
    });
    const result = await tools.check_ready({
      exceptionApproved: 'yes' as never,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
  });
});
