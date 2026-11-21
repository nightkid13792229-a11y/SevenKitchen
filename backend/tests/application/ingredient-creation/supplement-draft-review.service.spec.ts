import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { FeedAdditiveCatalogService } from '../../../src/domain/ingredient/feed-additive-catalog.service';
import { FeedMaterialCatalogService } from '../../../src/domain/ingredient/feed-material-catalog.service';
import { SupplementDosageService } from '../../../src/application/supplement-shop/supplement-dosage.service';
import { computeDraftCompleteness } from '../../../src/application/ingredient-creation/supplement-draft-completeness';
import { SupplementDraftReviewService } from '../../../src/application/ingredient-creation/supplement-draft-review.service';
import {
  SupplementDraftService,
  type SupplementDraftView,
} from '../../../src/application/ingredient-creation/supplement-draft.service';
import {
  emptySupplementDraftPayload,
  type SupplementDraftBasic,
  type SupplementDraftDiy,
  type SupplementDraftEquivalence,
  type SupplementDraftEvidence,
  type SupplementDraftLabel,
  type SupplementDraftNutrition,
  type SupplementDraftPayload,
  type SupplementDraftRetail,
} from '../../../src/application/ingredient-creation/supplement-draft.types';
import {
  validateSupplementDraftFeatures,
  type SupplementDraftIssue,
  type SupplementDraftIssueCode,
  type SupplementDraftValidationContext,
} from '../../../src/application/ingredient-creation/supplement-draft-validation';

/* ------------------------------------------------------------------ */
/* 草稿载荷构造                                                        */
/* ------------------------------------------------------------------ */

interface DraftPatch {
  basic?: Partial<SupplementDraftBasic>;
  nutrition?: Partial<SupplementDraftNutrition>;
  label?: Partial<SupplementDraftLabel>;
  retail?: Partial<SupplementDraftRetail>;
  diy?: Partial<SupplementDraftDiy>;
  evidence?: Partial<SupplementDraftEvidence>;
  equivalence?: Partial<SupplementDraftEquivalence>;
}

function draft(patch: DraftPatch = {}): SupplementDraftPayload {
  const empty = emptySupplementDraftPayload();
  return {
    ...empty,
    basic: { ...empty.basic, ...patch.basic },
    nutrition: { ...empty.nutrition, ...patch.nutrition },
    label: { ...empty.label, ...patch.label },
    retail: { ...empty.retail, ...patch.retail },
    diy: { ...empty.diy, ...patch.diy },
    evidence: { ...empty.evidence, ...patch.evidence },
    equivalence: { ...empty.equivalence, ...patch.equivalence },
  };
}

/** 一份功能项全部表态、全部合规的草稿；每个用例只改一处。 */
function validDraft(patch: DraftPatch = {}): SupplementDraftPayload {
  return draft({
    basic: {
      name: '鱼油',
      brand: '',
      productModel: '',
      purchaseChannel: '',
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
    retail: {
      enabled: true,
      shelfLifeMonths: 24,
      openedShelfLifeDays: null,
      storageCondition: '避光、密封、阴凉干燥处保存',
      isOilBased: false,
      noSaleReason: null,
      ...patch.retail,
    },
    diy: {
      enabled: false,
      platform: '',
      linkUrl: '',
      imageUrl: '',
      ...patch.diy,
    },
    evidence: {
      frontImageUrl: 'https://example.com/front.jpg',
      labelImageUrl: 'https://example.com/label.jpg',
      productUrl: '',
      selectionNote: '',
      ...patch.evidence,
    },
    equivalence: {
      groupId: null,
      priority: null,
      reapproveGroup: true,
      ...patch.equivalence,
    },
  });
}

/* ------------------------------------------------------------------ */
/* 校验上下文构造                                                      */
/* ------------------------------------------------------------------ */

function validContext(
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

type GroupContext = NonNullable<
  SupplementDraftValidationContext['equivalenceGroup']
>;

function groupContext(overrides: Partial<GroupContext> = {}): GroupContext {
  return {
    id: 'group-1',
    name: 'EPA 鱼油',
    status: 'APPROVED',
    isActive: true,
    memberCount: 2,
    nutrientKey: 'fattyAcids.epa',
    nutrientLabel: 'EPA',
    nutrientUnit: 'mg',
    ...overrides,
  };
}

function featureIssues(
  patch: DraftPatch = {},
  contextPatch: Partial<SupplementDraftValidationContext> = {},
): SupplementDraftIssue[] {
  return validateSupplementDraftFeatures(
    validDraft(patch),
    validContext(contextPatch),
  );
}

function issueOf(
  issues: SupplementDraftIssue[],
  code: SupplementDraftIssueCode,
): SupplementDraftIssue | undefined {
  return issues.find((issue) => issue.code === code);
}

describe('validateSupplementDraftFeatures', () => {
  it('功能项齐全的草稿没有任何功能问题', () => {
    // 等价组必须明确表态：已选组（APPROVED、2 个成员、浓度 OK）。
    expect(
      featureIssues(
        { equivalence: { groupId: 'group-1' } },
        {
          equivalenceGroup: groupContext({ memberCount: 2 }),
          concentration: { status: 'OK' },
        },
      ),
    ).toEqual([]);
  });

  /* ① 重复建档 ------------------------------------------------------ */

  it('同名同品牌同规格已存在 → DUPLICATE_INGREDIENT 阻断，并带上已有名称', () => {
    const issues = featureIssues(
      {},
      { duplicate: { exists: true, existingName: '鱼油（旧）' } },
    );

    const issue = issueOf(issues, 'DUPLICATE_INGREDIENT');
    expect(issue).toMatchObject({
      code: 'DUPLICATE_INGREDIENT',
      level: 'BLOCKER',
    });
    expect(issue?.message).toContain('鱼油（旧）');
    expect(issue?.ackKey).toBeUndefined();
  });

  /* ② 标签规范名 ---------------------------------------------------- */

  it('所有标签名都在目录里完全命中 → 不报 LABEL_NAME_UNVERIFIED', () => {
    const issues = featureIssues(
      { label: { labelNames: ['鱼油'] } },
      { catalog: { allExact: true, missingNames: [], candidatesByName: {} } },
    );

    expect(issueOf(issues, 'LABEL_NAME_UNVERIFIED')).toBeUndefined();
  });

  it('有标签名在目录里查不到 → LABEL_NAME_UNVERIFIED 提醒（不是阻断），带候选', () => {
    const issues = featureIssues(
      { label: { labelNames: ['目录里没有的名字'] } },
      {
        catalog: {
          allExact: false,
          missingNames: ['目录里没有的名字'],
          candidatesByName: {
            目录里没有的名字: ['候选 A', '候选 B'],
          },
        },
      },
    );

    const issue = issueOf(issues, 'LABEL_NAME_UNVERIFIED');
    expect(issue).toMatchObject({
      code: 'LABEL_NAME_UNVERIFIED',
      level: 'WARNING',
      ackKey: 'LABEL_NAME_UNVERIFIED:目录里没有的名字',
    });
    expect(issue?.message).toContain('目录里没有的名字');
    expect(issue?.message).toContain('候选 A');
    expect(issue?.message).toContain('候选 B');
  });

  it('标签名只核对 labelNames：原料名不在目录里也不影响', () => {
    const issues = featureIssues(
      {
        basic: { name: '目录里没有的名字' },
        label: { labelNames: ['鱼油'] },
      },
      { catalog: { allExact: true, missingNames: [], candidatesByName: {} } },
    );

    expect(issueOf(issues, 'LABEL_NAME_UNVERIFIED')).toBeUndefined();
  });

  it('原料名在目录里也不代表标签名通过：标签名缺失照样提醒', () => {
    const issues = featureIssues(
      {
        basic: { name: '鱼油' },
        label: { labelNames: ['目录里没有的名字'] },
      },
      {
        catalog: {
          allExact: false,
          missingNames: ['目录里没有的名字'],
          candidatesByName: {},
        },
      },
    );

    expect(issueOf(issues, 'LABEL_NAME_UNVERIFIED')?.level).toBe('WARNING');
  });

  it('多个缺失标签名的 ackKey 排序后拼接，候选最多展示 5 条', () => {
    const issues = featureIssues(
      { label: { labelNames: ['乙标签', '甲标签'] } },
      {
        catalog: {
          allExact: false,
          missingNames: ['乙标签', '甲标签'],
          candidatesByName: {
            甲标签: ['候选1', '候选2', '候选3', '候选4', '候选5', '候选6'],
            乙标签: [],
          },
        },
      },
    );

    const issue = issueOf(issues, 'LABEL_NAME_UNVERIFIED');
    expect(issue?.ackKey).toBe('LABEL_NAME_UNVERIFIED:乙标签|甲标签');
    expect(issue?.message).toContain('候选5');
    expect(issue?.message).not.toContain('候选6');
  });

  it('标签名为空时不报 LABEL_NAME_UNVERIFIED（基础校验会报标签名必填）', () => {
    const issues = featureIssues(
      { label: { labelNames: [] } },
      {
        catalog: {
          allExact: false,
          missingNames: ['不该出现的名字'],
          candidatesByName: {},
        },
      },
    );

    expect(issueOf(issues, 'LABEL_NAME_UNVERIFIED')).toBeUndefined();
  });

  /* ③ 上架体检映射 -------------------------------------------------- */

  it('过滤 EQUIVALENCE_* 和 DUPLICATE_NAME（由本函数其它规则负责）', () => {
    const issues = featureIssues(
      { equivalence: { groupId: '__SKIP__' } },
      {
        issues: [
          { code: 'EQUIVALENCE_UNGROUPED', level: 'WARN', message: '未归组' },
          {
            code: 'EQUIVALENCE_GROUP_SINGLETON',
            level: 'WARN',
            message: '只有 1 个成员',
          },
          { code: 'DUPLICATE_NAME', level: 'WARN', message: '同名 2 条' },
        ],
      },
    );

    // 明确选了「暂不归组」，只剩这一条提醒；体检里的等价组/重复项不重复出现。
    expect(issues.map((issue) => issue.code)).toEqual(['GROUP_SKIPPED']);
  });

  it('上架=开 + 体检 ERROR → RETAIL_BLOCKED_BY_ISSUES 阻断，带上体检文案', () => {
    const issues = featureIssues(
      {},
      {
        issues: [
          { code: 'NO_PRICE', level: 'ERROR', message: '进货价为 0，无法计价' },
          {
            code: 'SHELF_LIFE_MISSING',
            level: 'ERROR',
            message: '未填写原厂保质期',
          },
        ],
      },
    );

    const issue = issueOf(issues, 'RETAIL_BLOCKED_BY_ISSUES');
    expect(issue).toMatchObject({
      code: 'RETAIL_BLOCKED_BY_ISSUES',
      level: 'BLOCKER',
    });
    expect(issue?.message).toContain('进货价为 0');
    expect(issue?.message).toContain('未填写原厂保质期');
    expect(issue?.ackKey).toBeUndefined();
  });

  it('上架=开 + 体检 WARN → CATALOG_WARNING 提醒，ackKey 跟着体检项变', () => {
    const issues = featureIssues(
      {},
      {
        issues: [
          {
            code: 'STORAGE_MISSING',
            level: 'WARN',
            message: '未填写储存条件，标签无法印刷',
          },
        ],
      },
    );

    const issue = issueOf(issues, 'CATALOG_WARNING');
    expect(issue).toMatchObject({
      code: 'CATALOG_WARNING',
      level: 'WARNING',
      ackKey: 'CATALOG_WARNING:STORAGE_MISSING',
    });
    expect(issue?.message).toContain('未填写储存条件');
  });

  it('上架=关时不报上架体检问题', () => {
    const issues = featureIssues(
      { retail: { enabled: false, noSaleReason: 'UNDECIDED' } },
      {
        issues: [{ code: 'NO_PRICE', level: 'ERROR', message: '进货价为 0' }],
      },
    );

    expect(issueOf(issues, 'RETAIL_BLOCKED_BY_ISSUES')).toBeUndefined();
    expect(issueOf(issues, 'CATALOG_WARNING')).toBeUndefined();
  });

  /* ④ 不上架原因 / 保质期 ------------------------------------------- */

  it('上架=关且没填原因 → NO_SALE_REASON_REQUIRED 阻断', () => {
    const issues = featureIssues({
      retail: { enabled: false, noSaleReason: null },
    });

    expect(issueOf(issues, 'NO_SALE_REASON_REQUIRED')?.level).toBe('BLOCKER');
  });

  it.each(['', '   '])('上架=关且原因为空（%j）→ 视同没填', (reason) => {
    const issues = featureIssues({
      retail: { enabled: false, noSaleReason: reason },
    });

    expect(issueOf(issues, 'NO_SALE_REASON_REQUIRED')?.level).toBe('BLOCKER');
  });

  it.each(['SELF_MADE', 'BULK', 'NO_SUPPLY', 'UNDECIDED'])(
    '上架=关且原因合法（%s）→ 不报原因问题',
    (reason) => {
      const issues = featureIssues({
        retail: { enabled: false, noSaleReason: reason },
      });

      expect(issueOf(issues, 'NO_SALE_REASON_REQUIRED')).toBeUndefined();
      expect(issueOf(issues, 'NO_SALE_REASON_INVALID')).toBeUndefined();
    },
  );

  it('上架=关但原因不在四选一里 → NO_SALE_REASON_INVALID 阻断', () => {
    const issues = featureIssues({
      retail: { enabled: false, noSaleReason: 'SOMETHING_ELSE' },
    });

    expect(issueOf(issues, 'NO_SALE_REASON_INVALID')?.level).toBe('BLOCKER');
    expect(issueOf(issues, 'NO_SALE_REASON_REQUIRED')).toBeUndefined();
  });

  it.each([0, -3, 1.5])(
    '保质期填了但不是正整数（%s）→ SHELF_LIFE_INVALID 阻断',
    (shelfLifeMonths) => {
      const issues = featureIssues({ retail: { shelfLifeMonths } });

      expect(issueOf(issues, 'SHELF_LIFE_INVALID')?.level).toBe('BLOCKER');
    },
  );

  it('保质期没填不报 SHELF_LIFE_INVALID（缺填由上架体检负责）', () => {
    const issues = featureIssues(
      { retail: { shelfLifeMonths: null } },
      { issues: [] },
    );

    expect(issueOf(issues, 'SHELF_LIFE_INVALID')).toBeUndefined();
  });

  it('上架=关时保质期填了非法值也要阻断（finalize 仍会落库）', () => {
    const issues = featureIssues({
      retail: {
        enabled: false,
        noSaleReason: 'UNDECIDED',
        shelfLifeMonths: 0,
      },
    });

    expect(issueOf(issues, 'SHELF_LIFE_INVALID')?.level).toBe('BLOCKER');
    expect(issueOf(issues, 'NO_SALE_REASON_REQUIRED')).toBeUndefined();
  });

  /* ⑤ DIY ---------------------------------------------------------- */

  it('DIY=开但缺链接/平台 → DIY_LINK_REQUIRED 阻断', () => {
    const issues = featureIssues({
      diy: { enabled: true, platform: '', linkUrl: '' },
    });

    expect(issueOf(issues, 'DIY_LINK_REQUIRED')?.level).toBe('BLOCKER');
  });

  it.each([
    ['缺平台', { platform: '', linkUrl: 'https://example.com/item' }],
    ['缺链接', { platform: 'TAOBAO', linkUrl: '' }],
  ])('DIY=开但%s → DIY_LINK_REQUIRED', (_title, diy) => {
    const issues = featureIssues({ diy: { enabled: true, ...diy } });

    expect(issueOf(issues, 'DIY_LINK_REQUIRED')?.level).toBe('BLOCKER');
  });

  it('DIY=开但平台不在允许值内 → DIY_PLATFORM_INVALID 阻断', () => {
    const issues = featureIssues({
      diy: {
        enabled: true,
        platform: 'WEBVIEW',
        linkUrl: 'https://example.com',
      },
    });

    const issue = issueOf(issues, 'DIY_PLATFORM_INVALID');
    expect(issue?.level).toBe('BLOCKER');
    expect(issue?.message).toContain('WEBVIEW');
    expect(issueOf(issues, 'DIY_LINK_REQUIRED')).toBeUndefined();
  });

  it.each(['TAOBAO', 'JD', 'PINDUODUO', 'IHERB', 'OTHER'])(
    'DIY=开且平台合法（%s）+ 有链接 → 无 DIY 问题',
    (platform) => {
      const issues = featureIssues({
        diy: { enabled: true, platform, linkUrl: 'https://example.com/item' },
      });

      expect(issueOf(issues, 'DIY_LINK_REQUIRED')).toBeUndefined();
      expect(issueOf(issues, 'DIY_PLATFORM_INVALID')).toBeUndefined();
    },
  );

  it('DIY=关时不检查平台/链接', () => {
    const issues = featureIssues({
      diy: { enabled: false, platform: 'WEBVIEW', linkUrl: '' },
    });

    expect(issueOf(issues, 'DIY_LINK_REQUIRED')).toBeUndefined();
    expect(issueOf(issues, 'DIY_PLATFORM_INVALID')).toBeUndefined();
  });

  /* ⑥ 长度 ---------------------------------------------------------- */

  it('储存条件超过 200 字 → STORAGE_CONDITION_TOO_LONG 阻断；200 字通过', () => {
    const tooLong = featureIssues({
      retail: { storageCondition: '储'.repeat(201) },
    });
    expect(issueOf(tooLong, 'STORAGE_CONDITION_TOO_LONG')?.level).toBe(
      'BLOCKER',
    );

    const justFits = featureIssues({
      retail: { storageCondition: '储'.repeat(200) },
    });
    expect(issueOf(justFits, 'STORAGE_CONDITION_TOO_LONG')).toBeUndefined();
  });

  it('采购单位超过 50 字 → PURCHASE_UNIT_TOO_LONG 阻断；50 字通过', () => {
    const tooLong = featureIssues({ basic: { purchaseUnit: '瓶'.repeat(51) } });
    expect(issueOf(tooLong, 'PURCHASE_UNIT_TOO_LONG')?.level).toBe('BLOCKER');

    const justFits = featureIssues({
      basic: { purchaseUnit: '瓶'.repeat(50) },
    });
    expect(issueOf(justFits, 'PURCHASE_UNIT_TOO_LONG')).toBeUndefined();
  });

  /* ⑦ 等价组 -------------------------------------------------------- */

  it('还没选等价组（null）→ GROUP_NOT_CHOSEN 阻断，不能靠完成度放行', () => {
    const issues = featureIssues({ equivalence: { groupId: null } });

    const issue = issueOf(issues, 'GROUP_NOT_CHOSEN');
    expect(issue).toMatchObject({
      code: 'GROUP_NOT_CHOSEN',
      level: 'BLOCKER',
    });
    expect(issue?.message).toContain('暂不归组');
    expect(issue?.fieldPath).toBe('equivalence.groupId');
    expect(issue?.ackKey).toBeUndefined();
    expect(issueOf(issues, 'GROUP_SKIPPED')).toBeUndefined();
  });

  it('暂不归组（__SKIP__）→ GROUP_SKIPPED 提醒，且没有 GROUP_NOT_CHOSEN 阻断', () => {
    const issues = featureIssues({
      equivalence: { groupId: '__SKIP__' },
    });

    expect(issueOf(issues, 'GROUP_SKIPPED')).toMatchObject({
      code: 'GROUP_SKIPPED',
      level: 'WARNING',
      ackKey: 'GROUP_SKIPPED:__SKIP__',
    });
    expect(issueOf(issues, 'GROUP_NOT_CHOSEN')).toBeUndefined();
    expect(issues.some((issue) => issue.level === 'BLOCKER')).toBe(false);
  });

  it('已选组不受 GROUP_NOT_CHOSEN 影响', () => {
    const issues = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      { equivalenceGroup: groupContext({ memberCount: 2 }) },
    );

    expect(issueOf(issues, 'GROUP_NOT_CHOSEN')).toBeUndefined();
  });

  it('选了组但查不到 / 已停用 / DISABLED → GROUP_INACTIVE 阻断', () => {
    const notFound = featureIssues({ equivalence: { groupId: 'gone' } });

    expect(issueOf(notFound, 'GROUP_INACTIVE')?.level).toBe('BLOCKER');

    const inactive = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      { equivalenceGroup: groupContext({ isActive: false }) },
    );
    expect(issueOf(inactive, 'GROUP_INACTIVE')?.level).toBe('BLOCKER');

    const disabled = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      { equivalenceGroup: groupContext({ status: 'DISABLED' }) },
    );
    expect(issueOf(disabled, 'GROUP_INACTIVE')?.level).toBe('BLOCKER');
  });

  it('组停用时不再报未审核/单成员提醒（阻断优先）', () => {
    const issues = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      {
        equivalenceGroup: groupContext({
          isActive: false,
          status: 'PENDING_REVIEW',
          memberCount: 1,
        }),
      },
    );

    expect(issueOf(issues, 'GROUP_NOT_APPROVED')).toBeUndefined();
    expect(issueOf(issues, 'GROUP_SINGLETON')).toBeUndefined();
  });

  it('组未审核 → GROUP_NOT_APPROVED 提醒，ackKey 带组 id', () => {
    const issues = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      {
        equivalenceGroup: groupContext({
          status: 'PENDING_REVIEW',
          memberCount: 3,
        }),
      },
    );

    expect(issueOf(issues, 'GROUP_NOT_APPROVED')).toMatchObject({
      level: 'WARNING',
      ackKey: 'GROUP_NOT_APPROVED:group-1',
    });
    expect(issueOf(issues, 'GROUP_SINGLETON')).toBeUndefined();
  });

  it('组只有 1 个成员 → GROUP_SINGLETON 提醒，ackKey 带组 id', () => {
    const issues = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      { equivalenceGroup: groupContext({ memberCount: 1 }) },
    );

    expect(issueOf(issues, 'GROUP_SINGLETON')).toMatchObject({
      level: 'WARNING',
      ackKey: 'GROUP_SINGLETON:group-1',
    });
  });

  it('组已审核且成员 >= 2 → 没有组相关提醒', () => {
    const issues = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      { equivalenceGroup: groupContext({ memberCount: 2 }) },
    );

    expect(issues).toEqual([]);
  });

  it('选了组但浓度缺失 → GROUP_NUTRIENT_MISSING 提醒，ackKey 带组 id', () => {
    const issues = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      {
        equivalenceGroup: groupContext({ memberCount: 2 }),
        concentration: { status: 'MISSING' },
      },
    );

    expect(issueOf(issues, 'GROUP_NUTRIENT_MISSING')).toMatchObject({
      code: 'GROUP_NUTRIENT_MISSING',
      level: 'WARNING',
      ackKey: 'GROUP_NUTRIENT_MISSING:group-1',
    });
    expect(issueOf(issues, 'GROUP_UNIT_MISMATCH')).toBeUndefined();
  });

  it('选了组但浓度单位不一致 → GROUP_UNIT_MISMATCH 提醒，message 带实际单位', () => {
    const issues = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      {
        equivalenceGroup: groupContext({ memberCount: 2 }),
        concentration: { status: 'UNIT_MISMATCH', actualUnit: 'g' },
      },
    );

    const issue = issueOf(issues, 'GROUP_UNIT_MISMATCH');
    expect(issue).toMatchObject({
      code: 'GROUP_UNIT_MISMATCH',
      level: 'WARNING',
      ackKey: 'GROUP_UNIT_MISMATCH:group-1',
    });
    expect(issue?.message).toContain('g');
    expect(issue?.message).toContain('mg');
    expect(issueOf(issues, 'GROUP_NUTRIENT_MISSING')).toBeUndefined();
  });

  it('浓度 OK 或未选组/暂不归组时不报浓度相关提醒', () => {
    const ok = featureIssues(
      { equivalence: { groupId: 'group-1' } },
      {
        equivalenceGroup: groupContext({ memberCount: 2 }),
        concentration: { status: 'OK' },
      },
    );
    expect(issueOf(ok, 'GROUP_NUTRIENT_MISSING')).toBeUndefined();
    expect(issueOf(ok, 'GROUP_UNIT_MISMATCH')).toBeUndefined();

    const skipped = featureIssues(
      { equivalence: { groupId: '__SKIP__' } },
      {
        concentration: { status: 'MISSING' },
      },
    );
    expect(issueOf(skipped, 'GROUP_NUTRIENT_MISSING')).toBeUndefined();
    expect(issueOf(skipped, 'GROUP_UNIT_MISMATCH')).toBeUndefined();
  });

  /* ⑧ 总开关 -------------------------------------------------------- */

  it('商城总开关关闭 → SHOP_DISABLED 提醒', () => {
    const issues = featureIssues(
      {},
      { config: { shopEnabled: false, equivalenceEnabled: true } },
    );

    expect(issueOf(issues, 'SHOP_DISABLED')).toMatchObject({
      level: 'WARNING',
      ackKey: 'SHOP_DISABLED',
    });
  });

  it('等价组总开关关闭 → EQUIVALENCE_DISABLED 提醒', () => {
    const issues = featureIssues(
      {},
      { config: { shopEnabled: true, equivalenceEnabled: false } },
    );

    expect(issueOf(issues, 'EQUIVALENCE_DISABLED')).toMatchObject({
      level: 'WARNING',
      ackKey: 'EQUIVALENCE_DISABLED',
    });
  });

  /* ⑨ 证据 ---------------------------------------------------------- */

  it.each([
    ['缺正面图', { frontImageUrl: '' }, 'EVIDENCE_MISSING:front'],
    ['缺标签图', { labelImageUrl: '' }, 'EVIDENCE_MISSING:label'],
  ])(
    '证据%s → EVIDENCE_MISSING 提醒，ackKey 带上缺哪张',
    (_title, evidence, ackKey) => {
      const issues = featureIssues({ evidence });

      expect(issueOf(issues, 'EVIDENCE_MISSING')).toMatchObject({
        level: 'WARNING',
        ackKey,
      });
    },
  );

  it('两张图都缺也只报一条 EVIDENCE_MISSING，ackKey 含两张', () => {
    const issues = featureIssues({
      evidence: { frontImageUrl: '', labelImageUrl: '' },
    });

    const evidenceIssues = issues.filter(
      (issue) => issue.code === 'EVIDENCE_MISSING',
    );
    expect(evidenceIssues).toHaveLength(1);
    expect(evidenceIssues[0].ackKey).toBe('EVIDENCE_MISSING:front+label');
  });

  it('两张图都有 → 不报 EVIDENCE_MISSING', () => {
    const issues = featureIssues();

    expect(issueOf(issues, 'EVIDENCE_MISSING')).toBeUndefined();
  });

  /* ⑩ ackKey 完整性 -------------------------------------------------- */

  it('所有提醒项都有稳定 ackKey，阻断项都没有', () => {
    const issues = featureIssues(
      {
        retail: {
          enabled: false,
          noSaleReason: null,
          shelfLifeMonths: null,
          storageCondition: '',
        },
        evidence: { frontImageUrl: '', labelImageUrl: '' },
        equivalence: { groupId: '__SKIP__' },
      },
      {
        duplicate: { exists: true, existingName: '鱼油（旧）' },
        catalog: {
          allExact: false,
          missingNames: ['鱼油油'],
          candidatesByName: { 鱼油油: [] },
        },
        config: { shopEnabled: false, equivalenceEnabled: false },
      },
    );

    const warnings = issues.filter((issue) => issue.level === 'WARNING');
    const blockers = issues.filter((issue) => issue.level === 'BLOCKER');
    expect(warnings.length).toBeGreaterThan(0);
    expect(blockers.length).toBeGreaterThan(0);
    for (const issue of warnings) {
      expect(issue.ackKey).toBeTruthy();
      expect(issue.ackKey?.startsWith(issue.code)).toBe(true);
    }
    for (const issue of blockers) {
      expect(issue.ackKey).toBeUndefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/* 审核服务                                                            */
/* ------------------------------------------------------------------ */

interface DraftServiceMock {
  get: jest.Mock;
}

interface DosageMock {
  resolveConcentration: jest.Mock;
}

interface CatalogMock {
  get: jest.Mock;
  lookup: jest.Mock;
}

interface PrismaMock {
  ingredient: { findFirst: jest.Mock };
  supplementEquivalenceGroup: { findUnique: jest.Mock; findMany: jest.Mock };
  supplementShopConfig: { findUnique: jest.Mock };
}

function createPrismaMock(): PrismaMock {
  return {
    ingredient: { findFirst: jest.fn() },
    supplementEquivalenceGroup: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    supplementShopConfig: { findUnique: jest.fn() },
  };
}

function draftView(payload: SupplementDraftPayload): SupplementDraftView {
  return {
    id: 'draft-1',
    createdBy: 'u1',
    status: 'DRAFT',
    schemaVersion: 1,
    name: payload.basic.name,
    payload,
    aiSnapshot: null,
    manualFields: [],
    verification: null,
    finalizedIngredientId: null,
    finalizedNutritionFoodId: null,
    finalizedEvidenceId: null,
    finalizedAt: null,
    createdAt: new Date('2026-11-21T10:00:00.000Z'),
    updatedAt: new Date('2026-11-21T11:00:00.000Z'),
    completeness: computeDraftCompleteness(payload),
  };
}

describe('SupplementDraftReviewService', () => {
  let prismaMock: PrismaMock;
  let draftServiceMock: DraftServiceMock;
  let dosageMock: DosageMock;
  let additiveMock: CatalogMock;
  let materialMock: CatalogMock;
  let service: SupplementDraftReviewService;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    prismaMock.ingredient.findFirst.mockResolvedValue(null);
    prismaMock.supplementEquivalenceGroup.findUnique.mockResolvedValue(null);
    prismaMock.supplementEquivalenceGroup.findMany.mockResolvedValue([]);
    prismaMock.supplementShopConfig.findUnique.mockResolvedValue({
      enabled: true,
      equivalenceEnabled: true,
    });

    draftServiceMock = { get: jest.fn() };
    draftServiceMock.get.mockResolvedValue(draftView(validDraft()));

    dosageMock = { resolveConcentration: jest.fn() };
    dosageMock.resolveConcentration.mockReturnValue({
      status: 'OK',
      value: 325,
      unit: 'mg',
    });

    additiveMock = { get: jest.fn(), lookup: jest.fn() };
    additiveMock.get.mockReturnValue(null);
    additiveMock.lookup.mockReturnValue([]);
    materialMock = { get: jest.fn(), lookup: jest.fn() };
    materialMock.get.mockReturnValue(null);
    materialMock.lookup.mockReturnValue([]);

    service = new SupplementDraftReviewService(
      prismaMock as unknown as PrismaService,
      draftServiceMock as unknown as SupplementDraftService,
      dosageMock as unknown as SupplementDosageService,
      additiveMock as unknown as FeedAdditiveCatalogService,
      materialMock as unknown as FeedMaterialCatalogService,
    );
  });

  describe('buildContext', () => {
    it('查重复/等价组/配置/目录，并用草稿营养档案解析组浓度', async () => {
      const payload = validDraft({
        basic: { name: '鱼油', brand: '  ', productModel: ' 120 粒 ' },
        label: { labelNames: ['鱼油', '目录里没有的名字', '鱼油'] },
        equivalence: { groupId: 'group-1' },
      });
      prismaMock.ingredient.findFirst.mockResolvedValue({
        id: 'ing-1',
        name: '鱼油（旧）',
      });
      prismaMock.supplementEquivalenceGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        name: 'EPA 鱼油',
        status: 'PENDING_REVIEW',
        isActive: true,
        nutrientKey: 'fattyAcids.epa',
        nutrientLabel: 'EPA',
        nutrientUnit: 'mg',
        _count: { ingredients: 3 },
      });
      prismaMock.supplementShopConfig.findUnique.mockResolvedValue({
        enabled: false,
        equivalenceEnabled: false,
      });
      additiveMock.get.mockImplementation((name: string) =>
        name === '鱼油' ? { name: '鱼油' } : null,
      );
      additiveMock.lookup.mockReturnValue([{ name: '鱼油 A' }]);
      materialMock.lookup.mockReturnValue([
        { name: '鱼油 B' },
        { name: '鱼油 A' },
        { name: '鱼油 C' },
        { name: '鱼油 D' },
        { name: '鱼油 E' },
        { name: '鱼油 F' },
      ]);

      const context = await service.buildContext(payload);

      expect(prismaMock.ingredient.findFirst).toHaveBeenCalledWith({
        where: {
          type: 'SUPPLEMENT',
          name: '鱼油',
          brand: null,
          productModel: '120 粒',
        },
        select: { id: true, name: true },
      });
      expect(context.duplicate).toEqual({
        exists: true,
        existingName: '鱼油（旧）',
      });

      expect(
        prismaMock.supplementEquivalenceGroup.findUnique,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'group-1' } }),
      );
      expect(context.equivalenceGroup).toEqual({
        id: 'group-1',
        name: 'EPA 鱼油',
        status: 'PENDING_REVIEW',
        isActive: true,
        memberCount: 3,
        nutrientKey: 'fattyAcids.epa',
        nutrientLabel: 'EPA',
        nutrientUnit: 'mg',
      });
      expect(context.concentration).toEqual({ status: 'OK' });

      expect(prismaMock.supplementShopConfig.findUnique).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        select: { enabled: true, equivalenceEnabled: true },
      });
      expect(context.config).toEqual({
        shopEnabled: false,
        equivalenceEnabled: false,
      });

      // 标签名去重后再查目录：'鱼油' 命中，'目录里没有的名字' 给候选。
      expect(context.catalog).toEqual({
        allExact: false,
        missingNames: ['目录里没有的名字'],
        candidatesByName: {
          目录里没有的名字: ['鱼油 A', '鱼油 B', '鱼油 C', '鱼油 D', '鱼油 E'],
        },
      });
      expect(additiveMock.get.mock.calls.map((call) => call[0])).toEqual([
        '鱼油',
        '目录里没有的名字',
      ]);
      expect(materialMock.get.mock.calls.map((call) => call[0])).toEqual([
        '鱼油',
        '目录里没有的名字',
      ]);

      expect(dosageMock.resolveConcentration).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'draft',
          type: 'SUPPLEMENT',
          baseUnit: 'PCS',
          unitDisplayLabel: '粒',
          purchaseUnit: '瓶',
          properties: expect.objectContaining({
            display_unit: '粒',
            serving_unit_label: '粒',
            serving_units_per_dose: 2,
          }),
        }),
        {
          fieldPath: 'fattyAcids.epa',
          label: 'EPA',
          unit: 'mg',
          targetValuePerKg: 1,
        },
      );

      const [ingredientLike] = dosageMock.resolveConcentration.mock.calls[0];
      const profile = ingredientLike.nutritionProfile as {
        meta: { rawBasisType: string };
        fattyAcids: { epa: number };
      };
      expect(profile.meta.rawBasisType).toBe('PER_SERVING');
      expect(profile.fattyAcids.epa).toBe(325);
    });

    it('把上架体检需要的字段都传进去（重复/组/浓度映射）', async () => {
      const payload = validDraft({
        basic: {
          name: '鱼油',
          currentPricePerPurchaseUnit: 0,
          unitDisplayLabel: 'g',
        },
        retail: { enabled: true, shelfLifeMonths: null, storageCondition: '' },
        equivalence: { groupId: 'group-1' },
      });
      prismaMock.ingredient.findFirst.mockResolvedValue({
        id: 'ing-1',
        name: '鱼油（旧）',
      });
      prismaMock.supplementEquivalenceGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        name: '碘组',
        status: 'PENDING_REVIEW',
        isActive: true,
        nutrientKey: 'minerals.iodine',
        nutrientLabel: '碘',
        nutrientUnit: 'μg',
        _count: { ingredients: 1 },
      });
      dosageMock.resolveConcentration.mockReturnValue({
        status: 'UNIT_MISMATCH',
        actualUnit: 'g',
        reason: 'UNIT_LABEL',
      });

      const context = await service.buildContext(payload);
      const codes = context.issues.map((issue) => issue.code);

      expect(codes).toEqual(
        expect.arrayContaining([
          'NO_PRICE',
          'UNIT_INCOMPATIBLE',
          'SHELF_LIFE_MISSING',
          'STORAGE_MISSING',
          'DUPLICATE_NAME',
          'EQUIVALENCE_GROUP_NOT_APPROVED',
          'EQUIVALENCE_GROUP_SINGLETON',
          'EQUIVALENCE_UNIT_MISMATCH',
        ]),
      );
      expect(
        context.issues.find((issue) => issue.code === 'DUPLICATE_NAME')
          ?.message,
      ).toContain('2 条');
      expect(
        context.issues.find(
          (issue) => issue.code === 'EQUIVALENCE_UNIT_MISMATCH',
        )?.message,
      ).toContain('g');
      // 组的浓度解析结果也进 context，供功能校验报「加入也不参与替换」。
      expect(context.concentration).toEqual({
        status: 'UNIT_MISMATCH',
        actualUnit: 'g',
      });
    });

    it('暂不归组（__SKIP__）不查组，context.equivalenceGroup 与浓度都为 null', async () => {
      const context = await service.buildContext(
        validDraft({ equivalence: { groupId: '__SKIP__' } }),
      );

      expect(
        prismaMock.supplementEquivalenceGroup.findUnique,
      ).not.toHaveBeenCalled();
      expect(context.equivalenceGroup).toBeNull();
      expect(context.concentration).toBeNull();
      expect(context.issues.map((issue) => issue.code)).toContain(
        'EQUIVALENCE_UNGROUPED',
      );
    });

    it('名称为空时不查重复档案', async () => {
      const context = await service.buildContext(
        validDraft({ basic: { name: '   ' } }),
      );

      expect(prismaMock.ingredient.findFirst).not.toHaveBeenCalled();
      expect(context.duplicate).toEqual({ exists: false });
    });

    it('目录核对用标签名：原料名有目录但标签名没有 → missing；反过来不 missing', async () => {
      additiveMock.get.mockImplementation((name: string) =>
        name === '鱼油' ? { name: '鱼油' } : null,
      );
      materialMock.get.mockReturnValue(null);

      const labelMissing = await service.buildContext(
        validDraft({
          basic: { name: '鱼油' },
          label: { labelNames: ['目录里没有的名字'] },
        }),
      );
      expect(labelMissing.catalog).toEqual({
        allExact: false,
        missingNames: ['目录里没有的名字'],
        candidatesByName: { 目录里没有的名字: [] },
      });

      const basicMissing = await service.buildContext(
        validDraft({
          basic: { name: '目录里没有的名字' },
          label: { labelNames: ['鱼油'] },
        }),
      );
      expect(basicMissing.catalog).toEqual({
        allExact: true,
        missingNames: [],
        candidatesByName: {},
      });
    });

    it('没有标签名时 allExact=true（缺标签名由基础校验负责）', async () => {
      const context = await service.buildContext(
        validDraft({ label: { labelNames: [] } }),
      );

      expect(context.catalog).toEqual({
        allExact: true,
        missingNames: [],
        candidatesByName: {},
      });
      expect(additiveMock.get).not.toHaveBeenCalled();
      expect(materialMock.get).not.toHaveBeenCalled();
    });

    it('配置不存在时两个开关都按关闭处理', async () => {
      prismaMock.supplementShopConfig.findUnique.mockResolvedValue(null);

      const context = await service.buildContext(validDraft());

      expect(context.config).toEqual({
        shopEnabled: false,
        equivalenceEnabled: false,
      });
    });

    it('档案齐全且组已审核时 issues 为空', async () => {
      prismaMock.supplementEquivalenceGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        name: 'EPA 鱼油',
        status: 'APPROVED',
        isActive: true,
        nutrientKey: 'fattyAcids.epa',
        nutrientLabel: 'EPA',
        nutrientUnit: 'mg',
        _count: { ingredients: 2 },
      });

      const context = await service.buildContext(
        validDraft({ equivalence: { groupId: 'group-1' } }),
      );

      expect(context.issues).toEqual([]);
      expect(context.catalog).toEqual({
        allExact: false,
        missingNames: ['鱼油'],
        candidatesByName: { 鱼油: [] },
      });
    });
  });

  describe('validate', () => {
    it('读取草稿并合并基础校验与功能校验，返回完成度', async () => {
      const payload = validDraft({
        basic: { name: '鱼油胶囊' },
        evidence: { frontImageUrl: '', labelImageUrl: '' },
      });
      const view = draftView(payload);
      draftServiceMock.get.mockResolvedValue(view);
      prismaMock.ingredient.findFirst.mockResolvedValue({
        id: 'ing-1',
        name: '鱼油（旧）',
      });

      const result = await service.validate('u1', 'draft-1');

      expect(draftServiceMock.get).toHaveBeenCalledWith('draft-1', 'u1');
      expect(result.draft).toBe(view);
      expect(result.completeness).toEqual(computeDraftCompleteness(payload));

      expect(result.blockers.map((issue) => issue.code)).toContain(
        'DUPLICATE_INGREDIENT',
      );
      expect(result.warnings.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'NAME_FORM_WORD',
          'LABEL_NAME_UNVERIFIED',
          'EVIDENCE_MISSING',
        ]),
      );
      expect(result.blockers.every((issue) => issue.level === 'BLOCKER')).toBe(
        true,
      );
      expect(result.warnings.every((issue) => issue.level === 'WARNING')).toBe(
        true,
      );
    });

    it('基础校验的阻断项也会进入 blockers', async () => {
      draftServiceMock.get.mockResolvedValue(
        draftView(validDraft({ basic: { name: '' } })),
      );

      const result = await service.validate('u1', 'draft-1');

      expect(result.blockers.map((issue) => issue.code)).toContain(
        'NAME_REQUIRED',
      );
    });

    it('合并结果里每条提醒都有 ackKey、每条阻断都没有；NAME_FORM_WORD 也有 ackKey', async () => {
      const payload = validDraft({
        basic: { name: '鱼油胶囊' },
        evidence: { frontImageUrl: '', labelImageUrl: '' },
      });
      draftServiceMock.get.mockResolvedValue(draftView(payload));
      prismaMock.ingredient.findFirst.mockResolvedValue({
        id: 'ing-1',
        name: '鱼油（旧）',
      });
      prismaMock.supplementShopConfig.findUnique.mockResolvedValue({
        enabled: false,
        equivalenceEnabled: false,
      });

      const result = await service.validate('u1', 'draft-1');

      const formWord = result.warnings.find(
        (issue) => issue.code === 'NAME_FORM_WORD',
      );
      expect(formWord?.ackKey).toBe('NAME_FORM_WORD:鱼油胶囊');
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      for (const warning of result.warnings) {
        expect(warning.ackKey).toBeTruthy();
        expect(warning.ackKey?.startsWith(warning.code)).toBe(true);
      }
      for (const blocker of result.blockers) {
        expect(blocker.ackKey).toBeUndefined();
      }
    });

    it('标签核对只看 labelNames：原料名有目录、标签名没有 → 提醒；反过来不提醒', async () => {
      additiveMock.get.mockImplementation((name: string) =>
        name === '鱼油' ? { name: '鱼油' } : null,
      );
      materialMock.get.mockReturnValue(null);

      draftServiceMock.get.mockResolvedValue(
        draftView(
          validDraft({
            basic: { name: '鱼油' },
            label: { labelNames: ['目录里没有的名字'] },
          }),
        ),
      );
      const labelMissing = await service.validate('u1', 'draft-1');
      expect(labelMissing.warnings.map((issue) => issue.code)).toContain(
        'LABEL_NAME_UNVERIFIED',
      );

      draftServiceMock.get.mockResolvedValue(
        draftView(
          validDraft({
            basic: { name: '目录里没有的名字' },
            label: { labelNames: ['鱼油'] },
          }),
        ),
      );
      const basicMissing = await service.validate('u1', 'draft-1');
      expect(basicMissing.warnings.map((issue) => issue.code)).not.toContain(
        'LABEL_NAME_UNVERIFIED',
      );
    });
  });

  describe('recommendGroups', () => {
    function groupRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'group-1',
        code: 'EPA_FISH_OIL',
        name: 'EPA 鱼油',
        status: 'APPROVED',
        nutrientKey: 'fattyAcids.epa',
        nutrientLabel: 'EPA',
        nutrientUnit: 'mg',
        _count: { ingredients: 2 },
        ...overrides,
      };
    }

    it('按草稿营养解析浓度、排序并给出原因，不依赖原料行', async () => {
      prismaMock.supplementEquivalenceGroup.findMany.mockResolvedValue([
        groupRow({
          id: 'group-2',
          code: 'PENDING_EPA',
          name: '待审核 EPA 组',
          status: 'PENDING_REVIEW',
          _count: { ingredients: 1 },
        }),
        groupRow({ id: 'group-1' }),
        groupRow({
          id: 'group-3',
          code: 'ZINC',
          name: '锌组',
          nutrientKey: 'minerals.zinc',
          nutrientLabel: '锌',
        }),
      ]);
      dosageMock.resolveConcentration.mockImplementation(
        (_ingredient: unknown, target: { fieldPath: string }) =>
          target.fieldPath === 'minerals.zinc'
            ? { status: 'MISSING' }
            : { status: 'OK', value: 325, unit: 'mg' },
      );

      const result = await service.recommendGroups('u1', 'draft-1');

      expect(draftServiceMock.get).toHaveBeenCalledWith('draft-1', 'u1');
      expect(
        prismaMock.supplementEquivalenceGroup.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, status: { not: 'DISABLED' } },
          take: 200,
        }),
      );
      expect(result.equivalenceEnabled).toBe(true);
      expect(result.candidates.map((candidate) => candidate.groupId)).toEqual([
        'group-1',
        'group-2',
      ]);
      expect(result.candidates[0]).toMatchObject({
        groupId: 'group-1',
        code: 'EPA_FISH_OIL',
        name: 'EPA 鱼油',
        status: 'APPROVED',
        memberCount: 2,
        sameUnit: true,
        nutrientLabel: 'EPA',
        nutrientUnit: 'mg',
        actualUnit: null,
        mismatchReason: null,
        reason:
          '单位一致、组已审核、2 个成员；加入后会把组打回待审核，需要重新审核才继续生效',
      });
      expect(result.candidates[1].reason).toContain('加入后就是 2 个成员');

      const [ingredientLike, target] =
        dosageMock.resolveConcentration.mock.calls[0];
      expect(ingredientLike).toMatchObject({
        id: 'draft',
        type: 'SUPPLEMENT',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
      });
      expect(target).toMatchObject({
        fieldPath: 'fattyAcids.epa',
        targetValuePerKg: 1,
      });
      expect(prismaMock.ingredient.findFirst).not.toHaveBeenCalled();
    });

    it('recommendGroups 只是读取草稿后转交 recommendGroupsForPayload', async () => {
      prismaMock.supplementEquivalenceGroup.findMany.mockResolvedValue([
        groupRow(),
      ]);
      const payload = validDraft({ basic: { name: '草稿名' } });
      draftServiceMock.get.mockResolvedValue(draftView(payload));

      const result = await service.recommendGroups('u1', 'draft-1');

      expect(draftServiceMock.get).toHaveBeenCalledWith('draft-1', 'u1');
      const [ingredientLike] = dosageMock.resolveConcentration.mock.calls[0];
      expect(ingredientLike.name).toBe('草稿名');
      expect(result.candidates).toHaveLength(1);
    });

    /** 用真的浓度解析：验证「临时载荷 → 营养档案 → 浓度」这条链。 */
    function serviceWithRealDosage(): SupplementDraftReviewService {
      return new SupplementDraftReviewService(
        prismaMock as unknown as PrismaService,
        draftServiceMock as unknown as SupplementDraftService,
        new SupplementDosageService(),
        additiveMock as unknown as FeedAdditiveCatalogService,
        materialMock as unknown as FeedMaterialCatalogService,
      );
    }

    it('recommendGroupsForPayload 直接用未保存载荷算浓度（不读草稿、不查 ingredient 表）', async () => {
      prismaMock.supplementEquivalenceGroup.findMany.mockResolvedValue([
        groupRow(),
      ]);
      // 全新草稿：还没选组、也还没有 ingredient 行，只有载荷里的营养事实。
      const payload = validDraft({
        basic: { name: '鱼油' },
        equivalence: { groupId: null },
      });

      const result =
        await serviceWithRealDosage().recommendGroupsForPayload(payload);

      expect(draftServiceMock.get).not.toHaveBeenCalled();
      expect(prismaMock.ingredient.findFirst).not.toHaveBeenCalled();
      expect(result.equivalenceEnabled).toBe(true);
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({
        groupId: 'group-1',
        code: 'EPA_FISH_OIL',
        status: 'APPROVED',
        memberCount: 2,
        sameUnit: true,
        actualUnit: null,
        mismatchReason: null,
      });
      expect(result.candidates[0].reason).toBe(
        '单位一致、组已审核、2 个成员；加入后会把组打回待审核，需要重新审核才继续生效',
      );
    });

    it('recommendGroupsForPayload 空载荷返回空候选（没有可解析的浓度）', async () => {
      prismaMock.supplementEquivalenceGroup.findMany.mockResolvedValue([
        groupRow(),
      ]);

      const result = await serviceWithRealDosage().recommendGroupsForPayload(
        emptySupplementDraftPayload(),
      );

      expect(result.equivalenceEnabled).toBe(true);
      expect(result.candidates).toEqual([]);
    });

    it('单位不一致的组也返回，但 sameUnit=false 且原因说明不一致', async () => {
      prismaMock.supplementEquivalenceGroup.findMany.mockResolvedValue([
        groupRow(),
      ]);
      dosageMock.resolveConcentration.mockReturnValue({
        status: 'UNIT_MISMATCH',
        actualUnit: 'g',
        reason: 'UNIT_LABEL',
      });

      const result = await service.recommendGroups('u1', 'draft-1');

      expect(result.candidates[0]).toMatchObject({
        sameUnit: false,
        actualUnit: 'g',
        mismatchReason: 'UNIT_LABEL',
      });
      expect(result.candidates[0].reason).toContain('单位不一致');
      expect(result.candidates[0].reason).toContain('组要求 mg');
    });

    it('等价组总开关为空配置时返回 false', async () => {
      prismaMock.supplementShopConfig.findUnique.mockResolvedValue(null);

      const result = await service.recommendGroups('u1', 'draft-1');

      expect(result.equivalenceEnabled).toBe(false);
      expect(result.candidates).toEqual([]);
    });

    it('候选最多返回 8 个，成员多的优先', async () => {
      prismaMock.supplementEquivalenceGroup.findMany.mockResolvedValue(
        Array.from({ length: 9 }, (_unused, index) =>
          groupRow({
            id: `group-${10 - index}`,
            name: `组 ${10 - index}`,
            _count: { ingredients: 10 - index },
          }),
        ),
      );

      const result = await service.recommendGroups('u1', 'draft-1');

      expect(result.candidates).toHaveLength(8);
      expect(result.candidates[0].groupId).toBe('group-10');
      expect(result.candidates[7].groupId).toBe('group-3');
    });
  });
});
