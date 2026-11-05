import type { IngredientDraft } from 'src/application/ingredient-creation/ingredient-creation.types';
import {
  INGREDIENT_CARD_RULES,
  runIngredientCardCheck,
} from 'src/domain/ingredient-creation/ingredient-card-check';
import { INGREDIENT_CARD_FIELDS } from 'src/domain/ingredient-creation/ingredient-card-fields';

/** 干净草稿：填 9 个必填项，其余字段都留空。 */
const base: IngredientDraft = {
  name: '冷冻三文鱼',
  type: 'FOOD',
  baseUnit: 'G',
  unitDisplayLabel: '克',
  cfctClass: '鱼类及制品',
  procurementStrategy: 'DAILY_PURCHASE',
  edibleYieldRate: 0.95,
  labelCategory: 'FEED_MATERIAL',
  labelNames: ['三文鱼'],
};

const check = (
  ingredient: IngredientDraft | null,
  existingNames: readonly string[] = [],
) => runIngredientCardCheck({ ingredient, existingNames });

const codes = (
  ingredient: IngredientDraft | null,
  existingNames: readonly string[] = [],
) => check(ingredient, existingNames).map((item) => item.code);

/** 有必填校验的 9 项，不计入完整度提醒。 */
const REQUIRED_FIELD_KEYS: ReadonlySet<string> = new Set([
  'name',
  'type',
  'baseUnit',
  'unitDisplayLabel',
  'cfctClass',
  'procurementStrategy',
  'edibleYieldPercent',
  'labelCategory',
  'labelNames',
]);

/** 枚举字段给合法值，其余按类型给一个非空值：完整度只看「有没有值」。 */
function sampleValue(field: (typeof INGREDIENT_CARD_FIELDS)[number]): unknown {
  if (field.key === 'labelCategory') return 'FEED_MATERIAL';
  if (field.key === 'labelNames') return ['三文鱼'];
  if (field.key === 'procurementStrategy') return 'DAILY_PURCHASE';
  if (field.valueType === 'STRING_ARRAY') return ['x'];
  return field.valueType === 'NUMBER' || field.valueType === 'BOOLEAN'
    ? 1
    : 'x';
}

/** 从字段契约生成「所有 CREATABLE 非必填字段都有值」的草稿。 */
function filledDraft(): Record<string, unknown> {
  const draft: Record<string, unknown> = {
    name: '鹌鹑肉',
    type: 'FOOD',
    baseUnit: 'G',
    unitDisplayLabel: '克',
    cfctClass: '禽肉类及制品',
    procurementStrategy: 'DAILY_PURCHASE',
    edibleYieldRate: 0.95,
    labelCategory: 'FEED_MATERIAL',
    labelNames: ['鹌鹑肉'],
  };
  for (const field of INGREDIENT_CARD_FIELDS) {
    if (field.stage !== 'CREATABLE' || REQUIRED_FIELD_KEYS.has(field.key)) {
      continue;
    }
    draft[field.key] = sampleValue(field);
  }
  return draft;
}

const draftOf = (value: Record<string, unknown>): IngredientDraft =>
  value as unknown as IngredientDraft;

describe('runIngredientCardCheck', () => {
  it('干净草稿只有完整度提醒，没有阻断 / 例外', () => {
    const items = check(base);
    const levels = new Map(
      INGREDIENT_CARD_RULES.map((rule) => [rule.code, rule.level]),
    );

    expect(items.filter((item) => levels.get(item.code) !== 'warning')).toEqual(
      [],
    );
    expect(items.map((item) => item.code)).toEqual(['FIELDS_EMPTY']);
  });

  it('空字段给出唯一一条完整度提醒，不阻断、不可例外', () => {
    const warnings = check(base).filter((item) => item.code === 'FIELDS_EMPTY');

    expect(warnings).toHaveLength(1);
    // 无法定位到单格，所以不带 fieldPath。
    expect(warnings[0].fieldPath).toBeUndefined();
    expect(warnings[0].message).toMatch(/还有 \d+ 项没填/);
    expect(warnings[0].message).toBe(
      '还有 5 项没填：标签分类、单个重量(克)、主要营养价值、采购价格、名称依据',
    );
    expect(warnings[0].suggestion).toBe('这些不是阻断项，补不补由你定');
    expect(
      INGREDIENT_CARD_RULES.find((rule) => rule.code === 'FIELDS_EMPTY')?.level,
    ).toBe('warning');
  });

  it('填满 CREATABLE 非必填字段后不再提示完整度', () => {
    expect(codes(draftOf(filledDraft()))).not.toContain('FIELDS_EMPTY');
  });

  it('AFTER_CREATE 字段留空不报完整度缺失', () => {
    const filled = filledDraft();
    for (const field of INGREDIENT_CARD_FIELDS) {
      if (field.stage === 'AFTER_CREATE') {
        filled[field.key] = null;
      }
    }

    expect(codes(draftOf(filled))).not.toContain('FIELDS_EMPTY');
  });

  it('数字 0 与布尔 false 算已填，不算完整度缺失', () => {
    const filled = filledDraft();
    for (const field of INGREDIENT_CARD_FIELDS) {
      if (field.stage !== 'CREATABLE' || REQUIRED_FIELD_KEYS.has(field.key)) {
        continue;
      }
      if (field.valueType === 'NUMBER') filled[field.key] = 0;
      if (field.valueType === 'BOOLEAN') filled[field.key] = false;
    }

    expect(codes(draftOf(filled))).not.toContain('FIELDS_EMPTY');
  });

  it('可食部按草稿里的比例 edibleYieldRate 判断，已填不算空', () => {
    const filled = filledDraft();
    delete filled.edibleYieldPercent;
    filled.edibleYieldRate = 0.75;

    expect(codes(draftOf(filled))).not.toContain('FIELDS_EMPTY');
  });

  it('草稿为 null 时只报名称必填', () => {
    const items = check(null);

    expect(items).toHaveLength(1);
    expect(items[0].code).toBe('NAME_REQUIRED');
    expect(items[0].fieldPath).toBe('ingredient.name');
  });

  it('名称只有空白（含全角空格）时算必填缺失', () => {
    expect(codes({ ...base, name: '   ' })).toContain('NAME_REQUIRED');
    expect(codes({ ...base, name: '\u3000\u3000' })).toContain('NAME_REQUIRED');
  });

  it('全角空格与半角空格归一后仍算重名', () => {
    expect(codes({ ...base, name: '冷冻　三文鱼' }, ['冷冻 三文鱼'])).toContain(
      'NAME_DUPLICATE',
    );
  });

  it('比较重名时忽略大小写、首尾空白与连续空白', () => {
    expect(
      codes({ ...base, name: '  FROZEN   Salmon ' }, ['frozen salmon']),
    ).toContain('NAME_DUPLICATE');
    expect(
      codes({ ...base, name: '冷冻 三文鱼' }, ['  冷冻　三文鱼  ']),
    ).toContain('NAME_DUPLICATE');
  });

  it('名字不同不报重名', () => {
    expect(codes(base, ['冷冻鳕鱼'])).not.toContain('NAME_DUPLICATE');
  });

  it('基本单位只能是 G / ML / PCS', () => {
    for (const unit of ['G', 'ML', 'PCS'] as const) {
      expect(codes({ ...base, baseUnit: unit })).not.toContain(
        'BASE_UNIT_INVALID',
      );
    }

    const items = check({ ...base, baseUnit: 'KG' as never });
    expect(items.map((item) => item.code)).toContain('BASE_UNIT_INVALID');
    expect(
      items.find((item) => item.code === 'BASE_UNIT_INVALID')?.fieldPath,
    ).toBe('ingredient.baseUnit');
  });

  it('单位展示名称不能为空', () => {
    const items = check({ ...base, unitDisplayLabel: '  ' });

    expect(items.map((item) => item.code)).toContain('UNIT_LABEL_REQUIRED');
    expect(
      items.find((item) => item.code === 'UNIT_LABEL_REQUIRED')?.fieldPath,
    ).toBe('ingredient.unitDisplayLabel');
  });

  it('CFCT 分类必填', () => {
    for (const cfctClass of [undefined, null, '  ']) {
      const items = check({ ...base, cfctClass: cfctClass as never });
      expect(items.map((item) => item.code)).toContain('CFCT_REQUIRED');
      expect(
        items.find((item) => item.code === 'CFCT_REQUIRED')?.fieldPath,
      ).toBe('ingredient.cfctClass');
    }
  });

  it('采购策略必填，且只认受控词表', () => {
    for (const procurementStrategy of [undefined, null, '', '长期采购']) {
      const items = check({
        ...base,
        procurementStrategy: procurementStrategy as never,
      });
      expect(items.map((item) => item.code)).toContain(
        'PURCHASE_STRATEGY_REQUIRED',
      );
    }
    for (const procurementStrategy of [
      'DAILY_PURCHASE',
      'STOCK_REPLENISHMENT',
      'HYBRID',
    ]) {
      expect(
        codes({ ...base, procurementStrategy }),
      ).not.toContain('PURCHASE_STRATEGY_REQUIRED');
    }
  });

  it('可食部必填，且 10%–100% 之外阻断', () => {
    for (const edibleYieldRate of [undefined, null]) {
      expect(codes({ ...base, edibleYieldRate: edibleYieldRate as never })).toContain(
        'EDIBLE_REQUIRED',
      );
    }
    expect(codes({ ...base, edibleYieldRate: 0.05 })).toContain('EDIBLE_RANGE');
    expect(codes({ ...base, edibleYieldRate: 1.5 })).toContain('EDIBLE_RANGE');
    expect(codes({ ...base, edibleYieldRate: 0.1 })).not.toContain(
      'EDIBLE_RANGE',
    );
    expect(codes({ ...base, edibleYieldRate: 1 })).not.toContain('EDIBLE_RANGE');
  });

  it('标签类型必须选，空值与目录外值都阻断', () => {
    for (const labelCategory of [undefined, null, 'NOT_A_CATEGORY']) {
      const items = check({
        ...base,
        labelCategory: labelCategory as never,
      });
      expect(items.map((item) => item.code)).toContain(
        'LABEL_CATEGORY_REQUIRED',
      );
      expect(
        items.find((item) => item.code === 'LABEL_CATEGORY_REQUIRED')
          ?.fieldPath,
      ).toBe('ingredient.labelCategory');
    }
  });

  it('标签名称至少一项，空白项不算', () => {
    for (const labelNames of [[], ['  '], undefined]) {
      expect(
        codes({ ...base, labelNames: labelNames as never }),
      ).toContain('LABEL_NAMES_REQUIRED');
    }
    expect(codes({ ...base, labelNames: ['三文鱼'] })).not.toContain(
      'LABEL_NAMES_REQUIRED',
    );
  });

  it('基准单位为毫升时密度必填，大于 0', () => {
    const ml: IngredientDraft = { ...base, baseUnit: 'ML' };
    expect(codes(ml)).toContain('DENSITY_REQUIRED');
    expect(codes({ ...ml, densityGPerMl: 0 })).toContain('DENSITY_REQUIRED');
    expect(codes({ ...ml, densityGPerMl: 1.03 })).not.toContain(
      'DENSITY_REQUIRED',
    );
    expect(codes(base)).not.toContain('DENSITY_REQUIRED');
  });

  it('可食部 0 与 1.5 都不合格，1 合法', () => {
    expect(codes({ ...base, edibleYieldRate: 0 })).toContain('EDIBLE_RANGE');
    expect(codes({ ...base, edibleYieldRate: 1.5 })).toContain('EDIBLE_RANGE');
    expect(codes({ ...base, edibleYieldRate: 1 })).not.toContain(
      'EDIBLE_RANGE',
    );
    expect(codes({ ...base, edibleYieldRate: 0.75 })).not.toContain(
      'EDIBLE_RANGE',
    );
    expect(codes({ ...base, edibleYieldRate: null })).not.toContain(
      'EDIBLE_RANGE',
    );
  });

  it('可食部的 fieldPath 用公共名 edibleYieldPercent，而不是存储名 edibleYieldRate', () => {
    const item = check({ ...base, edibleYieldRate: 0 }).find(
      (candidate) => candidate.code === 'EDIBLE_RANGE',
    );

    expect(item?.fieldPath).toBe('ingredient.edibleYieldPercent');
    expect(item?.fieldPath).not.toContain('edibleYieldRate');
  });

  it('多个问题按规则表的固定顺序返回', () => {
    const messy: IngredientDraft = {
      name: '  ',
      type: 'FOOD',
      baseUnit: 'KG' as never,
      unitDisplayLabel: '',
      edibleYieldRate: 0,
    };

    expect(codes(messy)).toEqual([
      'NAME_REQUIRED',
      'BASE_UNIT_INVALID',
      'UNIT_LABEL_REQUIRED',
      'CFCT_REQUIRED',
      'PURCHASE_STRATEGY_REQUIRED',
      'LABEL_CATEGORY_REQUIRED',
      'LABEL_NAMES_REQUIRED',
      'EDIBLE_RANGE',
      'FIELDS_EMPTY',
    ]);
  });

  it('每条都带中文说明与一句建议；能定位到单格的带 fieldPath', () => {
    const items = check({
      name: '  ',
      type: 'FOOD',
      baseUnit: 'KG' as never,
      unitDisplayLabel: '',
      edibleYieldRate: 0,
    });

    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.code === 'FIELDS_EMPTY')).toBe(true);
    for (const item of items) {
      if (item.code === 'FIELDS_EMPTY') {
        expect(item.fieldPath).toBeUndefined();
      } else {
        expect(item.fieldPath).toMatch(/^ingredient\./);
      }
      expect(item.message).toMatch(/[\u4e00-\u9fff]/);
      expect(item.suggestion?.trim()).toBeTruthy();
    }
  });

  it('规则表按固定顺序列全本任务实现的规则，且不含 PRICE_LOOKS_PROMO', () => {
    expect(INGREDIENT_CARD_RULES.map((rule) => rule.code)).toEqual([
      'NAME_REQUIRED',
      'NAME_DUPLICATE',
      'BASE_UNIT_INVALID',
      'UNIT_LABEL_REQUIRED',
      'CFCT_REQUIRED',
      'PURCHASE_STRATEGY_REQUIRED',
      'LABEL_CATEGORY_REQUIRED',
      'LABEL_NAMES_REQUIRED',
      'DENSITY_REQUIRED',
      'EDIBLE_REQUIRED',
      'EDIBLE_RANGE',
      'FIELDS_EMPTY',
    ]);
    expect(INGREDIENT_CARD_RULES).toEqual([
      { code: 'NAME_REQUIRED', level: 'blocking' },
      { code: 'NAME_DUPLICATE', level: 'blocking' },
      { code: 'BASE_UNIT_INVALID', level: 'blocking' },
      { code: 'UNIT_LABEL_REQUIRED', level: 'blocking' },
      { code: 'CFCT_REQUIRED', level: 'blocking' },
      { code: 'PURCHASE_STRATEGY_REQUIRED', level: 'blocking' },
      { code: 'LABEL_CATEGORY_REQUIRED', level: 'blocking' },
      { code: 'LABEL_NAMES_REQUIRED', level: 'blocking' },
      { code: 'DENSITY_REQUIRED', level: 'blocking' },
      { code: 'EDIBLE_REQUIRED', level: 'blocking' },
      { code: 'EDIBLE_RANGE', level: 'blocking' },
      { code: 'FIELDS_EMPTY', level: 'warning' },
    ]);
    expect(
      INGREDIENT_CARD_RULES.find((rule) => rule.code === 'NAME_REQUIRED')
        ?.level,
    ).toBe('blocking');
    expect(
      INGREDIENT_CARD_RULES.find((rule) => rule.code === 'EDIBLE_RANGE')?.level,
    ).toBe('blocking');
    expect(
      INGREDIENT_CARD_RULES.find((rule) => rule.code === 'FIELDS_EMPTY')?.level,
    ).toBe('warning');
    expect(
      INGREDIENT_CARD_RULES.some((rule) => rule.code === 'PRICE_LOOKS_PROMO'),
    ).toBe(false);
  });
});
