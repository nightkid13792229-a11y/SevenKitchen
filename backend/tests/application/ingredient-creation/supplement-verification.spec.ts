import { findNutritionField } from '../../../src/domain/ingredient/nutrition-field-catalog';
import {
  buildDirectVerification,
  buildFinalizeInput,
  type DirectVerificationSnapshot,
} from '../../../src/application/ingredient-creation/supplement-verification';
import {
  emptySupplementDraftPayload,
  type SupplementDraftBasic,
  type SupplementDraftDiy,
  type SupplementDraftEquivalence,
  type SupplementDraftEvidence,
  type SupplementDraftLabel,
  type SupplementDraftNutrition,
  type SupplementDraftPayload,
  type SupplementDraftProcurement,
  type SupplementDraftRetail,
  type SupplementDraftReview,
} from '../../../src/application/ingredient-creation/supplement-draft.types';

/* ------------------------------------------------------------------ */
/* 载荷构造                                                            */
/* ------------------------------------------------------------------ */

interface DraftPatch {
  basic?: Partial<SupplementDraftBasic>;
  nutrition?: Partial<SupplementDraftNutrition>;
  label?: Partial<SupplementDraftLabel>;
  retail?: Partial<SupplementDraftRetail>;
  diy?: Partial<SupplementDraftDiy>;
  procurement?: Partial<SupplementDraftProcurement>;
  evidence?: Partial<SupplementDraftEvidence>;
  equivalence?: Partial<SupplementDraftEquivalence>;
  review?: Partial<SupplementDraftReview>;
}

function payload(patch: DraftPatch = {}): SupplementDraftPayload {
  const empty = emptySupplementDraftPayload();
  return {
    basic: {
      ...empty.basic,
      name: '鱼油（Omega-3）',
      brand: 'Nordic Naturals',
      productModel: '120 粒/瓶',
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
      ...empty.nutrition,
      servingNutrients: { 'fattyAcids.epa': 650 },
      defaultTargetFields: ['fattyAcids.epa'],
      labelText: 'Serving Size 2 Softgels',
      ...patch.nutrition,
    },
    label: {
      ...empty.label,
      labelCategory: 'FEED_ADDITIVE',
      labelNames: ['鱼油'],
      tagNames: ['油脂类'],
      labelNameSource: '饲料添加剂品种目录（2023 版）',
      ...patch.label,
    },
    retail: {
      ...empty.retail,
      enabled: true,
      shelfLifeMonths: 24,
      openedShelfLifeDays: 60,
      storageCondition: '避光、密封、阴凉干燥处保存',
      isOilBased: true,
      noSaleReason: null,
      ...patch.retail,
    },
    diy: {
      ...empty.diy,
      enabled: false,
      platform: 'IHERB',
      linkUrl: 'https://www.iherb.com/pr/x',
      imageUrl: 'https://img.example.com/x.jpg',
      ...patch.diy,
    },
    procurement: { enabled: true, ...patch.procurement },
    equivalence: {
      ...empty.equivalence,
      groupId: 'group-1',
      priority: null,
      reapproveGroup: true,
      ...patch.equivalence,
    },
    evidence: {
      ...empty.evidence,
      frontImageUrl: 'https://example.com/front.jpg',
      labelImageUrl: 'https://example.com/label.jpg',
      productUrl: 'https://www.iherb.com/pr/x',
      selectionNote: '按剂型与单价选出的那瓶',
      ...patch.evidence,
    },
    review: { acknowledgedWarnings: [], ...patch.review },
  };
}

/* ------------------------------------------------------------------ */
/* 核验快照构造                                                        */
/* ------------------------------------------------------------------ */

const EPA_FIELD = findNutritionField('fattyAcids.epa');

function snapshot(): DirectVerificationSnapshot {
  return {
    ingredient: {
      name: '鱼油（Omega-3）',
      brand: 'Nordic Naturals',
      productModel: '120 粒/瓶',
      purchaseChannel: 'iHerb',
      baseUnit: 'PCS',
      unitDisplayLabel: '粒',
      physicalForm: 'CAPSULE',
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 120,
      currentPricePerPurchaseUnit: 398,
      diyEnabled: true,
      procurementEnabled: true,
      shelfLifeMonths: 24,
      openedShelfLifeDays: 60,
      storageCondition: '避光、密封、阴凉干燥处保存',
      isOilBased: false,
      supplementRetailEnabled: true,
      equivalenceGroupId: 'group-1',
      equivalencePriority: 2,
      properties: {
        display_unit: '粒',
        serving_unit_label: '粒',
        serving_units_per_dose: 2,
        add_timing: 'BEFORE_MIXING',
        production_loss_rate: 1.05,
        label_category: 'FEED_ADDITIVE',
        label_names: ['鱼油'],
        label_name_source: '饲料添加剂品种目录（2023 版）',
        tags: ['油脂类'],
        no_sale_reason: null,
        purchase_link: {
          platform: 'IHERB',
          url: 'https://www.iherb.com/pr/x',
        },
        image_url: 'https://img.example.com/x.jpg',
      },
    },
    ingredientProfile: {
      nutrients: { 'fattyAcids.epa': 325 },
    },
    nutritionFood: {
      status: 'VERIFIED',
      category: 'SUPPLEMENT',
      nutrients: { 'fattyAcids.epa': 325 },
      defaultSupplementTargets: [
        {
          fieldPath: 'fattyAcids.epa',
          label: EPA_FIELD?.label ?? null,
          unit: EPA_FIELD?.unit ?? null,
        },
      ],
      primaryMapping: true,
      yieldRate: 1,
    },
    evidence: {
      productUrl: 'https://www.iherb.com/pr/x',
      frontImageUrl: 'https://example.com/front.jpg',
      labelImageUrl: 'https://example.com/label.jpg',
      labelText: 'Serving Size 2 Softgels',
      servingUnitsPerDose: 2,
      conversionSnapshot: {
        servingUnitsPerDose: 2,
        servingNutrients: { 'fattyAcids.epa': 650 },
        perUnitNutrients: { 'fattyAcids.epa': 325 },
        unitDisplayLabel: '粒',
      },
    },
    tags: ['油脂类'],
    group: { status: 'APPROVED' },
    draft: {
      status: 'FINALIZED',
      ingredientId: 'ing-1',
      nutritionFoodId: 'nf-1',
      evidenceId: 'ev-1',
    },
  };
}

function findField(
  result: ReturnType<typeof buildDirectVerification>,
  key: string,
) {
  const field = result.fields.find((item) => item.key === key);
  expect(field).toBeDefined();
  return field!;
}

/* ------------------------------------------------------------------ */
/* buildFinalizeInput                                                  */
/* ------------------------------------------------------------------ */

describe('buildFinalizeInput', () => {
  it('把草稿的每个区块都翻译成建档入参，且不送每粒值', () => {
    const input = buildFinalizeInput(payload());

    expect(input).toMatchObject({
      name: '鱼油（Omega-3）',
      brand: 'Nordic Naturals',
      productModel: '120 粒/瓶',
      purchaseChannel: 'iHerb',
      baseUnit: 'PCS',
      unitDisplayLabel: '粒',
      physicalForm: 'CAPSULE',
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 120,
      currentPricePerPurchaseUnit: 398,
      addTiming: 'BEFORE_MIXING',
      productionLossRate: 1.05,
      diyEnabled: false,
      procurementEnabled: true,
      labelCategory: 'FEED_ADDITIVE',
      labelNames: ['鱼油'],
      labelNameSource: '饲料添加剂品种目录（2023 版）',
      tagNames: ['油脂类'],
      servingUnitsPerDose: 2,
      servingNutrients: { 'fattyAcids.epa': 650 },
      defaultTargetFields: ['fattyAcids.epa'],
      shelfLifeMonths: 24,
      openedShelfLifeDays: 60,
      storageCondition: '避光、密封、阴凉干燥处保存',
      isOilBased: true,
      supplementRetailEnabled: true,
      imageUrl: 'https://img.example.com/x.jpg',
    });

    // 「每份多少」只在入参里出现一次；折算由建档服务做，客户端/草稿的每粒值不作数。
    expect(input).not.toHaveProperty('perUnitNutrients');

    // 上架=开：不允许留不上架原因。
    expect(input.noSaleReason).toBeNull();
  });

  it('上架关闭时保留不上架原因；DIY 关闭也保留链接与图片', () => {
    const input = buildFinalizeInput(
      payload({
        retail: {
          enabled: false,
          shelfLifeMonths: null,
          noSaleReason: 'CUSTOMER_REQUEST',
        },
        diy: { enabled: false },
      }),
    );

    expect(input.supplementRetailEnabled).toBe(false);
    expect(input.noSaleReason).toBe('CUSTOMER_REQUEST');
    expect(input.diyEnabled).toBe(false);
    expect(input.purchaseLink).toEqual({
      platform: 'IHERB',
      url: 'https://www.iherb.com/pr/x',
    });
    expect(input.imageUrl).toBe('https://img.example.com/x.jpg');
  });

  it('DIY 平台与链接都为空时不写购买链接', () => {
    const input = buildFinalizeInput(
      payload({
        diy: { enabled: false, platform: '  ', linkUrl: '', imageUrl: '' },
      }),
    );

    expect(input.purchaseLink).toBeNull();
    expect(input.imageUrl).toBeNull();
  });

  it('名称/标签去空格去重，空文本按 null 落库', () => {
    const input = buildFinalizeInput(
      payload({
        basic: { brand: '  ', productModel: ' ', purchaseChannel: '' },
        label: {
          labelNames: [' 鱼油 ', '鱼油', '   '],
          tagNames: [' 油脂类 ', '油脂类'],
          labelNameSource: '',
        },
        evidence: { productUrl: '  ' },
      }),
    );

    expect(input.brand).toBeNull();
    expect(input.productModel).toBeNull();
    expect(input.purchaseChannel).toBeNull();
    expect(input.labelNames).toEqual(['鱼油']);
    expect(input.tagNames).toEqual(['油脂类']);
    expect(input.labelNameSource).toBeNull();
    expect(input.evidence.productUrl).toBeNull();
  });

  it('选品依据有笔记时是 SKILL 快照，没有时是 MANUAL，且都带记录时间', () => {
    const withNote = buildFinalizeInput(payload());
    const withoutNote = buildFinalizeInput(
      payload({ evidence: { selectionNote: '   ' } }),
    );

    const selection = withNote.evidence.selection as {
      source: string;
      note: string | null;
      recordedAt: string;
    };
    expect(selection.source).toBe('SKILL');
    expect(selection.note).toBe('按剂型与单价选出的那瓶');
    expect(Number.isNaN(new Date(selection.recordedAt).getTime())).toBe(false);

    const manual = withoutNote.evidence.selection as {
      source: string;
      note: string | null;
    };
    expect(manual.source).toBe('MANUAL');
    expect(manual.note).toBeNull();
  });

  it('证据带上正面图、标签图、商品链接与标签原文', () => {
    const input = buildFinalizeInput(payload());

    expect(input.evidence).toMatchObject({
      productUrl: 'https://www.iherb.com/pr/x',
      frontImageUrl: 'https://example.com/front.jpg',
      labelImageUrl: 'https://example.com/label.jpg',
      labelText: 'Serving Size 2 Softgels',
    });
  });

  it('缺物理形态/份量时给兜底值，交给基础校验与建档服务拦', () => {
    const input = buildFinalizeInput(
      payload({
        basic: {
          physicalForm: null,
          servingUnitsPerDose: null,
          purchaseToBaseRatio: null,
          currentPricePerPurchaseUnit: null,
        },
      }),
    );

    expect(input.servingUnitsPerDose).toBe(0);
    expect(input.purchaseToBaseRatio).toBe(0);
    expect(input.currentPricePerPurchaseUnit).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* buildDirectVerification                                             */
/* ------------------------------------------------------------------ */

describe('buildDirectVerification', () => {
  it('完整覆盖 spec §9.1 的每一行', () => {
    const result = buildDirectVerification(snapshot(), snapshot());

    const keys = result.fields.map((field) => field.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        // 原料
        'ingredient.name',
        'ingredient.brand',
        'ingredient.productModel',
        'ingredient.purchaseChannel',
        'ingredient.baseUnit',
        'ingredient.unitDisplayLabel',
        'ingredient.physicalForm',
        'ingredient.purchaseUnit',
        'ingredient.purchaseToBaseRatio',
        'ingredient.currentPricePerPurchaseUnit',
        'ingredient.diyEnabled',
        'ingredient.procurementEnabled',
        'ingredient.shelfLifeMonths',
        'ingredient.openedShelfLifeDays',
        'ingredient.storageCondition',
        'ingredient.isOilBased',
        'ingredient.supplementRetailEnabled',
        'ingredient.equivalenceGroupId',
        'ingredient.equivalencePriority',
        // properties
        'properties.add_timing',
        'properties.production_loss_rate',
        'properties.label_category',
        'properties.label_names',
        'properties.label_name_source',
        'properties.tags',
        'properties.serving_units_per_dose',
        'properties.display_unit',
        'properties.no_sale_reason',
        'properties.purchase_link',
        'properties.image_url',
        // 营养档案
        'nutrition.status',
        'nutrition.category',
        'nutrition.nutrients.fattyAcids.epa',
        'ingredientProfile.nutrients.fattyAcids.epa',
        'nutrition.defaultSupplementTargets',
        'nutrition.primaryMapping',
        'nutrition.yieldRate',
        // 证据
        'evidence.productUrl',
        'evidence.frontImageUrl',
        'evidence.labelImageUrl',
        'evidence.labelText',
        'evidence.servingUnitsPerDose',
        'evidence.conversionSnapshot',
        // 标签 / 组 / 草稿
        'tags',
        'group.status',
        'draft.status',
        'draft.ingredientId',
        'draft.nutritionFoodId',
        'draft.evidenceId',
      ]),
    );
    // 每行都带生产落点，页面才能指出「写哪没写对」。
    for (const field of result.fields) {
      expect(field.target).toBeTruthy();
      expect(field.label).toBeTruthy();
    }
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('上架/保质期/DIY 链接/每份量不一致时都算不通过', () => {
    const expected = snapshot();

    const shelfLife = snapshot();
    shelfLife.ingredient.shelfLifeMonths = 12;
    const shelfLifeResult = buildDirectVerification(expected, shelfLife);
    expect(shelfLifeResult.ok).toBe(false);
    expect(findField(shelfLifeResult, 'ingredient.shelfLifeMonths').ok).toBe(
      false,
    );
    expect(shelfLifeResult.mismatches.join('；')).toContain('原厂保质期');

    const retail = snapshot();
    retail.ingredient.supplementRetailEnabled = false;
    const retailResult = buildDirectVerification(expected, retail);
    expect(
      findField(retailResult, 'ingredient.supplementRetailEnabled').ok,
    ).toBe(false);

    const diy = snapshot();
    diy.ingredient.properties.purchase_link = {
      platform: 'IHERB',
      url: 'https://www.iherb.com/pr/other',
    };
    const diyResult = buildDirectVerification(expected, diy);
    expect(findField(diyResult, 'properties.purchase_link').ok).toBe(false);

    const serving = snapshot();
    serving.ingredient.properties.serving_units_per_dose = 0.9;
    const servingResult = buildDirectVerification(expected, serving);
    expect(
      findField(servingResult, 'properties.serving_units_per_dose').ok,
    ).toBe(false);
    expect(servingResult.mismatches.join('；')).toContain('每份多少');
  });

  it('营养写进两处：任何一处缺值/写错都算不通过，两处都对才通过', () => {
    // 两处都对
    expect(buildDirectVerification(snapshot(), snapshot()).ok).toBe(true);

    // 营养档案（配方设计器读的那份）少一个值
    const missingInFood = snapshot();
    delete (missingInFood.nutritionFood.nutrients as Record<string, number>)[
      'fattyAcids.epa'
    ];
    const missingFoodResult = buildDirectVerification(
      snapshot(),
      missingInFood,
    );
    expect(
      findField(missingFoodResult, 'nutrition.nutrients.fattyAcids.epa').ok,
    ).toBe(false);
    expect(
      findField(missingFoodResult, 'ingredientProfile.nutrients.fattyAcids.epa')
        .ok,
    ).toBe(true);
    expect(missingFoodResult.ok).toBe(false);

    // 原料档案那一份写错（营养档案对）
    const wrongProfile = snapshot();
    wrongProfile.ingredientProfile.nutrients['fattyAcids.epa'] = 320;
    const wrongProfileResult = buildDirectVerification(
      snapshot(),
      wrongProfile,
    );
    expect(
      findField(
        wrongProfileResult,
        'ingredientProfile.nutrients.fattyAcids.epa',
      ).ok,
    ).toBe(false);
    expect(
      findField(wrongProfileResult, 'nutrition.nutrients.fattyAcids.epa').ok,
    ).toBe(true);
    expect(wrongProfileResult.mismatches.join('；')).toContain(
      '原料档案营养素值',
    );
  });

  it('价格按 Decimal(14,6) 归一：0.1234567 落库成 0.123457 不算不一致', () => {
    const expected = snapshot();
    expected.ingredient.currentPricePerPurchaseUnit = 0.1234567;
    const actual = snapshot();
    actual.ingredient.currentPricePerPurchaseUnit = 0.123457;

    const result = buildDirectVerification(expected, actual);
    expect(findField(result, 'ingredient.currentPricePerPurchaseUnit').ok).toBe(
      true,
    );

    // 真的差 1 分钱仍然要报出来
    const wrong = snapshot();
    wrong.ingredient.currentPricePerPurchaseUnit = 0.1234;
    expect(
      findField(
        buildDirectVerification(expected, wrong),
        'ingredient.currentPricePerPurchaseUnit',
      ).ok,
    ).toBe(false);
  });

  it('数字精确比较：差一个小数点也算不一致', () => {
    const expected = snapshot();
    const actual = snapshot();
    actual.nutritionFood.nutrients['fattyAcids.epa'] = 325.0000001;

    const result = buildDirectVerification(expected, actual);

    expect(findField(result, 'nutrition.nutrients.fattyAcids.epa').ok).toBe(
      false,
    );
    expect(result.ok).toBe(false);
  });

  it('JSON 深比较：键顺序无关，值不同/缺键都不通过', () => {
    const expected = snapshot();
    const reordered = snapshot();
    reordered.evidence.conversionSnapshot = {
      unitDisplayLabel: '粒',
      perUnitNutrients: { 'fattyAcids.epa': 325 },
      servingNutrients: { 'fattyAcids.epa': 650 },
      servingUnitsPerDose: 2,
    };
    expect(buildDirectVerification(expected, reordered).ok).toBe(true);

    const missing = snapshot();
    delete (missing.nutritionFood.nutrients as Record<string, number>)[
      'fattyAcids.epa'
    ];
    const missingResult = buildDirectVerification(expected, missing);
    expect(
      findField(missingResult, 'nutrition.nutrients.fattyAcids.epa').ok,
    ).toBe(false);

    const targets = snapshot();
    targets.nutritionFood.defaultSupplementTargets = [];
    expect(
      findField(
        buildDirectVerification(expected, targets),
        'nutrition.defaultSupplementTargets',
      ).ok,
    ).toBe(false);
  });

  it('properties 里没有的键按 null 计（Task 9 对空值不写键）', () => {
    const expected = snapshot();
    expected.ingredient.properties.image_url = null;
    const actual = snapshot();
    delete actual.ingredient.properties.no_sale_reason;
    delete actual.ingredient.properties.image_url;

    const result = buildDirectVerification(expected, actual);

    expect(result.ok).toBe(true);
    expect(findField(result, 'properties.no_sale_reason')).toMatchObject({
      expected: null,
      actual: null,
      ok: true,
    });
    expect(findField(result, 'properties.image_url')).toMatchObject({
      expected: null,
      actual: null,
      ok: true,
    });
  });

  it('标签名集合不看顺序；组状态/草稿 id 写错都算失败', () => {
    const expected = snapshot();
    const actual = snapshot();
    actual.tags = ['油脂类'];
    actual.draft.nutritionFoodId = 'nf-2';

    const result = buildDirectVerification(expected, actual);

    expect(findField(result, 'tags').ok).toBe(true);
    expect(findField(result, 'draft.nutritionFoodId').ok).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.mismatches.join('；')).toContain('已写入营养档案 id');
  });

  it('组状态参与核验：预期 APPROVED、实际 DRAFT 时不通过', () => {
    const expected = snapshot();
    const actual = snapshot();
    actual.group.status = 'DRAFT';

    const result = buildDirectVerification(expected, actual);

    expect(findField(result, 'group.status').ok).toBe(false);
    expect(result.mismatches.join('；')).toContain('等价组状态');
  });
});
