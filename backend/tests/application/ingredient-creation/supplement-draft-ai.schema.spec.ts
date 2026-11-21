import {
  parseSupplementAiDraft,
  type SupplementAiParseContext,
} from '../../../src/application/ingredient-creation/supplement-draft-ai.schema';
import {
  buildSupplementDraftPrompt,
  type SupplementDraftPromptInput,
} from '../../../src/application/ingredient-creation/supplement-draft-ai.prompt';
import type { SupplementGroupRecommendation } from '../../../src/application/ingredient-creation/supplement-draft-review.service';
import type { SupplementLinkPreview } from '../../../src/application/ingredient-creation/supplement-link-preview.service';
import { emptySupplementDraftPayload } from '../../../src/application/ingredient-creation/supplement-draft.types';

/**
 * 解析上下文：允许字段用真实目录路径（带点），故意留几个「不存在的字段」
 * 给过滤用例用。测试不联网、不碰模型。
 */
const CONTEXT: SupplementAiParseContext = {
  allowedFields: ['crudeProtein', 'fattyAcids.epa', 'fattyAcids.dha'],
  allowedTags: ['油脂类', '蛋白质类'],
  allowedTimings: ['BEFORE_MIXING', 'BEFORE_MEAL'],
  allowedNoSaleReasons: ['SELF_MADE', 'BULK', 'NO_SUPPLY', 'UNDECIDED'],
  groupIds: ['group-1', 'group-2'],
};

/** 模型返回的一个字段条目；source/confidence 先写成 string，专门测兜底。 */
function field(
  value: unknown,
  source = 'LABEL',
  confidence = 'HIGH',
  reason = '',
): { value: unknown; source: string; confidence: string; reason: string } {
  return { value, source, confidence, reason };
}

function parseJson(value: unknown) {
  return parseSupplementAiDraft(JSON.stringify(value), CONTEXT);
}

const DEFAULT_DECISIONS = {
  recommendCreate: { value: true, reason: '' },
  retail: { enabled: false, reason: '' },
  noSaleReason: null,
  diy: { enabled: false, linkUrl: '', imageUrl: '', reason: '' },
  procurement: { enabled: false, reason: '' },
  equivalence: { groupId: null, reason: '' },
  labelNames: [],
  defaultTargetFields: [],
  tagNames: [],
  addTiming: null,
};

describe('parseSupplementAiDraft', () => {
  it('parses plain JSON', () => {
    const draft = parseJson({
      fields: { 'basic.name': field('鱼油') },
      decisions: {},
    });

    expect(draft).not.toBeNull();
    expect(draft?.fields['basic.name']).toEqual({
      value: '鱼油',
      source: 'LABEL',
      confidence: 'HIGH',
      reason: '',
    });
  });

  it('parses fenced JSON', () => {
    const text = [
      '```json',
      JSON.stringify({ fields: { 'basic.name': field('鱼油') } }),
      '```',
    ].join('\n');

    const draft = parseSupplementAiDraft(text, CONTEXT);

    expect(draft?.fields['basic.name'].value).toBe('鱼油');
  });

  it('keeps known payload paths, filters nutrient subpaths and drops unknown ones', () => {
    const draft = parseJson({
      fields: {
        'basic.name': field('鱼油'),
        'basic.servingUnitsPerDose': field(2),
        'basic.unknown': field('x'),
        'nutrition.servingNutrients.crudeProtein': field(875),
        'nutrition.servingNutrients.notAField': field(1),
        'nutrition.defaultTargetFields': field(['fattyAcids.epa', 'notAField']),
        'label.labelNames': field(['鱼油']),
        'label.tagNames': field(['油脂类', '猫']),
        'evidence.productUrl': field('https://example.com/item'),
        'secret.token': field('x'),
      },
    });

    expect(Object.keys(draft!.fields).sort()).toEqual([
      'basic.name',
      'basic.servingUnitsPerDose',
      'evidence.productUrl',
      'label.labelNames',
      'label.tagNames',
      'nutrition.defaultTargetFields',
      'nutrition.servingNutrients.crudeProtein',
    ]);
    expect(draft!.fields['nutrition.defaultTargetFields'].value).toEqual([
      'fattyAcids.epa',
    ]);
    expect(draft!.fields['label.tagNames'].value).toEqual(['油脂类']);
  });

  it('drops field values that fail enum or type checks', () => {
    const draft = parseJson({
      fields: {
        'basic.baseUnit': field('TON'),
        'basic.physicalForm': field('GAS'),
        'label.labelCategory': field('OTHER'),
        'basic.addTiming': field('AFTER_MEAL'),
        'retail.noSaleReason': field('BORED'),
        'nutrition.servingNutrients.crudeProtein': field('875'),
      },
    });

    expect(draft!.fields).toEqual({});
  });

  it('normalizes decisions and filters them to allowed values', () => {
    const draft = parseJson({
      decisions: {
        recommendCreate: { value: false, reason: '这不是补剂' },
        retail: { enabled: true, reason: '有原厂保质期' },
        noSaleReason: 'BULK',
        diy: {
          enabled: true,
          linkUrl: 'https://item.taobao.com/item.htm?id=1',
          imageUrl: 'https://img.example.com/front.jpg',
          reason: '淘宝能买到',
        },
        procurement: { enabled: true, reason: '生产要用' },
        equivalence: { groupId: 'group-1', reason: '同浓度鱼油' },
        labelNames: ['鱼油'],
        defaultTargetFields: ['fattyAcids.epa', 'notAllowed'],
        tagNames: ['油脂类', '猫'],
        addTiming: 'BEFORE_MEAL',
      },
    });

    expect(draft!.decisions).toEqual({
      recommendCreate: { value: false, reason: '这不是补剂' },
      retail: { enabled: true, reason: '有原厂保质期' },
      noSaleReason: 'BULK',
      diy: {
        enabled: true,
        linkUrl: 'https://item.taobao.com/item.htm?id=1',
        imageUrl: 'https://img.example.com/front.jpg',
        reason: '淘宝能买到',
      },
      procurement: { enabled: true, reason: '生产要用' },
      equivalence: { groupId: 'group-1', reason: '同浓度鱼油' },
      labelNames: ['鱼油'],
      defaultTargetFields: ['fattyAcids.epa'],
      tagNames: ['油脂类'],
      addTiming: 'BEFORE_MEAL',
    });
  });

  it('accepts __SKIP__ but turns an unknown group id into null with a warning', () => {
    const skipped = parseJson({
      decisions: { equivalence: { groupId: '__SKIP__', reason: '暂不归组' } },
    });
    expect(skipped!.decisions.equivalence.groupId).toBe('__SKIP__');

    const unknown = parseJson({
      decisions: { equivalence: { groupId: 'group-9', reason: '看着像' } },
    });
    expect(unknown!.decisions.equivalence).toEqual({
      groupId: null,
      reason: '看着像',
    });
    expect(unknown!.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EQUIVALENCE_GROUP_UNKNOWN',
          fieldPath: 'equivalence.groupId',
        }),
      ]),
    );
  });

  it('falls back to safe defaults when decisions are missing', () => {
    const draft = parseJson({ fields: {} });

    expect(draft).not.toBeNull();
    expect(draft!.fields).toEqual({});
    expect(draft!.decisions).toEqual(DEFAULT_DECISIONS);
    expect(draft!.missing).toEqual([]);
    expect(draft!.warnings).toEqual([]);
  });

  it('falls back to safe defaults when decisions are malformed', () => {
    const draft = parseJson({
      decisions: {
        recommendCreate: { value: 'yes', reason: 7 },
        retail: { enabled: 'true', reason: 1 },
        noSaleReason: 'WHATEVER',
        diy: { enabled: 1, linkUrl: 5, imageUrl: null, reason: 3 },
        procurement: 'yes',
        equivalence: { groupId: 42, reason: 9 },
        labelNames: '鱼油',
        defaultTargetFields: 'fattyAcids.epa',
        tagNames: null,
        addTiming: 'NOPE',
      },
    });

    expect(draft!.decisions).toEqual(DEFAULT_DECISIONS);
  });

  it('keeps field source, confidence and reason; defaults invalid provenance', () => {
    const draft = parseJson({
      fields: {
        'basic.name': field('鱼油', 'LINK', 'MEDIUM', '商品页标题'),
        'basic.brand': {
          value: 'NOW Foods',
          source: 'WRONG',
          confidence: 'CERTAIN',
          reason: 5,
        },
        'basic.productModel': '180粒/瓶',
      },
    });

    expect(draft!.fields['basic.name']).toEqual({
      value: '鱼油',
      source: 'LINK',
      confidence: 'MEDIUM',
      reason: '商品页标题',
    });
    expect(draft!.fields['basic.brand']).toEqual({
      value: 'NOW Foods',
      source: 'INFERENCE',
      confidence: 'LOW',
      reason: '',
    });
    expect(draft!.fields['basic.productModel']).toBeUndefined();
  });

  it('normalizes missing and warnings', () => {
    const draft = parseJson({
      missing: [
        { fieldPath: 'basic.name', reason: '正面图糊了', suggestion: '补拍' },
        { fieldPath: '', reason: '没有路径' },
        { reason: '没有字段路径' },
        null,
      ],
      warnings: [
        {
          code: 'LOW_QUALITY',
          message: '图片模糊',
          fieldPath: 'evidence.frontImageUrl',
        },
        { message: '没有 code' },
        { code: 'NO_MESSAGE' },
        { code: '', message: '空 code' },
      ],
    });

    expect(draft!.missing).toEqual([
      { fieldPath: 'basic.name', reason: '正面图糊了', suggestion: '补拍' },
    ]);
    expect(draft!.warnings).toEqual([
      {
        code: 'LOW_QUALITY',
        message: '图片模糊',
        fieldPath: 'evidence.frontImageUrl',
      },
      { code: 'NO_MESSAGE', message: '' },
    ]);
  });

  it.each([
    ['plain text', 'not json'],
    ['broken fence', '```json\n{broken\n```'],
    ['array', '[{"fields":{}}]'],
    ['empty', ''],
  ])('returns null for %s', (_label, text) => {
    expect(parseSupplementAiDraft(text, CONTEXT)).toBeNull();
  });
});

/** 提示词用例的输入：真实形状，全部本地造，不发请求。 */
function promptInput(): SupplementDraftPromptInput {
  const provisionalDraft = emptySupplementDraftPayload();
  provisionalDraft.basic.name = '鱼油';
  provisionalDraft.basic.brand = 'NOW Foods';
  provisionalDraft.basic.baseUnit = 'PCS';
  provisionalDraft.basic.unitDisplayLabel = '粒';
  provisionalDraft.basic.physicalForm = 'CAPSULE';
  provisionalDraft.nutrition.servingNutrients = { 'fattyAcids.epa': 650 };
  provisionalDraft.nutrition.defaultTargetFields = ['fattyAcids.epa'];

  return {
    labelText: 'Serving Size 1 Softgel\nFish Oil 650 mg',
    frontText: 'NOW Foods Ultra Omega-3 180 Softgels',
    linkPreview: {
      productUrl: 'https://cn.iherb.com/pr/now-foods/123',
      pagePriceCny: 199,
      productName: 'NOW Foods Ultra Omega-3',
      brand: 'NOW Foods',
      productModel: '180 Softgels',
      imageUrl: 'https://img.example.com/front.jpg',
      servingUnitsPerDose: 1,
      nutrients: [{ fieldPath: 'fattyAcids.epa', value: 650, unit: 'mg' }],
      unrecognized: ['Other Ingredients: softgel'],
      labelText: 'Supplement Facts ...',
    },
    catalogNames: ['鱼油', '牛磺酸'],
    groupCandidates: [
      {
        groupId: 'group-1',
        name: '鱼油等价组',
        nutrientLabel: 'EPA',
        nutrientUnit: 'g',
        memberCount: 3,
        reason: '浓度接近',
      },
    ],
    config: { shopEnabled: true, equivalenceEnabled: false },
    provisionalDraft,
    allowedFields: ['fattyAcids.epa', 'crudeProtein'],
    allowedTags: ['油脂类', '蛋白质类'],
    allowedTimings: ['BEFORE_MIXING', 'BEFORE_MEAL'],
    allowedNoSaleReasons: ['SELF_MADE', 'BULK', 'NO_SUPPLY', 'UNDECIDED'],
  };
}

describe('buildSupplementDraftPrompt', () => {
  it('accepts the real link-preview and group-candidate shapes used by Task 8', () => {
    const input: SupplementDraftPromptInput = {
      ...promptInput(),
      linkPreview: null as SupplementLinkPreview | null,
      groupCandidates: [] as SupplementGroupRecommendation[],
    };

    expect(buildSupplementDraftPrompt(input)).toContain('没有候选等价组');
  });

  it('includes the facts, allowed values and the output JSON schema', () => {
    const prompt = buildSupplementDraftPrompt(promptInput());

    for (const text of [
      'Serving Size 1 Softgel',
      'Fish Oil 650 mg',
      'NOW Foods Ultra Omega-3 180 Softgels',
      'https://cn.iherb.com/pr/now-foods/123',
      '199',
      '鱼油',
      '牛磺酸',
      'group-1',
      '鱼油等价组',
      '浓度接近',
      '商城总开关：开',
      '等价组总开关：关',
      'fattyAcids.epa',
      'crudeProtein',
      '油脂类',
      '蛋白质类',
      'BEFORE_MIXING',
      'BEFORE_MEAL',
      'SELF_MADE',
      'BULK',
      'NO_SUPPLY',
      'UNDECIDED',
      '"fields"',
      '"decisions"',
      '"recommendCreate"',
      '"source"',
      '"confidence"',
      '"missing"',
      '"warnings"',
      'basic.name',
      'nutrition.servingNutrients.<field>',
    ]) {
      expect(prompt).toContain(text);
    }
  });

  it('states the no-invention, JSON-only and no-applicability rules', () => {
    const prompt = buildSupplementDraftPrompt(promptInput());

    expect(prompt).toContain('只输出 JSON');
    expect(prompt).toContain('不要编');
    expect(prompt).toContain('不确定就写 null');
    expect(prompt).toContain('missing');
    expect(prompt).toContain('每个决定都要写理由');
    expect(prompt).toContain('recommendCreate');
    expect(prompt).toContain('目录只用来核对标签名称');
    expect(prompt).toContain('dogAllowed');
    expect(prompt).toContain('适用范围');
    expect(prompt).toContain('不要加 markdown');
  });
});
