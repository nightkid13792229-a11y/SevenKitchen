import {
  emptySupplementDraftPayload,
  type SupplementDraftBasic,
  type SupplementDraftLabel,
  type SupplementDraftNutrition,
  type SupplementDraftPayload,
  type SupplementDraftRetail,
} from '../../../src/application/ingredient-creation/supplement-draft.types';
import {
  validateSupplementDraftBasics,
  type SupplementDraftIssue,
  type SupplementDraftIssueCode,
} from '../../../src/application/ingredient-creation/supplement-draft-validation';

/**
 * 只覆盖基础校验会改到的区块；其余区块沿用空草稿。
 * 用 `Partial<区块>` 展开而不是整段手写，类型不对时 tsc 会直接报出来。
 */
interface DraftPatch {
  basic?: Partial<SupplementDraftBasic>;
  nutrition?: Partial<SupplementDraftNutrition>;
  label?: Partial<SupplementDraftLabel>;
  retail?: Partial<SupplementDraftRetail>;
}

function draft(patch: DraftPatch = {}): SupplementDraftPayload {
  const empty = emptySupplementDraftPayload();
  return {
    ...empty,
    basic: { ...empty.basic, ...patch.basic },
    nutrition: { ...empty.nutrition, ...patch.nutrition },
    label: { ...empty.label, ...patch.label },
    retail: { ...empty.retail, ...patch.retail },
  };
}

/** 一份基础项全部合规的草稿；每个用例只弄坏一处。 */
function validDraft(patch: DraftPatch = {}): SupplementDraftPayload {
  return draft({
    basic: {
      name: '鱼油',
      brand: 'Nordic Naturals',
      productModel: '120 粒',
      purchaseChannel: 'iHerb',
      baseUnit: 'PCS',
      unitDisplayLabel: '粒',
      physicalForm: 'CAPSULE',
      servingUnitsPerDose: 2,
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 120,
      currentPricePerPurchaseUnit: 398,
      productionLossRate: 1.05,
      addTiming: 'BEFORE_MIXING',
      ...patch.basic,
    },
    nutrition: {
      servingNutrients: { 'fattyAcids.epa': 650 },
      defaultTargetFields: ['fattyAcids.epa'],
      labelText: '',
      ...patch.nutrition,
    },
    label: {
      labelCategory: 'FEED_ADDITIVE',
      labelNames: ['鱼油'],
      tagNames: ['油脂类'],
      labelNameSource: '',
      ...patch.label,
    },
    retail: { ...patch.retail },
  });
}

function issuesOf(patch: DraftPatch = {}): SupplementDraftIssue[] {
  return validateSupplementDraftBasics(validDraft(patch));
}

function expectIssue(
  issues: SupplementDraftIssue[],
  code: SupplementDraftIssueCode,
  level: 'BLOCKER' | 'WARNING' = 'BLOCKER',
): void {
  expect(issues).toContainEqual(expect.objectContaining({ code, level }));
}

describe('validateSupplementDraftBasics', () => {
  it('一份填全的草稿没有基础问题', () => {
    // 上架关闭且没填不上架原因 —— 基础校验不接管条件项，留给功能校验。
    expect(validateSupplementDraftBasics(validDraft())).toEqual([]);
  });

  it('空草稿报出核心阻断项，且每条都有中文说明', () => {
    const issues = validateSupplementDraftBasics(emptySupplementDraftPayload());
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'NAME_REQUIRED',
        'PHYSICAL_FORM_REQUIRED',
        'NUTRIENT_EMPTY',
      ]),
    );
    for (const issue of issues) {
      expect(issue.message.trim().length).toBeGreaterThan(0);
      expect(['BLOCKER', 'WARNING']).toContain(issue.level);
    }
  });

  const formWords = [
    '胶囊',
    '片',
    '粉剂',
    '滴剂',
    '颗粒',
    '冲剂',
    '口服液',
    '软胶囊',
    '咀嚼片',
    '含片',
    '泡腾片',
    '片剂',
    '胶丸',
  ];

  it.each(formWords)('名称以「%s」结尾 → NAME_FORM_WORD 提醒', (word) => {
    expectIssue(
      issuesOf({ basic: { name: `鱼油${word}` } }),
      'NAME_FORM_WORD',
      'WARNING',
    );
  });

  const blockerCases: Array<[string, DraftPatch, SupplementDraftIssueCode]> = [
    ['名称为空', { basic: { name: '' } }, 'NAME_REQUIRED'],
    ['名称只有空白', { basic: { name: '   ' } }, 'NAME_REQUIRED'],
    ['名称超过 200 字', { basic: { name: '鱼'.repeat(201) } }, 'NAME_TOO_LONG'],
    [
      '品牌超过 100 字',
      { basic: { brand: '品'.repeat(101) } },
      'BRAND_TOO_LONG',
    ],
    [
      '产品规格超过 100 字',
      { basic: { productModel: '规'.repeat(101) } },
      'PRODUCT_MODEL_TOO_LONG',
    ],
    [
      '采购渠道超过 200 字',
      { basic: { purchaseChannel: '渠'.repeat(201) } },
      'PURCHASE_CHANNEL_TOO_LONG',
    ],
    [
      '没选物理形态',
      { basic: { physicalForm: null } },
      'PHYSICAL_FORM_REQUIRED',
    ],
    [
      '胶囊每份 1.5 粒',
      { basic: { servingUnitsPerDose: 1.5 } },
      'SERVING_SIZE_NOT_INTEGER',
    ],
    [
      '每份量缺失',
      { basic: { servingUnitsPerDose: null } },
      'SERVING_SIZE_REQUIRED',
    ],
    [
      '每份量为 0',
      { basic: { servingUnitsPerDose: 0 } },
      'SERVING_SIZE_REQUIRED',
    ],
    [
      '展示单位与 PCS 不 1:1',
      { basic: { unitDisplayLabel: 'g' } },
      'UNIT_DISPLAY_MISMATCH',
    ],
    [
      '展示单位用了「份」',
      { basic: { unitDisplayLabel: '份' } },
      'UNIT_DISPLAY_MISMATCH',
    ],
    [
      '营养素全为 0',
      { nutrition: { servingNutrients: { 'fattyAcids.epa': 0 } } },
      'NUTRIENT_EMPTY',
    ],
    ['营养素为空', { nutrition: { servingNutrients: {} } }, 'NUTRIENT_EMPTY'],
    [
      '营养素字段不在目录内',
      {
        nutrition: {
          servingNutrients: { 'fattyAcids.epa': 650, 'bogus.field': 1 },
        },
      },
      'NUTRIENT_FIELD_UNKNOWN',
    ],
    [
      '营养素为负数',
      {
        nutrition: {
          servingNutrients: {
            'fattyAcids.epa': 650,
            'minerals.zinc': -1,
          },
        },
      },
      'NUTRIENT_VALUE_INVALID',
    ],
    [
      '营养素为 NaN',
      {
        nutrition: {
          servingNutrients: {
            'fattyAcids.epa': 650,
            'minerals.zinc': Number.NaN,
          },
        },
      },
      'NUTRIENT_VALUE_INVALID',
    ],
    [
      '默认目标为空',
      { nutrition: { defaultTargetFields: [] } },
      'DEFAULT_TARGET_REQUIRED',
    ],
    [
      '默认目标没有对应值',
      { nutrition: { defaultTargetFields: ['minerals.zinc'] } },
      'DEFAULT_TARGET_INVALID',
    ],
    [
      '默认目标是目录外字段',
      { nutrition: { defaultTargetFields: ['bogus.field'] } },
      'DEFAULT_TARGET_INVALID',
    ],
    [
      '采购单位为空',
      { basic: { purchaseUnit: ' ' } },
      'PURCHASE_UNIT_REQUIRED',
    ],
    [
      '换算倍数为 0',
      { basic: { purchaseToBaseRatio: 0 } },
      'PURCHASE_RATIO_INVALID',
    ],
    [
      '换算倍数缺失',
      { basic: { purchaseToBaseRatio: null } },
      'PURCHASE_RATIO_INVALID',
    ],
    [
      '采购价为 0',
      { basic: { currentPricePerPurchaseUnit: 0 } },
      'PURCHASE_PRICE_INVALID',
    ],
    [
      '采购价缺失',
      { basic: { currentPricePerPurchaseUnit: null } },
      'PURCHASE_PRICE_INVALID',
    ],
    [
      '损耗率低于 1',
      { basic: { productionLossRate: 0.9 } },
      'PRODUCTION_LOSS_RATE_INVALID',
    ],
    [
      '损耗率高于 2',
      { basic: { productionLossRate: 2.1 } },
      'PRODUCTION_LOSS_RATE_INVALID',
    ],
    [
      '没选标签分类',
      { label: { labelCategory: null } },
      'LABEL_CATEGORY_REQUIRED',
    ],
    ['标签名称为空', { label: { labelNames: [] } }, 'LABEL_NAMES_REQUIRED'],
    [
      '标签名称全是空白',
      { label: { labelNames: ['  ', ''] } },
      'LABEL_NAMES_REQUIRED',
    ],
    ['添加时机为空', { basic: { addTiming: '' } }, 'ADD_TIMING_INVALID'],
    [
      '添加时机不在允许值内',
      { basic: { addTiming: 'AFTER_MEAL' } },
      'ADD_TIMING_INVALID',
    ],
    [
      '开盖保质期是小数',
      { retail: { openedShelfLifeDays: 1.5 } },
      'OPENED_SHELF_LIFE_DAYS_INVALID',
    ],
    [
      '开盖保质期为 0',
      { retail: { openedShelfLifeDays: 0 } },
      'OPENED_SHELF_LIFE_DAYS_INVALID',
    ],
    [
      '开盖保质期为负数',
      { retail: { openedShelfLifeDays: -7 } },
      'OPENED_SHELF_LIFE_DAYS_INVALID',
    ],
  ];

  it.each(blockerCases)('%s → %s', (_name, patch, code) => {
    expectIssue(issuesOf(patch), code);
  });

  describe('允许的情形', () => {
    it('粉剂可以按平勺计（PCS + 平勺）', () => {
      expect(
        issuesOf({
          basic: {
            physicalForm: 'POWDER',
            baseUnit: 'PCS',
            unitDisplayLabel: '平勺',
            servingUnitsPerDose: 1,
          },
        }),
      ).toEqual([]);
    });

    it('液体可以按滴计（PCS + 滴）', () => {
      expect(
        issuesOf({
          basic: {
            physicalForm: 'LIQUID',
            baseUnit: 'PCS',
            unitDisplayLabel: '滴',
            servingUnitsPerDose: 4,
          },
        }),
      ).toEqual([]);
    });

    it('标签分类标签是选填：空数组不阻断', () => {
      expect(issuesOf({ label: { tagNames: [] } })).toEqual([]);
    });

    it('粉剂每份 0.9 g 可以是小数', () => {
      const issues = issuesOf({
        basic: {
          physicalForm: 'POWDER',
          baseUnit: 'G',
          unitDisplayLabel: 'g',
          servingUnitsPerDose: 0.9,
        },
      });
      expect(issues).toEqual([]);
    });

    it('液体每份 2.5 ml 可以是小数', () => {
      const issues = issuesOf({
        basic: {
          physicalForm: 'LIQUID',
          baseUnit: 'ML',
          unitDisplayLabel: 'ml',
          servingUnitsPerDose: 2.5,
        },
      });
      expect(issues).toEqual([]);
    });

    it('PCS 每份 1 粒可以是整数', () => {
      expect(issuesOf({ basic: { servingUnitsPerDose: 1 } })).toEqual([]);
    });

    it('添加时机允许 BEFORE_MEAL', () => {
      expect(issuesOf({ basic: { addTiming: 'BEFORE_MEAL' } })).toEqual([]);
    });

    it('开盖保质期为正整数时可以填', () => {
      expect(issuesOf({ retail: { openedShelfLifeDays: 30 } })).toEqual([]);
    });

    it('长度正好卡在上限不算超长', () => {
      expect(
        issuesOf({
          basic: {
            name: '鱼'.repeat(200),
            brand: '品'.repeat(100),
            productModel: '规'.repeat(100),
            purchaseChannel: '渠'.repeat(200),
          },
        }),
      ).toEqual([]);
    });
  });
});
