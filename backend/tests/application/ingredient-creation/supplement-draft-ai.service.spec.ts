import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import {
  SupplementDraftAiService,
  type SupplementDraftAiFillInput,
  type SupplementDraftAiSnapshot,
} from '../../../src/application/ingredient-creation/supplement-draft-ai.service';
import {
  SupplementDraftReviewService,
  type SupplementDraftGroupRecommendations,
} from '../../../src/application/ingredient-creation/supplement-draft-review.service';
import {
  SupplementDraftService,
  type SupplementDraftView,
  type UpdateSupplementDraftInput,
} from '../../../src/application/ingredient-creation/supplement-draft.service';
import { computeDraftCompleteness } from '../../../src/application/ingredient-creation/supplement-draft-completeness';
import {
  emptySupplementDraftPayload,
  normalizeSupplementDraftPayload,
  type SupplementDraftPayload,
} from '../../../src/application/ingredient-creation/supplement-draft.types';
import type { SupplementDraftValidationContext } from '../../../src/application/ingredient-creation/supplement-draft-validation';
import {
  SupplementLabelIntakeService,
  type LabelIntakeResult,
} from '../../../src/application/ingredient-creation/supplement-label-intake.service';
import { SupplementLabelVisionService } from '../../../src/application/ingredient-creation/supplement-label-vision.service';
import {
  SupplementLinkPreviewService,
  type SupplementLinkPreview,
} from '../../../src/application/ingredient-creation/supplement-link-preview.service';

/**
 * Task 8 的编排测试：不联网、不碰模型、不碰数据库。
 *
 * 依赖全部用 mock：读图、链接预览、审核服务、草稿服务。断言重点是
 * 「调了谁、传了什么、最终草稿变成什么、aiSnapshot 怎么记」，
 * 以及三条硬规则：
 * 1. 两图缺一不可；
 * 2. manualFields 永远不被覆盖；
 * 3. AI 失败也保存确定性事实，状态记 PARTIAL。
 */

type IntakeOverrides = Partial<
  Omit<LabelIntakeResult, 'analysis' | 'front'>
> & {
  front?: Partial<LabelIntakeResult['front']>;
  analysis?: Partial<NonNullable<LabelIntakeResult['analysis']>> | null;
};

interface DraftServiceMock {
  get: jest.Mock<Promise<SupplementDraftView>, []>;
  update: jest.Mock<
    Promise<SupplementDraftView>,
    [string, string, UpdateSupplementDraftInput]
  >;
}

interface ReviewMock {
  buildContext: jest.Mock<
    Promise<SupplementDraftValidationContext>,
    [SupplementDraftPayload]
  >;
  recommendGroups: jest.Mock<
    Promise<SupplementDraftGroupRecommendations>,
    [string, string]
  >;
  recommendGroupsForPayload: jest.Mock<
    Promise<SupplementDraftGroupRecommendations>,
    [SupplementDraftPayload]
  >;
}

interface IntakeMock {
  read: jest.Mock<
    Promise<LabelIntakeResult>,
    [{ frontImageUrl: string; labelImageUrl: string }]
  >;
}

interface VisionMock {
  analyze: jest.Mock<Promise<{ text: string; model: string } | null>, [string]>;
}

interface LinkPreviewMock {
  preview: jest.Mock<Promise<SupplementLinkPreview>, [string]>;
}

const NOW = new Date('2026-11-21T10:00:00.000Z');
const FRONT_IMAGE = 'https://img.sevenkitchen.cloud/front.jpg';
const LABEL_IMAGE = 'https://img.sevenkitchen.cloud/label.jpg';
const PRODUCT_URL = 'https://www.iherb.com/pr/now-foods-zinc/12345';

/** 模型返回的一条字段提案。 */
function field(
  value: unknown,
  source = 'LABEL',
  confidence = 'HIGH',
  reason = '标签上写着',
): { value: unknown; source: string; confidence: string; reason: string } {
  return { value, source, confidence, reason };
}

/** 模型回包：只给必要的决定，其余走解析器安全默认值。 */
function aiReply(
  overrides: {
    fields?: Record<string, unknown>;
    decisions?: Record<string, unknown>;
  } = {},
): { text: string; model: string } {
  const decisions = {
    recommendCreate: { value: true, reason: '标签信息完整，可以建档' },
    retail: { enabled: true, reason: '有保质期与储存条件，可上架' },
    noSaleReason: null,
    diy: {
      enabled: true,
      linkUrl: PRODUCT_URL,
      imageUrl: '',
      reason: '商品链接可买到，用于 DIY',
    },
    procurement: { enabled: true, reason: '有采购价，可用于生产' },
    equivalence: { groupId: 'group-1', reason: '同为锌，单位一致' },
    labelNames: ['甘氨酸锌'],
    defaultTargetFields: ['minerals.zinc'],
    tagNames: ['矿物质'],
    addTiming: 'BEFORE_MIXING',
    ...overrides.decisions,
  };

  const fields = {
    // 营养素只由起草模型给：默认让它按字段单位填锌 50 mg。
    'nutrition.servingNutrients.minerals.zinc': field(50),
    ...overrides.fields,
  };

  return {
    text: JSON.stringify({
      fields,
      decisions,
      missing: [],
      warnings: [],
    }),
    model: 'mock-model',
  };
}

function makeIntake(overrides: IntakeOverrides = {}): LabelIntakeResult {
  const baseAnalysis = {
    name: '甘氨酸锌',
    brand: 'NOW Foods',
    productModel: '250片/瓶',
    priceCny: 88,
    purchaseChannel: 'iHerb',
    baseUnit: 'PCS' as const,
    unitDisplayLabel: '片',
    physicalForm: 'TABLET' as const,
    perBottleUnits: 250,
    servingUnitsPerDose: 2,
    nutrients: [{ fieldPath: 'minerals.zinc', value: 50, unit: 'mg' }],
    perUnitNutrients: [{ fieldPath: 'minerals.zinc', value: 25, unit: 'mg' }],
    labelCategory: 'FEED_ADDITIVE' as const,
    labelNames: ['甘氨酸锌'],
    tagNames: ['矿物质'],
    addTiming: 'BEFORE_MIXING',
    defaultTargetFields: ['minerals.zinc'],
    dropped: [],
  };

  const analysis =
    overrides.analysis === null
      ? null
      : { ...baseAnalysis, ...(overrides.analysis ?? {}) };

  return {
    frontText: 'NOW FOODS\nZinc 50 mg\n250 Tablets',
    labelText: 'Supplement Facts\nServing Size 2 Tablets\nZinc 50 mg',
    servingUnitsPerDose: 2,
    // 旧向导用的预填数据；起草流程不用它（数值只认起草模型）
    nutrients: [],
    unrecognized: [],
    suggestedName: '锌',
    perBottleUnits: 250,
    saltNameZh: '甘氨酸',
    catalog: { query: '锌', matches: [], suggestion: null },
    packSpec: '250片/瓶',
    detectedPriceCny: 88,
    diagnostics: {
      frontChars: 30,
      labelChars: 50,
      analysisOk: true,
      dropped: [],
      notes: [],
    },
    ...overrides,
    front: {
      brandCandidate: 'NOW FOODS',
      productModel: '250 Tablets',
      physicalForm: 'TABLET',
      unitDisplayLabel: '片',
      ...(overrides.front ?? {}),
    },
    analysis,
  };
}

function makeLinkPreview(
  overrides: Partial<SupplementLinkPreview> = {},
): SupplementLinkPreview {
  return {
    productUrl: PRODUCT_URL,
    pagePriceCny: 99,
    productName: 'NOW Foods, Zinc, 50 mg, 250 Tablets',
    brand: 'NOW Foods',
    productModel: '250 Tablets',
    imageUrl: 'https://images-iherb.com/now-foods-zinc.jpg',
    servingUnitsPerDose: 2,
    nutrients: [
      { fieldPath: 'minerals.zinc', value: 50, unit: 'mg', rawName: 'Zinc' },
    ],
    unrecognized: [],
    labelText: 'Supplement Facts\nServing Size 2 Tablets\nZinc 50 mg',
    ...overrides,
  };
}

function makePayload(
  patch: {
    name?: string;
    shelfLifeMonths?: number;
    retailEnabled?: boolean;
    procurementEnabled?: boolean;
    diyEnabled?: boolean;
    reapproveGroup?: boolean;
    noSaleReason?: string | null;
    storageCondition?: string;
    acknowledgedWarnings?: SupplementDraftPayload['review']['acknowledgedWarnings'];
  } = {},
): SupplementDraftPayload {
  const payload = emptySupplementDraftPayload();
  if (patch.name !== undefined) payload.basic.name = patch.name;
  if (patch.shelfLifeMonths !== undefined) {
    payload.retail.shelfLifeMonths = patch.shelfLifeMonths;
  }
  if (patch.retailEnabled !== undefined) {
    payload.retail.enabled = patch.retailEnabled;
  }
  if (patch.procurementEnabled !== undefined) {
    payload.procurement.enabled = patch.procurementEnabled;
  }
  if (patch.diyEnabled !== undefined) {
    payload.diy.enabled = patch.diyEnabled;
  }
  if (patch.reapproveGroup !== undefined) {
    payload.equivalence.reapproveGroup = patch.reapproveGroup;
  }
  if (patch.noSaleReason !== undefined) {
    payload.retail.noSaleReason = patch.noSaleReason;
  }
  if (patch.storageCondition !== undefined) {
    payload.retail.storageCondition = patch.storageCondition;
  }
  if (patch.acknowledgedWarnings !== undefined) {
    payload.review.acknowledgedWarnings = patch.acknowledgedWarnings;
  }
  return payload;
}

function draftView(
  payload: SupplementDraftPayload = makePayload(),
  options: {
    name?: string;
    manualFields?: string[];
    status?: SupplementDraftView['status'];
    updatedAt?: Date;
  } = {},
): SupplementDraftView {
  return {
    id: 'draft-1',
    createdBy: 'u1',
    status: options.status ?? 'DRAFT',
    schemaVersion: 1,
    name: options.name ?? payload.basic.name,
    payload,
    aiSnapshot: null,
    manualFields: options.manualFields ?? [],
    verification: null,
    finalizedIngredientId: null,
    finalizedNutritionFoodId: null,
    finalizedEvidenceId: null,
    finalizedAt: null,
    createdAt: NOW,
    updatedAt: options.updatedAt ?? NOW,
    completeness: computeDraftCompleteness(payload),
  };
}

function validationContext(
  overrides: Partial<SupplementDraftValidationContext> = {},
): SupplementDraftValidationContext {
  return {
    issues: [],
    duplicate: { exists: false },
    equivalenceGroup: null,
    config: { shopEnabled: true, equivalenceEnabled: true },
    catalog: { allExact: true, missingNames: [], candidatesByName: {} },
    concentration: null,
    ...overrides,
  };
}

function groupRecommendations(): SupplementDraftGroupRecommendations {
  return {
    equivalenceEnabled: true,
    candidates: [
      {
        groupId: 'group-1',
        code: 'ZINC',
        name: '锌',
        status: 'APPROVED',
        memberCount: 3,
        sameUnit: true,
        nutrientLabel: '锌',
        nutrientUnit: 'mg',
        actualUnit: null,
        mismatchReason: null,
        reason: '营养素与单位一致',
      },
    ],
  };
}

const FILL_INPUT: SupplementDraftAiFillInput = {
  frontImageUrl: FRONT_IMAGE,
  labelImageUrl: LABEL_IMAGE,
};

describe('SupplementDraftAiService', () => {
  let draftService: DraftServiceMock;
  let review: ReviewMock;
  let intake: IntakeMock;
  let vision: VisionMock;
  let linkPreview: LinkPreviewMock;
  let currentDraft: SupplementDraftView;
  let service: SupplementDraftAiService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    currentDraft = draftView();
    draftService = {
      // 用箭头函数而不是 mockResolvedValue：单个用例会替换 currentDraft。
      get: jest.fn(() => Promise.resolve(currentDraft)),
      update: jest.fn(
        (id: string, createdBy: string, input: UpdateSupplementDraftInput) => {
          const payload = normalizeSupplementDraftPayload(input.payload);
          const updated: SupplementDraftView = {
            ...currentDraft,
            id,
            createdBy,
            name: input.name ?? currentDraft.name,
            payload,
            aiSnapshot: input.aiSnapshot ?? null,
            updatedAt: new Date('2026-11-21T11:00:00.000Z'),
            completeness: computeDraftCompleteness(payload),
          };
          return Promise.resolve(updated);
        },
      ),
    };

    review = {
      buildContext: jest.fn<
        Promise<SupplementDraftValidationContext>,
        [SupplementDraftPayload]
      >(() => Promise.resolve(validationContext())),
      recommendGroups: jest.fn<
        Promise<SupplementDraftGroupRecommendations>,
        [string, string]
      >(() => Promise.resolve(groupRecommendations())),
      recommendGroupsForPayload: jest.fn<
        Promise<SupplementDraftGroupRecommendations>,
        [SupplementDraftPayload]
      >(() => Promise.resolve(groupRecommendations())),
    };
    intake = {
      read: jest.fn<
        Promise<LabelIntakeResult>,
        [{ frontImageUrl: string; labelImageUrl: string }]
      >(() => Promise.resolve(makeIntake())),
    };
    vision = {
      analyze: jest.fn<
        Promise<{ text: string; model: string } | null>,
        [string]
      >(() => Promise.resolve(aiReply())),
    };
    linkPreview = {
      preview: jest.fn<Promise<SupplementLinkPreview>, [string]>(() =>
        Promise.resolve(makeLinkPreview()),
      ),
    };

    service = new SupplementDraftAiService(
      draftService as unknown as SupplementDraftService,
      review as unknown as SupplementDraftReviewService,
      intake as unknown as SupplementLabelIntakeService,
      vision as unknown as SupplementLabelVisionService,
      linkPreview as unknown as SupplementLinkPreviewService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function lastUpdateInput(): UpdateSupplementDraftInput {
    const calls = draftService.update.mock.calls;
    return calls[calls.length - 1][2];
  }

  function lastPayload(): SupplementDraftPayload {
    return normalizeSupplementDraftPayload(lastUpdateInput().payload);
  }

  function lastSnapshot(): SupplementDraftAiSnapshot {
    return lastUpdateInput().aiSnapshot as SupplementDraftAiSnapshot;
  }

  it('AI 不写入标签分类标签，保留草稿里已有的人工标签', async () => {
    const existing = makePayload({ name: '已有标签的草稿' });
    existing.label.tagNames = ['人工标签'];
    currentDraft = draftView(existing);

    await service.fill({ userId: 'u1' }, 'draft-1', {
      frontImageUrl: FRONT_IMAGE,
      labelImageUrl: LABEL_IMAGE,
    });

    expect(lastPayload().label.tagNames).toEqual(['人工标签']);
  });

  it('正面图/标签图缺一张就拒绝，且不读图、不写草稿', async () => {
    const missingLabel = service.fill({ userId: 'u1' }, 'draft-1', {
      frontImageUrl: FRONT_IMAGE,
      labelImageUrl: '  ',
    });
    await expect(missingLabel).rejects.toBeInstanceOf(BadRequestException);
    await expect(missingLabel).rejects.toThrow('正面图和标签图都要有');

    const missingFront = service.fill({ userId: 'u1' }, 'draft-1', {
      frontImageUrl: '',
      labelImageUrl: LABEL_IMAGE,
    });
    await expect(missingFront).rejects.toThrow('正面图和标签图都要有');

    expect(draftService.get).not.toHaveBeenCalled();
    expect(intake.read).not.toHaveBeenCalled();
    expect(vision.analyze).not.toHaveBeenCalled();
    expect(draftService.update).not.toHaveBeenCalled();
  });

  it('两张图齐全、没有商品链接：读图 → 拼提示词 → 决策 → 保存', async () => {
    const result = await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    expect(intake.read).toHaveBeenCalledWith({
      frontImageUrl: FRONT_IMAGE,
      labelImageUrl: LABEL_IMAGE,
    });
    expect(linkPreview.preview).not.toHaveBeenCalled();

    // 事实先叠进临时草稿，再交给审核服务取上下文/目录/推荐组
    expect(review.buildContext).toHaveBeenCalledTimes(1);
    const provisional = review.buildContext.mock.calls[0][0];
    expect(provisional.basic.name).toBe('甘氨酸锌');
    expect(provisional.basic.servingUnitsPerDose).toBe(2);
    // 营养素不再由代码解析成事实：起草模型才是唯一写入方
    expect(provisional.nutrition.servingNutrients).toEqual({});
    expect(provisional.evidence.frontImageUrl).toBe(FRONT_IMAGE);
    expect(provisional.evidence.labelImageUrl).toBe(LABEL_IMAGE);
    // 组推荐用「草稿现值 + 本次事实 + 首轮分析读到的营养素」的临时载荷，
    // 但那些营养素只做推荐线索，不写进 provisional。
    const recommendationInput =
      review.recommendGroupsForPayload.mock.calls[0][0];
    expect(recommendationInput.basic.name).toBe('甘氨酸锌');
    expect(recommendationInput.nutrition.servingNutrients['minerals.zinc']).toBe(
      50,
    );
    expect(provisional.nutrition.servingNutrients).toEqual({});
    expect(review.recommendGroups).not.toHaveBeenCalled();

    expect(vision.analyze).toHaveBeenCalledTimes(1);
    const prompt = vision.analyze.mock.calls[0][0];
    expect(prompt).toContain('Supplement Facts');
    expect(prompt).toContain('minerals.zinc');
    expect(prompt).toContain('矿物质');
    expect(prompt).toContain('BEFORE_MIXING');
    expect(prompt).toContain('SELF_MADE');
    expect(prompt).toContain('IHERB');

    expect(draftService.update).toHaveBeenCalledTimes(1);
    expect(lastSnapshot().status).toBe('OK');
    expect(result.id).toBe('draft-1');
  });

  it('营养数值只由模型按字段单位填：标签 mg 换算成 IU 后落库', async () => {
    intake.read.mockResolvedValue(
      makeIntake({
        labelText:
          'Supplement Facts\nServing Size 1 Softgel\nVitamin E 134.2 mg 895%',
        analysis: {
          nutrients: [
            { fieldPath: 'vitamins.vitaminE', value: 134.2, unit: 'mg' },
          ],
        },
      }),
    );
    vision.analyze.mockResolvedValue(
      aiReply({
        fields: {
          'nutrition.servingNutrients.vitamins.vitaminE': field(
            200,
            'LABEL',
            'HIGH',
            '标签 134.2 mg；美国标签的 mg 是 α-生育酚当量，1 mg = 1.49 IU，134.2 × 1.49 ≈ 200 IU',
          ),
        },
        decisions: { defaultTargetFields: ['vitamins.vitaminE'] },
      }),
    );

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    const prompt = vision.analyze.mock.calls[0][0];
    // 字段单位必须出现在提示词里，模型才知道往 IU 字段填
    expect(prompt).toContain('vitamins.vitaminE ｜ 维生素 E ｜ IU');
    expect(prompt).toContain('1 mg = 1.49 IU');
    expect(prompt).toContain('Vitamin E 134.2 mg');
    // 标签原文原样进提示词，换算由模型做
    expect(prompt).toContain('不要因为标签上写的是 mg 就原样填进 IU 字段');

    const payload = lastPayload();
    expect(payload.nutrition.servingNutrients['vitamins.vitaminE']).toBe(200);
    expect(payload.nutrition.defaultTargetFields).toEqual([
      'vitamins.vitaminE',
    ]);
  });

  it('有商品链接：读链接，价格/品牌/规格/主图进入事实', async () => {
    intake.read.mockResolvedValue(
      makeIntake({
        analysis: {
          brand: '分析出来的品牌',
          productModel: '250片/瓶',
          priceCny: 88,
        },
      }),
    );
    linkPreview.preview.mockResolvedValue(makeLinkPreview());

    await service.fill({ id: 'u1' }, 'draft-1', {
      ...FILL_INPUT,
      productUrl: PRODUCT_URL,
    });

    expect(linkPreview.preview).toHaveBeenCalledWith(PRODUCT_URL);
    const payload = lastPayload();
    expect(payload.basic.currentPricePerPurchaseUnit).toBe(99);
    expect(payload.basic.brand).toBe('NOW Foods');
    expect(payload.basic.productModel).toBe('250 Tablets');
    expect(payload.evidence.productUrl).toBe(PRODUCT_URL);
    // AI 没给 DIY 主图时，用商品链接主图兜底
    expect(payload.diy.imageUrl).toBe(
      'https://images-iherb.com/now-foods-zinc.jpg',
    );

    const prompt = vision.analyze.mock.calls[0][0];
    expect(prompt).toContain('页面价格（人民币）：99');
    expect(prompt).toContain('NOW Foods');
  });

  it('商品链接读取失败：保留其它事实，继续起草并留提醒', async () => {
    linkPreview.preview.mockRejectedValue(
      new BadRequestException('这个链接读不出来'),
    );

    await expect(
      service.fill({ userId: 'u1' }, 'draft-1', {
        ...FILL_INPUT,
        productUrl: PRODUCT_URL,
      }),
    ).resolves.toBeDefined();

    const payload = lastPayload();
    expect(payload.basic.name).toBe('甘氨酸锌');
    expect(payload.nutrition.servingNutrients['minerals.zinc']).toBe(50);
    expect(draftService.update).toHaveBeenCalledTimes(1);
    expect(
      lastSnapshot().warnings.some(
        (warning) => warning.code === 'LINK_PREVIEW_FAILED',
      ),
    ).toBe(true);
  });

  it('manualFields 里的字段不被事实/AI 覆盖，其它字段照常填', async () => {
    currentDraft = draftView(
      makePayload({ name: '人改的名字', shelfLifeMonths: 12 }),
      { manualFields: ['basic.name', 'retail.shelfLifeMonths'] },
    );
    intake.read.mockResolvedValue(
      makeIntake({ analysis: { name: '分析出来的名字' } }),
    );
    vision.analyze.mockResolvedValue(
      aiReply({
        fields: {
          'basic.name': field('AI 起的名字'),
          'retail.shelfLifeMonths': field(24),
          'nutrition.servingNutrients.minerals.zinc': field(50),
        },
      }),
    );

    const result = await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    const input = lastUpdateInput();
    const payload = lastPayload();
    expect(payload.basic.name).toBe('人改的名字');
    expect(payload.retail.shelfLifeMonths).toBe(12);
    expect(payload.basic.brand).toBe('NOW Foods');
    expect(payload.nutrition.servingNutrients['minerals.zinc']).toBe(50);
    // update 只写草稿内容，不把 manualFields 回传（服务端已有列表不能被覆盖）
    expect(input.manualFields).toBeUndefined();
    expect(result.payload.basic.name).toBe('人改的名字');
  });

  it.each<[string, { text: string; model: string } | null]>([
    ['决策模型返回 null', null],
    ['决策模型回了非 JSON', { text: '这不是 JSON', model: 'mock-model' }],
  ])('%s：仍保存确定性事实，aiSnapshot 记 PARTIAL', async (_label, reply) => {
    vision.analyze.mockResolvedValue(reply);

    await expect(
      service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT),
    ).resolves.toBeDefined();

    const payload = lastPayload();
    expect(payload.basic.name).toBe('甘氨酸锌');
    expect(payload.basic.purchaseUnit).toBe('瓶');
    expect(payload.basic.productionLossRate).toBe(1.05);
    // 模型没跑通：营养数值留空（不再由解析器兜底写死），提醒人重试/对照标签
    expect(payload.nutrition.servingNutrients).toEqual({});

    const snapshot = lastSnapshot();
    expect(snapshot.status).toBe('PARTIAL');
    expect(snapshot.fields).toEqual({});
    expect(snapshot.decisions.recommendCreate.value).toBe(true);
    // 空决定的采购默认也必须是 false，和“保留 current”一致
    expect(payload.procurement.enabled).toBe(false);
    expect(snapshot.decisions.procurement.enabled).toBe(false);
    expect(snapshot.proposedDecisions.procurement.enabled).toBe(false);
    expect(
      snapshot.warnings.some(
        (warning) => warning.code === 'AI_DRAFT_UNAVAILABLE',
      ),
    ).toBe(true);
  });

  it('recommendCreate=false 只记进 aiSnapshot，不丢草稿/状态/名称', async () => {
    currentDraft = draftView(makePayload({ name: '人起的名字' }));
    intake.read.mockResolvedValue(
      makeIntake({ analysis: null, suggestedName: null }),
    );
    vision.analyze.mockResolvedValue({
      text: JSON.stringify({
        fields: {},
        decisions: {
          recommendCreate: { value: false, reason: '不建议建档，信息不足' },
        },
      }),
      model: 'mock-model',
    });

    const result = await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    const input = lastUpdateInput();
    const snapshot = input.aiSnapshot as SupplementDraftAiSnapshot;
    expect(snapshot.decisions.recommendCreate).toEqual({
      value: false,
      reason: '不建议建档，信息不足',
    });
    expect(input.name).toBe('人起的名字');
    expect(input).not.toHaveProperty('status');
    expect(draftService.update).toHaveBeenCalledWith(
      'draft-1',
      'u1',
      expect.any(Object),
    );
    expect(result.status).toBe('DRAFT');
    expect(result.name).toBe('人起的名字');
  });

  it('同一草稿并发起草：第二次 409，第一次结束后释放锁', async () => {
    let resolveIntake: ((value: LabelIntakeResult) => void) | undefined;
    intake.read.mockReturnValue(
      new Promise<LabelIntakeResult>((resolve) => {
        resolveIntake = resolve;
      }),
    );

    const first = service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);
    const second = service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    await expect(second).rejects.toBeInstanceOf(ConflictException);
    await expect(second).rejects.toThrow('AI 正在起草这张草稿');

    expect(resolveIntake).toBeDefined();
    resolveIntake!(makeIntake());
    await expect(first).resolves.toBeDefined();
    expect(draftService.update).toHaveBeenCalledTimes(1);

    // 锁已释放：第三次可以正常跑
    intake.read.mockResolvedValue(makeIntake());
    await expect(
      service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT),
    ).resolves.toBeDefined();
    expect(draftService.update).toHaveBeenCalledTimes(2);
  });

  it('只通过 draftService.update 保存草稿，不写原料/营养/证据', async () => {
    await service.fill('u1', 'draft-1', FILL_INPUT);

    expect(draftService.get).toHaveBeenCalledWith('draft-1', 'u1');
    expect(draftService.update).toHaveBeenCalledTimes(1);

    const input = draftService.update.mock.calls[0][2];
    expect(Object.keys(input).sort()).toEqual([
      'aiSnapshot',
      'expectedUpdatedAt',
      'name',
      'payload',
    ]);
    expect(input).not.toHaveProperty('manualFields');
    expect(input).not.toHaveProperty('status');
    expect(input).not.toHaveProperty('ingredientId');
    expect(input).not.toHaveProperty('nutritionFoodId');
    expect(input).not.toHaveProperty('evidenceId');
  });

  it('合并优先级：manualFields > 链接/每份量事实 > 首轮分析 > 起草模型（营养素只认起草模型）', async () => {
    currentDraft = draftView(makePayload({ name: '人改名称' }), {
      manualFields: ['basic.name'],
    });
    intake.read.mockResolvedValue(
      makeIntake({
        servingUnitsPerDose: 2,
        analysis: {
          name: '分析名称',
          brand: '分析品牌',
          priceCny: 88,
          purchaseChannel: 'iHerb',
          servingUnitsPerDose: 3,
          nutrients: [{ fieldPath: 'minerals.zinc', value: 60, unit: 'mg' }],
        },
      }),
    );
    linkPreview.preview.mockResolvedValue(makeLinkPreview());
    vision.analyze.mockResolvedValue(
      aiReply({
        fields: {
          'basic.name': field('AI 名称'),
          'basic.brand': field('AI 品牌'),
          'basic.currentPricePerPurchaseUnit': field(77),
          'basic.purchaseChannel': field('AI 渠道'),
          'basic.servingUnitsPerDose': field(4),
          'nutrition.servingNutrients.minerals.zinc': field(70),
        },
      }),
    );

    await service.fill({ userId: 'u1' }, 'draft-1', {
      ...FILL_INPUT,
      productUrl: PRODUCT_URL,
    });

    const payload = lastPayload();
    // manualFields 最高
    expect(payload.basic.name).toBe('人改名称');
    // 每份量仍是代码读的确定性事实
    expect(payload.basic.servingUnitsPerDose).toBe(2);
    // 营养数值只认起草模型（首轮分析的 60 只用于等价组推荐，不落库）
    expect(payload.nutrition.servingNutrients['minerals.zinc']).toBe(70);
    // 链接事实 > 首轮分析 > 决策模型
    expect(payload.basic.currentPricePerPurchaseUnit).toBe(99);
    expect(payload.basic.brand).toBe('NOW Foods');
    // 首轮分析 > 决策模型
    expect(payload.basic.purchaseChannel).toBe('iHerb');
  });

  it('AI 没给等价组：用推荐第一名；没有候选时记 missing', async () => {
    vision.analyze.mockResolvedValue(
      aiReply({
        decisions: {
          equivalence: { groupId: null, reason: '拿不准' },
        },
      }),
    );

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);
    expect(lastPayload().equivalence.groupId).toBe('group-1');

    review.recommendGroupsForPayload.mockResolvedValue({
      equivalenceEnabled: true,
      candidates: [],
    });
    vision.analyze.mockResolvedValue(
      aiReply({
        decisions: {
          equivalence: { groupId: null, reason: '拿不准' },
        },
      }),
    );

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);
    expect(lastPayload().equivalence.groupId).toBeNull();
    expect(
      lastSnapshot().missing.some(
        (item) => item.fieldPath === 'equivalence.groupId',
      ),
    ).toBe(true);
  });

  it('AI 期间人自动保存：写回前重读最新草稿，并用乐观锁更新', async () => {
    const oldUpdatedAt = new Date('2026-11-21T10:00:00.000Z');
    const latestUpdatedAt = new Date('2026-11-21T10:30:00.000Z');
    const oldDraft = draftView(
      makePayload({ name: '旧名字', storageCondition: '旧储存' }),
      { updatedAt: oldUpdatedAt },
    );
    const latestDraft = draftView(
      makePayload({ name: '人手改的名字', storageCondition: '最新储存' }),
      { manualFields: ['basic.name'], updatedAt: latestUpdatedAt },
    );
    draftService.get
      .mockResolvedValueOnce(oldDraft)
      .mockResolvedValueOnce(latestDraft);
    intake.read.mockResolvedValue(
      makeIntake({ analysis: { name: '分析出来的名字' } }),
    );
    vision.analyze.mockResolvedValue(
      aiReply({ fields: { 'basic.name': field('AI 名字') } }),
    );

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    expect(draftService.get).toHaveBeenCalledTimes(2);
    const input = lastUpdateInput();
    const payload = normalizeSupplementDraftPayload(input.payload);
    // 人改的新值/新 manualFields 来自第二次 get，不能拿第一次的旧草稿盖掉
    expect(payload.basic.name).toBe('人手改的名字');
    expect(payload.retail.storageCondition).toBe('最新储存');
    expect(input.expectedUpdatedAt).toBe(latestUpdatedAt.toISOString());
    expect(input.expectedUpdatedAt).not.toBe(oldUpdatedAt.toISOString());
  });

  it('写回时乐观锁冲突 409 直接抛出，不吞掉', async () => {
    draftService.update.mockRejectedValueOnce(
      new ConflictException('草稿已被更新，请刷新后再试'),
    );

    await expect(
      service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT),
    ).rejects.toThrow('草稿已被更新，请刷新后再试');
    expect(draftService.update).toHaveBeenCalledTimes(1);
  });

  it('全新空草稿按内存事实推荐等价组，并写回推荐/__SKIP__', async () => {
    currentDraft = draftView(makePayload());
    intake.read.mockResolvedValue(
      makeIntake({
        // 首轮分析（模型）读到的营养素只当等价组推荐线索，不落库
        analysis: {
          nutrients: [{ fieldPath: 'fattyAcids.epa', value: 650, unit: 'mg' }],
          physicalForm: 'CAPSULE',
          unitDisplayLabel: '粒',
        },
        suggestedName: null,
        servingUnitsPerDose: 1,
        front: {
          brandCandidate: null,
          productModel: null,
          physicalForm: 'CAPSULE',
          unitDisplayLabel: '粒',
        },
      }),
    );
    vision.analyze.mockResolvedValue({
      text: JSON.stringify({
        fields: {},
        decisions: {
          equivalence: { groupId: '__SKIP__', reason: '暂不归组' },
        },
      }),
      model: 'mock-model',
    });

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    expect(review.recommendGroupsForPayload).toHaveBeenCalledTimes(1);
    expect(review.recommendGroups).not.toHaveBeenCalled();
    const recommendedPayload =
      review.recommendGroupsForPayload.mock.calls[0][0];
    expect(recommendedPayload.basic.baseUnit).toBe('PCS');
    expect(recommendedPayload.basic.unitDisplayLabel).toBe('粒');
    expect(
      recommendedPayload.nutrition.servingNutrients['fattyAcids.epa'],
    ).toBe(650);

    const prompt = vision.analyze.mock.calls[0][0];
    expect(prompt).toContain('group-1');
    expect(lastPayload().equivalence.groupId).toBe('__SKIP__');
    expect(lastSnapshot().decisions.equivalence.groupId).toBe('__SKIP__');
  });

  it('AI 省略决定时不重置已有值，快照与 payload 一致', async () => {
    currentDraft = draftView(
      makePayload({
        retailEnabled: true,
        procurementEnabled: true,
        diyEnabled: true,
        noSaleReason: 'UNDECIDED',
      }),
    );
    intake.read.mockResolvedValue(
      makeIntake({ analysis: null, suggestedName: null }),
    );
    vision.analyze.mockResolvedValue({
      text: JSON.stringify({
        fields: {},
        decisions: { recommendCreate: { value: true, reason: '信息够' } },
      }),
      model: 'mock-model',
    });

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    const payload = lastPayload();
    expect(payload.retail.enabled).toBe(true);
    expect(payload.procurement.enabled).toBe(true);
    expect(payload.diy.enabled).toBe(true);
    expect(payload.retail.noSaleReason).toBe('UNDECIDED');

    const snapshot = lastSnapshot();
    expect(snapshot.decisions.retail.enabled).toBe(true);
    expect(snapshot.decisions.procurement.enabled).toBe(true);
    expect(snapshot.decisions.diy.enabled).toBe(true);
    expect(snapshot.decisions.noSaleReason).toBe('UNDECIDED');
  });

  it('aiSnapshot 保留 AI 原始提议，和生效值分开记录', async () => {
    currentDraft = draftView(makePayload({ retailEnabled: true }));
    intake.read.mockResolvedValue(
      makeIntake({ analysis: null, suggestedName: null }),
    );
    // AI 没给 retail 的有效理由：解析器原始提议是 false，但生效值应保留 true
    vision.analyze.mockResolvedValue({
      text: JSON.stringify({
        fields: {},
        decisions: { recommendCreate: { value: true, reason: '信息够' } },
      }),
      model: 'mock-model',
    });

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    expect(lastPayload().retail.enabled).toBe(true);
    const snapshot = lastSnapshot();
    expect(snapshot.proposedDecisions.retail).toEqual({
      enabled: false,
      reason: '',
    });
    expect(snapshot.decisions.retail.enabled).toBe(true);
    expect(snapshot.proposedDecisions.retail.enabled).not.toBe(
      snapshot.decisions.retail.enabled,
    );
  });

  it('空草稿 + AI 省略 procurement：payload 与生效决定都是 false', async () => {
    currentDraft = draftView(makePayload());
    intake.read.mockResolvedValue(
      makeIntake({ analysis: null, suggestedName: null }),
    );
    vision.analyze.mockResolvedValue({
      text: JSON.stringify({
        fields: {},
        decisions: { recommendCreate: { value: true, reason: '信息够' } },
      }),
      model: 'mock-model',
    });

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    expect(lastPayload().procurement.enabled).toBe(false);
    const snapshot = lastSnapshot();
    expect(snapshot.decisions.procurement.enabled).toBe(false);
    expect(snapshot.proposedDecisions.procurement.enabled).toBe(false);
  });

  it.each<[string, { text: string; model: string } | null]>([
    ['AI 正常返回（OK）', aiReply()],
    ['AI 不可用（PARTIAL）', null],
  ])('%s：AI 重跑后清空旧提醒确认', async (_label, reply) => {
    currentDraft = draftView(
      makePayload({
        acknowledgedWarnings: [
          { code: 'STORAGE_CONDITION_MISSING', paramsHash: 'abc123' },
        ],
      }),
    );
    vision.analyze.mockResolvedValue(reply);

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    const payload = normalizeSupplementDraftPayload(lastUpdateInput().payload);
    expect(payload.review.acknowledgedWarnings).toEqual([]);
    expect(lastSnapshot().status).toBe(reply ? 'OK' : 'PARTIAL');
  });

  it('AI 明确给 false + 理由时才关掉开关，快照同步', async () => {
    currentDraft = draftView(
      makePayload({
        retailEnabled: true,
        procurementEnabled: true,
        diyEnabled: true,
      }),
    );
    vision.analyze.mockResolvedValue(
      aiReply({
        decisions: {
          retail: { enabled: false, reason: '标签缺保质期，暂不上架' },
          diy: {
            enabled: false,
            linkUrl: '',
            imageUrl: '',
            reason: '没有可靠购买链接',
          },
          procurement: { enabled: false, reason: '自制品，不走采购' },
        },
      }),
    );

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    const payload = lastPayload();
    expect(payload.retail.enabled).toBe(false);
    expect(payload.procurement.enabled).toBe(false);
    expect(payload.diy.enabled).toBe(false);

    const snapshot = lastSnapshot();
    expect(snapshot.decisions.retail.enabled).toBe(false);
    expect(snapshot.decisions.procurement.enabled).toBe(false);
    expect(snapshot.decisions.diy.enabled).toBe(false);
  });

  it('AI-only 字段和决定能进入 payload，不被事实/默认值遮住', async () => {
    currentDraft = draftView(makePayload());
    intake.read.mockResolvedValue(
      makeIntake({
        analysis: null,
        suggestedName: null,
        servingUnitsPerDose: null,
        detectedPriceCny: null,
        front: {
          brandCandidate: null,
          productModel: null,
          physicalForm: null,
          unitDisplayLabel: null,
        },
      }),
    );
    vision.analyze.mockResolvedValue(
      aiReply({
        fields: {
          'basic.name': field('AI 名称'),
          'basic.brand': field('AI 品牌'),
          'basic.purchaseChannel': field('AI 渠道'),
          'retail.enabled': field(true),
          'retail.shelfLifeMonths': field(24),
          'label.labelNames': field(['AI 标签名']),
        },
        decisions: {
          retail: { enabled: false, reason: '' },
          diy: { enabled: false, linkUrl: '', imageUrl: '', reason: '' },
          procurement: { enabled: false, reason: '' },
          equivalence: { groupId: '__SKIP__', reason: '暂不归组' },
          labelNames: [],
          tagNames: ['矿物质'],
          addTiming: 'BEFORE_MIXING',
          defaultTargetFields: [],
        },
      }),
    );

    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);

    const payload = lastPayload();
    expect(payload.basic.name).toBe('AI 名称');
    expect(payload.basic.brand).toBe('AI 品牌');
    expect(payload.basic.purchaseChannel).toBe('AI 渠道');
    expect(payload.retail.enabled).toBe(true);
    expect(payload.retail.shelfLifeMonths).toBe(24);
    expect(payload.label.labelNames).toEqual(['AI 标签名']);
    expect(payload.equivalence.groupId).toBe('__SKIP__');

    const snapshot = lastSnapshot();
    expect(snapshot.fields['basic.brand']?.value).toBe('AI 品牌');
    expect(snapshot.decisions.retail.enabled).toBe(true);
    expect(snapshot.decisions.equivalence.groupId).toBe('__SKIP__');
  });

  it.each(['FINALIZED', 'DISCARDED'] as const)(
    '%s 状态拒绝起草，且不读图/不写草稿',
    async (status) => {
      currentDraft = draftView(makePayload(), { status });
      const promise = service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toThrow('已写入或已放弃的草稿不能再起草');
      expect(intake.read).not.toHaveBeenCalled();
      expect(vision.analyze).not.toHaveBeenCalled();
      expect(draftService.update).not.toHaveBeenCalled();
    },
  );

  it('AI 不能改 reapproveGroup，只有人能取消', async () => {
    currentDraft = draftView(makePayload({ reapproveGroup: false }));
    vision.analyze.mockResolvedValue(
      aiReply({
        fields: { 'equivalence.reapproveGroup': field(true) },
      }),
    );
    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);
    expect(lastPayload().equivalence.reapproveGroup).toBe(false);

    currentDraft = draftView(makePayload());
    vision.analyze.mockResolvedValue(
      aiReply({
        fields: { 'equivalence.reapproveGroup': field(false) },
      }),
    );
    await service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT);
    expect(lastPayload().equivalence.reapproveGroup).toBe(true);
  });

  it('商品链接主图是确定性事实，AI 不能覆盖 DIY 主图', async () => {
    linkPreview.preview.mockResolvedValue(makeLinkPreview());
    vision.analyze.mockResolvedValue(
      aiReply({
        fields: { 'diy.imageUrl': field('https://ai.example/other.jpg') },
        decisions: {
          diy: {
            enabled: true,
            linkUrl: PRODUCT_URL,
            imageUrl: 'https://ai.example/other.jpg',
            reason: '换成别的图',
          },
        },
      }),
    );

    await service.fill({ userId: 'u1' }, 'draft-1', {
      ...FILL_INPUT,
      productUrl: PRODUCT_URL,
    });

    expect(lastPayload().diy.imageUrl).toBe(
      'https://images-iherb.com/now-foods-zinc.jpg',
    );
  });

  it('读图失败也释放锁，第二次可以继续', async () => {
    intake.read.mockRejectedValueOnce(new BadRequestException('读图失败'));
    await expect(
      service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(draftService.update).not.toHaveBeenCalled();

    intake.read.mockResolvedValue(makeIntake());
    await expect(
      service.fill({ userId: 'u1' }, 'draft-1', FILL_INPUT),
    ).resolves.toBeDefined();
    expect(draftService.update).toHaveBeenCalledTimes(1);
  });
});
