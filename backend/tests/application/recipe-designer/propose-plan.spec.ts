import {
  normalizePlan,
  normalizeSelection,
  summarizePlan,
} from '../../../src/application/recipe-designer/agent/propose-plan';

const plan = {
  summary: '低脂维持，控钠',
  rationale: '胰腺炎优先控脂；心脏病进一步限钠。',
  mealsPerDay: 3,
  constraints: [
    {
      key: 'fat',
      label: '脂肪',
      min: 7,
      max: 10,
      unit: 'PERCENT_DM',
      basis: '胰腺炎恢复期',
      source: 'SACN5',
      hard: true,
    },
  ],
  nonNutrient: [
    { key: 'moisture', label: '含水量', value: '≥70', unit: '%', hard: false },
  ],
};

describe('propose_plan normalization', () => {
  it('normalizes a valid plan and keeps constraints as given', () => {
    const normalized = normalizePlan(plan);
    expect(normalized.constraints).toHaveLength(1);
    expect(normalized.constraints[0]).toMatchObject({
      key: 'fat',
      min: 7,
      max: 10,
    });
    expect(summarizePlan(normalized)).toContain('方案待确认');
  });

  it('keeps null bounds without rejecting the plan', () => {
    const normalized = normalizePlan({
      ...plan,
      constraints: [{ ...plan.constraints[0], min: null, max: null }],
    });
    expect(normalized.constraints[0].min).toBeNull();
    expect(normalized.constraints[0].max).toBeNull();
  });

  it('rejects an empty constraint list', () => {
    expect(() => normalizePlan({ ...plan, constraints: [] })).toThrow(
      'constraints 不能为空',
    );
  });

  it('rejects a constraint whose min is greater than max', () => {
    expect(() =>
      normalizePlan({
        ...plan,
        constraints: [{ ...plan.constraints[0], min: 20, max: 10 }],
      }),
    ).toThrow('下限不能大于上限');
  });
});

describe('propose_selection normalization', () => {
  it('accepts one item per category without a diversity count check', () => {
    const normalized = normalizeSelection({
      summary: '用户确认清单',
      confirmed: true,
      items: [
        {
          kind: 'FOOD',
          name: '燕麦片',
          foodCategory: '谷类及制品',
          reason: '用户确认',
        },
        {
          kind: 'FOOD',
          name: '苹果',
          foodCategory: '水果类及制品',
          reason: '用户确认',
        },
      ],
    });
    expect(normalized.items).toHaveLength(2);
    expect(normalized.confirmed).toBe(true);
  });

  it('does not reject supplements or unknown categories at the schema layer', () => {
    const normalized = normalizeSelection({
      summary: 'x',
      items: [
        {
          kind: 'SUPPLEMENT',
          name: '鱼油',
          foodCategory: '油脂类',
          reason: 'x',
        },
      ],
    });
    expect(normalized.items[0].kind).toBe('SUPPLEMENT');
    expect(normalized.items[0].foodCategory).toBe('油脂类');
  });

  it('keeps skipped category reasons without a CFCT enum check', () => {
    const normalized = normalizeSelection({
      summary: 'x',
      items: [
        {
          kind: 'FOOD',
          name: '猪里脊',
          foodCategory: '畜肉类及制品',
          reason: 'x',
        },
      ],
      skippedCategories: [{ category: '自定义分类', reason: '不适用' }],
    });
    expect(normalized.skippedCategories?.[0].category).toBe('自定义分类');
  });
});
