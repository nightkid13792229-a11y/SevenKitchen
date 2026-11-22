import {
  emptySupplementDraftPayload,
  normalizeSupplementDraftPayload,
} from '../../../src/application/ingredient-creation/supplement-draft.types';
import { computeDraftCompleteness } from '../../../src/application/ingredient-creation/supplement-draft-completeness';

describe('draft completeness', () => {
  it('empty draft reports required fields', () => {
    const empty = emptySupplementDraftPayload();
    const result = computeDraftCompleteness(empty);
    expect(result.filledRequired).toBe(0);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        'name',
        'physicalForm',
        'nutrition',
        'labelNames',
      ]),
    );
    expect(result.totalRequired).toBeGreaterThan(5);
  });

  it('fully filled draft has nothing missing', () => {
    const payload = normalizeSupplementDraftPayload({
      basic: {
        name: '鱼油',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        physicalForm: 'CAPSULE',
        servingUnitsPerDose: 2,
        purchaseUnit: '瓶',
        purchaseToBaseRatio: 120,
        currentPricePerPurchaseUnit: 398,
        addTiming: 'BEFORE_MIXING',
      },
      nutrition: {
        servingNutrients: { 'fattyAcids.epa': 650 },
        defaultTargetFields: ['fattyAcids.epa'],
      },
      label: {
        labelCategory: 'FEED_ADDITIVE',
        labelNames: ['鱼油'],
        tagNames: ['油脂类'],
      },
      retail: { enabled: true, shelfLifeMonths: 24, noSaleReason: null },
      diy: { enabled: false },
      procurement: { enabled: true },
      equivalence: { groupId: '__SKIP__' },
    });
    expect(computeDraftCompleteness(payload).missing).toEqual([]);
  });

  it('retail off requires a reason; retail on requires shelf life', () => {
    const payload = emptySupplementDraftPayload();
    payload.basic = { ...payload.basic, name: '鱼油' };
    payload.nutrition = {
      ...payload.nutrition,
      servingNutrients: { 'fattyAcids.epa': 650 },
      defaultTargetFields: ['fattyAcids.epa'],
    };
    payload.label = {
      ...payload.label,
      labelCategory: 'FEED_ADDITIVE',
      labelNames: ['鱼油'],
      tagNames: ['油脂类'],
    };
    payload.equivalence = { ...payload.equivalence, groupId: '__SKIP__' };
    const off = {
      ...payload,
      retail: { ...payload.retail, enabled: false, shelfLifeMonths: null },
    };
    expect(computeDraftCompleteness(off).missing).not.toContain('noSaleReason');
    const on = {
      ...payload,
      retail: { ...payload.retail, enabled: true, shelfLifeMonths: null },
    };
    expect(computeDraftCompleteness(on).missing).toContain('shelfLifeMonths');
  });
});

  it('DIY 开启只要求平台，商品链接是选填', () => {
    const payload = normalizeSupplementDraftPayload({
      basic: {
        name: '鱼油',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        physicalForm: 'CAPSULE',
        servingUnitsPerDose: 2,
        purchaseUnit: '瓶',
        purchaseToBaseRatio: 120,
        currentPricePerPurchaseUnit: 398,
        addTiming: 'BEFORE_MIXING',
      },
      nutrition: {
        servingNutrients: { 'fattyAcids.epa': 650 },
        defaultTargetFields: ['fattyAcids.epa'],
      },
      label: {
        labelCategory: 'FEED_ADDITIVE',
        labelNames: ['鱼油'],
        tagNames: ['油脂类'],
      },
      retail: { enabled: true, shelfLifeMonths: 24, noSaleReason: null },
      diy: { enabled: true, platform: 'TAOBAO', linkUrl: '' },
      procurement: { enabled: true },
      equivalence: { groupId: '__SKIP__' },
    });

    expect(computeDraftCompleteness(payload).missing).not.toContain('linkUrl');
    expect(computeDraftCompleteness(payload).missing).not.toContain('platform');
  });

  it('标签分类标签是选填：不填不影响必填完成度', () => {
    const payload = normalizeSupplementDraftPayload({
      basic: {
        name: '鱼油',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        physicalForm: 'CAPSULE',
        servingUnitsPerDose: 2,
        purchaseUnit: '瓶',
        purchaseToBaseRatio: 120,
        currentPricePerPurchaseUnit: 398,
        addTiming: 'BEFORE_MIXING',
      },
      nutrition: {
        servingNutrients: { 'fattyAcids.epa': 650 },
        defaultTargetFields: ['fattyAcids.epa'],
      },
      label: {
        labelCategory: 'FEED_ADDITIVE',
        labelNames: ['鱼油'],
        tagNames: [],
      },
      retail: { enabled: true, shelfLifeMonths: 24, noSaleReason: null },
      diy: { enabled: false },
      procurement: { enabled: true },
      equivalence: { groupId: '__SKIP__' },
    });

    expect(computeDraftCompleteness(payload).missing).not.toContain('tagNames');
  });
