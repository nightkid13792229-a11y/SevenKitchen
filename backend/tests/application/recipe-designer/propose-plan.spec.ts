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
  it('marks a food without ids as MISSING and keeps supplements with ids', () => {
    const normalized = normalizeSelection({
      summary: '主蛋白兔/猪，补剂用库内',
      items: [
        { kind: 'FOOD', name: '鹿肉', reason: '低脂红肉' },
        {
          kind: 'SUPPLEMENT',
          name: '鱼油',
          ingredientId: 'ing-1',
          reason: 'EPA/DHA',
        },
      ],
    });

    expect(normalized.items[0].dataStatus).toBe('MISSING');
    expect(normalized.items[1].dataStatus).toBe('AVAILABLE');
  });

  it('rejects a supplement without a library id', () => {
    expect(() =>
      normalizeSelection({
        summary: '补剂',
        items: [{ kind: 'SUPPLEMENT', name: '鱼油', reason: 'EPA' }],
      }),
    ).toThrow('必须来自原料库');
  });
});
