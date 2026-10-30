import {
  buildDraftLaunchReadiness,
  type BuildDraftLaunchReadinessInput,
} from '../../../src/domain/recipe-designer/launch-readiness';

/**
 * 上线门槛 · 产品展示与设计分支（2026-10-22）
 *
 * 覆盖：
 *  · 公共项（COMMON）继续对两种设计模式生效；
 *  · 产品展示（PRESENTATION）对 CATALOG / ORDER 都是硬阻断；
 *  · 产品线（CATALOG）额外要求描述 / 卖点 / 适用生命阶段，目标健康标签只提醒；
 *  · 订单（ORDER）额外要求订单号 / 份数 / 顾客爱犬；
 *  · 分支专属的提醒不会与公共提醒重复。
 */

const VALID_PRESENTATION = {
  coverImageUrl: 'https://img.example.com/cover.jpg',
  coverTitle: '鸡肉成犬',
  description: '鲜鸡肉为主料，适合成犬日常维持。',
  sellingPoint: '鲜肉低敏，日常维持',
  applicableLifeStages: ['HIGH_ACTIVITY_ADULT'],
  targetHealthTags: ['JOINT'],
};

const VALID_ORDER = {
  orderId: 'order-1',
  orderQuantity: 2,
  customerDogId: 'dog-1',
};

function baseInput(
  overrides: Partial<BuildDraftLaunchReadinessInput> = {},
): BuildDraftLaunchReadinessInput {
  return {
    draftId: 'draft-1',
    designMode: 'CATALOG',
    name: '鸡肉成犬配方',
    items: [
      {
        id: 'item-food',
        ingredientId: 'ingredient-food',
        name: '鸡胸肉',
        included: true,
        isSupplement: false,
        preparationMethod: '蒸熟',
      },
    ],
    productionStepCount: 1,
    assessment: {
      totalWeightG: 100,
      energyDensityKcalPerKg: 955,
      dryMatterEnergyDensityKcalPerKg: 4800,
      overallStatus: 'COMPLIANT',
      deficientCount: 0,
      excessCount: 0,
      missingDataCount: 0,
      dataGaps: [],
    },
    reportAvailable: true,
    presentation: { ...VALID_PRESENTATION },
    order: { ...VALID_ORDER },
    ...overrides,
  };
}

function codes(issues: Array<{ code: string }>) {
  return issues.map((issue) => issue.code);
}

describe('buildDraftLaunchReadiness · presentation and design branch', () => {
  it('keeps a complete CATALOG draft ready', () => {
    const readiness = buildDraftLaunchReadiness(baseInput());

    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.warnings).toEqual([]);
  });

  it('does not require preparation when the item is exempt', () => {
    const base = baseInput();
    const readiness = buildDraftLaunchReadiness({
      ...base,
      items: [
        {
          ...base.items[0],
          preparationMethod: null,
          preparationRequired: false,
        },
      ],
    });

    expect(readiness.ready).toBe(true);
    expect(codes(readiness.blockers)).not.toContain(
      'PREPARATION_METHOD_REQUIRED',
    );
  });

  it('requires preparation when the item is required and empty', () => {
    const base = baseInput();
    const readiness = buildDraftLaunchReadiness({
      ...base,
      items: [
        {
          ...base.items[0],
          preparationMethod: null,
          preparationRequired: true,
        },
      ],
    });

    expect(readiness.ready).toBe(false);
    expect(codes(readiness.blockers)).toContain('PREPARATION_METHOD_REQUIRED');
  });

  it('keeps a complete ORDER draft ready', () => {
    const readiness = buildDraftLaunchReadiness(
      baseInput({ designMode: 'ORDER' }),
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it.each(['CATALOG', 'ORDER'])(
    'requires cover image and cover title for %s drafts',
    (designMode) => {
      const readiness = buildDraftLaunchReadiness(
        baseInput({
          designMode,
          presentation: {
            ...VALID_PRESENTATION,
            coverImageUrl: '   ',
            coverTitle: null,
          },
        }),
      );

      expect(readiness.ready).toBe(false);
      expect(readiness.blockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'COVER_IMAGE_REQUIRED',
            scope: 'PRESENTATION',
            field: 'coverImageUrl',
          }),
          expect.objectContaining({
            code: 'COVER_TITLE_REQUIRED',
            scope: 'PRESENTATION',
            field: 'coverTitle',
          }),
        ]),
      );
    },
  );

  it('requires description / selling point / applicable life stages only for CATALOG', () => {
    const readiness = buildDraftLaunchReadiness(
      baseInput({
        presentation: {
          ...VALID_PRESENTATION,
          description: '   ',
          sellingPoint: null,
          applicableLifeStages: [],
        },
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SELLING_POINT_REQUIRED',
          scope: 'CATALOG',
          field: 'sellingPoint',
        }),
      ]),
    );

    // ORDER 不要求这三项产品线文案字段
    const orderReadiness = buildDraftLaunchReadiness(
      baseInput({
        designMode: 'ORDER',
        presentation: {
          ...VALID_PRESENTATION,
          description: null,
          sellingPoint: null,
          applicableLifeStages: [],
        },
      }),
    );
    expect(
      orderReadiness.blockers.filter(
        (blocker) =>
          blocker.code === 'DESCRIPTION_REQUIRED' ||
          blocker.code === 'SELLING_POINT_REQUIRED' ||
          blocker.code === 'APPLICABLE_LIFE_STAGES_REQUIRED',
      ),
    ).toEqual([]);
    expect(orderReadiness.ready).toBe(true);
  });

  it('warns when a CATALOG draft has no target health tags', () => {
    const readiness = buildDraftLaunchReadiness(
      baseInput({
        presentation: { ...VALID_PRESENTATION, targetHealthTags: [] },
      }),
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'TARGET_HEALTH_TAGS_MISSING',
          scope: 'CATALOG',
          field: 'targetHealthTags',
        }),
      ]),
    );

    // 订单设计没有健康标签筛选诉求，不产生这条提醒
    const orderReadiness = buildDraftLaunchReadiness(
      baseInput({
        designMode: 'ORDER',
        presentation: { ...VALID_PRESENTATION, targetHealthTags: [] },
      }),
    );
    expect(codes(orderReadiness.warnings)).not.toContain(
      'TARGET_HEALTH_TAGS_MISSING',
    );
  });

  it('requires order id / quantity / customer dog only for ORDER', () => {
    const readiness = buildDraftLaunchReadiness(
      baseInput({
        designMode: 'ORDER',
        order: {
          orderId: '   ',
          orderQuantity: 0,
          customerDogId: null,
        },
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ORDER_ID_REQUIRED',
          scope: 'ORDER',
          field: 'series.orderId',
        }),
        expect.objectContaining({
          code: 'ORDER_QUANTITY_INVALID',
          scope: 'ORDER',
          field: 'series.orderQuantity',
        }),
        expect.objectContaining({
          code: 'CUSTOMER_DOG_REQUIRED',
          scope: 'ORDER',
          field: 'customerDogId',
        }),
      ]),
    );

    // 产品线设计不绑定订单，同样的空订单上下文不影响 ready
    const catalogReadiness = buildDraftLaunchReadiness(
      baseInput({
        order: {
          orderId: null,
          orderQuantity: null,
          customerDogId: null,
        },
      }),
    );
    expect(catalogReadiness.ready).toBe(true);
    expect(codes(catalogReadiness.blockers)).not.toContain('ORDER_ID_REQUIRED');
  });

  it('tags common issues as COMMON without duplicating warning codes', () => {
    const readiness = buildDraftLaunchReadiness(
      baseInput({
        name: '   ',
        assessment: {
          totalWeightG: 100,
          energyDensityKcalPerKg: 955,
          dryMatterEnergyDensityKcalPerKg: 4800,
          overallStatus: 'DEFICIENT',
          deficientCount: 2,
          excessCount: 0,
          missingDataCount: 1,
          dataGaps: [
            {
              itemId: 'item-food',
              itemName: '鸡胸肉',
              fieldPath: 'minerals.zinc',
              fieldLabel: '锌',
            },
          ],
        },
        presentation: { ...VALID_PRESENTATION, targetHealthTags: [] },
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'NAME_REQUIRED', scope: 'COMMON' }),
      ]),
    );
    expect(readiness.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'REVIEW_REQUIRED', scope: 'COMMON' }),
        expect.objectContaining({
          code: 'MISSING_NUTRITION_DATA',
          scope: 'COMMON',
        }),
        expect.objectContaining({
          code: 'NUTRIENT_OUT_OF_RANGE',
          scope: 'COMMON',
        }),
        expect.objectContaining({
          code: 'TARGET_HEALTH_TAGS_MISSING',
          scope: 'CATALOG',
        }),
      ]),
    );

    const warningCodes = codes(readiness.warnings);
    expect(new Set(warningCodes).size).toBe(warningCodes.length);
  });
});
