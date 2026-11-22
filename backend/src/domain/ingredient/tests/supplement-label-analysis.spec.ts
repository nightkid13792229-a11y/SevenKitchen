import {
  buildAnalysisPrompt,
  parseAnalysisJson,
  validateAnalysis,
  type AnalysisContext,
} from '../supplement-label-analysis';

function ctx(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    frontText: 'SWANSON\nAlbion Ferrochel Iron\n¥77.02\n180 CAPSULES\niHerb',
    labelText: 'Supplement Facts\nServing Size 1 Capsule\nIron 18 mg 100%',
    additiveCatalog: ['甘氨酸铁络（螯）合物', '牛磺酸'],
    materialCatalog: ['鱼油'],
    nutrientLabel: '铁',
    saltNameZh: '甘氨酸',
    allowedFields: [{ fieldPath: 'minerals.iron', label: '铁', unit: 'mg' }],
    allowedTags: ['矿物质', '维生素'],
    allowedAddTimings: ['BEFORE_MIXING', 'BEFORE_MEAL'],
    ...overrides,
  };
}

describe('validateAnalysis', () => {
  it('接受完整且自洽的结论', () => {
    const { result, dropped } = validateAnalysis(
      {
        name: '甘氨酸亚铁',
        brand: 'SWANSON',
        priceCny: 77.02,
        purchaseChannel: 'iHerb',
        physicalForm: 'CAPSULE',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        servingUnitsPerDose: 1,
        nutrients: [{ fieldPath: 'minerals.iron', value: 18, unit: 'mg' }],
        labelCategory: 'FEED_ADDITIVE',
        labelNames: ['甘氨酸铁络（螯）合物'],
        tagNames: ['矿物质'],
        addTiming: 'BEFORE_MIXING',
      },
      ctx(),
    );
    expect(result.name).toBe('甘氨酸亚铁');
    expect(result.priceCny).toBe(77.02);
    expect(result.baseUnit).toBe('PCS');
    expect(result.labelNames).toEqual(['甘氨酸铁络（螯）合物']);
    expect(dropped).toHaveLength(0);
  });

  it('价格在原文里找不到也保留，但要提醒核对', () => {
    const { result, dropped } = validateAnalysis({ priceCny: 99.99 }, ctx());
    expect(result.priceCny).toBe(99.99);
    expect(dropped.some((item) => item.field === 'priceCny')).toBe(true);
  });

  it('营养素按模型给的值收，不再和代码解析结果对账', () => {
    const { result, dropped } = validateAnalysis(
      { nutrients: [{ fieldPath: 'minerals.iron', value: 18, unit: 'mg' }] },
      ctx(),
    );
    expect(result.nutrients).toEqual([
      { fieldPath: 'minerals.iron', value: 18, unit: 'mg' },
    ]);
    expect(dropped).toHaveLength(0);
  });

  it('不允许的营养素字段直接忽略', () => {
    const { result, dropped } = validateAnalysis(
      {
        nutrients: [
          { fieldPath: 'minerals.iron', value: 18, unit: 'mg' },
          { fieldPath: 'minerals.gold', value: 1, unit: 'mg' },
        ],
      },
      ctx(),
    );
    expect(result.nutrients.map((row) => row.fieldPath)).toEqual([
      'minerals.iron',
    ]);
    expect(dropped.some((item) => item.reason.includes('不是允许'))).toBe(true);
  });

  it('基准单位与剂型冲突时按剂型纠正（粉 → G）', () => {
    const { result, dropped } = validateAnalysis(
      { physicalForm: 'POWDER', baseUnit: 'PCS', unitDisplayLabel: '粒' },
      ctx(),
    );
    expect(result.baseUnit).toBe('G');
    expect(result.unitDisplayLabel).toBe('粒');
    expect(dropped.some((item) => item.field === 'baseUnit')).toBe(true);
  });

  it('目录里没有的标签名照样填上，但要提醒核对', () => {
    const { result, dropped } = validateAnalysis(
      { labelNames: ['甘氨酸铁络（螯）合物', '我自己编的添加剂'] },
      ctx(),
    );
    expect(result.labelNames).toEqual(['甘氨酸铁络（螯）合物', '我自己编的添加剂']);
    expect(dropped.some((item) => item.field === 'labelNames')).toBe(true);
  });

  it('标签类型只接受两个枚举', () => {
    expect(validateAnalysis({ labelCategory: 'FEED_MATERIAL' }, ctx()).result.labelCategory).toBe(
      'FEED_MATERIAL',
    );
    expect(validateAnalysis({ labelCategory: '随便' }, ctx()).result.labelCategory).toBeNull();
  });
});

describe('validateAnalysis · 原料目录', () => {
  it('鱼油可以标成饲料原料，并从原料目录取名', () => {
    const fishCtx = ctx({
      additiveCatalog: [],
      materialCatalog: ['鱼油'],
      nutrientLabel: '鱼油',
      saltNameZh: null,
      allowedFields: [{ fieldPath: 'fattyAcids.epa', label: 'EPA', unit: 'mg' }],
      frontText: 'NOW Foods 鱼油 ¥168.00'
    });
    const { result } = validateAnalysis(
      { name: '鱼油', labelCategory: 'FEED_MATERIAL', labelNames: ['鱼油'], priceCny: 168 },
      fishCtx,
    );
    expect(result.labelCategory).toBe('FEED_MATERIAL');
    expect(result.labelNames).toEqual(['鱼油']);
    expect(result.priceCny).toBe(168);
  });
});

describe('validateAnalysis · 标签名清洗', () => {
  it('「鱼油（分类）」这种抄法会剥掉括号再对目录', () => {
    const fishCtx = ctx({
      additiveCatalog: [],
      materialCatalog: ['鱼油'],
      nutrientLabel: '鱼油',
      saltNameZh: null,
      allowedFields: []
    });
    const { result, dropped } = validateAnalysis(
      { name: '鱼油', labelCategory: 'FEED_MATERIAL', labelNames: ['鱼油（鱼、其它水生生物及其副产品）'] },
      fishCtx,
    );
    expect(result.labelNames).toEqual(['鱼油']);
    expect(dropped).toHaveLength(0);
  });
});

describe('parseAnalysisJson', () => {
  it('剥掉代码块包装', () => {
    expect(parseAnalysisJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('不是 JSON 就返回 null', () => {
    expect(parseAnalysisJson('我觉得应该买甘氨酸亚铁')).toBeNull();
  });
});

describe('buildAnalysisPrompt', () => {
  it('把目录候选、枚举和编号规则都写进提示词', () => {
    const prompt = buildAnalysisPrompt(ctx());
    expect(prompt).toContain('甘氨酸铁络（螯）合物');
    expect(prompt).toContain('FEED_MATERIAL');
    expect(prompt).toContain('minerals.iron');
    expect(prompt).toContain('化学形态名');
  });

  it('把字段单位和换算口径写进提示词（mg → IU 由模型算）', () => {
    const prompt = buildAnalysisPrompt(ctx());
    expect(prompt).toContain('minerals.iron（铁，单位 mg）');
    expect(prompt).toContain('1 mg = 1.49 IU');
    expect(prompt).toContain('μg = 40 IU');
    expect(prompt).toContain('μg RAE = 3.33 IU');
    expect(prompt).toContain('%DV');
    expect(prompt).toContain('不要直接抄标签数字');
  });
});

describe('validateAnalysis · 默认目标营养素', () => {
  it('只保留自己列出来的营养素', () => {
    const { result } = validateAnalysis(
      {
        nutrients: [{ fieldPath: 'minerals.iron', value: 18, unit: 'mg' }],
        defaultTargetFields: ['minerals.iron', 'minerals.zinc'],
      },
      ctx(),
    );
    expect(result.defaultTargetFields).toEqual(['minerals.iron']);
  });

  it('没给就是空数组，不猜', () => {
    expect(validateAnalysis({}, ctx()).result.defaultTargetFields).toEqual([]);
  });
});
