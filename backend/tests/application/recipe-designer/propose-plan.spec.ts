import {
  normalizePlan,
  normalizeSelection,
  summarizePlan,
} from '../../../src/application/recipe-designer/agent/propose-plan';

const plan = {
  summary: '低脂维持，控钠',
  rationale: '胰腺炎优先控脂；心脏病在默认评估上进一步限钠。',
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
      citationId: 'sacn5-chapters-SACN5-67/p5',
      hard: true,
    },
    {
      key: 'sodium',
      label: '钠',
      min: 0.08,
      max: 0.15,
      unit: 'PERCENT_DM',
      basis: '心脏病 Class Ib/II/III',
      source: 'SACN5',
      hard: true,
    },
  ],
  nonNutrient: [
    { key: 'moisture', label: '含水量', value: '≥70', unit: '%', hard: false },
  ],
};

describe('propose_plan normalization', () => {
  it('normalizes a valid plan without a daily calorie target', () => {
    const normalized = normalizePlan(plan);

    expect(normalized).not.toHaveProperty('energyKcal');
    expect(normalized.mealsPerDay).toBe(3);
    expect(normalized.constraints).toHaveLength(2);
    expect(normalized.constraints[0]).toMatchObject({
      key: 'fat',
      min: 7,
      max: 10,
      citationId: 'sacn5-chapters-SACN5-67/p5',
    });
    expect(normalized.rationale).toContain('胰腺炎优先控脂');
    expect(normalized.nonNutrient[0].key).toBe('moisture');
    const summary = summarizePlan(normalized);
    expect(summary).toContain('方案待确认');
    expect(summary).toContain('理由与建议');
    expect(summary).toContain('见上方方案卡表格');
    expect(summary).not.toContain('- 脂肪');
  });

  it('accepts an energy-density constraint instead of total calories', () => {
    const normalized = normalizePlan({
      summary: '减重期控制能量密度',
      constraints: [
        {
          key: 'energyDensity',
          label: '能量密度',
          max: 120,
          unit: 'KCAL_PER_100G',
          source: 'Vet plan',
          hard: true,
        },
      ],
    });
    expect(normalized.constraints[0].unit).toBe('KCAL_PER_100G');
  });

  it('drops the generic FEDIAF sodium range but keeps a stricter cardiac target', () => {
    const fat = plan.constraints[0];
    const generic = normalizePlan({
      summary: '心脏病',
      constraints: [
        fat,
        {
          key: 'sodium',
          label: '钠',
          min: 0.25,
          max: 0.55,
          unit: 'PER_1000_KCAL',
          source: 'FEDIAF 2025',
          hard: true,
        },
      ],
    });
    expect(generic.constraints.map((c) => c.key)).toEqual(['fat']);

    const stricter = normalizePlan({
      summary: '心脏病',
      constraints: [
        {
          key: 'sodium',
          label: '钠',
          min: 0.25,
          max: 0.4,
          unit: 'PER_1000_KCAL',
          source: 'SACN5',
          hard: true,
        },
      ],
    });
    expect(stricter.constraints[0].max).toBe(0.4);
  });

  it('drops a non-restrictive energy density but keeps a real cap', () => {
    const fat = plan.constraints[0];
    const generic = normalizePlan({
      summary: '维持',
      constraints: [
        fat,
        {
          key: 'energyDensity',
          label: '能量密度',
          max: 4000,
          unit: 'KCAL_PER_KG',
          source: 'SACN5',
          hard: true,
        },
      ],
    });
    expect(generic.constraints.map((c) => c.key)).toEqual(['fat']);

    const stricter = normalizePlan({
      summary: '减重',
      constraints: [
        {
          key: 'energyDensity',
          label: '能量密度',
          max: 3500,
          unit: 'KCAL_PER_KG',
          source: 'Vet plan',
          hard: true,
        },
      ],
    });
    expect(stricter.constraints[0].max).toBe(3500);
  });

  it('keeps only the disease-specific side of fat/protein', () => {
    const normalized = normalizePlan({
      summary: '胰腺炎低脂',
      constraints: [
        {
          key: 'fat',
          label: '脂肪',
          min: 5.5,
          max: 12,
          unit: 'PERCENT_DM',
          source: 'SACN5',
          hard: true,
        },
        {
          key: 'protein',
          label: '蛋白',
          min: 21,
          max: 30,
          unit: 'PERCENT_DM',
          source: 'SACN5',
          hard: true,
        },
      ],
    });
    expect(normalized.constraints).toEqual([
      expect.objectContaining({ key: 'fat', min: null, max: 12 }),
      expect.objectContaining({ key: 'protein', min: null, max: 30 }),
    ]);
  });

  it('drops constraints that exactly match the default assessment', () => {
    expect(() =>
      normalizePlan({
        summary: '通用维持',
        constraints: [
          {
            key: 'calcium',
            label: '钙',
            min: 0.5,
            max: 2.5,
            unit: 'PERCENT_DM',
            source: 'FEDIAF 2025',
            hard: true,
          },
          {
            key: 'phosphorus',
            label: '磷',
            min: 0.4,
            max: 1.6,
            unit: 'PERCENT_DM',
            source: 'FEDIAF 2025',
            hard: true,
          },
        ],
      }),
    ).toThrow('只列疾病特异性');
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

  it('requires at least one bound', () => {
    expect(() =>
      normalizePlan({
        ...plan,
        constraints: [{ ...plan.constraints[0], min: null, max: null }],
      }),
    ).toThrow('至少要有 min 或 max');
  });
});

describe('propose_selection normalization', () => {
  const baseItems = [
    {
      kind: 'FOOD',
      name: '猪里脊',
      foodCategory: '畜肉类及制品',
      ingredientId: 'ing-1',
      reason: '低脂蛋白',
    },
    {
      kind: 'FOOD',
      name: '兔里脊',
      foodCategory: '畜肉类及制品',
      ingredientId: 'ing-2',
      reason: '低脂蛋白',
    },
    {
      kind: 'FOOD',
      name: '大米',
      foodCategory: '谷类及制品',
      ingredientId: 'ing-3',
      reason: '低脂碳水',
    },
    {
      kind: 'FOOD',
      name: '小米',
      foodCategory: '谷类及制品',
      ingredientId: 'ing-4',
      reason: '碳水轮换',
    },
    {
      kind: 'FOOD',
      name: '鹿肉',
      foodCategory: '畜肉类及制品',
      reason: '库外非常见蛋白',
    },
    {
      kind: 'FOOD',
      name: '鸭肉',
      foodCategory: '畜肉类及制品',
      reason: '库外非常见蛋白',
    },
  ];

  it('keeps library foods and marks outside foods as MISSING', () => {
    const normalized = normalizeSelection({
      summary: '按 CFCT 类型给候选',
      items: baseItems,
    });

    expect(normalized.items).toHaveLength(6);
    expect(normalized.items[0].dataStatus).toBe('AVAILABLE');
    expect(normalized.items[4].dataStatus).toBe('MISSING');
    expect(normalized.items[0].foodCategory).toBe('畜肉类及制品');
  });

  it('rejects a simplified category that is not one of the 15 CFCT classes', () => {
    expect(() =>
      normalizeSelection({
        summary: '简化分类',
        items: baseItems.map((item) => ({
          ...item,
          foodCategory: '肉类',
        })),
      }),
    ).toThrow('CFCT 固定 15 类');
  });

  it('rejects supplements in the selection stage', () => {
    expect(() =>
      normalizeSelection({
        summary: '补剂',
        items: [{ kind: 'SUPPLEMENT', name: '鱼油', reason: 'EPA' }],
      }),
    ).toThrow('选材阶段只列食材');
  });

  it('requires at least two candidates per category', () => {
    expect(() =>
      normalizeSelection({
        summary: '单候选',
        items: [
          ...baseItems.filter((item) => item.foodCategory !== '谷类及制品'),
          {
            kind: 'FOOD',
            name: '燕麦',
            foodCategory: '谷类及制品',
            ingredientId: 'ing-5',
            reason: '碳水',
          },
        ],
      }),
    ).toThrow('至少要有 2 个候选');
  });

  it('does not require outside-library candidates', () => {
    const normalized = normalizeSelection({
      summary: '全库内',
      items: baseItems.filter(
        (item) => item.name !== '鹿肉' && item.name !== '鸭肉',
      ),
    });
    expect(normalized.items).toHaveLength(4);
    expect(
      normalized.items.every((item) => item.dataStatus === 'AVAILABLE'),
    ).toBe(true);
  });
});
